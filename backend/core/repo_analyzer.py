import os
import tempfile
import re
from concurrent.futures import ThreadPoolExecutor
import requests
from git import Repo
from api.models import DependencyInfo
from core.versions import parse_version
from core.pyproject import parse_pyproject

GITHUB_REPO_RE = re.compile(r"github\.com[/:]([\w.-]+)/([\w.-]+?)(?:\.git)?(?:[/#?]|$)")

def clone_repository(repo_url: str, github_token: str = None) -> str:
    temp_dir = tempfile.mkdtemp()

    url_to_clone = repo_url
    if github_token:
        url_to_clone = repo_url.replace("https://github.com/", f"https://x-access-token:{github_token}@github.com/")
        if not url_to_clone.endswith(".git"):
            url_to_clone += ".git"

    # Set GIT_TERMINAL_PROMPT=0 so git instantly fails instead of hanging indefinitely asking for password
    Repo.clone_from(url_to_clone, temp_dir, env={"GIT_TERMINAL_PROMPT": "0"}, depth=1)
    return temp_dir

def _find_github_repo(urls: list) -> str:
    for url in urls:
        if not isinstance(url, str):
            continue
        match = GITHUB_REPO_RE.search(url)
        # Skip funding links like github.com/sponsors/<user>
        if match and match.group(1).lower() not in ("sponsors", "orgs"):
            return f"{match.group(1)}/{match.group(2)}"
    return None

def _get_with_retry(url: str, attempts: int = 2) -> requests.Response:
    # Registry calls run in parallel and occasionally time out on small servers, so retry once
    for attempt in range(attempts):
        try:
            return requests.get(url, timeout=10)
        except requests.RequestException:
            if attempt == attempts - 1:
                raise

def get_pypi_info(package_name: str) -> tuple:
    """Returns (latest_version, "owner/repo" source on GitHub)."""
    try:
        url = f"https://pypi.org/pypi/{package_name}/json"
        response = _get_with_retry(url)
        if response.status_code == 200:
            info = response.json().get("info", {})
            project_urls = info.get("project_urls") or {}
            # Prefer links labelled as the source code over docs, funding, etc.
            source_first = sorted(project_urls, key=lambda label: not any(
                word in label.lower() for word in ("source", "repository", "code", "github")
            ))
            urls = [project_urls[label] for label in source_first] + [info.get("home_page")]
            return info.get("version", None), _find_github_repo(urls)
    except Exception:
        pass
    return None, None

def get_npm_info(package_name: str) -> tuple:
    """Returns (latest_version, "owner/repo" source on GitHub)."""
    try:
        url = f"https://registry.npmjs.org/{package_name}"
        response = _get_with_retry(url)
        if response.status_code == 200:
            data = response.json()
            repository = data.get("repository")
            repo_url = repository.get("url") if isinstance(repository, dict) else repository
            return data.get("dist-tags", {}).get("latest", None), _find_github_repo([repo_url, data.get("homepage")])
    except Exception:
        pass
    return None, None

def parse_requirements_txt(file_path: str, rel_path: str) -> list[DependencyInfo]:
    deps = []
    # Using utf-8 or errors='ignore' to handle potential BOM like \ufeff
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            # Remove BOM if present
            if line.startswith('\ufeff'):
                line = line[1:]

            if not line or line.startswith("#"):
                continue

            clean_line = line.split(";")[0].split("#")[0].strip()
            match = re.match(r"^([a-zA-Z0-9_\-\.]+)(?:[\s]*([=><~]+)[\s]*(.*))?$", clean_line)
            if match:
                name = match.group(1).strip()
                operator = match.group(2)
                version = match.group(3)

                if operator and version:
                    current_version = version.strip()
                else:
                    current_version = "unknown"

                deps.append(DependencyInfo(
                    name=name,
                    current_version=current_version,
                    declared=f"{operator}{version.strip()}" if operator and version else "",
                    file_path=rel_path,
                    ecosystem="PyPI",
                ))
    return deps

def parse_package_json(file_path: str, rel_path: str) -> list[DependencyInfo]:
    import json
    deps = []
    try:
        with open(file_path, "r") as f:
            data = json.load(f)
            deps_dict = data.get("dependencies", {})
            dev_deps_dict = data.get("devDependencies", {})

            all_deps = {**deps_dict, **dev_deps_dict}
            for name, version in all_deps.items():
                deps.append(DependencyInfo(
                    name=name,
                    current_version=version,
                    declared=version,
                    file_path=rel_path,
                    ecosystem="npm",
                ))
    except Exception:
        pass
    return deps

def _mark_outdated(dep: DependencyInfo, latest: str):
    dep.latest_version = latest
    current, newest = parse_version(dep.current_version), parse_version(latest)
    if current and newest:
        dep.is_outdated = current < newest
    else:
        # Unpinned or unparseable spec, so we can't tell what's installed
        dep.is_outdated = True

REGISTRY_LOOKUPS = {
    "PyPI": get_pypi_info,
    "npm": get_npm_info,
}

# Folders that never hold the project's own manifests
SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "env", "__pycache__", "dist", "build", ".next", "site-packages", "vendor", ".tox"}
MAX_MANIFEST_DEPTH = 4
MAX_MANIFESTS = 25

def _manifest_parser(filename: str):
    if filename == "package.json":
        return parse_package_json
    if filename == "pyproject.toml":
        return parse_pyproject
    if filename.startswith("requirements") and filename.endswith(".txt"):
        return parse_requirements_txt
    return None

def find_manifests(repo_dir: str) -> list[str]:
    """Paths (relative to the repo root) of every supported manifest, root first."""
    found = []
    for root, dirs, files in os.walk(repo_dir):
        depth = os.path.relpath(root, repo_dir).count(os.sep) + (root != repo_dir)
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith(".") and depth < MAX_MANIFEST_DEPTH)
        for filename in sorted(files):
            if _manifest_parser(filename):
                found.append(os.path.relpath(os.path.join(root, filename), repo_dir))
    found.sort(key=lambda path: (path.count(os.sep), path))
    return found[:MAX_MANIFESTS]

def find_dependencies(repo_dir: str) -> list[DependencyInfo]:
    deps = []
    for rel_path in find_manifests(repo_dir):
        parser = _manifest_parser(os.path.basename(rel_path))
        deps += parser(os.path.join(repo_dir, rel_path), rel_path)
    return deps

def lookup_latest_versions(dependencies: list[DependencyInfo]):
    # The same package can appear in several manifests, so look each one up once
    keys = sorted({(dep.ecosystem, dep.name.lower()) for dep in dependencies})
    def lookup(key):
        ecosystem, name = key
        return key, REGISTRY_LOOKUPS[ecosystem](name)

    # Registry lookups are network-bound, so run them in parallel
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = dict(pool.map(lookup, keys))

    for dep in dependencies:
        latest, dep.source_repo = results[(dep.ecosystem, dep.name.lower())]
        if latest:
            _mark_outdated(dep, latest)
