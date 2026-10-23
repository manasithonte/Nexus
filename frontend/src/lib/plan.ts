import type { Dependency, PlanItem, Vulnerability } from "./types";

export type UpdateType = "major" | "minor" | "patch" | "other";

export const RISK_LEVELS = ["High", "Medium", "Low", "Unknown"] as const;

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MODERATE", "MEDIUM", "LOW"];

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

/** Mirrors how the backend rewrites each manifest, so the preview matches the pull request. */
export function buildDiff(items: PlanItem[], dependencies: Dependency[]): FileDiff[] {
  const byName = new Map(dependencies.map((dep) => [dep.name, dep]));
  const files = new Map<string, DiffLine[]>();

  for (const item of items) {
    const dep = byName.get(item.dependency);
    if (!dep) continue;
    const lines = files.get(dep.file_path) ?? [];
    if (dep.file_path === "package.json") {
      const prefix = dep.declared.startsWith("^") ? "^" : dep.declared.startsWith("~") ? "~" : "";
      lines.push({ kind: "removed", text: `    "${dep.name}": "${dep.declared}",` });
      lines.push({ kind: "added", text: `    "${dep.name}": "${prefix}${item.to_version}",` });
    } else {
      lines.push({ kind: "removed", text: `${dep.name}${dep.declared}` });
      lines.push({ kind: "added", text: `${item.dependency}==${item.to_version}` });
    }
    files.set(dep.file_path, lines);
  }
  return [...files].map(([file, lines]) => ({ file, lines }));
}
