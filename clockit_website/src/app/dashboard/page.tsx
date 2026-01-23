"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { isServerUnavailableError, statsApi } from "@/lib/api-client";
import Link from "next/link";
import UploadCSV from "@/components/UploadCSV";
import Stats from "@/components/Stats";
import { IconCode, IconHourglassEmpty, IconSum, IconTimeDuration0 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import useFeature from "@/hooks/useFeature";
import { buildNavLinks, isFeatureEnabledForNav } from "@/utils/navigation";
import FocusRadars from "@/components/FocusRadars";
import RefreshAggregates from "@/components/RefreshAggregates";
import { metricSum } from "@/hooks/useFetchAggregates";
import { AggregateEntry, Aggregates, MetricValue, Range } from "@/types";
import ServerUnavailable from "@/components/ServerUnavailable";

const rangeLabels: Record<Range, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
};

export default function DashboardPage() {
  const [user, loadingUser, authError] = useAuthState(auth);
  const { isFeatureEnabled } = useFeature();
  const [range, setRange] = useState<Range>("week");
  const [, setFocusRange] = useState<Range>("week");
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<Error | null>(null);
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<number | null | { _seconds: number; _nanoseconds: number }>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null | { _seconds: number; _nanoseconds: number }>(null);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

  // Feature flags for navigation
  const featureFlags = isFeatureEnabledForNav(isFeatureEnabled);
  const navLinks = buildNavLinks(featureFlags, 'dashboard');

  useEffect(() => {
    if (!user) {
      setAggregates(null);
      setIsLoadingStats(false);
      setLastRefresh(null);
      return;
    }
    setIsLoadingStats(true);
    setStatsError(null);

    const fetchAggregates = async () => {
      try {
        const data = await statsApi.get() as {
          aggregates?: Aggregates;
          lastRefreshRequested?: number | { _seconds: number; _nanoseconds: number };
          lastAggregatedAt?: number | { _seconds: number; _nanoseconds: number };
          updatedAt?: number | { _seconds: number; _nanoseconds: number };
        };

        if (!data) {
          setAggregates(null);
          setStatsError(new Error("No aggregated stats found yet."));
          return;
        }

        setAggregates(data.aggregates || null);
        const ts = data.lastRefreshRequested;
        if (typeof ts === "number" && Number.isFinite(ts)) {
          setLastRefresh(ts);
        }
        const aggregateTs = data.lastAggregatedAt;
        const updatedTs = data.updatedAt;
        const chosen = aggregateTs || updatedTs || ts || null;
        setLastUpdated(chosen);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to load stats");
        setStatsError(error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    void fetchAggregates();
  }, [user]);

  const active = useMemo(() => {
    if (!aggregates) {return undefined;}
    const pickLatest = (list: AggregateEntry[] | undefined) => {
      if (!list || list.length === 0) {return undefined;}
      return [...list].sort((a, b) => (a.periodStart > b.periodStart ? -1 : 1))[0];
    };
    switch (range) {
      case "week":
        return aggregates.thisWeek ? aggregates.thisWeek : null;
      case "month":
        return aggregates.thisMonth ? aggregates.thisMonth : null;
      case "year":
        return aggregates.thisYear ? aggregates.thisYear : null;
      case "all":
      default:
        return pickLatest(aggregates.all);
    }
  }, [aggregates, range]);


  const topWorkspaces = useMemo(() => {
    const current = active;
    if (current?.topWorkspaces?.length) {
      return current.topWorkspaces.slice(0, 5).map((item) => ({
        workspace: item.workspace,
        seconds: metricSum(item.seconds),
      }));
    }
    // Fallback: derive from workspaceSeconds if topWorkspaces not provided.
    const totals: Record<string, number> = {};
    if (current?.workspaceSeconds) {
      for (const [name, seconds] of Object.entries(current.workspaceSeconds)) {
        totals[name] = (totals[name] || 0) + metricSum(seconds);
      }
    }
    return Object.entries(totals)
      .map(([workspace, seconds]) => ({ workspace, seconds }))
      .filter((t) => t.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5);
  }, [active]);

  const navigateToRecentTable = () => router.push("/session-activity");

  const handleRecentCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, select, option, a, input, textarea")) {return;}
    navigateToRecentTable();
  };

  const handleRecentCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["Enter", " "].includes(event.key)) {return;}
    const target = event.target as HTMLElement;
    if (target.closest("button, select, option, a, input, textarea")) {return;}
    event.preventDefault();
    navigateToRecentTable();
  };

  if (loadingUser || isLoadingStats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-red-600 gap-3">
        <p>Auth error: {authError.message}</p>
        <Link href="/auth" className="text-blue-600 hover:underline">Go to sign in</Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-[var(--text)]">
        <p className="text-lg font-semibold">You need to sign in to view your dashboard.</p>
        <div className="flex gap-3">
          <Link href="/auth" className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-contrast)] rounded-lg shadow hover:opacity-90 transition-colors">
            Sign in
          </Link>
          <Link href="/auth?mode=signup" className="px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--text)] hover:border-[var(--primary)]/40 hover:text-[var(--primary)] transition-colors">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  if (statsError && isServerUnavailableError(statsError)) {
    return <ServerUnavailable />;
  }

  const title = user.displayName || user.email || "Developer";
