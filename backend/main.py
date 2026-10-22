from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import dotenv

dotenv.load_dotenv(override=True)
from api.models import AnalyzeRequest, AnalyzeResponse, UpgradeRequest, UpgradeResponse
import shutil
from core.repo_analyzer import clone_repository, analyze_repo
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

@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_repository(request: AnalyzeRequest):
    try:
        # 1. Clone, analyze the manifests and find where each package is imported
        repo_dir = clone_repository(request.repo_url, request.github_token)
        try:
            dependencies = analyze_repo(repo_dir)
            find_usages(repo_dir, dependencies)
        finally:
            shutil.rmtree(repo_dir, ignore_errors=True)

        # 2. Check for known vulnerabilities and pull upstream release notes
        check_vulnerabilities(dependencies)
        release_notes = fetch_release_notes(dependencies, request.github_token)

        # 3. Get Upgrade Plan
        upgrade_plan = generate_upgrade_plan(dependencies, release_notes)
        
        return AnalyzeResponse(
            repo_url=request.repo_url,
            dependencies=dependencies,
            upgrade_plan=upgrade_plan
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
