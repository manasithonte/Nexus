import os
import tempfile
import re
import requests
from git import Repo
from api.models import DependencyInfo
from core.versions import parse_version

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

def get_pypi_info(package_name: str) -> tuple:
    """Returns (latest_version, "owner/repo" source on GitHub)."""
    try:
        url = f"https://pypi.org/pypi/{package_name}/json"
        response = requests.get(url, timeout=5)
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
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            repository = data.get("repository")
            repo_url = repository.get("url") if isinstance(repository, dict) else repository
            return data.get("dist-tags", {}).get("latest", None), _find_github_repo([repo_url, data.get("homepage")])
    except Exception:
        pass
    return None, None

def parse_requirements_txt(file_path: str) -> list[DependencyInfo]:
    deps = []
    # Using utf-8 or errors='ignore' to handle potential BOM like
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            # Remove BOM if present
            if line.startswith('﻿'):
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
                    file_path=os.path.basename(file_path)
                ))
    return deps

def parse_package_json(file_path: str) -> list[DependencyInfo]:
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
                    file_path=os.path.basename(file_path)
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

def analyze_repo(repo_dir: str) -> list[DependencyInfo]:
    all_deps = []

    # Check for requirements.txt
    req_file = os.path.join(repo_dir, "requirements.txt")
    if os.path.exists(req_file):
        for dep in parse_requirements_txt(req_file):
            latest, dep.source_repo = get_pypi_info(dep.name)
            if latest:
                _mark_outdated(dep, latest)
            all_deps.append(dep)

    # Check for package.json
    pkg_file = os.path.join(repo_dir, "package.json")
    if os.path.exists(pkg_file):
        for dep in parse_package_json(pkg_file):
            latest, dep.source_repo = get_npm_info(dep.name)
            if latest:
                _mark_outdated(dep, latest)
            all_deps.append(dep)

    return all_deps
