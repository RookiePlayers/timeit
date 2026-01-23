"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { IconChecks, IconClockPlay, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconTargetArrow, IconTimelineEvent } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import { auth } from "@/lib/firebase";
import useFeature from "@/hooks/useFeature";
import type { Goal } from "@/types";
import type { GroupView } from "./types";
import GoalsTab from "./components/GoalsTab";
import SessionsTab from "./components/SessionsTab";
import { buildNavLinks, isFeatureEnabledForNav } from "@/utils/navigation";


function ClockitOnlinePageContent() {
  const [user] = useAuthState(auth);
  const { isFeatureEnabled } = useFeature();
  const onlineEnabled = isFeatureEnabled("clockit-online");
  const goalsEnabled = !!user?.uid && isFeatureEnabled("create-goals-for-sessions");

  // Feature flags for navigation
  const featureFlags = isFeatureEnabledForNav(isFeatureEnabled);
  const navLinks = buildNavLinks(featureFlags, 'clockit-online');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"goals" | "sessions">(goalsEnabled ? "goals" : "sessions");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hideMobileTabs, setHideMobileTabs] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const sessionStarterRef = useRef<((group: GroupView) => void) | null>(null);
  const lastScrollYRef = useRef(0);

  const handleRegisterStartFromGroup = useCallback((fn: (group: GroupView) => void) => {
    sessionStarterRef.current = fn;
  }, []);

  const syncTabToUrl = useCallback(
    (tab: "goals" | "sessions") => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setTab = useCallback(
    (tab: "goals" | "sessions") => {
      if (tab === "goals" && !goalsEnabled) {
        setActiveTab("sessions");
        return;
      }
      setActiveTab(tab);
      syncTabToUrl(tab);
    },
    [syncTabToUrl, goalsEnabled],
  );

  useLayoutEffect(() => {
    const tabParam = searchParams?.get("tab");
    if (tabParam === "goals" && !goalsEnabled) {
      // Defer state updates to avoid cascading renders
      const timer = setTimeout(() => {
        setActiveTab("sessions");
        syncTabToUrl("sessions");
      }, 0);
      return () => clearTimeout(timer);
    }
    if (tabParam === "goals" || tabParam === "sessions") {
      const timer = setTimeout(() => {
        setActiveTab((prev) => (prev === tabParam ? prev : tabParam));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [searchParams, goalsEnabled, syncTabToUrl]);

  useEffect(() => {
    if (!onlineEnabled) {
      router.replace("/dashboard");
    }
  }, [onlineEnabled, router]);

  const handleStartClockit = useCallback(
    (group: GroupView) => {
      sessionStarterRef.current?.(group);
      setTab("sessions");
    },
    [setTab],
  );

  useEffect(() => {
    if (!onlineEnabled) {
      return;
    }

    const handleScroll = () => {
      const currentY = window.scrollY;
      const lastY = lastScrollYRef.current;
      const threshold = Math.max(0, window.innerHeight * 0.5);
      const scrolledPastHalf = currentY > threshold;
      const scrollingUp = currentY < lastY - 6;
      const scrollingDown = currentY > lastY + 6;

      if (scrolledPastHalf && scrollingDown) {
        setHideMobileTabs(true);
      } else if (scrollingUp || !scrolledPastHalf) {
        setHideMobileTabs(false);
      }

      lastScrollYRef.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [onlineEnabled]);

  if (!onlineEnabled) {
    return (
      <div className="min-h-screen theme-bg">
        <NavBar
          userName={user?.displayName || user?.email || undefined}
          userPhoto={user?.photoURL}
          onSignOut={user ? () => auth.signOut() : undefined}
          links={navLinks}
        />
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-lg shadow-blue-900/10 text-center space-y-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">Clockit Online is not available for your account</h1>
            <p className="text-[var(--muted)]">
              This feature is currently disabled. If you believe this is an error, please contact support or your administrator.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/dashboard" className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] font-semibold hover:opacity-90">
                Go to dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-bg">
      <NavBar
        userName={user?.displayName || user?.email || undefined}
        userPhoto={user?.photoURL}
        onSignOut={user ? () => auth.signOut() : undefined}
        links={navLinks}
      />

      <main className="max-w-6xl mx-auto px-6 pb-32 pt-8 relative">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.25) 1px, transparent 0), radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.06), transparent 60%)",
            backgroundSize: "24px 24px, 100% 100%",
          }}
          aria-hidden
        />
        <div
          className="lg:grid lg:gap-6"
          style={{ gridTemplateColumns: sidebarCollapsed ? "64px 1fr" : "260px 1fr" }}
        >
          <aside className="hidden lg:block sticky top-28 self-start">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3 shadow-lg shadow-blue-900/10 backdrop-blur">
                <div className="flex items-center justify-between mb-2">
                {!sidebarCollapsed && (
                  <span className="text-xs uppercase tracking-wide text-blue-500">Clockit Online</span>
                )}
                <button
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  className="p-2 rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--card-soft)]"
                  aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                >
                  {sidebarCollapsed ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />}
                </button>
                </div>
              <div className="flex flex-col gap-2">
                {[
                  ...(goalsEnabled ? [{ key: "goals", label: "Clockit Goals", Icon: IconTargetArrow }] : []),
                  { key: "sessions", label: "Clockit Sessions", Icon: IconTimelineEvent },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key as "goals" | "sessions")}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl font-semibold transition-colors ${
                      activeTab === key
                        ? "bg-[var(--primary)] text-[var(--primary-contrast)] shadow"
                        : "bg-[var(--card-soft)] text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    <Icon size={16} />
                    {!sidebarCollapsed && <span>{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          </aside>

        <div
          className={`lg:hidden sticky top-14 z-40 px-4 transition duration-200 ease-out ${
            hideMobileTabs ? "opacity-0 pointer-events-none -translate-y-1" : "opacity-100"
          }`}
        >
          <div className="bg-[var(--card)]/90 backdrop-blur-md rounded-2xl px-3 py-3 flex flex-row gap-2 border border-[var(--border)] shadow-lg shadow-blue-900/10">
            {[
              ...(goalsEnabled ? [{ key: "goals", label: "Goals", Icon: IconChecks, disabled: false }] : []),
              { key: "sessions", label: "Sessions", Icon: IconClockPlay, disabled: false },
            ].map(({ key, label, Icon, disabled }) => (
              <button
                key={key}
                onClick={() => !disabled && setTab(key as "goals" | "sessions")}
                disabled={disabled}
                className={`w-fit inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-3 py-2 text-left ${
                  disabled
                    ? "bg-[var(--card-soft)] text-[var(--muted)] opacity-60 cursor-not-allowed"
                    : activeTab === key
                        ? "bg-[var(--primary)] text-[var(--primary-contrast)] shadow"
                        : "bg-[var(--card-soft)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
          <div className="space-y-6">
            <div className={activeTab === "goals" ? "block" : "hidden"}>
              <GoalsTab
                user={user}
                goals={goals}
                setGoals={setGoals}
                onStartClockit={handleStartClockit}
                showQuickAdd={activeTab === "goals" && goalsEnabled}
                goalsEnabled={goalsEnabled}
              />
            </div>
            <div className={activeTab === "sessions" ? "block" : "hidden"}>
              <SessionsTab
                user={user}
                goals={goals}
                setGoals={setGoals}
                setActiveTab={setActiveTab}
                onRegisterStartFromGroup={handleRegisterStartFromGroup}
                showQuickAdd={activeTab === "sessions" && goalsEnabled}
                goalsEnabled={goalsEnabled}
              />
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default function ClockitOnlinePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ClockitOnlinePageContent />
    </Suspense>
  );
}
