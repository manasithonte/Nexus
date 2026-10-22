"use client";

import { useEffect, useState } from "react";

type Vulnerability = {
  id: string;
  summary: string;
  severity: string | null;
  fixed_in: string | null;
  url: string;
};

type UsageLocation = {
  file: string;
  line: number;
  code: string;
};

type Dependency = {
  name: string;
  current_version: string;
  latest_version: string | null;
  is_outdated: boolean;
  file_path: string;
  source_repo: string | null;
  vulnerabilities: Vulnerability[];
  usages: UsageLocation[];
};

type PlanItem = {
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

type AnalyzeResult = {
  repo_url: string;
  dependencies: Dependency[];
  upgrade_plan: PlanItem[];
};

type UpgradeResult = {
  success: boolean;
  pr_url: string | null;
  message: string;
};

type Filter = "upgrades" | "security" | "all";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const EXAMPLE_REPOS = [
  "https://github.com/expressjs/express",
  "https://github.com/miguelgrinberg/microblog",
];

const TONES = {
  red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  neutral: "bg-surface text-muted ring-line",
};

const RISK_TONE: Record<string, keyof typeof TONES> = {
  High: "red",
  Medium: "amber",
  Low: "green",
};

const SEVERITY_CLASS: Record<string, string> = {
  CRITICAL: "text-red-700 dark:text-red-400 font-semibold",
  HIGH: "text-red-700 dark:text-red-400",
  MODERATE: "text-amber-700 dark:text-amber-300",
  MEDIUM: "text-amber-700 dark:text-amber-300",
};

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MODERATE", "MEDIUM", "LOW"];
const VULNS_SHOWN = 5;

function severityRank(vuln: Vulnerability) {
  const rank = SEVERITY_ORDER.indexOf((vuln.severity || "").toUpperCase());
  return rank === -1 ? SEVERITY_ORDER.length : rank;
}

// Renders the **bold** and `code` markup that the model's text often contains
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-medium">{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-bg px-1 font-mono text-[0.85em] ring-1 ring-line">{part.slice(1, -1)}</code>
        ) : (
          part
        )
      )}
    </>
  );
}

function isUpgrade(item: PlanItem) {
  return item.from_version !== item.to_version;
}

function repoName(url: string) {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the Nexus API. If it has been idle, it may still be starting up. Try again in a minute.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || `Request failed with status ${res.status}`);
  }
  return data as T;
}

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="bg-bg px-5 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {detail && <span className="text-sm text-muted">{detail}</span>}
      </dd>
    </div>
  );
}

