"use client";

import { forwardRef, useState } from "react";
import { isUpgrade, itemKey, severityRank, updateType, type UpdateType } from "@/lib/plan";
import type { Dependency, PlanItem } from "@/lib/types";
import type { Tab } from "./Overview";
import { Badge, Icon, Kbd, RISK_TONE, RichText } from "./ui";

const VULNS_SHOWN = 5;

const SEVERITY_CLASS: Record<string, string> = {
  CRITICAL: "text-red-700 dark:text-red-400 font-semibold",
  HIGH: "text-red-700 dark:text-red-400",
  MODERATE: "text-amber-700 dark:text-amber-300",
  MEDIUM: "text-amber-700 dark:text-amber-300",
};

const TYPE_CLASS: Record<UpdateType, string> = {
  major: "text-red-600 dark:text-red-400",
  minor: "text-amber-600 dark:text-amber-400",
  patch: "text-emerald-600 dark:text-emerald-400",
  other: "text-muted",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-medium tracking-wide text-muted uppercase">{children}</h4>;
}

function PackageDetails({ item, dep }: { item: PlanItem; dep?: Dependency }) {
  const [showAllVulns, setShowAllVulns] = useState(false);
  const vulns = [...item.vulnerabilities].sort((a, b) => severityRank(a) - severityRank(b));
  const shownVulns = showAllVulns ? vulns : vulns.slice(0, VULNS_SHOWN);

  return (
    <div className="space-y-5 border-t border-line bg-surface px-4 py-5 sm:px-5 sm:pl-12">
      {vulns.length > 0 && (
        <section>
          <SectionTitle>Known vulnerabilities ({vulns.length})</SectionTitle>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-bg">
            {shownVulns.map((vuln) => (
              <li key={vuln.id} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[11rem_5.5rem_1fr_auto] sm:gap-3">
                <a href={vuln.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs leading-5 underline decoration-line underline-offset-2 hover:text-accent hover:decoration-accent">
                  {vuln.id}
                </a>
                <span className={`text-xs leading-5 ${SEVERITY_CLASS[(vuln.severity || "").toUpperCase()] || "text-muted"}`}>
                  {vuln.severity ? vuln.severity.toLowerCase() : "unrated"}
                </span>
                <span className="text-fg/90"><RichText text={vuln.summary} /></span>
                {vuln.fixed_in && <span className="font-mono text-xs leading-5 whitespace-nowrap text-muted">fixed in {vuln.fixed_in}</span>}
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

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle>Assessment</SectionTitle>
          <p className="mt-2 text-sm leading-6 whitespace-pre-line"><RichText text={item.reasoning} /></p>
          <p className="mt-2 text-xs text-muted">
            {item.notes_source ? `Based on ${item.notes_source}` : "No release notes found, so this assessment is less reliable."}
          </p>
        </section>
        <section>
          <SectionTitle>Breaking changes</SectionTitle>
          <p className="mt-2 text-sm leading-6 whitespace-pre-line"><RichText text={item.breaking_changes} /></p>
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

      {dep?.source_repo && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
          <a href={`https://github.com/${dep.source_repo}/releases`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-fg">
            Release notes <Icon name="external" className="size-3.5" />
          </a>
          <a href={`https://github.com/${dep.source_repo}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-fg">
            {dep.source_repo} <Icon name="external" className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

function PackageRow({
  index,
  item,
  dep,
  showFile,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  index: number;
  item: PlanItem;
  dep?: Dependency;
  showFile: boolean;
  selected: boolean;
  expanded: boolean;
  onSelect: (checked: boolean) => void;
  onToggle: () => void;
}) {
  const upgrade = isUpgrade(item);
  const type = updateType(item);
  // Keep the details mounted after the first open so collapsing can animate
  const [opened, setOpened] = useState(false);
  if (expanded && !opened) setOpened(true);

  return (
    <li
      className={`animate-fade-in-up transition-colors ${expanded ? "bg-surface/40" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <input
          type="checkbox"
          aria-label={`Include ${item.dependency}`}
          className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-default disabled:opacity-30"
          checked={selected}
          disabled={!upgrade}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={!upgrade}
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 flex-col gap-2 text-left disabled:cursor-default sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium group-enabled:group-hover:text-accent">{item.dependency}</span>
              {upgrade && type !== "other" && <span className={`text-[11px] font-medium ${TYPE_CLASS[type]}`}>{type}</span>}
              {showFile && <span className="hidden truncate font-mono text-[11px] text-muted sm:inline">{item.file_path}</span>}
            </span>
            <span className="mt-0.5 block font-mono text-xs text-muted">
              {upgrade ? (
                <>
                  {item.from_version} <span aria-hidden="true">→</span> <span className="text-fg">{item.to_version}</span>
                </>
              ) : (
                <>{item.from_version} · {dep && !dep.latest_version ? "couldn't check the latest version" : "up to date"}</>
              )}
            </span>
          </span>
          {upgrade && (
            <span className="flex flex-wrap items-center gap-1.5">
              {item.security_fix && (
                <Badge tone="amber">
                  <Icon name="shield" className="mr-1 size-3" />
                  Security fix
                </Badge>
              )}
              <Badge tone={RISK_TONE[item.risk_level] || "neutral"}>
                {item.risk_level === "Unknown" ? "Not assessed" : `${item.risk_level} risk`}
              </Badge>
              {item.recommended && <span className="hidden text-xs text-muted lg:inline">Recommended</span>}
              <Icon name="chevron" className={`ml-1 hidden size-4 text-muted transition-transform duration-200 sm:block ${expanded ? "rotate-180" : ""}`} />
            </span>
          )}
        </button>
      </div>
      {upgrade && (
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">{opened && <PackageDetails item={item} dep={dep} />}</div>
        </div>
      )}
    </li>
  );
}

export const PackageList = forwardRef<
  HTMLInputElement,
  {
    items: PlanItem[];
    dependencies: Map<string, Dependency>;
    tab: Tab;
    tabs: { id: Tab; label: string; count: number }[];
    query: string;
    filters: { label: string; onClear: () => void }[];
    selected: Record<string, boolean>;
    expanded: Record<string, boolean>;
    onTab: (tab: Tab) => void;
    onQuery: (query: string) => void;
    onSelect: (name: string, checked: boolean) => void;
    onToggle: (name: string) => void;
    onSelectRecommended: () => void;
    onClear: () => void;
  }
>(function PackageList(props, searchRef) {
  const { items, dependencies, tab, tabs, query, filters, selected, expanded } = props;
  // Only label rows with their manifest when the repo has more than one
  const showFiles = new Set([...dependencies.values()].map((dep) => dep.file_path)).size > 1;

  return (
    <div className="rounded-xl border border-line bg-bg">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => props.onTab(t.id)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition ${tab === t.id ? "bg-surface font-medium text-fg ring-1 ring-line" : "text-muted hover:text-fg"}`}
            >
              {t.label} <span className="text-muted tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="relative flex-1 lg:w-64 lg:flex-none">
            <span className="sr-only">Search packages</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search packages"
              value={query}
              onChange={(e) => props.onQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-line bg-bg pr-8 pl-8 text-sm outline-none placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/15"
            />
            {!query && <span className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:block"><Kbd>/</Kbd></span>}
          </label>
          <div className="flex shrink-0 gap-3 text-sm text-muted">
            <button type="button" onClick={props.onSelectRecommended} className="hover:text-fg">Recommended</button>
            <button type="button" onClick={props.onClear} className="hover:text-fg">Clear</button>
          </div>
        </div>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-sm sm:px-5">
          <span className="text-muted">Filtered by</span>
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={filter.onClear}
              className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-accent ring-1 ring-accent/20 ring-inset hover:bg-accent/15"
            >
              {filter.label}
              <Icon name="x" className="size-3" />
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">
          {query || filters.length ? "No packages match these filters." : tab === "vulnerable" ? "No known vulnerabilities in these dependencies." : "Everything is up to date."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item, index) => (
            <PackageRow
              key={itemKey(item)}
              index={index}
              item={item}
              dep={dependencies.get(itemKey(item))}
              showFile={showFiles}
              selected={!!selected[itemKey(item)]}
              expanded={!!expanded[itemKey(item)]}
              onSelect={(checked) => props.onSelect(itemKey(item), checked)}
              onToggle={() => props.onToggle(itemKey(item))}
            />
          ))}
        </ul>
      )}
    </div>
  );
});
