"use client";

import { useCallback, useMemo, useState } from "react";
import { Aggregates, getAggregatesForRange, MetricStats, MetricValue, Range, rangeLabels } from "@/types";

type Mode = "sum" | "avg" | "min" | "max";

export default function RangeTotals({
  aggregates,
  range,
  statsError,
}: {
  aggregates: Aggregates | null;
  range: Range;
  statsError?: Error | null;
}) {
  const [mode, setMode] = useState<Mode>("sum");
  const [languagePage, setLanguagePage] = useState(0);
  const [workspacePage, setWorkspacePage] = useState(0);
  const pageSize = 10;

  const pickMetric = useCallback(
    (value: MetricValue | undefined | null): number => {
      if (value === null || value === undefined) {return 0;}
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
      }
      const stats = value as MetricStats;
      const first = (...keys: Array<keyof MetricStats>) => {
        for (const key of keys) {
          const v = stats[key];
          if (typeof v === "number" && Number.isFinite(v)) {return v;}
        }
        return 0;
      };
      switch (mode) {
        case "avg": return first("avg", "sum", "max", "min");
        case "min": return first("min", "avg", "sum", "max");
        case "max": return first("max", "avg", "sum", "min");
        case "sum":
        default: return first("sum", "avg", "max", "min");
      }
    },
    [mode]
  );

  const entries = useMemo(() => getAggregatesForRange(aggregates, range), [aggregates, range]);

  const rangeTotals = useMemo(() => {
    if (!entries.length) {return null;}
    return entries.reduce(
      (acc, entry) => ({
        totalSeconds: acc.totalSeconds + pickMetric(entry.totalSeconds),
        workingSeconds: acc.workingSeconds + pickMetric(entry.workingSeconds),
        idleSeconds: acc.idleSeconds + pickMetric(entry.idleSeconds),
        sessions: acc.sessions + (entry.sessionCount ? pickMetric(entry.sessionCount) : 0),
      }),
      { totalSeconds: 0, workingSeconds: 0, idleSeconds: 0, sessions: 0 }
    );
  }, [entries, pickMetric]);

  const languageTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of entries) {
      const langSeconds = entry.languageSeconds || {};
      if (Object.keys(langSeconds).length === 0 && entry.topLanguage) {
        totals[entry.topLanguage.language] = (totals[entry.topLanguage.language] || 0) + pickMetric(entry.topLanguage.seconds);
      }
      for (const [lang, seconds] of Object.entries(langSeconds)) {
        totals[lang] = (totals[lang] || 0) + pickMetric(seconds);
      }
    }
    return totals;
  }, [entries, pickMetric]);

  const workspaceTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of entries) {
      const wsSeconds = entry.workspaceSeconds || {};
      if (Object.keys(wsSeconds).length === 0 && entry.topWorkspaces?.length) {
        for (const ws of entry.topWorkspaces) {
          totals[ws.workspace] = (totals[ws.workspace] || 0) + pickMetric(ws.seconds);
        }
      }
      for (const [ws, seconds] of Object.entries(wsSeconds)) {
        totals[ws] = (totals[ws] || 0) + pickMetric(seconds);
      }
    }
    return totals;
  }, [entries, pickMetric]);

  const rangeLabel = rangeLabels[range];
  const modeLabel: Record<Mode, string> = { sum: "Sum", avg: "Average", min: "Min", max: "Max" };

  const languageItems = Object.entries(languageTotals)
    .map(([label, seconds]) => ({ label, value: secondsToHours(seconds) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalLanguagePages = Math.max(1, Math.ceil(languageItems.length / pageSize));
  const languagePageSafe = Math.max(0, Math.min(languagePage, totalLanguagePages - 1));
  const languageStart = languagePageSafe * pageSize;
  const pagedLanguageItems = languageItems.slice(languageStart, languageStart + pageSize);

  const workspaceItems = Object.entries(workspaceTotals)
    .map(([label, seconds]) => ({ label, value: secondsToHours(seconds) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalWorkspacePages = Math.max(1, Math.ceil(workspaceItems.length / pageSize));
  const workspacePageSafe = Math.max(0, Math.min(workspacePage, totalWorkspacePages - 1));
  const workspaceStart = workspacePageSafe * pageSize;
  const pagedWorkspaceItems = workspaceItems.slice(workspaceStart, workspaceStart + pageSize);

  return (
    <section className="card-clean bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4 transition-all duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Range totals</h2>
          <p className="text-sm text-[var(--muted)]">Sums across all aggregated entries for this view.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--card)] text-[var(--muted)]">{rangeLabel}</span>
          <div className="flex items-center gap-1">
            {(["sum", "avg", "min", "max"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  mode === m
                    ? "bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)]"
                    : "bg-[var(--card)] text-[var(--text)] border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                }`}
              >
                {modeLabel[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!rangeTotals ? (
        <p className="text-sm text-gray-500">{statsError?.message || "No aggregated data yet for this range."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="Total time" value={`${secondsToHours(rangeTotals.totalSeconds).toFixed(1)} h`} />
            <MiniStat label="Working time" value={`${secondsToHours(rangeTotals.workingSeconds).toFixed(1)} h`} />
            <MiniStat label="Idle time" value={`${secondsToHours(rangeTotals.idleSeconds).toFixed(1)} h`} />
            {rangeTotals.sessions > 0 && (
              <MiniStat label="Sessions" value={`${rangeTotals.sessions.toFixed(0)}`} />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TotalsList
              title="Languages"
              emptyLabel="No language data yet for this range."
              items={pagedLanguageItems}
              startIndex={languageStart}
              footer={
                totalLanguagePages > 1 && (
                  <Pager
                    page={languagePageSafe}
                    totalPages={totalLanguagePages}
                    onPrev={() => setLanguagePage((p) => Math.max(0, p - 1))}
                    onNext={() => setLanguagePage((p) => Math.min(totalLanguagePages - 1, p + 1))}
                  />
                )
              }
            />
            <TotalsList
              title="Workspaces"
              emptyLabel="No workspace data yet for this range."
              items={pagedWorkspaceItems}
              startIndex={workspaceStart}
              footer={
                totalWorkspacePages > 1 && (
                  <Pager
                    page={workspacePageSafe}
                    totalPages={totalWorkspacePages}
                    onPrev={() => setWorkspacePage((p) => Math.max(0, p - 1))}
                    onNext={() => setWorkspacePage((p) => Math.min(totalWorkspacePages - 1, p + 1))}
                  />
                )
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

function secondsToHours(seconds: number) {
  return Number((seconds / 3600).toFixed(2));
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function TotalsList({
  title,
  items,
  emptyLabel,
  footer,
  startIndex = 0,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  emptyLabel: string;
  footer?: React.ReactNode;
  startIndex?: number;
}) {
  const hasItems = items.length > 0;
  return (
    <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {hasItems && <span className="text-xs text-gray-500">{items.length} entries</span>}
      </div>
      {!hasItems ? (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((row, idx) => (
            <div key={row.label} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-gray-100">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
                  {startIndex + idx + 1}
                </span>
                <span className="font-semibold text-gray-900">{row.label}</span>
              </div>
              <span className="text-sm text-gray-700">{row.value.toFixed(2)} h</span>
            </div>
          ))}
        </div>
      )}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <span className="text-xs text-gray-600">
        Page {page + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages - 1}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
