"use client";

import type { StageId, StageState } from "@/lib/types";
import { Icon, Spinner } from "./ui";

export const STAGES: { id: StageId; label: string; idle: string }[] = [
  { id: "clone", label: "Clone repository", idle: "Shallow copy of the default branch" },
  { id: "manifests", label: "Read manifests", idle: "requirements.txt and package.json" },
  { id: "usage", label: "Find imports", idle: "Every place your code uses each package" },
  { id: "registry", label: "Check latest versions", idle: "PyPI and npm registries" },
  { id: "security", label: "Scan for vulnerabilities", idle: "OSV.dev advisory database" },
  { id: "notes", label: "Read release notes", idle: "GitHub Releases and changelogs" },
  { id: "ai", label: "Review each upgrade", idle: "Gemini weighs the notes against your code" },
];

export type PipelineMode = "idle" | "running" | "done" | "error";

function StageIcon({ status }: { status: StageState["status"] }) {
  if (status === "active") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/30">
        <Spinner className="size-3.5" />
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-accent text-white animate-pop">
        <Icon name="check" className="size-3.5" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-red-500 text-white">
        <Icon name="x" className="size-3.5" />
      </span>
    );
  }
  return <span className="flex size-6 items-center justify-center rounded-full bg-bg ring-1 ring-line" />;
}

function seconds(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function Pipeline({
  mode,
  stages,
  elapsed,
  repo,
}: {
  mode: PipelineMode;
  stages: Record<StageId, StageState>;
  elapsed: number;
  repo: string;
}) {
  const doneCount = STAGES.filter((stage) => stages[stage.id].status === "done").length;
  const progress = mode === "idle" ? 0 : (doneCount / STAGES.length) * 100;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
      <div className="h-0.5 bg-line/60">
        <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="text-sm font-medium">
          {mode === "idle" && "How it works"}
          {mode === "running" && <span className="truncate">Analyzing <span className="font-mono text-[13px]">{repo}</span></span>}
          {mode === "done" && "Analysis complete"}
          {mode === "error" && "Analysis stopped"}
        </p>
        {mode !== "idle" && (
          <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
            <Icon name="clock" className="size-3.5" />
            {elapsed}s
          </span>
        )}
      </div>

      <ol className="px-5 py-4">
        {STAGES.map((stage, index) => {
          const state = stages[stage.id];
          const last = index === STAGES.length - 1;
          const duration = state.startedAt && state.endedAt ? state.endedAt - state.startedAt : null;
          return (
            <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  className={`absolute top-7 left-3 -ml-px h-[calc(100%-1.5rem)] w-0.5 transition-colors duration-500 ${state.status === "done" ? "bg-accent" : "bg-line"}`}
                  aria-hidden="true"
                />
              )}
              <StageIcon status={state.status} />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`text-sm ${state.status === "pending" && mode !== "idle" ? "text-muted" : "font-medium"}`}>{stage.label}</p>
                  {duration !== null && <span className="font-mono text-[11px] text-muted tabular-nums">{seconds(duration)}</span>}
                </div>
                <p
                  key={state.detail ?? stage.idle}
                  className={`mt-0.5 truncate text-xs ${state.detail ? "text-fg/80 animate-fade-in" : "text-muted"}`}
                >
                  {state.detail || stage.idle}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