function PackageDetails({ item }: { item: PlanItem }) {
  const [showAllVulns, setShowAllVulns] = useState(false);
  const vulns = [...item.vulnerabilities].sort((a, b) => severityRank(a) - severityRank(b));
  const shownVulns = showAllVulns ? vulns : vulns.slice(0, VULNS_SHOWN);
  return (
    <div className="space-y-5 border-t border-line bg-surface px-4 py-5 sm:px-5 sm:pl-12">
      {item.vulnerabilities.length > 0 && (
        <section>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
            Known vulnerabilities ({item.vulnerabilities.length})
          </h4>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-bg">
            {shownVulns.map((vuln) => (
              <li key={vuln.id} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[11rem_6rem_1fr_auto] sm:gap-3">
                <a href={vuln.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs leading-5 underline decoration-line underline-offset-2 hover:decoration-fg">
                  {vuln.id}
                </a>
                <span className={`text-xs leading-5 ${SEVERITY_CLASS[(vuln.severity || "").toUpperCase()] || "text-muted"}`}>
                  {vuln.severity ? vuln.severity.toLowerCase() : "unrated"}
                </span>
                <span className="text-fg/90"><RichText text={vuln.summary} /></span>
                {vuln.fixed_in && <span className="font-mono text-xs leading-5 text-muted whitespace-nowrap">fixed in {vuln.fixed_in}</span>}
              </li>
            ))}
          </ul>
          {vulns.length > VULNS_SHOWN && (
            <button type="button" onClick={() => setShowAllVulns((v) => !v)} className="mt-2 text-sm text-muted hover:text-fg">
              {showAllVulns ? "Show fewer" : `Show all ${vulns.length}`}
            </button>
          )}
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Assessment</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-6"><RichText text={item.reasoning} /></p>
          <p className="mt-2 text-xs text-muted">
            {item.notes_source ? `Based on ${item.notes_source}` : "No release notes found, so this assessment is less reliable."}
          </p>
        </section>
        <section>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Breaking changes</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-6"><RichText text={item.breaking_changes} /></p>
          {item.affected_locations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted">Code to review</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.affected_locations.map((loc) => (
                  <code key={loc} className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-xs">{loc}</code>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PackageRow({
  item,
  latestUnknown,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  item: PlanItem;
  latestUnknown: boolean;
  selected: boolean;
  expanded: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
}) {
  const upgrade = isUpgrade(item);
  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <input
          type="checkbox"
          aria-label={`Include ${item.dependency}`}
          className="size-4 shrink-0 accent-fg disabled:opacity-30"
          checked={selected}
          disabled={!upgrade}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={!upgrade}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 flex-col gap-2 text-left disabled:cursor-default sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{item.dependency}</span>
            <span className="mt-0.5 block font-mono text-xs text-muted">
              {upgrade ? (
                <>
                  {item.from_version} <span aria-hidden="true">→</span> <span className="text-fg">{item.to_version}</span>
                </>
              ) : (
                <>{item.from_version} · {latestUnknown ? "couldn't check the latest version" : "up to date"}</>
              )}
            </span>
          </span>
          {upgrade && (
            <span className="flex flex-wrap items-center gap-1.5">
              {item.security_fix && <Badge tone="amber">Security fix</Badge>}
              <Badge tone={RISK_TONE[item.risk_level] || "neutral"}>
                {item.risk_level === "Unknown" ? "Not assessed" : `${item.risk_level} risk`}
              </Badge>
              <svg
                className={`ml-1 hidden size-4 text-muted transition-transform sm:block ${expanded ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </button>
      </div>
      {expanded && <PackageDetails item={item} />}
    </li>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>("upgrades");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResult | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    setUpgradeResult(null);
    setUpgradeError(null);
    setExpanded({});

    try {
      const data = await postJson<AnalyzeResult>("/api/analyze", { repo_url: repoUrl.trim(), github_token: githubToken });
      setResult(data);
      setSelected(Object.fromEntries(data.upgrade_plan.map((item) => [item.dependency, isUpgrade(item) && item.recommended])));
      setFilter(data.upgrade_plan.some((item) => item.security_fix) ? "security" : "upgrades");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong while analyzing the repository.");
    } finally {
      setLoading(false);
    }
  };

  const plan = result?.upgrade_plan ?? [];
  const upgrades = plan.filter(isUpgrade);
  const securityItems = plan.filter((item) => item.vulnerabilities.length > 0);
  const visible = filter === "upgrades" ? upgrades : filter === "security" ? securityItems : plan;
  const selectedItems = upgrades.filter((item) => selected[item.dependency]);
  const vulnCount = result?.dependencies.reduce((total, dep) => total + dep.vulnerabilities.length, 0) ?? 0;
  const unknownLatest = new Set(result?.dependencies.filter((dep) => !dep.latest_version).map((dep) => dep.name));

  const executeUpgrade = async () => {
    if (selectedItems.length === 0 || !githubToken) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const data = await postJson<UpgradeResult>("/api/upgrade", {
        repo_url: result!.repo_url,
        plan: selectedItems,
        github_token: githubToken,
      });
      setUpgradeResult(data);
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong while creating the pull request.");
    } finally {
      setUpgrading(false);
    }
  };

  const setAll = (value: (item: PlanItem) => boolean) =>
    setSelected(Object.fromEntries(upgrades.map((item) => [item.dependency, value(item)])));

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "upgrades", label: "Upgrades", count: upgrades.length },
    { id: "security", label: "Vulnerable", count: securityItems.length },
    { id: "all", label: "All packages", count: plan.length },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12m0 0-4-4m4 4 4-4" />
              <path d="M5 21h14" />
            </svg>
            Nexus
          </span>
          <a href="https://github.com/manasithonte/Nexus" target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-fg">
            GitHub
          </a>
        </div>
      </header>

      <main className={`mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 ${result ? "pb-32" : "pb-16"}`}>
        <section className="pt-12 pb-8 sm:pt-16">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Upgrade dependencies without breaking your code.
          </h1>
          <p className="mt-3 max-w-2xl text-muted leading-7">
            Nexus checks each dependency for known vulnerabilities, reads the release notes, finds where your code uses it,
            and opens a pull request with the upgrades you approve. Works with <code className="font-mono text-sm text-fg">requirements.txt</code> and{" "}
            <code className="font-mono text-sm text-fg">package.json</code>.
          </p>

          <form onSubmit={handleAnalyze} className="mt-8 max-w-2xl">
            <label htmlFor="repo" className="text-sm font-medium">GitHub repository</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="repo"
                type="url"
                required
                placeholder="https://github.com/owner/repo"
                className="h-10 flex-1 rounded-md border border-line bg-bg px-3 text-sm outline-none placeholder:text-muted/70 focus:border-fg/40 focus:ring-2 focus:ring-fg/10"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
              >
                {loading && <Spinner />}
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>Try:</span>
              {EXAMPLE_REPOS.map((url) => (
                <button key={url} type="button" onClick={() => setRepoUrl(url)} className="font-mono text-xs underline decoration-line underline-offset-4 hover:text-fg hover:decoration-fg">
                  {repoName(url)}
                </button>
              ))}
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <button type="button" onClick={() => setShowToken((v) => !v)} className="hover:text-fg">
                {showToken ? "Hide GitHub token" : "Add GitHub token"}
              </button>
            </div>

            {showToken && (
              <div className="mt-4 rounded-md border border-line p-4">
                <label htmlFor="token" className="text-sm font-medium">GitHub token</label>
                <p className="mt-1 text-sm text-muted">
                  Needed for private repositories and for opening pull requests. Use a fine-grained token with read and write
                  access to Contents and Pull requests on this repository. It is only sent to the Nexus API for this session.
                </p>
                <input
                  id="token"
                  type="password"
                  autoComplete="off"
                  placeholder="github_pat_…"
                  className="mt-3 h-10 w-full rounded-md border border-line bg-bg px-3 font-mono text-sm outline-none placeholder:text-muted/70 focus:border-fg/40 focus:ring-2 focus:ring-fg/10"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
              </div>
            )}
          </form>
        </section>

        {loading && (
          <div className="max-w-2xl rounded-md border border-line px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Spinner /> Analyzing {repoName(repoUrl)} <span className="tabular-nums text-muted">{elapsed}s</span>
            </p>
            <p className="mt-1 text-muted">
              Cloning the repository, checking OSV.dev for vulnerabilities, reading release notes and reviewing each upgrade.
              This usually takes 30–90 seconds, longer if the server was idle.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="max-w-2xl rounded-md border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {result && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                <a href={result.repo_url} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">
                  {repoName(result.repo_url)}
                </a>
              </h2>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              <Stat label="Packages" value={result.dependencies.length} />
              <Stat label="Outdated" value={upgrades.length} />
              <Stat label="Vulnerabilities" value={vulnCount} detail={`in ${securityItems.length} packages`} />
              <Stat label="Security fixes" value={plan.filter((item) => item.security_fix).length} />
            </dl>

            {plan.length === 0 ? (
              <p className="rounded-lg border border-line px-5 py-10 text-center text-muted">
                No <code className="font-mono text-sm">requirements.txt</code> or <code className="font-mono text-sm">package.json</code> found at the root of this repository.
              </p>
            ) : (
              <div className="rounded-lg border border-line">
                <div className="flex flex-col gap-3 border-b border-line px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={filter === tab.id}
                        onClick={() => setFilter(tab.id)}
                        className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-sm ${filter === tab.id ? "bg-surface font-medium text-fg" : "text-muted hover:text-fg"}`}
                      >
                        {tab.label} <span className="tabular-nums text-muted">{tab.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3 text-sm text-muted">
                    <button type="button" onClick={() => setAll((item) => item.recommended)} className="hover:text-fg">Select recommended</button>
                    <button type="button" onClick={() => setAll(() => false)} className="hover:text-fg">Clear</button>
                  </div>
                </div>

                {visible.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted">
                    {filter === "security" ? "No known vulnerabilities in these dependencies." : "Everything is up to date."}
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {visible.map((item) => (
                      <PackageRow
                        key={item.dependency}
                        item={item}
                        latestUnknown={unknownLatest.has(item.dependency)}
                        selected={!!selected[item.dependency]}
                        expanded={!!expanded[item.dependency]}
                        onSelect={(checked) => setSelected((prev) => ({ ...prev, [item.dependency]: checked }))}
                        onToggle={() => setExpanded((prev) => ({ ...prev, [item.dependency]: !prev[item.dependency] }))}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="text-xs text-muted">
              Vulnerability data from OSV.dev. Versions from PyPI and npm. Release notes from GitHub. Assessments by Gemini can be wrong, so review the pull request before merging.
            </p>
          </section>
        )}
      </main>

      {result && upgrades.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-sm">
              {upgradeResult ? (
                upgradeResult.success ? (
                  <span>Pull request created.</span>
                ) : (
                  <span className="text-muted">{upgradeResult.message}</span>
                )
              ) : upgradeError ? (
                <span className="text-red-700 dark:text-red-400">{upgradeError}</span>
              ) : !githubToken ? (
                <span className="text-muted">
                  {selectedItems.length} selected ·{" "}
                  <button type="button" onClick={() => { setShowToken(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="underline underline-offset-4 hover:text-fg">
                    Add a GitHub token
                  </button>{" "}
                  to open a pull request
                </span>
              ) : (
                <span className="text-muted">
                  <span className="font-medium text-fg">{selectedItems.length}</span> of {upgrades.length} upgrades selected
                </span>
              )}
            </div>
            {upgradeResult?.pr_url ? (
              <a
                href={upgradeResult.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90"
              >
                View pull request
              </a>
            ) : (
              <button
                type="button"
                onClick={executeUpgrade}
                disabled={upgrading || selectedItems.length === 0 || !githubToken}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
              >
                {upgrading && <Spinner />}
                {upgrading ? "Creating pull request…" : `Create pull request${selectedItems.length ? ` (${selectedItems.length})` : ""}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
