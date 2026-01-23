"use client";

import Image from "next/image";
import Link from "next/link";
import HeroAnimation from "@/components/HeroAnimation";
import InstallButton from "@/components/InstallButton";
import ReadDocsButton from "@/components/ReadDocsButton";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (loading) {return;}
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen theme-bg">
      <header className="sticky top-0 z-30 backdrop-blur bg-[var(--card)]/80 border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/icon.png" alt="Clockit Icon" width={32} height={32} className="rounded-full" />
              <span className="text-lg font-semibold tracking-tight text-[var(--text)]">Clockit</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-4 text-sm text-[var(--muted)]">
              <a href="#features" className="hover:text-[var(--text)]">Features</a>
              <a href="#workflow" className="hover:text-[var(--text)]">How it works</a>
              <Link href="/clockit-online" className="hover:text-[var(--text)]">Clockit Online</Link>
              <Link href="/docs" className="hover:text-[var(--text)]">Docs</Link>
            </nav>
            <div className="hidden sm:flex items-center gap-3">
              <ReadDocsButton variant="nav" />
              <InstallButton variant="nav" />
              <Link
                href="/auth"
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] text-sm font-semibold hover:opacity-90 transition-colors shadow-sm"
              >
                Sign in
              </Link>
              <ThemeToggle />
            </div>
            <button
              aria-label="Toggle navigation"
              className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--text)]/30 transition-colors"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="sr-only">Toggle navigation</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileNavOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>

          {mobileNavOpen && (
            <div className="sm:hidden border border-[var(--border)] rounded-xl bg-[var(--card)] px-4 py-3 space-y-3">
              <nav className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                <a href="#features" className="hover:text-[var(--text)]">Features</a>
                <a href="#workflow" className="hover:text-[var(--text)]">How it works</a>
                <Link href="/clockit-online" className="hover:text-[var(--text)]">Clockit Online</Link>
                <Link href="/docs" className="hover:text-[var(--text)]">Docs</Link>
              </nav>
              <div className="grid grid-cols-1 gap-2">
                <InstallButton variant="nav" />
                <ReadDocsButton variant="nav" />
                <Link
                  href="/auth"
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] text-sm font-semibold hover:opacity-90 transition-colors shadow-sm text-center"
                >
                  Sign in
                </Link>
                <ThemeToggle className="w-full justify-center" />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-16 text-[var(--text)]">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Developer time tracking</p>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
              Know where your coding hours go.
            </h1>
            <p className="text-lg text-[var(--muted)]">
              Clockit captures your editor focus time, trims idle minutes, and exports to CSV, Jira, and Notion—no manual timers, no friction. Grab the extension, read the docs, and ship smarter.
            </p>
            <div className="flex flex-wrap gap-3">
              <InstallButton />
              <ReadDocsButton />
            </div>
            <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Auto idle detection</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>Per-language stats</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                <span>CSV/Jira/Notion export</span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-4 shadow-2xl">
            <HeroAnimation />
          </div>
        </section>

        <section id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Automatic capture",
              desc: "Sessions start when you code, pause on idle, and pick back up—no timers to remember.",
            },
            {
              title: "Export everywhere",
              desc: "Send sessions to CSV for analysis, Jira for worklogs, or Notion for your team’s hub.",
            },
            {
              title: "Language awareness",
              desc: "See where you spend time by language to spot stack drift or focus trends quickly.",
            },
            {
              title: "Idle trimmed",
              desc: "Idle minutes are stripped before export, keeping your reports clean and trustworthy.",
            },
            {
              title: "Yearly recaps",
              desc: "Get productivity grades, peak months, and badge progress to track long-term momentum.",
            },
            {
              title: "Privacy-first",
              desc: "Your data lives with you. Choose where to send it, or just keep the CSV locally.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm hover:bg-[var(--card-soft)] transition-colors"
            >
              <h3 className="text-lg font-semibold mb-2 text-[var(--text)]">{f.title}</h3>
              <p className="text-sm text-[var(--muted)]">{f.desc}</p>
            </div>
          ))}
        </section>

        <section id="workflow" className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Workflow</p>
            <h2 className="text-3xl font-bold text-[var(--text)]">Install, code, export. That’s it.</h2>
            <ol className="space-y-3 text-[var(--muted)]">
              <li><strong className="text-[var(--text)]">1.</strong> Install Clockit for your editor and start coding—sessions begin automatically.</li>
              <li><strong className="text-[var(--text)]">2.</strong> Idle time is trimmed; per-language focus is captured without setup.</li>
              <li><strong className="text-[var(--text)]">3.</strong> Export to CSV/Jira/Notion or view dashboards (no login needed to download).</li>
            </ol>
            <div className="flex gap-3">
              <InstallButton variant="hero" />
              <ReadDocsButton variant="hero" />
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-6 space-y-4">
            <div className="flex items-center justify-between text-sm text-[var(--muted)] flex-wrap gap-2">
              <span>Snapshot of exports</span>
              <span className="px-3 py-1 rounded-full bg-[var(--pill)] text-[var(--text)] text-xs">Live CSV</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <table className="min-w-[600px] w-full text-xs sm:text-sm text-[var(--text)]">
                <thead className="bg-[var(--card-soft)] text-[var(--muted)]">
                  <tr>
                    {["startedIso", "endedIso", "durationSeconds", "idleSeconds", "perLanguageSeconds"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { start: "2025-01-03T09:12:00Z", end: "2025-01-03T10:02:00Z", dur: "3000", idle: "120", lang: '{"ts":2400,"json":360}' },
                    { start: "2025-01-03T11:10:00Z", end: "2025-01-03T11:42:00Z", dur: "1920", idle: "90", lang: '{"tsx":1500,"css":330}' },
                    { start: "2025-01-03T13:00:00Z", end: "2025-01-03T13:55:00Z", dur: "3300", idle: "180", lang: '{"go":2940,"sh":180}' },
                  ].map((row, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-mono text-[11px] sm:text-xs whitespace-nowrap">{row.start}</td>
                      <td className="px-3 py-2 font-mono text-[11px] sm:text-xs whitespace-nowrap">{row.end}</td>
                      <td className="px-3 py-2">{row.dur}</td>
                      <td className="px-3 py-2">{row.idle}</td>
                      <td className="px-3 py-2 font-mono text-[11px] sm:text-xs break-all">{row.lang}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--muted)]">CSV export stays local by default. Push to cloud/Jira/Notion only when you choose.</p>
          </div>
        </section>

        <section className="rounded-2xl theme-callout px-6 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Ready to get started?</p>
            <h3 className="text-2xl font-bold text-[var(--text)] mt-1">Grab the extension or read the docs before you sign in.</h3>
            <p className="text-sm text-[var(--muted)] mt-2">Sign in lives in the nav when you’re ready to see your dashboard.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <InstallButton variant="hero" />
            <ReadDocsButton variant="hero" />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-[#0b1021]/80">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-white/60">
          <div className="flex items-center gap-3">
        <Image src="/icon.png" alt="Clockit Icon" width={28} height={28} className="rounded-full" />
        <span>Clockit — Track coding time without the busywork</span>
          </div>
          <div className="flex flex-wrap gap-3">
        <Link href="/docs" className="hover:text-white">Docs</Link>
        <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
        <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
        <Link href="/contact" className="hover:text-white">Contact</Link>
        <Link href="https://marketplace.visualstudio.com/items?itemName=octech.clockit" className="hover:text-white">VS Code Marketplace</Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-4 text-xs text-white/40 text-center">
          © {new Date().getFullYear()} octech. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
