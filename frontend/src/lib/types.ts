export type Vulnerability = {
  id: string;
  summary: string;
  severity: string | null;
  fixed_in: string | null;
  url: string;
};

export type UsageLocation = {
  file: string;
  line: number;
  code: string;
};

export type Dependency = {
  name: string;
  current_version: string;
  declared: string;
  latest_version: string | null;
  is_outdated: boolean;
  file_path: string;
  source_repo: string | null;
  vulnerabilities: Vulnerability[];
  usages: UsageLocation[];
};

export type PlanItem = {
  dependency: string;
  from_version: string;
  to_version: string;
  breaking_changes: string;
  risk_level: string;
  recommended: boolean;
  reasoning: string;
  affected_locations: string[];
  vulnerabilities: Vulnerability[];
  security_fix: boolean;
  notes_source: string | null;
};

export type AnalyzeResult = {
  repo_url: string;
  dependencies: Dependency[];
  upgrade_plan: PlanItem[];
};

export type UpgradeResult = {
  success: boolean;
  pr_url: string | null;
  message: string;
};

export type StageId = "clone" | "manifests" | "usage" | "registry" | "security" | "notes" | "ai";

export type StageStatus = "pending" | "active" | "done" | "error";

export type StageState = {
  status: StageStatus;
  detail?: string | null;
  startedAt?: number;
  endedAt?: number;
};

export type StreamEvent =
  | { type: "stage"; id: StageId; status: "active" | "done"; detail: string | null }
  | { type: "result"; data: AnalyzeResult }
  | { type: "error"; message: string };
