from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from concurrent.futures import ThreadPoolExecutor
import json
import queue
import dotenv

dotenv.load_dotenv(override=True)
from api.models import AnalyzeRequest, AnalyzeResponse, UpgradeRequest, UpgradeResponse
import shutil
from core.repo_analyzer import clone_repository, find_dependencies, lookup_latest_versions
from core.usage_finder import find_usages
from core.security import check_vulnerabilities
from core.changelog import fetch_release_notes
from ai.planner import generate_upgrade_plan
from core.github_upgrader import apply_upgrades_and_create_pr

import os

app = FastAPI(title="Nexus API", description="Automated dependency upgrades using AI")

# Comma-separated list of frontend URLs allowed to call the API, e.g. "https://nexus.vercel.app"
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Optional regex for Vercel preview deployments, e.g. "https://nexus-.*\.vercel\.app"
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX") or None,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to Nexus API"}

def _plural(count: int, word: str) -> str:
    if count == 1:
        return f"{count} {word}"
    return f"{count} {word[:-1]}ies" if word.endswith("y") else f"{count} {word}s"

def run_analysis(request: AnalyzeRequest):
    """
    Runs the full analysis, yielding progress events as dicts:
      {"type": "stage", "id": ..., "status": "active" | "done", "detail": ...}
      {"type": "result", "data": AnalyzeResponse}
    """
    def stage(stage_id: str, status: str = "active", detail: str = None):
        return {"type": "stage", "id": stage_id, "status": status, "detail": detail}

    # 1. Clone, read the manifests and find where each package is imported
    yield stage("clone")
    repo_dir = clone_repository(request.repo_url, request.github_token)
    try:
        yield stage("clone", "done")

        yield stage("manifests")
        dependencies = find_dependencies(repo_dir)
        files = sorted({dep.file_path for dep in dependencies})
        where = ", ".join(files) if len(files) <= 3 else _plural(len(files), "file")
        yield stage("manifests", "done", f"{_plural(len(dependencies), 'package')} in {where}" if files else "No requirements, pyproject.toml or package.json files found")

        yield stage("usage")
        find_usages(repo_dir, dependencies)
        used = [dep for dep in dependencies if dep.usages]
        yield stage("usage", "done", f"{_plural(len(used), 'package')} imported in {_plural(sum(len(dep.usages) for dep in used), 'place')}")
    finally:
        shutil.rmtree(repo_dir, ignore_errors=True)

    # 2. Look up latest versions, known vulnerabilities and upstream release notes
    yield stage("registry")
    lookup_latest_versions(dependencies)
    yield stage("registry", "done", f"{sum(dep.is_outdated for dep in dependencies)} of {len(dependencies)} outdated")

    yield stage("security")
    check_vulnerabilities(dependencies)
    vulnerable = [dep for dep in dependencies if dep.vulnerabilities]
    yield stage("security", "done", f"{_plural(sum(len(dep.vulnerabilities) for dep in vulnerable), 'advisory')} in {_plural(len(vulnerable), 'package')}")

    yield stage("notes")
    release_notes = fetch_release_notes(dependencies, request.github_token)
    yield stage("notes", "done", f"Found notes for {_plural(len(release_notes), 'package')}")

    # 3. Review the upgrades with the AI, reporting each finished batch
    yield stage("ai")
    progress = queue.Queue()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(generate_upgrade_plan, dependencies, release_notes, lambda done, total: progress.put((done, total)))
        while not future.done() or not progress.empty():
            try:
                done, total = progress.get(timeout=1)
                yield stage("ai", "active", f"Reviewed batch {done} of {total}")
            except queue.Empty:
                continue
        upgrade_plan = future.result()
    yield stage("ai", "done", f"{_plural(sum(item.from_version != item.to_version for item in upgrade_plan), 'upgrade')} assessed")

    yield {
        "type": "result",
        "data": AnalyzeResponse(repo_url=request.repo_url, dependencies=dependencies, upgrade_plan=upgrade_plan),
    }

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_repository(request: AnalyzeRequest):
    try:
        for event in run_analysis(request):
            if event["type"] == "result":
                return event["data"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/stream")
def analyze_repository_stream(request: AnalyzeRequest):
    """Same as /api/analyze, but streams progress as Server-Sent Events."""
    def events():
        try:
            for event in run_analysis(request):
                if event["type"] == "result":
                    event = {"type": "result", "data": event["data"].model_dump()}
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        # Stop proxies from buffering the stream
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/api/upgrade", response_model=UpgradeResponse)
def upgrade_repository(request: UpgradeRequest):
    if not request.github_token:
        raise HTTPException(status_code=400, detail="GitHub token is required to create a Pull Request.")
        
    try:
        print(f"Applying upgrade plan to {request.repo_url}")
        
        # 1. Execute Upgrade & Create PR
        pr_url = apply_upgrades_and_create_pr(
            repo_url=request.repo_url,
            plan=request.plan,
            github_token=request.github_token
        )
        
        if not pr_url:
            return UpgradeResponse(
                success=False,
                pr_url=None,
                message="No files were locally modified. They may already be up to date."
            )
            
        return UpgradeResponse(
            success=True,
            pr_url=pr_url,
            message="Successfully upgraded dependencies and created a GitHub Pull Request!"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create PR: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