console.log('Rendering dashboard for user:', lastUpdated);
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <NavBar
        userName={title}
        userPhoto={user?.photoURL}
        onSignOut={() => auth.signOut()}
        links={navLinks}
      />

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-sm text-blue-600 font-semibold">Dashboard</p>
            <h1 className="text-3xl font-bold text-[var(--text)]">Your productivity at a glance</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Data shown for {rangeLabels[range].toLowerCase()}
              {lastUpdated ? ` — last updated ${new Date(lastUpdated?._seconds ? lastUpdated._seconds * 1000 : 0).toLocaleString()}` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(["week", "month", "year", "all"] as Range[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setRange(key);
                  setFocusRange(key);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                  range === key
                    ? "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]"
                    : "bg-[var(--card-soft)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--primary)] hover:text-[var(--primary-contrast)] hover:border-[var(--primary)"
                }`}
              >
                {rangeLabels[key]}
              </button>
            ))}
            <RefreshAggregates
              userId={user?.uid}
              lastRefresh={lastRefresh}
              onRefreshed={setLastRefresh}
              cooldownMs={COOLDOWN_MS}
            />
          </div>
        </header>

        {isFeatureEnabled('dashboard-productivity-at-a-glance') && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="border border-[var(--border)] bg-[var(--card)] shadow-lg shadow-blue-900/10 p-6 rounded-2xl">
            <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Total time</h2>
            {active ? (
              <div className="space-y-3">
                <MetricRow icon={<IconSum/>} label="Total time" value={formatDuration(active.totalSeconds)} />
                <MetricRow icon={<IconTimeDuration0 />} label="Working time" value={formatDuration(active.workingSeconds)} />
                <MetricRow icon={<IconHourglassEmpty />} label="Idle time" value={formatDuration(active.idleSeconds)} />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{statsError?.message || "No data available."}</p>
            )}
          </div>

          <div className=" p-6 border border-[var(--border)] bg-[var(--card)] rounded-2xl shadow-lg shadow-blue-900/10">
            <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Most used language</h2>
            {active?.topLanguage ? (
              <div className="flex flex-col items-start gap-4">
                <div className="flex items-center gap-3 mb-2">
                  <IconCode className="w-6 h-6 text-[var(--muted)]" />
                  <p className="text-xl font-bold text-[var(--text)]">{active.topLanguage.language}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted)] mb-1">Focused time</p>
                  <p className="text-xl font-semibold text-[var(--primary)]">{formatDuration(active.topLanguage.seconds)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{statsError?.message || "No language data available."}</p>
            )}
          </div>

          <div className=" border border-[var(--border)] bg-[var(--card)] card-clean shadow-lg shadow-blue-900/10 p-6 rounded-2xl">
            <h2 className="text-lg font-semibold text-[var(--text)] mb-1">Productivity score</h2>
            <div className="relative group inline-block mb-2">
              <span className="text-sm text-[var(--muted)] cursor-pointer underline decoration-dotted">
                Working vs idle ratio
              </span>
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-64 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-3 text-xs text-[var(--text)] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-10">
                Based on aggregated sessions.
              </div>
            </div>
            {active ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-3xl font-bold text-[var(--text)]">{active.productivityPercent}%</p>
                </div>
                <div className="w-full h-2 bg-[var(--card-soft)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] rounded-full"
                    style={{ width: `${active.productivityPercent}%` }}
                  />
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Working: {formatDuration(active.workingSeconds)} · Idle: {formatDuration(active.idleSeconds)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{statsError?.message || "No productivity data available."}</p>
            )}
          </div>

          <div className=" border border-[var(--border)] bg-[var(--card)] card-clean shadow-lg shadow-blue-900/10 p-6 rounded-2xl">
            <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Top workspaces</h2>
            {topWorkspaces.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{statsError?.message || "No workspace data available."}</p>
            ) : (
              <div className="space-y-2">
                {topWorkspaces.map((ws, idx) => (
                  <div key={ws.workspace} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-[var(--primary)] text-xs font-semibold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-[var(--text)]">{ws.workspace}</span>
                    </div>
                    <span className="text-[var(--muted)]">{formatDuration(ws.seconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </section>
        )}

        {isFeatureEnabled('dashboard-focus-radars') && (
          <div className=" border border-[var(--border)] bg-[var(--card)]  card-clean shadow-lg shadow-blue-900/10 p-6 rounded-2xl">
            <FocusRadars />
          </div>
        )}

        {user && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {isFeatureEnabled('recent-activity') && (
              <div
              className="lg:col-span-2  border border-[var(--border)] bg-[var(--card)] rounded-2xl card-clean shadow-lg shadow-blue-900/10 p-6 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              role="button"
              tabIndex={0}
              onClick={handleRecentCardClick}
              onKeyDown={handleRecentCardKeyDown}
              aria-label="Open full recent activity table"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text)]">Recent activity</h2>
                  <p className="text-xs text-[var(--muted)]">Click to open the full table view.</p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-semibold text-[var(--primary-contrast)] bg-[var(--primary)] rounded-lg hover:opacity-90 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToRecentTable();
                  }}
                >
                  Open table
                </button>
              </div>
              <Stats uid={user.uid} refreshKey={statsRefreshKey} />
              </div>
            )}
            {isFeatureEnabled('upload-csv-data') && (
              <div className=" border border-[var(--border)] bg-[var(--card)] card-clean shadow-lg shadow-blue-900/10 p-6 rounded-2xl">
                <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Upload CSV</h2>
                <UploadCSV
                  onUploadComplete={() => {
                    // Refresh the stats component by incrementing the refresh key
                    setStatsRefreshKey(prev => prev + 1);
                  }}
                />
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function MetricRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {icon && <span className="text-[var(--muted)]">{icon}</span>}
        <p className="text-sm text-[var(--muted)]">{label}</p>
      </div>
      <p className="text-base font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}


function formatDuration(totalSeconds: MetricValue | undefined | null) {
  const seconds = metricSum(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}
