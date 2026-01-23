/* eslint-disable react-hooks/error-boundaries */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { isServerUnavailableError, uploadsApi } from "@/lib/api-client";
import { Goal } from "@/types";
import NavBar from "@/components/NavBar";
import ServerUnavailable from "@/components/ServerUnavailable";

type UploadRows = Array<Record<string, unknown>>;

type UploadData = {
  filename: string;
  uploadedAt: Date | null;
  rows: UploadRows;
};

export default function UploadDetailPage() {
  const params = useParams<{ uploadId: string }>();
  const uploadId = params?.uploadId;
  const [user, loadingUser, authError] = useAuthState(auth);
  const [upload, setUpload] = useState<UploadData | null>(null);
  const [loadingUpload, setLoadingUpload] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{ title: string; entries: Array<{ label: string; seconds: number }> } | null>(null);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [commentContent, setCommentContent] = useState<string | null>(null);
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [extraContent, setExtraContent] = useState<string>("");
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [goalModalContent, setGoalModalContent] = useState<{ title: string; goals: GoalDisplay[] } | null>(null);

  useEffect(() => {
    if (!user || !uploadId) {
      setLoadingUpload(false);
      return;
    }

    const fetchUpload = async () => {
      try {
        setLoadError(null);
        setLoadingUpload(true);

        const data = await uploadsApi.get(uploadId);

        if (!data) {
          setLoadError(new Error("Upload not found."));
          setUpload(null);
          return;
        }

        const rows = Array.isArray(data.data) ? (data.data as UploadRows) : [];
        const uploadedAt = data.uploadedAt ? new Date(data.uploadedAt) : null;

        setUpload({
          filename: data.filename && data.filename.length ? data.filename : uploadId,
          uploadedAt,
          rows,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to load upload.");
        setLoadError(error);
      } finally {
        setLoadingUpload(false);
      }
    };

    void fetchUpload();
  }, [user, uploadId]);

  const columns = useMemo(() => {
    const rows = upload?.rows || [];
    if (!rows.length) {return [];}
    const preferred = [
      "startedIso",
      "startedISO",
      "endedIso",
      "endedISO",
      "durationSeconds",
      "idleSeconds",
      "perFileSeconds",
      "perLanguageSeconds",
      "workspace",
      "language",
      "project",
      "note",
      "comment",
    ];
    const allKeys = new Set<string>();
    for (const row of rows) {
      Object.keys(row || {}).forEach((k) => allKeys.add(k));
    }
    const ordered: string[] = [];
    for (const key of preferred) {
      if (allKeys.has(key)) {
        ordered.push(key);
        allKeys.delete(key);
      }
    }
    return [...ordered, ...Array.from(allKeys).sort()];
  }, [upload?.rows]);

  if (loadingUser || loadingUpload) {
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
        <p className="text-lg font-semibold">You need to sign in to view this upload.</p>
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

  if (loadError && isServerUnavailableError(loadError)) {
    return <ServerUnavailable />;
  }

  const title = user.displayName || user.email || "Developer";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <NavBar
        userName={title}
        userPhoto={user?.photoURL}
        onSignOut={() => auth.signOut()}
        links={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/clockit-online", label: "Clockit Online" },
          { href: "/advanced-stats", label: "Advanced Stats" },
          { href: "/recent-activity", label: "Recent Activity" },
          { href: "/session-activity", label: "Session Activity", active: true },
          { href: "/docs", label: "Docs" },
          
        ]}
      />

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-sm text-blue-600 font-semibold">Upload detail</p>
            <h1 className="text-3xl font-bold text-[var(--text)] break-all">{upload?.filename ?? "Upload"}</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {upload?.uploadedAt ? upload.uploadedAt.toLocaleString() : "Upload time unavailable"}
              {" · "}
              {upload?.rows?.length ?? 0} row{(upload?.rows?.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/session-activity" className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text)] border border-[var(--border)] hover:border-[var(--primary)]/40 hover:text-[var(--primary)] transition-colors">
              Back to session activity
            </Link>
          </div>
        </header>

        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-lg shadow-blue-900/10">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--text)]">Rows</h2>
            {loadError && <span className="text-sm text-red-500"> {loadError.message}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[840px] w-full text-sm text-[var(--text)]">
              <thead className="bg-[var(--card-soft)] text-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold whitespace-nowrap">#</th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className={`text-left px-4 py-2 font-semibold whitespace-nowrap  ${isWideColumn(col) ? "min-w-[210px]" : "min-w-[180px]"}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
              </thead>
              <tbody>
                {(!upload || upload.rows.length === 0) && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-[var(--muted)]">
                      No rows found in this upload.
                    </td>
                  </tr>
                )}
                {upload?.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--card-soft)] transition-colors">
                    <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">{idx + 1}</td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className={`px-4 py-3 text-[var(--text)] align-top min-w-[80px] ${isWideColumn(col) ? "min-w-[220px]" : ""}`}
                      >
                        {col === "perFileSeconds" || col === "perLanguageSeconds" ? (
                          <button
                            type="button"
                            className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                            onClick={() => {
                              const entries = parseSecondsMap((row as Record<string, unknown>)[col]);
                              setModalContent({
                                title: col,
                                entries,
                              });
                              setIsModalOpen(true);
                            }}
                          >
                            {col === "perFileSeconds" ? "View per file" : "View per language"}
                          </button>
                        ) : col === "comment" ? (
                          <button
                            type="button"
                            className="w-full text-center px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                            onClick={() => {
                              const comment = (row as Record<string, unknown>)[col];
                              const content = typeof comment === "string" ? comment : "";
                              setCommentContent(content);
                              setIsCommentModalOpen(true);
                            }}
                          >
                            {renderCommentPreview((row as Record<string, unknown>)[col])}
                          </button>
                        ) : col === "goals" ? (
                          <GoalsCell
                            row={row as Record<string, unknown>}
                            onOpen={(goals) => {
                              setGoalModalContent({ title: "Goals", goals });
                              setIsGoalsModalOpen(true);
                            }}
                          />
                        ) : col === "__parsed_extra" ? (
                          <button
                            type="button"
                            className="w-full text-center px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
                            onClick={() => {
                              setExtraContent(formatJson((row as Record<string, unknown>)[col]));
                              setIsExtraModalOpen(true);
                            }}
                          >
                            View parsed extra
                          </button>
                        ) : (
                          <Cell value={(row as Record<string, unknown>)[col]} column={col} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">{modalContent?.title ?? "Details"}</h3>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-auto">
                {(!modalContent || modalContent.entries.length === 0) ? (
                  <p className="text-sm text-gray-600">No data available.</p>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                    {modalContent.entries.map((item) => (
                      <div
                        key={`${item.label}-${item.seconds}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50"
                      >
                        <span className="font-mono text-xs text-gray-800 break-all flex-1">{item.label}</span>
                        <span
                          className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"
                          title={formatHoursTooltip(item.seconds)}
                        >
                          {formatNumberCompact(item.seconds)}s
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {isExtraModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">__parsed_extra</h3>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => setIsExtraModalOpen(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-auto">
                <pre className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap break-words">
                  {extraContent}
                </pre>
              </div>
            </div>
          </div>
        )}
        {isCommentModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[70vh] overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Comment</h3>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => setIsCommentModalOpen(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-auto">
                {commentContent && commentContent.trim().length > 0 ? (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{commentContent}</p>
                ) : (
                  <p className="text-sm text-gray-600">No comment provided for this row.</p>
                )}
              </div>
            </div>
          </div>
        )}
        {isGoalsModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-gray-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">{goalModalContent?.title ?? "Goals"}</h3>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => setIsGoalsModalOpen(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-auto">
                {!goalModalContent || goalModalContent.goals.length === 0 ? (
                  <p className="text-sm text-gray-600">No goals recorded for this session.</p>
                ) : (
                  <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                    {goalModalContent.goals.map((goal, idx) => (
                      <div
                        key={`${goal.title}-${goal.completedAt ?? goal.createdAt ?? idx}`}
                        className="flex items-start gap-3 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50"
                      >
                        <input type="checkbox" checked={goal.completed} readOnly className="mt-1 h-4 w-4 accent-blue-600" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 break-words">{goal.title || "Untitled goal"}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {goal.timeTakenSeconds !== null && goal.timeTakenSeconds !== undefined && (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                Time: {formatDurationShort(goal.timeTakenSeconds)}
                              </span>
                            )}
                            {goal.fromEndSeconds !== null && goal.fromEndSeconds !== undefined && (
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                                From end: {formatFromEnd(goal.fromEndSeconds)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

type GoalDisplay = {
  title: string;
  completed: boolean;
  createdAt?: string | null;
  completedAt?: string | null;
  timeTakenSeconds?: number | null;
  fromEndSeconds?: number | null;
};

function Cell({ value, column }: { value: unknown; column: string }) {
  const numericColumns = new Set(["durationSeconds", "idleSeconds", "linesAdded", "linesDeleted"]);
  if (value === null || value === undefined) {
    return <span className="text-gray-400">—</span>;
  }
  const numericValue = (() => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (numericColumns.has(column) && typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  })();

  if (numericValue !== null) {
    return (
      <span
        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800"
        title={isTimeColumn(column) ? formatHoursTooltip(numericValue) : String(numericValue)}
      >
        {formatNumberCompact(numericValue)}
      </span>
    );
  }

  if (typeof value === "object") {
    try {
      return <code className="text-xs break-all">{JSON.stringify(value)}</code>;
    } catch {
      return <span className="text-gray-800">[object]</span>;
    }
  }

  return <span className="text-gray-800 break-all">{String(value)}</span>;
}

function parseSecondsMap(value: unknown): Array<{ label: string; seconds: number }> {
  if (!value) {return [];}
  let data: unknown = value;
  if (typeof value === "string") {
    try {
      data = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (typeof data !== "object" || Array.isArray(data) || data === null) {
    return [];
  }
  const entries: Array<{ label: string; seconds: number }> = [];
  for (const [label, seconds] of Object.entries(data as Record<string, unknown>)) {
    const num = Number(seconds);
    if (!Number.isFinite(num)) {continue;}
    entries.push({ label, seconds: num });
  }
  return entries;
}

function isWideColumn(column: string) {
  const iso = column === "startedIso" || column === "startedISO" || column === "endedIso" || column === "endedISO";
  const contact = column === "authorEmail";
  const machine = column === "machine" || column === "machineName";
  const repo = column === "repoPath";
  const branch = column === "branch";
  const comment = column === "comment";
  return iso || contact || machine || repo || branch || comment;
}

function formatNumberCompact(value: number) {
  try {
    return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  } catch {
    return value.toString();
  }
}

function isTimeColumn(column: string) {
  const key = column.toLowerCase();
  return key === "durationseconds" || key === "idleseconds" || key === "perfileseconds" || key === "perlanguageseconds";
}

function formatHoursTooltip(seconds: number) {
  const hours = seconds / 3600;
  return `${hours.toFixed(2)} hours`;
}

function renderCommentPreview(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "No comment";
  }
  const trimmed = value.trim();
  if (trimmed.length <= 50) {
    return trimmed;
  }
  return `${trimmed.slice(0, 50)}…`;
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDurationShort(seconds: number) {
  if (!Number.isFinite(seconds)) {return "—";}
  if (seconds < 60) {return `${Math.round(seconds)}s`;}
  const minutes = seconds / 60;
  if (minutes < 60) {return `${minutes.toFixed(minutes < 10 ? 1 : 0)}m`;}
  const hours = minutes / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

function formatFromEnd(secondsFromEnd: number) {
  const label = formatDurationShort(Math.abs(secondsFromEnd));
  return secondsFromEnd >= 0 ? `${label} before end` : `${label} after end`;
}

function GoalsCell({
  row,
  onOpen,
}: {
  row: Record<string, unknown>;
  onOpen: (goals: GoalDisplay[]) => void;
}) {
  const endedIso = (row.endedIso as string) || (row.endedISO as string) || "";
  const goals = parseGoals(row.goals, endedIso);
  const disabled = goals.length === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      className={`w-full text-center px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
        disabled
          ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
          : "text-green-700 bg-green-50 border-green-100 hover:bg-green-100"
      }`}
      onClick={() => {
        if (!disabled) {
          onOpen(goals);
        }
      }}
    >
      {disabled ? "No goals" : "View goals"}
    </button>
  );
}

function parseGoals(raw: unknown, endedIso?: string): GoalDisplay[] {
  if (!raw) {return [];}
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) {
    return [];
  }
  const ended = safeParseDate(endedIso);
  return data
    .map((g: Goal & Record<string, unknown>) => {
      if (typeof g !== "object" || g === null) {return null;}
      const title = typeof (g).title === "string" ? (g).title : "";
      const createdAt = typeof (g).createdAt === "string" ? (g).createdAt : null;
      const completedAt = typeof (g).completedAt === "string" ? (g).completedAt : null;
      const timeTakenSecondsRaw = (g).timeTaken;
      const timeTakenSeconds =
        typeof timeTakenSecondsRaw === "number" && Number.isFinite(timeTakenSecondsRaw)
          ? timeTakenSecondsRaw
          : deriveTimeTaken(createdAt, completedAt);
      const fromEndSeconds = deriveFromEndSeconds(ended, completedAt || createdAt);
      return {
        title,
        completed: Boolean(completedAt),
        createdAt,
        completedAt,
        timeTakenSeconds,
        fromEndSeconds,
      } as GoalDisplay;
    })
    .filter((g): g is GoalDisplay => Boolean(g));
}

function safeParseDate(value?: string | null) {
  if (!value || typeof value !== "string") {return null;}
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function deriveTimeTaken(createdAt?: string | null, completedAt?: string | null) {
  const created = safeParseDate(createdAt);
  const completed = safeParseDate(completedAt);
  if (!created || !completed) {return null;}
  const seconds = Math.max(0, (completed.getTime() - created.getTime()) / 1000);
  return Number.isFinite(seconds) ? seconds : null;
}

function deriveFromEndSeconds(ended: Date | null, referenceIso?: string | null) {
  if (!ended) {return null;}
  const ref = safeParseDate(referenceIso || undefined);
  if (!ref) {return null;}
  const seconds = Math.round((ended.getTime() - ref.getTime()) / 1000);
  return Number.isFinite(seconds) ? seconds : null;
}
