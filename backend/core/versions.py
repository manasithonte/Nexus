import re
from typing import Optional
from packaging.version import Version, InvalidVersion

def clean_version(spec: str) -> str:
    """Strips range operators so "^1.2.3" or ">= 1.2" becomes the bare version."""
    return re.sub(r"^[\s^~=<>!v]+", "", spec or "").strip()

def parse_version(spec: str) -> Optional[Version]:
    """Parses a PyPI or npm version string, returning None for "unknown", "*", git URLs, etc."""
    try:
        return Version(clean_version(spec))
    except InvalidVersion:
        return None
