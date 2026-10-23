"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pipeline, STAGES, type PipelineMode } from "@/components/Pipeline";
import { RiskBreakdown, StatCards, type Tab } from "@/components/Overview";
import { PackageList } from "@/components/PackageList";
import { ReviewDrawer } from "@/components/ReviewDrawer";
import { Icon, Spinner } from "@/components/ui";
import { createPullRequest, streamAnalysis } from "@/lib/api";
import { RISK_LEVELS, depKey, isUpgrade, itemKey, repoName, updateType, type UpdateType } from "@/lib/plan";
import type { AnalyzeResult, StageId, StageState, UpgradeResult } from "@/lib/types";

const EXAMPLE_REPOS = ["https://github.com/expressjs/express", "https://github.com/miguelgrinberg/microblog"];

const RECENT_KEY = "nexus.recentScans";

type RecentScan = { url: string; outdated: number; vulnerabilities: number; at: number };

const FEATURES = [
  {
    title: "Real vulnerability data",
    body: "Every package is checked against OSV.dev, and upgrades that fix a known advisory are flagged and listed first.",
  },
  {
    title: "Grounded in release notes",
    body: "The AI reads the actual changelogs between your version and the latest, not just the version numbers.",
  },
  {
    title: "Specific to your code",
    body: "Nexus finds where you import each package and points to the exact lines a breaking change could affect.",
  },
];

function initialStages(): Record<StageId, StageState> {
  return Object.fromEntries(STAGES.map((stage) => [stage.id, { status: "pending" }])) as Record<StageId, StageState>;
}

