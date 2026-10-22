import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from api.models import DependencyInfo, UpgradePlanItem
from core.versions import parse_version

# Initialize the Gemini model via LangChain
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.2,
    google_api_key=os.getenv("GEMINI_API_KEY", "dummy_key_for_now"),
    convert_system_message_to_human=True
)

SEVERITY_RANK = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "MEDIUM": 2, "LOW": 3}

def _describe_dependency(dep: DependencyInfo, notes: tuple) -> str:
    status = "OUTDATED" if dep.is_outdated else "UP-TO-DATE"
    latest = dep.latest_version or dep.current_version
    lines = [f"### {dep.name} ({dep.file_path}): {dep.current_version} -> {latest} [{status}]"]

    if dep.vulnerabilities:
        lines.append("Known vulnerabilities:")
        for vuln in dep.vulnerabilities:
            fixed = f", fixed in {vuln.fixed_in}" if vuln.fixed_in else ""
            lines.append(f"- {vuln.id} ({vuln.severity or 'unrated'}{fixed}): {vuln.summary}")

    if dep.usages:
        lines.append("Usage in this repository:")
        lines.extend(f"- {u.file}:{u.line}: {u.code}" for u in dep.usages)
    else:
        lines.append("Usage in this repository: no direct imports found")

    if notes:
        text, source = notes
        lines.append(f"Release notes ({source}):\n{text}")
    else:
        lines.append("Release notes: not available")

    return "\n".join(lines)

def _is_security_fix(item: UpgradePlanItem) -> bool:
    target = parse_version(item.to_version)
    for vuln in item.vulnerabilities:
        fixed = parse_version(vuln.fixed_in or "")
        if fixed and target and target >= fixed:
            return True
    return False

def _sort_key(item: UpgradePlanItem):
    worst_severity = min((SEVERITY_RANK.get((v.severity or "").upper(), 4) for v in item.vulnerabilities), default=5)
    return (not item.security_fix, worst_severity, item.from_version == item.to_version, item.dependency.lower())

PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert AI software architect. For each dependency you are given its version jump, known vulnerabilities, the exact places this repository imports it, and the upstream release notes when available.
Generate an evaluation and upgrade plan for EACH dependency.

Rules:
- Base "breaking_changes" on the provided release notes. Name the specific APIs that changed. If no release notes are provided, say so and only mention changes you are highly confident about.
- Use the repository usages to judge real impact: a breaking change to an API this repo never imports is lower risk. A dependency with no direct imports may still be used indirectly (plugins, CLI tools, config).
- Weigh known vulnerabilities heavily: an upgrade that fixes a HIGH or CRITICAL vulnerability should usually be recommended unless it is very likely to break the code.
- "affected_locations" must only contain "file:line" entries copied from the usages listed for that dependency.

Respond ONLY with a JSON array of objects, containing these exact keys for EVERY dependency:
- "dependency": string (name of the package)
- "from_version": string (current version)
- "to_version": string (latest version)
- "breaking_changes": string (description of potential breaking changes, or 'None' if up-to-date)
- "risk_level": string ("None", "Low", "Medium", "High")
- "recommended": boolean (whether it's safe to upgrade automatically. false if up-to-date or high risk)
- "reasoning": string (a detailed explanation for the risk level, referring to this repository's code where relevant)
- "affected_locations": array of strings (the usages likely to need changes, e.g. "app/models.py:12")

Example:
[
  {{
    "dependency": "pydantic",
    "from_version": "1.10.0",
    "to_version": "2.6.0",
    "breaking_changes": "v2.0 removes `@validator` in favour of `@field_validator`, and renames `.dict()` to `.model_dump()`.",
    "risk_level": "High",
    "recommended": false,
    "reasoning": "app/models.py imports `validator`, which was removed in v2.0. The validators there must be rewritten before upgrading.",
    "affected_locations": ["app/models.py:3"]
  }}
]"""),
    ("human", "Here are the dependencies:\n\n{deps_text}")
])

# Small batches run in parallel, which is much faster than one huge response
BATCH_SIZE = 8
MAX_PARALLEL_CALLS = 4

def _ask_ai(batch: list[DependencyInfo], release_notes: dict) -> dict:
    deps_text = "\n\n".join(_describe_dependency(dep, release_notes.get(dep.name)) for dep in batch)
    try:
        response = (PROMPT | llm).invoke({"deps_text": deps_text})

        content = response.content
        clean_content = content.replace("```json", "").replace("```", "").strip()
        return {str(item.get("dependency", "")).lower(): item for item in json.loads(clean_content)}
    except Exception as e:
        print(f"Error generating plan for {[dep.name for dep in batch]}: {e}")
        return {}

def generate_upgrade_plan(
    dependencies: list[DependencyInfo],
    release_notes: dict = None,
    on_progress: Callable[[int, int], None] = None,
) -> list[UpgradePlanItem]:
    """on_progress(batches_done, batches_total) is called as each AI batch finishes."""
    if not dependencies:
        return []
    release_notes = release_notes or {}

    # Up-to-date packages need no AI review
    outdated = [dep for dep in dependencies if dep.is_outdated]
    batches = [outdated[i:i + BATCH_SIZE] for i in range(0, len(outdated), BATCH_SIZE)]
    ai_items = {}
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_CALLS) as pool:
        futures = [pool.submit(_ask_ai, batch, release_notes) for batch in batches]
        for done, future in enumerate(as_completed(futures), start=1):
            ai_items.update(future.result())
            if on_progress:
                on_progress(done, len(batches))

    plan_items = []
    for dep in dependencies:
        notes = release_notes.get(dep.name)
        real_locations = {f"{u.file}:{u.line}" for u in dep.usages}
        ai_item = ai_items.get(dep.name.lower())
        # Never target a version below the current one (npm "latest" can lag behind a newer major)
        to_version = (dep.latest_version or dep.current_version) if dep.is_outdated else dep.current_version

        if not dep.is_outdated:
            item = UpgradePlanItem(
                dependency=dep.name,
                from_version=dep.current_version,
                to_version=to_version,
                breaking_changes="None",
                risk_level="None",
                recommended=False,
                reasoning="Already on the latest version.",
            )
        elif ai_item:
            item = UpgradePlanItem(
                dependency=dep.name,
                from_version=dep.current_version,
                to_version=to_version,
                breaking_changes=str(ai_item.get("breaking_changes", "")),
                risk_level=str(ai_item.get("risk_level", "Unknown")),
                recommended=bool(ai_item.get("recommended", False)),
                reasoning=str(ai_item.get("reasoning", "")),
                # Drop any location the model made up
                affected_locations=[loc for loc in ai_item.get("affected_locations") or [] if loc in real_locations],
            )
        else:
            item = UpgradePlanItem(
                dependency=dep.name,
                from_version=dep.current_version,
                to_version=to_version,
                breaking_changes="AI failed to generate details",
                risk_level="Unknown",
                recommended=False,
                reasoning="Failed to contact AI model",
            )

        # Security data and note sources come from the scanners, not the model
        item.vulnerabilities = dep.vulnerabilities
        item.notes_source = notes[1] if notes else None
        item.security_fix = _is_security_fix(item)
        plan_items.append(item)

    plan_items.sort(key=_sort_key)
    return plan_items
