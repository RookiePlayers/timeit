"use client";

"use client";

// Disable static pre-render to avoid Firebase client init during build without env vars
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { isServerUnavailableError, statsApi } from "@/lib/api-client";
import NavBar from "@/components/NavBar";
import useFeature from "@/hooks/useFeature";
import { useRouter } from "next/navigation";
import { buildNavLinks, isFeatureEnabledForNav } from "@/utils/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AggregateEntry, Aggregates, ChartView, getAggregatesForRange, Grade, MetricValue, Range, rangeLabels } from "@/types";
import FocusRadars from "@/components/FocusRadars";
import { metricAverage, toHours } from "@/hooks/useFetchAggregates";
import RefreshAggregates from "@/components/RefreshAggregates";
import RangeTotals from "@/components/RangeTotals";
import ServerUnavailable from "@/components/ServerUnavailable";

export const chartViews: Array<{ key: ChartView; label: string }> = [
  { key: "stackedArea", label: "Stacked area" },
  { key: "stackedBar", label: "Stacked bars" },
  { key: "line", label: "Lines" },
];

export default function AdvancedStatsPage() {
  const [user, loadingUser, authError] = useAuthState(auth);
  const router = useRouter();
  const { isFeatureEnabled, loading: featureLoading } = useFeature();
  const [range, setRange] = useState<Range>("week");
  const [chartView, setChartView] = useState<ChartView>("stackedArea");
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statsError, setStatsError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
  const lastSavedBadgesRef = useRef<string | null>(null);

  const advancedStatsEnabled = isFeatureEnabled("advanced-stats");
  const baseStatsEnabled = isFeatureEnabled("base-stats");
  const hasStatsAccess = advancedStatsEnabled || baseStatsEnabled;

  // Feature flags for navigation
  const featureFlags = isFeatureEnabledForNav(isFeatureEnabled);
  const navLinks = buildNavLinks(featureFlags, 'advanced-stats');

  // Redirect if no stats access
  useEffect(() => {
    if (!featureLoading && !loadingUser && !hasStatsAccess) {
      router.push("/dashboard");
    }
  }, [featureLoading, loadingUser, hasStatsAccess, router]);

  useEffect(() => {
    if (!user) {
      setAggregates(null);
      setIsLoading(false);
      setLastRefresh(null);
      return;
    }
    setIsLoading(true);
    setStatsError(null);

    const fetchAggregates = async () => {
      try {
        const data = await statsApi.get() as { aggregates?: Aggregates; lastRefreshRequested?: number };
        setAggregates(data.aggregates || null);
        const ts = data.lastRefreshRequested;
        if (typeof ts === "number" && Number.isFinite(ts)) {
          setLastRefresh(ts);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to load stats");
        setStatsError(error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchAggregates();
  }, [user]);

  const trendData = useMemo(() => {
    const list = getAggregatesForRange(aggregates, range);
    return [...list]
      .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime())
      .map((entry) => ({
        label: formatBucketLabel(entry.periodStart, range),
        workingHours: toHours(entry.workingSeconds),
        idleHours: toHours(entry.idleSeconds),
        productivity: entry.productivityPercent ?? 0,
      }));
  }, [aggregates, range]);



  const yearSummary = useMemo(() => computeYearSummary(aggregates), [aggregates]);
  const badges = useMemo(() => computeBadges(aggregates), [aggregates]);

  useEffect(() => {
    if (!user || !aggregates) { return; }
    const summary = badges.map((b) => ({
      title: b.title,
      description: b.description,
      detail: b.detail,
      earned: b.earned,
    }));
    const serialized = JSON.stringify(summary);
    if (serialized === lastSavedBadgesRef.current) { return; }
    lastSavedBadgesRef.current = serialized;

    // Save each badge as an achievement via the API
    const saveAchievements = async () => {
      try {
        for (const badge of summary) {
          if (badge.earned) {
            await statsApi.saveAchievement({
              id: badge.title.toLowerCase().replace(/\s+/g, '-'),
              type: 'badge',
              title: badge.title,
              description: badge.description,
              detail: badge.detail,
              earnedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        // Surface silently to console to avoid interrupting UX with badge persistence issues.
        console.error("Failed to save achievements", err);
      }
    };

    void saveAchievements();
  }, [aggregates, badges, user]);

  if (loadingUser || isLoading || featureLoading) {
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
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-gray-800">
        <p className="text-lg font-semibold">You need to sign in to view advanced stats.</p>
        <div className="flex gap-3">
          <Link href="/auth" className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors">
            Sign in
          </Link>
          <Link href="/auth?mode=signup" className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:border-blue-200 hover:text-blue-700 transition-colors">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  if (statsError && isServerUnavailableError(statsError)) {
    return <ServerUnavailable />;
  }

  if (!hasStatsAccess) {
    return (
      <div className="min-h-screen theme-bg">
        <NavBar
          userName={user?.displayName || user?.email || undefined}
          userPhoto={user?.photoURL}
          onSignOut={() => auth.signOut()}
          links={navLinks}
        />
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-lg text-center space-y-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">Advanced Stats not available</h1>
            <p className="text-[var(--muted)]">
              This feature is not included in your current plan. Upgrade to access advanced statistics and analytics.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/dashboard" className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] font-semibold hover:opacity-90">
                Go to Dashboard
              </Link>
              <Link href="/profile" className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text)] font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]">
                View Plans
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const title = user.displayName || user.email || "Developer";

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
            <p className="text-sm text-[var(--primary)] font-semibold">Advanced stats</p>
            <h1 className="text-3xl font-bold text-[var(--text)]">Deep dive into your patterns</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Explore working vs idle trends, language mix, and your yearly performance.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(["week", "month", "year", "all"] as Range[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setRange(key);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${range === key
                    ? "bg-[var(--primary)]/20 text-[var(--primary-contrast)] bg-[var(--primary)] border-[var(--border)]"
                    : "bg-[var(--card)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--primary)] hover:text-[var(--primary-contrast)] hover:border-[var(--primary)"
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

        <section className="card-clean bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Working vs idle</h2>
              <p className="text-sm text-[var(--muted)]">Multi-view trend for {rangeLabels[range].toLowerCase()} buckets.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {chartViews.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setChartView(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${chartView === key
                      ? "bg-[var(--primary)] text-[var(--primary-contrast)] border-[var(--primary)]"
                      : "bg-[var(--card)] text-[var(--text)] border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[320px]">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                {statsError?.message || "No aggregated data yet for this range."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {renderWorkingIdleChart(chartView, trendData)}
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="Avg productivity" value={`${average(trendData.map((d) => d.productivity)).toFixed(0)}%`} />
            <MiniStat label="Total working" value={`${sum(trendData.map((d) => d.workingHours)).toFixed(1)} h`} />
            <MiniStat label="Total idle" value={`${sum(trendData.map((d) => d.idleHours)).toFixed(1)} h`} />
            <MiniStat label="Data points" value={`${trendData.length}`} />
          </div>
        </section>

        <RangeTotals aggregates={aggregates} range={range} statsError={statsError} />

        <section className="card-clean bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-6">
          <FocusRadars />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card-clean bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Yearly recap</h2>
                <p className="text-sm text-[var(--muted)]">Highlights pulled from your latest full year.</p>
              </div>
            </div>
            {!yearSummary ? (
              <p className="text-sm text-[var(--muted)]">We&apos;ll surface a recap once yearly data is available.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MiniStat label="Year" value={yearSummary.yearLabel} />
                  <MiniStat label="Avg Working time" value={`${yearSummary.workingHours.toFixed(1)} h`} />
                  <MiniStat label="Avg Idle time" value={`${yearSummary.idleHours.toFixed(1)} h`} />
                  <MiniStat label="Avg productivity" value={`${yearSummary.avgProductivity.toFixed(0)}%`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <RecapCard title="Peak month" value={yearSummary.bestMonth ?? "—"} hint={yearSummary.bestMonthHint} />
                  <RecapCard title="Best week" value={yearSummary.bestWeek ?? "—"} hint={yearSummary.bestWeekHint} />
                  <RecapCard title="Top language" value={yearSummary.topLanguage ?? "—"} hint={yearSummary.topLanguageHint} />
                  <RecapCard title="Top workspace" value={yearSummary.topWorkspace ?? "—"} hint={yearSummary.topWorkspaceHint} />
                </div>
                <div className="rounded-xl border border-[var(--primary)] bg-[var(--primary-contrast)] px-4 py-3">
                  <p className="text-sm text-[var(--primary)]">
                    {yearSummary.narrative}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="card-clean bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm flex flex-col justify-between h-full">
            <div className="flex flex-col flex-1 justify-center items-center text-center">
              <h2 className="text-lg font-semibold text-[var(--text)] mb-1">Final grade</h2>
              <span className="text-sm text-[var(--muted)] mb-3">based on focus and throughput</span>
              {!yearSummary ? (
                <p className="text-sm text-[var(--muted)]">No yearly data yet to compute a grade.</p>
              ) : (
                <div className="flex items-center justify-center mb-2 flex-1">
                  <span className="text-[5em] font-black text-[var(--primary)]">{yearSummary.grade.letter}</span>
                </div>
              )}
            </div>
            {yearSummary && (
              <div className="mt-4">
                <p className="text-sm text-[var(--text)] mt-2 mb-4">{yearSummary.grade.description}</p>
                <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)] rounded-full"
                    style={{ width: `${Math.min(100, yearSummary.avgProductivity)}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--muted)] mt-2">
                  Grade blends productivity and total working time for the year.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="card-clean bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Badge cabinet</h2>
              <p className="text-sm text-[var(--muted)]">Accolades unlocked from your aggregates.</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--muted)]/20 text-[var(--muted)]">
              {badges.filter((b) => b.earned).length} / {badges.length} unlocked
            </span>
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`}>
            {badges.map((badge) => (
              <div
                key={badge.title}
                className={`p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg shadow-blue-900/10 ${badge.earned ? "border-green-200/30 bg-green-50/30" : "bg-[var(--card)]"} ${badge.earned ? "opacity-100" : "opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{badge.title}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">{badge.description}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">{badge.detail}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${badge.earned ? "bg-green-200 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                    {badge.earned ? "Unlocked" : "Locked"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function renderWorkingIdleChart(view: ChartView, data: Array<{ label: string; workingHours: number; idleHours: number; productivity: number }>) {
  const shared = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} />
      <Tooltip />
      <Legend />
    </>
  );

  if (view === "stackedArea") {
    return (
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        {shared}
        <Area type="monotone" dataKey="workingHours" stackId="time" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} name="Working (hrs)" />
        <Area type="monotone" dataKey="idleHours" stackId="time" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Idle (hrs)" />
        <Line type="monotone" dataKey="productivity" stroke="#10b981" strokeWidth={2} dot={false} name="Productivity %" yAxisId={1} />
        <YAxis orientation="right" yAxisId={1} tick={{ fontSize: 12 }} domain={[0, 100]} />
      </AreaChart>
    );
  }

  if (view === "stackedBar") {
    return (
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        {shared}
        <Bar dataKey="workingHours" stackId="time" fill="#2563eb" name="Working (hrs)" />
        <Bar dataKey="idleHours" stackId="time" fill="#f59e0b" name="Idle (hrs)" />
      </BarChart>
    );
  }

  return (
    <LineChart data={data} margin={{ left: 8, right: 8 }}>
      {shared}
      <Line type="monotone" dataKey="workingHours" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Working (hrs)" />
      <Line type="monotone" dataKey="idleHours" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Idle (hrs)" />
      <Line type="monotone" dataKey="productivity" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} name="Productivity %" yAxisId={1} />
      <YAxis orientation="right" yAxisId={1} tick={{ fontSize: 12 }} domain={[0, 100]} />
    </LineChart>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm text-center">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--text)]">{value}</p>
    </div>
  );
}

function RecapCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm">
      <p className="text-xs text-[var(--muted)]">{title}</p>
      <p className="text-lg font-semibold text-[var(--text)]">{value}</p>
      {hint && <p className="text-xs text-[var(--muted)] mt-1">{hint}</p>}
    </div>
  );
}


function formatBucketLabel(periodStart: string, range: Range) {
  if (range === "all") { return "All time"; }
  const date = new Date(periodStart);
  const options: Intl.DateTimeFormatOptions =
    range === "week"
      ? { month: "short", day: "numeric" }
      : range === "month"
        ? { month: "short", year: "numeric" }
        : { year: "numeric" };
  return new Intl.DateTimeFormat("en", options).format(date);
}


function sum(values: number[]) {
  return values.reduce((acc, curr) => acc + (Number.isFinite(curr) ? curr : 0), 0);
}

function average(values: number[]) {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (filtered.length === 0) { return 0; }
  return sum(filtered) / filtered.length;
}

function computeYearSummary(aggregates: Aggregates | null) {
  const years = aggregates?.year ?? [];
  if (!years.length) { return null; }
  const sorted = [...years].sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());
  const latest = sorted[0];
  const currentYear = new Date(latest.periodStart).getFullYear();
  const months = (aggregates?.month ?? []).filter((m) => new Date(m.periodStart).getFullYear() === currentYear);
  const weeks = (aggregates?.week ?? []).filter((w) => new Date(w.periodStart).getFullYear() === currentYear);

  const bestMonth = months.reduce<AggregateEntry | null>(
    (best, curr) => (!best || metricAverage(curr.workingSeconds) > metricAverage(best.workingSeconds) ? curr : best),
    null
  );
  const bestWeek = weeks.reduce<AggregateEntry | null>(
    (best, curr) => (!best || metricAverage(curr.workingSeconds) > metricAverage(best.workingSeconds) ? curr : best),
    null
  );

  const avgProd = average(months.map((m) => m.productivityPercent)) || latest.productivityPercent || 0;
  const workingHours = toHours(latest.workingSeconds);
  const idleHours = toHours(latest.idleSeconds);

  const topLanguageEntry = latest.topLanguage?.language
    ? { language: latest.topLanguage.language, seconds: metricAverage(latest.topLanguage.seconds) }
    : pickTopLanguage(latest.languageSeconds || {});
  const topWorkspaceEntry = pickTopWorkspace(latest);

  const grade = computeGrade(avgProd, workingHours);

  const narrativeParts = [
    `You shipped ${workingHours.toFixed(1)} hours of focused work`,
    `kept idle to ${idleHours.toFixed(1)} hours`,
    `and averaged ${avgProd.toFixed(0)}% productivity.`,
  ];
  if (bestMonth) {
    narrativeParts.push(`Your strongest month was ${formatBucketLabel(bestMonth.periodStart, "month")}.`);
  }
  if (topLanguageEntry?.language) {
    narrativeParts.push(`You leaned most on ${topLanguageEntry.language}.`);
  }
  if (topWorkspaceEntry?.workspace) {
    narrativeParts.push(`Your most active workspace was ${topWorkspaceEntry.workspace}.`);
  }

  return {
    yearLabel: currentYear.toString(),
    workingHours,
    idleHours,
    avgProductivity: avgProd,
    bestMonth: bestMonth ? formatBucketLabel(bestMonth.periodStart, "month") : undefined,
    bestMonthHint: bestMonth ? `${toHours(bestMonth.workingSeconds).toFixed(1)}h working` : undefined,
    bestWeek: bestWeek ? formatBucketLabel(bestWeek.periodStart, "week") : undefined,
    bestWeekHint: bestWeek ? `${toHours(bestWeek.workingSeconds).toFixed(1)}h working` : undefined,
    topLanguage: topLanguageEntry?.language,
    topLanguageHint: topLanguageEntry ? `${toHours(topLanguageEntry.seconds).toFixed(1)}h logged` : undefined,
    topWorkspace: topWorkspaceEntry?.workspace,
    topWorkspaceHint: topWorkspaceEntry ? `${toHours(topWorkspaceEntry.seconds).toFixed(1)}h logged` : undefined,
    grade,
    narrative: narrativeParts.join(" "),
  };
}

function computeGrade(avgProductivity: number, workingHours: number): Grade {
  const hoursScore = Math.min(100, (workingHours / 250) * 100);
  const blended = Math.round(avgProductivity * 0.65 + hoursScore * 0.35);
  if (blended >= 95) { return { letter: "A+", description: "Elite focus and output across the year." }; }
  if (blended >= 85) { return { letter: "A", description: "Outstanding consistency with strong throughput." }; }
  if (blended >= 75) { return { letter: "B", description: "Great momentum—keep the cadence going." }; }
  if (blended >= 65) { return { letter: "C", description: "Solid foundation with room to tighten focus." }; }
  return { letter: "D", description: "Opportunities to reduce idle time and increase deep work blocks." };
}

function pickTopLanguage(languageSeconds: Record<string, MetricValue>) {
  let best: { language: string; seconds: number } | null = null;
  for (const [language, seconds] of Object.entries(languageSeconds)) {
    const totalSeconds = metricAverage(seconds);
    if (!best || totalSeconds > best.seconds) {
      best = { language, seconds: totalSeconds };
    }
  }
  return best;
}

function pickTopWorkspace(entry: AggregateEntry) {
  if (entry.topWorkspaces?.length) {
    const sorted = [...entry.topWorkspaces].sort((a, b) => metricAverage(b.seconds) - metricAverage(a.seconds));
    const top = sorted[0];
    return { workspace: top.workspace, seconds: metricAverage(top.seconds) };
  }
  const wsMap = entry.workspaceSeconds || {};
  let best: { workspace: string; seconds: number } | null = null;
  for (const [workspace, seconds] of Object.entries(wsMap)) {
    const totalSeconds = metricAverage(seconds);
    if (!best || totalSeconds > best.seconds) {
      best = { workspace, seconds: totalSeconds };
    }
  }
  return best;
}

function computeBadges(aggregates: Aggregates | null) {
  const weeks = aggregates?.week ?? [];
  const months = aggregates?.month ?? [];
  const activeWeeks = weeks.filter((w) => metricAverage(w.workingSeconds) >= 3600).length;
  const avgProductivity = average(weeks.map((w) => w.productivityPercent));
  const allEntry = aggregates?.all?.[0];
  const totalHours = toHours(allEntry?.workingSeconds ?? 0);
  const idleRatio = allEntry
    ? Math.round((metricAverage(allEntry.idleSeconds) / Math.max(1, metricAverage(allEntry.totalSeconds))) * 100)
    : 0;
  const languageSeconds = allEntry?.languageSeconds || {};
  const strongLanguages = Object.values(languageSeconds).filter((sec) => toHours(sec) >= 3).length;
  const bestWeekHours = weeks.reduce((max, w) => Math.max(max, toHours(w.workingSeconds)), 0);
  const bestMonthHours = months.reduce((max, m) => Math.max(max, toHours(m.workingSeconds)), 0);
  const totalSessions =
    metricAverage(allEntry?.sessionCount) ||
    weeks.reduce((acc, w) => acc + (w.sessionCount ? metricAverage(w.sessionCount) : 0), 0);

  return [
    {
      title: "Consistency Champ",
      description: "Logged meaningful work across many weeks.",
      detail: `${activeWeeks} active weeks`,
      earned: activeWeeks >= 8,
    },
    {
      title: "Focus Master",
      description: "Sustained high productivity against idle time.",
      detail: `Avg productivity ${avgProductivity.toFixed(0)}%`,
      earned: avgProductivity >= 75,
    },
    {
      title: "Time Investor",
      description: "Significant hours invested into deep work.",
      detail: `${totalHours.toFixed(1)}h shipped`,
      earned: totalHours >= 120,
    },
    {
      title: "Polyglot Developer",
      description: "Multiple languages with meaningful focus time.",
      detail: `${strongLanguages} languages over 3h`,
      earned: strongLanguages >= 3,
    },
    {
      title: "Idle Slayer",
      description: "Kept idle time proportional to output.",
      detail: `Idle ratio ${idleRatio}%`,
      earned: idleRatio > 0 && idleRatio <= 35,
    },
    {
      title: "Weekly Warrior",
      description: "Hit a strong weekly deep work block.",
      detail: `Best week ${bestWeekHours.toFixed(1)}h`,
      earned: bestWeekHours >= 25,
    },
    {
      title: "Marathon Coder",
      description: "Massive working time across all history.",
      detail: `${totalHours.toFixed(1)}h total working`,
      earned: totalHours >= 250,
    },
    {
      title: "Session Grinder",
      description: "Plenty of individual sessions logged.",
      detail: `${totalSessions.toFixed(0)} sessions`,
      earned: totalSessions >= 200,
    },
    {
      title: "Monthly Peak",
      description: "A standout month of output.",
      detail: `Best month ${bestMonthHours.toFixed(1)}h`,
      earned: bestMonthHours >= 90,
    },
  ];
}
