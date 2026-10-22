from pydantic import BaseModel
from typing import List, Optional

class AnalyzeRequest(BaseModel):
    repo_url: str
    github_token: Optional[str] = None

class Vulnerability(BaseModel):
    id: str
    summary: str
    severity: Optional[str] = None  # CRITICAL / HIGH / MODERATE / LOW, when the advisory provides one
    fixed_in: Optional[str] = None
    url: str

class UsageLocation(BaseModel):
    file: str
    line: int
    code: str

class DependencyInfo(BaseModel):
    name: str
    current_version: str
    declared: str = ""  # the spec exactly as written, e.g. ">=2.20.0" or "^4.17.15"
    latest_version: Optional[str] = None
    is_outdated: bool = False
    file_path: str
    source_repo: Optional[str] = None  # "owner/repo" on GitHub, if the registry links one
    vulnerabilities: List[Vulnerability] = []
    usages: List[UsageLocation] = []

class UpgradePlanItem(BaseModel):
    dependency: str
    from_version: str
    to_version: str
    breaking_changes: str
    risk_level: str
    recommended: bool
    reasoning: str
    affected_locations: List[str] = []  # "file:line" entries from the repo's real usages
    vulnerabilities: List[Vulnerability] = []
    security_fix: bool = False
    notes_source: Optional[str] = None  # where the release notes came from; None means the AI had none

class AnalyzeResponse(BaseModel):
    repo_url: str
    dependencies: List[DependencyInfo]
    upgrade_plan: List[UpgradePlanItem]

class UpgradeRequest(BaseModel):
    repo_url: str
    plan: List[UpgradePlanItem]
    github_token: str

class UpgradeResponse(BaseModel):
    success: bool
    pr_url: Optional[str] = None
    message: str
