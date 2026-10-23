"""Reads and updates dependencies in pyproject.toml (PEP 621, dependency groups and Poetry)."""
import re
import tomllib
from api.models import DependencyInfo

# Splits a PEP 508 requirement like "uvicorn[standard] >= 0.20 ; python_version > '3.8'"
REQUIREMENT_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*([^;]*)")
PIN_OPERATORS = ("===", "==", "~=", ">=")

def _version_from_spec(spec: str) -> str:
    """Picks the version a spec pins or starts from, e.g. ">=2.0,<3" -> "2.0"."""
    for part in spec.split(","):
        part = part.strip()
        for op in PIN_OPERATORS + ("^", "~"):
            if part.startswith(op):
                return part[len(op):].strip() or "unknown"
        if re.match(r"^\d", part):
            return part
    return "unknown"

def _from_requirement(text: str, file_path: str):
    match = REQUIREMENT_RE.match(text)
    if not match:
        return None
    declared = match.group(3).strip()
    if declared.startswith("@"):
        return None  # Direct URL reference, not a registry version
    return DependencyInfo(
        name=match.group(1),
        current_version=_version_from_spec(declared),
        declared=declared,
        file_path=file_path,
        ecosystem="PyPI",
        section="project",
    )

def _from_poetry(name: str, value, file_path: str):
    if name.lower() == "python":
        return None
    declared = value.get("version") if isinstance(value, dict) else value
    if not isinstance(declared, str):
        return None  # git, path or url dependency
    return DependencyInfo(
        name=name,
        current_version="unknown" if declared.strip() == "*" else _version_from_spec(declared),
        declared=declared,
        file_path=file_path,
        ecosystem="PyPI",
        section="poetry",
    )

def parse_pyproject(path: str, file_path: str) -> list[DependencyInfo]:
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except (OSError, tomllib.TOMLDecodeError):
        return []

    deps = []
    project = data.get("project") or {}
    requirements = list(project.get("dependencies") or [])
    for group in (project.get("optional-dependencies") or {}).values():
        requirements += group
    for group in (data.get("dependency-groups") or {}).values():
        requirements += [req for req in group if isinstance(req, str)]
    deps += [dep for dep in (_from_requirement(req, file_path) for req in requirements) if dep]

    poetry = (data.get("tool") or {}).get("poetry") or {}
    tables = [poetry.get("dependencies") or {}, poetry.get("dev-dependencies") or {}]
    tables += [(group or {}).get("dependencies") or {} for group in (poetry.get("group") or {}).values()]
    for table in tables:
        deps += [dep for dep in (_from_poetry(name, value, file_path) for name, value in table.items()) if dep]

    # A package can appear in several groups; report it once
    unique = {}
    for dep in deps:
        unique.setdefault(dep.name.lower(), dep)
    return list(unique.values())

def updated_spec(declared: str, to_version: str, section: str) -> str:
    """The spec written back for an upgrade. Mirrored in the frontend's diff preview."""
    declared = declared.strip()
    if section == "poetry":
        prefix = re.match(r"^(\^|~=|~|>=|==)?", declared).group(1) or ""
        return f"{prefix}{to_version}"
    if "," not in declared:
        for op in PIN_OPERATORS:
            if declared.startswith(op):
                return f"{op}{to_version}"
    # Ranges like ">=2,<3" would exclude the new version, so widen them
    return f">={to_version}"

def update_pyproject(path: str, upgrades: dict):
    """Rewrites versions in place, keeping the file's formatting. upgrades maps name -> to_version."""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    by_name = {dep.name.lower(): dep for dep in parse_pyproject(path, "")}
    for name, to_version in upgrades.items():
        dep = by_name.get(name.lower())
        if not dep:
            continue
        new = updated_spec(dep.declared, to_version, dep.section)
        name_re = re.escape(dep.name)
        declared_re = re.escape(dep.declared)
        if dep.section == "project":
            # "flask[async] >= 2.0 ; python_version > '3.8'"
            # The marker after ";" can contain the other quote style, so only stop at the opening quote
            pattern = rf"""(["'])({name_re}\s*(?:\[[^\]]*\])?\s*){declared_re}(\s*(?:;(?:(?!\1).)*)?)\1"""
            text = re.sub(pattern, lambda m: f"{m.group(1)}{m.group(2)}{new}{m.group(3)}{m.group(1)}", text, flags=re.IGNORECASE)
        else:
            # flask = "^2.0"   or   flask = { version = "^2.0", extras = [...] }
            for pattern in (
                rf"""(^\s*["']?{name_re}["']?\s*=\s*)(["']){declared_re}\2""",
                rf"""(^\s*["']?{name_re}["']?\s*=\s*\{{[^}}]*?\bversion\s*=\s*)(["']){declared_re}\2""",
            ):
                text = re.sub(pattern, lambda m: f"{m.group(1)}{m.group(2)}{new}{m.group(2)}", text, flags=re.IGNORECASE | re.MULTILINE)

    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