function loadRecent(): RecentScan[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(scans: RecentScan[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(scans));
  } catch {
    // Storage can be unavailable (private mode); recent scans are just a convenience
  }
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [mode, setMode] = useState<PipelineMode>("idle");
  const [stages, setStages] = useState(initialStages);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);

  const [tab, setTab] = useState<Tab>("upgrades");
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<UpdateType | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResult | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const repoInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => setRecent(loadRecent()), []);

  useEffect(() => {
    if (mode !== "running") return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [mode, startedAt]);

  // Press "/" to jump to the package search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || !result || ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = repoUrl.trim();
    if (!url || mode === "running") return;

    const now = Date.now();
    setMode("running");
    setStages(initialStages());
    setStartedAt(now);
    setElapsed(0);
    setError(null);
    setResult(null);
    setExpanded({});
    setQuery("");
    setRiskFilter(null);
    setTypeFilter(null);
    setUpgradeResult(null);
    setUpgradeError(null);

    try {
      const data = await streamAnalysis({ repo_url: url, github_token: token }, (event) => {
        if (event.type !== "stage") return;
        setStages((prev) => {
          const current = prev[event.id];
          const at = Date.now();
          return {
            ...prev,
            [event.id]: {
              status: event.status,
              detail: event.detail ?? current.detail,
              startedAt: current.startedAt ?? at,
              endedAt: event.status === "done" ? at : undefined,
            },
          };
        });
      });

      setElapsed(Math.floor((Date.now() - now) / 1000));
      setMode("done");
      setResult(data);
      setSelected(Object.fromEntries(data.upgrade_plan.map((item) => [itemKey(item), isUpgrade(item) && item.recommended])));
      setTab(data.upgrade_plan.some((item) => item.security_fix) ? "vulnerable" : "upgrades");

      const scan: RecentScan = {
        url,
        outdated: data.upgrade_plan.filter(isUpgrade).length,
        vulnerabilities: data.dependencies.reduce((total, dep) => total + dep.vulnerabilities.length, 0),
        at: Date.now(),
      };
      const next = [scan, ...loadRecent().filter((s) => s.url !== url)].slice(0, 4);
      saveRecent(next);
      setRecent(next);

      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setMode("error");
      setError(err instanceof Error ? err.message : "Something went wrong while analyzing the repository.");
      setStages((prev) => {
        const active = STAGES.find((stage) => prev[stage.id].status === "active");
        return active ? { ...prev, [active.id]: { ...prev[active.id], status: "error" } } : prev;
      });
    }
  };

  const plan = useMemo(() => result?.upgrade_plan ?? [], [result]);
  const dependencies = useMemo(() => new Map(result?.dependencies.map((dep) => [depKey(dep), dep]) ?? []), [result]);
  const upgrades = useMemo(() => plan.filter(isUpgrade), [plan]);
  const vulnerable = useMemo(() => plan.filter((item) => item.vulnerabilities.length > 0), [plan]);
  const selectedItems = upgrades.filter((item) => selected[itemKey(item)]);

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of upgrades) {
      const risk = (RISK_LEVELS as readonly string[]).includes(item.risk_level) ? item.risk_level : "Unknown";
      counts[risk] = (counts[risk] || 0) + 1;
    }
    return counts;
  }, [upgrades]);

  const typeCounts = useMemo(() => {
    const counts = { major: 0, minor: 0, patch: 0, other: 0 };
    for (const item of upgrades) counts[updateType(item)]++;
    return counts;
  }, [upgrades]);

  const visible = useMemo(() => {
    const base = tab === "upgrades" ? upgrades : tab === "vulnerable" ? vulnerable : plan;
    const q = query.trim().toLowerCase();
    return base.filter((item) => {
      const risk = (RISK_LEVELS as readonly string[]).includes(item.risk_level) ? item.risk_level : "Unknown";
      return (
        (!q || item.dependency.toLowerCase().includes(q) || item.file_path.toLowerCase().includes(q)) &&
        (!riskFilter || (isUpgrade(item) && risk === riskFilter)) &&
        (!typeFilter || (isUpgrade(item) && updateType(item) === typeFilter))
      );
    });
  }, [tab, upgrades, vulnerable, plan, query, riskFilter, typeFilter]);

  const filters = [
    ...(riskFilter ? [{ label: `${riskFilter === "Unknown" ? "Not assessed" : riskFilter} risk`, onClear: () => setRiskFilter(null) }] : []),
    ...(typeFilter ? [{ label: `${typeFilter} updates`, onClear: () => setTypeFilter(null) }] : []),
  ];

  const createPr = async () => {
    if (!result || !token || selectedItems.length === 0) return;
    setCreating(true);
    setUpgradeError(null);
    setUpgradeResult(null);
    try {
      setUpgradeResult(await createPullRequest({ repo_url: result.repo_url, plan: selectedItems, github_token: token }));
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong while creating the pull request.");
    } finally {
      setCreating(false);
    }
  };

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `nexus-${repoName(result.repo_url).replace("/", "-")}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const newScan = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => repoInputRef.current?.select(), 300);
  };

  const securityFixCount = plan.filter((item) => item.security_fix).length;
  const selectedFixes = selectedItems.filter((item) => item.security_fix).length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#" onClick={(e) => { e.preventDefault(); newScan(); }} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-fg text-bg">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V7m0 0-5 5m5-5 5 5" />
              </svg>
            </span>
            Nexus
          </a>
          <a href="https://github.com/manasithonte/Nexus" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <Icon name="github" /> <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </header>

      <main className={`flex-1 ${result ? "pb-28" : "pb-16"}`}>
        <section className="relative">
          <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-14 pb-12 sm:px-6 lg:grid-cols-[1fr_400px] lg:gap-14 lg:pt-20">
            <div className="animate-fade-in-up">
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-line bg-bg px-3 py-1 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-accent" />
                {["requirements.txt", "pyproject.toml", "package.json"].map((file, i) => (
                  <span key={file} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true">·</span>}
                    <span className="font-mono text-[11px] text-fg/80">{file}</span>
                  </span>
                ))}
                <span className="hidden sm:inline">· any folder in a GitHub repo</span>
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Upgrade dependencies without breaking your code.
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
                Nexus checks every dependency for known vulnerabilities, reads the release notes, finds where your code
                uses it, and opens a pull request with the upgrades you approve.
              </p>

              <form onSubmit={handleAnalyze} className="mt-8 max-w-xl">
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.15)] focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10 sm:flex-row">
                  <label htmlFor="repo" className="sr-only">GitHub repository URL</label>
                  <div className="flex flex-1 items-center gap-2 px-2.5">
                    <Icon name="github" className="size-4 shrink-0 text-muted" />
                    <input
                      ref={repoInputRef}
                      id="repo"
                      type="url"
                      required
                      placeholder="https://github.com/owner/repo"
                      className="h-10 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={mode === "running"}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-fg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                  >
                    {mode === "running" ? <><Spinner /> Analyzing</> : "Analyze repository"}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
                  <span>Try</span>
                  {EXAMPLE_REPOS.map((url) => (
                    <button key={url} type="button" onClick={() => setRepoUrl(url)} className="rounded-md border border-line bg-bg px-2 py-0.5 font-mono text-xs transition hover:border-fg/20 hover:text-fg">
                      {repoName(url)}
                    </button>
                  ))}
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={() => setShowToken((v) => !v)} className="hover:text-fg">
                    {showToken ? "Hide token" : "Private repo?"}
                  </button>
                </div>

                {showToken && (
                  <div className="mt-4 animate-fade-in-up rounded-xl border border-line bg-bg p-4">
                    <label htmlFor="token" className="text-sm font-medium">GitHub token</label>
                    <p className="mt-1 text-sm text-muted">
                      Needed for private repositories and for opening pull requests. It is only sent to the Nexus API and never stored.
                    </p>
                    <input
                      id="token"
                      type="password"
                      autoComplete="off"
                      placeholder="github_pat_…"
                      className="mt-3 h-10 w-full rounded-lg border border-line bg-bg px-3 font-mono text-sm outline-none placeholder:text-muted/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </div>
                )}

                {recent.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">Recent scans</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recent.map((scan) => (
                        <button
                          key={scan.url}
                          type="button"
                          onClick={() => setRepoUrl(scan.url)}
                          className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm transition hover:border-fg/20"
                        >
                          <span className="font-mono text-xs">{repoName(scan.url)}</span>
                          <span className="text-xs text-muted">{scan.outdated} outdated</span>
                          {scan.vulnerabilities > 0 && <span className="text-xs text-red-600 dark:text-red-400">{scan.vulnerabilities} vulns</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form>

              {error && (
                <div role="alert" className="mt-6 max-w-xl animate-fade-in-up rounded-xl border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>

            <div className="animate-fade-in-up [animation-delay:120ms]">
              <Pipeline mode={mode} stages={stages} elapsed={elapsed} repo={repoName(repoUrl)} />
            </div>
          </div>
        </section>

        {!result && mode !== "running" && (
          <section className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 sm:px-6 md:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <div key={feature.title} className="animate-fade-in-up border-t border-line py-6 md:pr-8" style={{ animationDelay: `${200 + i * 80}ms` }}>
                <h2 className="font-medium">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{feature.body}</p>
              </div>
            ))}
          </section>
        )}

        {result && (
          <section ref={resultsRef} className="mx-auto max-w-6xl scroll-mt-20 space-y-4 px-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  <a href={result.repo_url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">
                    {repoName(result.repo_url)}
                  </a>
                </h2>
                <p className="mt-0.5 text-sm text-muted">Analyzed in {elapsed}s</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={exportJson} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-muted transition hover:border-fg/20 hover:text-fg">
                  <Icon name="download" className="size-3.5" /> Export JSON
                </button>
                <button type="button" onClick={newScan} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm text-muted transition hover:border-fg/20 hover:text-fg">
                  New scan
                </button>
              </div>
            </div>

            <StatCards
              packages={result.dependencies.length}
              outdated={upgrades.length}
              vulnerabilities={result.dependencies.reduce((total, dep) => total + dep.vulnerabilities.length, 0)}
              vulnerablePackages={vulnerable.length}
              securityFixes={securityFixCount}
              tab={tab}
              onTab={setTab}
            />

            <RiskBreakdown
              riskCounts={riskCounts}
              typeCounts={typeCounts}
              riskFilter={riskFilter}
              typeFilter={typeFilter}
              onRisk={(risk) => { setRiskFilter(risk); if (risk && tab === "all") setTab("upgrades"); }}
              onType={(type) => { setTypeFilter(type); if (type && tab === "all") setTab("upgrades"); }}
            />

            {plan.length === 0 ? (
              <p className="rounded-xl border border-line px-5 py-12 text-center text-muted">
                No <code className="font-mono text-sm">requirements.txt</code>, <code className="font-mono text-sm">pyproject.toml</code> or <code className="font-mono text-sm">package.json</code> found in this repository.
              </p>
            ) : (
              <PackageList
                ref={searchRef}
                items={visible}
                dependencies={dependencies}
                tab={tab}
                tabs={[
                  { id: "upgrades", label: "Upgrades", count: upgrades.length },
                  { id: "vulnerable", label: "Vulnerable", count: vulnerable.length },
                  { id: "all", label: "All packages", count: plan.length },
                ]}
                query={query}
                filters={filters}
                selected={selected}
                expanded={expanded}
                onTab={setTab}
                onQuery={setQuery}
                onSelect={(name, checked) => setSelected((prev) => ({ ...prev, [name]: checked }))}
                onToggle={(name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))}
                onSelectRecommended={() => setSelected(Object.fromEntries(upgrades.map((item) => [itemKey(item), item.recommended])))}
                onClear={() => setSelected({})}
              />
            )}

            <p className="text-xs leading-5 text-muted">
              Vulnerability data from OSV.dev. Versions from PyPI and npm. Release notes from GitHub. Assessments by Gemini can be wrong, so review the pull request and run your tests before merging.
            </p>
          </section>
        )}
      </main>

      {result && upgrades.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4 animate-fade-in-up">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-line bg-bg/90 py-2 pr-2 pl-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.3)] backdrop-blur">
            <p className="text-sm">
              <span className="font-medium tabular-nums">{selectedItems.length}</span>
              <span className="text-muted"> of {upgrades.length} selected</span>
              {selectedFixes > 0 && <span className="hidden text-muted sm:inline"> · {selectedFixes} security fix{selectedFixes === 1 ? "" : "es"}</span>}
            </p>
            <button
              type="button"
              onClick={() => { setUpgradeResult(null); setUpgradeError(null); setDrawerOpen(true); }}
              disabled={selectedItems.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg transition hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            >
              <Icon name="pr" /> Review changes
            </button>
          </div>
        </div>
      )}

      {result && (
        <ReviewDrawer
          open={drawerOpen}
          items={selectedItems}
          dependencies={result.dependencies}
          repo={repoName(result.repo_url)}
          token={token}
          creating={creating}
          result={upgradeResult}
          error={upgradeError}
          onToken={setToken}
          onCreate={createPr}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
