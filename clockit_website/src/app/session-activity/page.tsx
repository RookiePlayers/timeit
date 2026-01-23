"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { useSnackbar } from "notistack";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { isServerUnavailableError, UploadResponse, uploadsApi } from "@/lib/api-client";
import { UploadRow } from "@/types";
import useFeature from "@/hooks/useFeature";
import { buildNavLinks, isFeatureEnabledForNav } from "@/utils/navigation";
import ServerUnavailable from "@/components/ServerUnavailable";


export default function RecentActivityPage() {
  const [user, loadingUser, authError] = useAuthState(auth);
  const router = useRouter();
  const { isFeatureEnabled, loading: featureLoading } = useFeature();
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "auto">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const [uploads, setUploads] = useState<UploadResponse[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [uploadsError, setUploadsError] = useState<Error | null>(null);

  const sessionActivityEnabled = isFeatureEnabled("session-activity");
  const sessionExplorerEnabled = isFeatureEnabled("session-explorer");
  const hasSessionAccess = sessionActivityEnabled || sessionExplorerEnabled;

  // Feature flags for navigation
  const featureFlags = isFeatureEnabledForNav(isFeatureEnabled);
  const navLinks = buildNavLinks(featureFlags, 'session-activity');

  // Redirect if no session activity access
  useEffect(() => {
    if (!featureLoading && !loadingUser && !hasSessionAccess) {
      router.push("/dashboard");
    }
  }, [featureLoading, loadingUser, hasSessionAccess, router]);

  useEffect(() => {
    if (!user) {
      setUploads([]);
      return;
    }

    const loadUploads = async () => {
      try {
        setLoadingUploads(true);
        setUploadsError(null);
        const data = await uploadsApi.list(100, false);
        setUploads(data);
      } catch (err) {
        setUploadsError(err instanceof Error ? err : new Error('Failed to load uploads'));
      } finally {
        setLoadingUploads(false);
      }
    };

    void loadUploads();
  }, [user]);

  if (loadingUser || loadingUploads || featureLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
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

  if (!hasSessionAccess) {
    return (
      <div className="min-h-screen theme-bg">
        <NavBar
          userName={user?.displayName || user?.email || undefined}
          userPhoto={user?.photoURL}
          onSignOut={user ? () => auth.signOut() : undefined}
          links={navLinks}
        />
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-6 shadow-lg text-center space-y-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">Session Activity not available</h1>
            <p className="text-[var(--muted)]">
              This feature is not included in your current plan. Upgrade to access session activity tracking and history.
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

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-gray-800">
        <p className="text-lg font-semibold">You need to sign in to view session activity!</p>
        <div className="flex gap-3">
          <Link href="/auth" className="px-4 py-2 bg-blue-600 text-[var(--text)] rounded-lg shadow hover:bg-blue-700 transition-colors">
            Sign in
          </Link>
          <Link href="/auth?mode=signup" className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:border-[var(--border)] hover:text-[var(--primary)] transition-colors">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  if (uploadsError && isServerUnavailableError(uploadsError)) {
    return <ServerUnavailable />;
  }

  const rows: UploadRow[] = uploads.map((upload) => {
    const uploadedAt = upload.uploadedAt ? new Date(upload.uploadedAt) : null;
    const filename = upload.filename || upload.id;
    const count = upload.rowCount || 0;
    // If fileName exists and is different from the ID, it's a manual upload
    // If fileName equals the ID or is missing, it's an auto upload
    const source: UploadRow["source"] = upload.source
    // IDE name is not available in the API response currently
    const ideName = upload.ideName || undefined;
    return { id: upload.id, filename, uploadedAt, count, source, ideName };
  });

  const filteredRows = rows.filter((row) => sourceFilter === "all" || row.source === sourceFilter);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <NavBar
        userName={user.displayName || user.email || undefined}
        userPhoto={user?.photoURL}
        onSignOut={() => auth.signOut()}
        links={navLinks}
      />

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Session Activity</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Shows your latest uploads ordered by most recent.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard" className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text)] border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors">
              Back to dashboard
            </Link>
          </div>
        </header>

        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-[var(--text)]">Uploads</h2>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <div className="flex items-center gap-2 text-xs">
                <label className="text-[var(--muted)] font-medium">Source:</label>
                {(["all", "manual", "auto"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setSourceFilter(opt);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                      sourceFilter === opt
                        ? "bg-[var(--blue-50)] text-[var(--blue-700)] border-[var(--blue-200)]"
                        : "bg-[var(--white)] text-[var(--gray-600)] border-[var(--gray-200)] hover:border-[var(--blue-200)] hover:text-[var(--blue-700)]"
                    }`}
                  >
                    {opt === "all" ? "All sources" : opt === "manual" ? "Manual" : "Auto"}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[var(--muted)]">
                Showing {filteredRows.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filteredRows.length)} of {filteredRows.length}
              </span>
            </div>
          </div>
          {uploadsError && (
            <div className="px-4 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">
              Failed to load uploads: {uploadsError.message}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm text-[var(--text)]">
              <thead className="bg-[var(--gray-50)] text-[var(--gray-600)] border-b border-gray-100-50">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Filename</th>
                  <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">Uploaded at</th>
                  <th className="text-left px-4 py-2 font-semibold">Entries</th>
                  <th className="text-left px-4 py-2 font-semibold">Source</th>
                  <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">IDE</th>
                  <th className="text-left px-4 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-[var(--muted)]">
                      {rows.length === 0
                        ? "No uploads yet. Upload a CSV from the dashboard to see activity here."
                        : "No uploads match this source filter."}
                    </td>
                  </tr>
                )}
                {paginatedRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-[var(--gray-50)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text)] break-all">{row.filename}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                      {row.uploadedAt ? row.uploadedAt.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{row.count.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${row.source === "manual" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        {row.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                      {row.ideName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/session-activity/${row.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors mr-2"
                      >
                        View rows
                      </Link>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) {return;}
                          const confirmed = window.confirm("Delete this upload? This cannot be undone.");
                          if (!confirmed) {return;}
                          setDeletingId(row.id);
                          try {
                            await uploadsApi.delete(row.id);
                            // Remove from local state
                            setUploads((prev) => prev.filter((u) => u.id !== row.id));
                            enqueueSnackbar("Upload deleted.", { variant: "success" });
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : "Failed to delete upload.";
                            enqueueSnackbar(msg, { variant: "error" });
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                        disabled={deletingId === row.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {deletingId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100-50 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-[var(--gray-200)] bg-[var(--background)] hover:border-[var(--blue-200)] hover:text-[var(--blue-700)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-[var(--gray-200)] bg-[var(--background)] hover:border-[var(--blue-200)] hover:text-[var(--blue-700)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
