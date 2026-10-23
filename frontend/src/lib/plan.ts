import type { Dependency, PlanItem, Vulnerability } from "./types";

export type UpdateType = "major" | "minor" | "patch" | "other";

export const RISK_LEVELS = ["High", "Medium", "Low", "Unknown"] as const;

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MODERATE", "MEDIUM", "LOW"];

/** Unique per manifest, since the same package can be listed in several files. */
export function itemKey(item: Pick<PlanItem, "file_path" | "dependency">) {
  return `${item.file_path}::${item.dependency}`;
}

export function depKey(dep: Pick<Dependency, "file_path" | "name">) {
  return `${dep.file_path}::${dep.name}`;
}

export function isUpgrade(item: PlanItem) {
  return item.from_version !== item.to_version;
}

export function repoName(url: string) {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
}

export function severityRank(vuln: Vulnerability) {
  const rank = SEVERITY_ORDER.indexOf((vuln.severity || "").toUpperCase());
  return rank === -1 ? SEVERITY_ORDER.length : rank;
}

function versionParts(version: string): number[] | null {
  const match = version.replace(/^[\s^~=<>!v]+/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? [match[1], match[2], match[3]].map((part) => Number(part ?? 0)) : null;
}

/** Classifies an upgrade by which part of the version changes. */
export function updateType(item: PlanItem): UpdateType {
  const from = versionParts(item.from_version);
  const to = versionParts(item.to_version);
  if (!from || !to) return "other";
  if (to[0] !== from[0]) return "major";
  if (to[1] !== from[1]) return "minor";
  return "patch";
}

export type DiffLine = { kind: "removed" | "added"; text: string };
export type FileDiff = { file: string; lines: DiffLine[] };

const PIN_OPERATORS = ["===", "==", "~=", ">="];

/** Mirrors updated_spec in backend/core/pyproject.py. */
function updatedPyprojectSpec(declared: string, toVersion: string, section: string) {
  const spec = declared.trim();
  if (section === "poetry") {
    const prefix = spec.match(/^(\^|~=|~|>=|==)?/)?.[1] ?? "";
    return `${prefix}${toVersion}`;
  }
  if (!spec.includes(",")) {
    const op = PIN_OPERATORS.find((operator) => spec.startsWith(operator));
    if (op) return `${op}${toVersion}`;
  }
  return `>=${toVersion}`;
}

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

/** Mirrors how the backend rewrites each manifest, so the preview matches the pull request. */
export function buildDiff(items: PlanItem[], dependencies: Dependency[]): FileDiff[] {
  const byKey = new Map(dependencies.map((dep) => [depKey(dep), dep]));
  const files = new Map<string, DiffLine[]>();

  for (const item of items) {
    const dep = byKey.get(itemKey(item));
    if (!dep) continue;
    const lines = files.get(dep.file_path) ?? [];
    const file = basename(dep.file_path);
    if (file === "package.json") {
      const prefix = dep.declared.startsWith("^") ? "^" : dep.declared.startsWith("~") ? "~" : "";
      lines.push({ kind: "removed", text: `    "${dep.name}": "${dep.declared}",` });
      lines.push({ kind: "added", text: `    "${dep.name}": "${prefix}${item.to_version}",` });
    } else if (file === "pyproject.toml") {
      const next = updatedPyprojectSpec(dep.declared, item.to_version, dep.section);
      if (dep.section === "poetry") {
        lines.push({ kind: "removed", text: `${dep.name} = "${dep.declared}"` });
        lines.push({ kind: "added", text: `${dep.name} = "${next}"` });
      } else {
        lines.push({ kind: "removed", text: `    "${dep.name}${dep.declared}",` });
        lines.push({ kind: "added", text: `    "${dep.name}${next}",` });
      }
    } else {
      lines.push({ kind: "removed", text: `${dep.name}${dep.declared}` });
      lines.push({ kind: "added", text: `${item.dependency}==${item.to_version}` });
    }
    files.set(dep.file_path, lines);
  }
  return [...files].map(([file, lines]) => ({ file, lines }));
}
