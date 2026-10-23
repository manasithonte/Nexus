"use client";

import { useEffect, useRef } from "react";
import { buildDiff, itemKey } from "@/lib/plan";
import type { Dependency, PlanItem, UpgradeResult } from "@/lib/types";
import { Badge, Icon, RISK_TONE, Spinner } from "./ui";

export function ReviewDrawer({
  open,
  items,
  dependencies,
  repo,
  token,
  creating,
  result,
  error,
  onToken,
  onCreate,
  onClose,
}: {
  open: boolean;
  items: PlanItem[];
  dependencies: Dependency[];
  repo: string;
  token: string;
  creating: boolean;
  result: UpgradeResult | null;
  error: string | null;
  onToken: (token: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const diff = buildDiff(items, dependencies);
  const securityFixes = items.filter((item) => item.security_fix);
  const highRisk = items.filter((item) => item.risk_level === "High");

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-line bg-bg shadow-2xl outline-none animate-slide-in-right"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id="review-title" className="font-semibold">Review changes</h2>
            <p className="mt-0.5 text-sm text-muted">
              {items.length} upgrade{items.length === 1 ? "" : "s"} to <span className="font-mono text-[13px]">{repo}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-surface hover:text-fg">
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {result?.success && result.pr_url ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white animate-pop">
              <Icon name="check" className="size-7" />
            </span>
            <h3 className="mt-5 text-lg font-semibold">Pull request created</h3>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Review the changes on GitHub and run your tests before merging.
            </p>
            <a
              href={result.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90"
            >
              <Icon name="pr" /> View pull request
            </a>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {(securityFixes.length > 0 || highRisk.length > 0) && (
                <div className="flex flex-wrap gap-2">
                  {securityFixes.length > 0 && <Badge tone="amber">{securityFixes.length} security fix{securityFixes.length === 1 ? "" : "es"}</Badge>}
                  {highRisk.length > 0 && <Badge tone="red">{highRisk.length} high risk</Badge>}
                </div>
              )}

              <section>
                <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Files changed</h3>
                <div className="mt-2 space-y-3">
                  {diff.map((file) => (
                    <div key={file.file} className="overflow-hidden rounded-lg border border-line">
                      <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-2">
                        <span className="flex items-center gap-2 font-mono text-xs">
                          <Icon name="file" className="size-3.5 text-muted" />
                          {file.file}
                        </span>
                        <span className="font-mono text-xs">
                          <span className="text-emerald-600 dark:text-emerald-400">+{file.lines.filter((l) => l.kind === "added").length}</span>{" "}
                          <span className="text-red-600 dark:text-red-400">-{file.lines.filter((l) => l.kind === "removed").length}</span>
                        </span>
                      </div>
                      <pre className="overflow-x-auto py-1 font-mono text-xs leading-5">
                        {file.lines.map((line, i) => (
                          <div
                            key={i}
                            className={
                              line.kind === "added"
                                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                : "bg-red-500/10 text-red-800 dark:text-red-300"
                            }
                          >
                            <span className="inline-block w-6 text-center opacity-60 select-none">{line.kind === "added" ? "+" : "-"}</span>
                            {line.text}
                          </div>
                        ))}
                      </pre>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Pull request</h3>
                <div className="mt-2 rounded-lg border border-line p-4">
                  <p className="text-sm font-medium">Update Dependencies (Auto-Generated by Nexus)</p>
                  <ul className="mt-3 space-y-2.5 text-sm">
                    {items.map((item) => (
                      <li key={itemKey(item)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.dependency}</span>
                          <span className="font-mono text-xs text-muted">{item.from_version} → {item.to_version}</span>
                          <Badge tone={RISK_TONE[item.risk_level] || "neutral"}>{item.risk_level === "Unknown" ? "Not assessed" : item.risk_level}</Badge>
                        </div>
                        {item.affected_locations.length > 0 && (
                          <p className="mt-1 font-mono text-xs text-muted">Review: {item.affected_locations.join(", ")}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>

            <div className="space-y-3 border-t border-line px-6 py-4">
              <div>
                <label htmlFor="drawer-token" className="text-sm font-medium">GitHub token</label>
                <p className="mt-0.5 text-xs text-muted">Needs read and write access to Contents and Pull requests on this repository.</p>
                <input
                  id="drawer-token"
                  type="password"
                  autoComplete="off"
                  placeholder="github_pat_…"
                  value={token}
                  onChange={(e) => onToken(e.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-line bg-bg px-3 font-mono text-sm outline-none placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/15"
                />
              </div>
              {(error || (result && !result.success)) && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error || result?.message}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="h-9 rounded-md px-4 text-sm text-muted hover:bg-surface hover:text-fg">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={creating || !token || items.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
                >
                  {creating ? <Spinner /> : <Icon name="pr" />}
                  {creating ? "Creating pull request…" : "Create pull request"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
