from concurrent.futures import ThreadPoolExecutor
import requests
from api.models import DependencyInfo, Vulnerability
from core.versions import clean_version, parse_version

OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
OSV_VULN_URL = "https://api.osv.dev/v1/vulns/{}"

ECOSYSTEMS = {
    "requirements.txt": "PyPI",
    "package.json": "npm",
}

def _fixed_in(vuln: dict, dep: DependencyInfo, ecosystem: str) -> str:
    """Finds the lowest fixed version above the dependency's current version."""
    current = parse_version(dep.current_version)
    candidates = []
    for affected in vuln.get("affected", []):
        package = affected.get("package", {})
        if package.get("ecosystem") != ecosystem or package.get("name", "").lower() != dep.name.lower():
            continue
        for version_range in affected.get("ranges", []):
            for event in version_range.get("events", []):
                fixed = parse_version(event.get("fixed", ""))
                if fixed and (current is None or fixed > current):
                    candidates.append(fixed)
    return str(min(candidates)) if candidates else None

def _fetch_vuln(vuln_id: str) -> dict:
    try:
        response = requests.get(OSV_VULN_URL.format(vuln_id), timeout=10)
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return {"id": vuln_id}

def check_vulnerabilities(dependencies: list[DependencyInfo]):
    """
    Looks up known vulnerabilities on OSV.dev and attaches them to each dependency.
    For range specs like "^1.2.0" this checks the lowest version the manifest allows.
    """
    queryable = [
        dep for dep in dependencies
        if dep.file_path in ECOSYSTEMS and parse_version(dep.current_version)
    ]
    if not queryable:
        return

    queries = [
        {
            "package": {"name": dep.name, "ecosystem": ECOSYSTEMS[dep.file_path]},
            "version": clean_version(dep.current_version),
        }
        for dep in queryable
    ]
    try:
        response = requests.post(OSV_BATCH_URL, json={"queries": queries}, timeout=15)
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception as e:
        print(f"OSV lookup failed: {e}")
        return

    # The batch endpoint only returns IDs, so fetch the full advisories in parallel
    ids_per_dep = [[v["id"] for v in result.get("vulns", [])] for result in results]
    unique_ids = sorted({vuln_id for ids in ids_per_dep for vuln_id in ids})
    with ThreadPoolExecutor(max_workers=8) as pool:
        details = dict(zip(unique_ids, pool.map(_fetch_vuln, unique_ids)))

    for dep, ids in zip(queryable, ids_per_dep):
        ecosystem = ECOSYSTEMS[dep.file_path]
        for vuln_id in ids:
            vuln = details[vuln_id]
            dep.vulnerabilities.append(Vulnerability(
                id=vuln_id,
                summary=vuln.get("summary") or (vuln.get("details") or "")[:200] or "No summary available",
                severity=(vuln.get("database_specific") or {}).get("severity"),
                fixed_in=_fixed_in(vuln, dep, ecosystem),
                url=f"https://osv.dev/vulnerability/{vuln_id}",
            ))
