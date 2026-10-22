import re
from concurrent.futures import ThreadPoolExecutor
import requests
from api.models import DependencyInfo
from core.versions import parse_version

GITHUB_API = "https://api.github.com"
CHANGELOG_FILES = ["CHANGELOG.md", "CHANGES.md", "HISTORY.md", "CHANGES.rst", "CHANGELOG.rst"]

# Keeps the prompt focused: unauthenticated GitHub allows only 60 requests/hour
MAX_DEPS = 15
MAX_CHARS_PER_RELEASE = 1500
MAX_CHARS_PER_DEP = 6000

IMPORTANT_WORDS = re.compile(r"break|deprecat|remov|renam|drop|migrat|incompatib", re.IGNORECASE)
TAG_VERSION_RE = re.compile(r"\d+(?:\.\d+)+[\w.\-+]*")

def _headers(github_token: str = None) -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    return headers

def _tag_version(tag: str):
    """Pulls the version out of tags like "v1.2.3", "1.2.3" or "pkg@1.2.3"."""
    match = TAG_VERSION_RE.search(tag.rsplit("@", 1)[-1])
    return parse_version(match.group(0)) if match else None

def _from_releases(dep: DependencyInfo, github_token: str) -> tuple:
    current, latest = parse_version(dep.current_version), parse_version(dep.latest_version)
    if not (current and latest):
        return None, None

    response = requests.get(
        f"{GITHUB_API}/repos/{dep.source_repo}/releases",
        params={"per_page": 100},
        headers=_headers(github_token),
        timeout=10,
    )
    if response.status_code != 200:
        return None, None

    releases = []
    for release in response.json():
        version = _tag_version(release.get("tag_name", ""))
        body = (release.get("body") or "").strip()
        if version and current < version <= latest and body:
            releases.append((version, body[:MAX_CHARS_PER_RELEASE]))
    if not releases:
        return None, None

    # When over budget, keep major versions and notes that mention breaking changes first
    def priority(release):
        version, body = release
        is_major = version.major > current.major
        return (not is_major, not IMPORTANT_WORDS.search(body), version)

    kept, total = [], 0
    for version, body in sorted(releases, key=priority):
        if total + len(body) > MAX_CHARS_PER_DEP:
            continue
        kept.append((version, body))
        total += len(body)

    kept.sort(key=lambda release: release[0])
    notes = "\n\n".join(f"#### {version}\n{body}" for version, body in kept)
    return notes, f"GitHub Releases ({len(kept)} of {len(releases)})"

def _from_changelog_file(dep: DependencyInfo) -> tuple:
    # The newest entries sit at the top of a changelog, which is the range we care about
    for filename in CHANGELOG_FILES:
        response = requests.get(
            f"https://raw.githubusercontent.com/{dep.source_repo}/HEAD/{filename}",
            timeout=10,
        )
        if response.status_code == 200 and response.text.strip():
            return response.text[:MAX_CHARS_PER_DEP], filename
    return None, None

def _fetch_notes(dep: DependencyInfo, github_token: str) -> tuple:
    try:
        notes, source = _from_releases(dep, github_token)
        if not notes:
            notes, source = _from_changelog_file(dep)
        return notes, source
    except Exception as e:
        print(f"Could not fetch release notes for {dep.name}: {e}")
        return None, None

def fetch_release_notes(dependencies: list[DependencyInfo], github_token: str = None) -> dict:
    """Returns {dependency name: (notes text, source label)} for outdated deps with a GitHub source."""
    targets = [dep for dep in dependencies if dep.is_outdated and dep.source_repo]
    # Vulnerable packages first, then ones the code actually imports
    targets.sort(key=lambda dep: (not dep.vulnerabilities, not dep.usages))
    targets = targets[:MAX_DEPS]

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = pool.map(lambda dep: _fetch_notes(dep, github_token), targets)
    return {dep.name: result for dep, result in zip(targets, results) if result[0]}
