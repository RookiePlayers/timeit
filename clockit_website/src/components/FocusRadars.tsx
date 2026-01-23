"use client";

import { useMemo, useState } from "react";
import { languageTotalsForRange, toHours, useFetchAggregates, workspaceTotalsForRange } from "@/hooks/useFetchAggregates";
import { Range, rangeLabels } from "@/types";
import { RadarPanel } from "./RadarPanel";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import ServerUnavailable from "@/components/ServerUnavailable";
import { isServerUnavailableError } from "@/lib/api-client";

type Props = {
  statsError?: Error | null;
  initialRange?: Range;
};

export default function FocusRadars({ initialRange = "week" }: Props) {
  const [range, setRange] = useState<Range>(initialRange);
  const [user] = useAuthState(auth);
  const { aggregates, error: statsError, isLoading } = useFetchAggregates(user?.uid);

  const radarData = useMemo(() => {
    const totals = languageTotalsForRange(aggregates, range);
    return Object.entries(totals)
      .map(([language, seconds]) => ({ language, hours: Number(toHours(seconds).toFixed(2)) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 12);
  }, [aggregates, range]);

  const workspaceRadarData = useMemo(() => {
    const totals = workspaceTotalsForRange(aggregates, range);
    return Object.entries(totals)
      .map(([workspace, seconds]) => ({ workspace, hours: Number(toHours(seconds).toFixed(2)) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 12);
  }, [aggregates, range]);

  if (isLoading) {
    return (
      <section className="card-clean p-6 rounded-2xl space-y-6">
        <div className="animate-pulse h-48 bg-[var(--card-soft)] rounded-lg" />
      </section>
    );
  }

  if (statsError && isServerUnavailableError(statsError)) {
    return <ServerUnavailable />;
  }

  if (statsError) {
    return (
      <section className="card-clean p-6 rounded-2xl space-y-6">
        <p className="text-sm text-red-500">Error loading focus radars: {statsError.message}</p>
      </section>
    );
  }
  return (
    <section className="card-clean p-6 rounded-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Focus radars</h2>
          <p className="text-sm text-[var(--muted)]">Language and workspace focus across {rangeLabels[range].toLowerCase()} buckets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["week", "month", "year", "all"] as Range[]).map((key) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                range === key
                  ? "bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)]"
                      : "bg-[var(--card)] text-[var(--text)] border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]"}`}
            >
              {rangeLabels[key]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RadarPanel
          title="Language focus"
          emptyLabel="No language time recorded for this range yet."
          data={radarData.map((d) => ({ label: d.language, hours: d.hours }))}
          color="#6366f1"
        />
        <RadarPanel
          title="Workspace focus"
          emptyLabel="No workspace time recorded for this range yet."
          data={workspaceRadarData.map((d) => ({ label: d.workspace, hours: d.hours }))}
          color="#0ea5e9"
        />
      </div>
    </section>
  );
}
