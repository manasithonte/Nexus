"use client";

import { useEffect, useState } from "react";
import { RISK_LEVELS, type UpdateType } from "@/lib/plan";
import { RISK_FILL, useCountUp } from "./ui";

export type Tab = "upgrades" | "vulnerable" | "all";

function StatCard({
  label,
  value,
  detail,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  detail?: string;
  active: boolean;
  tone?: "red" | "amber";
  onClick: () => void;
}) {
  const shown = useCountUp(value);
  const color = tone === "red" && value > 0 ? "text-red-600 dark:text-red-400" : tone === "amber" && value > 0 ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-xl border bg-bg px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_-12px_rgba(0,0,0,0.25)] sm:px-5 ${active ? "border-accent/50 ring-2 ring-accent/15" : "border-line hover:border-fg/20"}`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-3xl font-semibold tracking-tight tabular-nums ${color}`}>{shown}</span>
        {detail && <span className="text-sm text-muted">{detail}</span>}
      </span>
    </button>
  );
}

export function StatCards({
  packages,
  outdated,
  vulnerabilities,
  vulnerablePackages,
  securityFixes,
  tab,
  onTab,
}: {
  packages: number;
  outdated: number;
  vulnerabilities: number;
  vulnerablePackages: number;
  securityFixes: number;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Packages" value={packages} active={tab === "all"} onClick={() => onTab("all")} />
      <StatCard label="Outdated" value={outdated} active={tab === "upgrades"} onClick={() => onTab("upgrades")} />
      <StatCard
        label="Vulnerabilities"
        value={vulnerabilities}
        detail={`in ${vulnerablePackages}`}
        tone="red"
        active={tab === "vulnerable"}
        onClick={() => onTab("vulnerable")}
      />
      <StatCard label="Security fixes" value={securityFixes} tone="amber" active={false} onClick={() => onTab("vulnerable")} />
    </div>
  );
}

const RISK_LABEL: Record<string, string> = { High: "High", Medium: "Medium", Low: "Low", Unknown: "Not assessed" };

export function RiskBreakdown({
  riskCounts,
  typeCounts,
  riskFilter,
  typeFilter,
  onRisk,
  onType,
}: {
  riskCounts: Record<string, number>;
  typeCounts: Record<UpdateType, number>;
  riskFilter: string | null;
  typeFilter: UpdateType | null;
  onRisk: (risk: string | null) => void;
  onType: (type: UpdateType | null) => void;
}) {
  // Start the bar empty so it animates in
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const total = RISK_LEVELS.reduce((sum, risk) => sum + (riskCounts[risk] || 0), 0);
  if (total === 0) return null;

  return (
    <div className="grid gap-6 rounded-xl border border-line bg-bg p-5 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
      <div>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Upgrade risk</h3>
          <span className="text-xs text-muted">{total} upgrades · click to filter</span>
        </div>
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface">
          {RISK_LEVELS.map((risk) => {
            const count = riskCounts[risk] || 0;
            if (!count) return null;
            const dimmed = riskFilter && riskFilter !== risk;
            return (
              <button
                key={risk}
                type="button"
                aria-label={`${RISK_LABEL[risk]} risk: ${count}`}
                onClick={() => onRisk(riskFilter === risk ? null : risk)}
                className={`h-full transition-all duration-700 ease-out first:rounded-l-full last:rounded-r-full hover:brightness-110 ${RISK_FILL[risk]} ${dimmed ? "opacity-25" : ""}`}
                style={{ width: mounted ? `${(count / total) * 100}%` : "0%" }}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {RISK_LEVELS.map((risk) => {
            const count = riskCounts[risk] || 0;
            if (!count) return null;
            const active = riskFilter === risk;
            return (
              <button
                key={risk}
                type="button"
                onClick={() => onRisk(active ? null : risk)}
                className={`flex items-center gap-1.5 rounded text-sm transition ${active ? "font-medium text-fg" : "text-muted hover:text-fg"} ${riskFilter && !active ? "opacity-50" : ""}`}
              >
                <span className={`size-2 rounded-full ${RISK_FILL[risk]}`} />
                {RISK_LABEL[risk]} <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Update type</h3>
        <div className="mt-3 inline-flex rounded-lg border border-line p-0.5">
          {(["major", "minor", "patch"] as const).map((type) => {
            const active = typeFilter === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onType(active ? null : type)}
                className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${active ? "bg-fg text-bg" : "text-muted hover:bg-surface hover:text-fg"}`}
              >
                {type} <span className="tabular-nums opacity-70">{typeCounts[type] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
