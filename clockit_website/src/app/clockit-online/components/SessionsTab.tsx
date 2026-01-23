"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowRight, IconClockPlay, IconPlayerPlayFilled } from "@tabler/icons-react";
import { useSnackbar } from "notistack";
import type { ClockitSession, ClockitSessionUpload, Goal } from "@/types";
import type { GroupView } from "../types";
import { CLOCKIT_SERVER_WS, STORAGE_KEY_SESSIONS } from "../constants";
import { auth } from "@/lib/firebase";
import { formatDayLabel, toDateKey } from "../utils";
import QuickAddGoal from "./QuickAddGoal";
import SessionCard from "./SessionCard";
import { createCSVFromSessionUpload, downloadSessionCsv } from "../utils";
import { sessionsApi } from "@/lib/api-client";

type SessionWire = {
  sessionId: string;
  label: string;
  startedAt: number;
  accumulatedMs: number;
  endedAt?: number;
  running: boolean;
  goals: Goal[];
  groupId?: string;
  groupName?: string;
  comment?: string;
  pausedAt?: number;
};

const STORAGE_KEY_PRIMARY = "clockit-online-primary-session";

type Props = {
  user: { email?: string | null; displayName?: string | null; uid?: string | null } | null | undefined;
  goals: Goal[];
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  setActiveTab: (tab: "goals" | "sessions") => void;
  onRegisterStartFromGroup: (fn: (group: GroupView) => void) => void;
  showQuickAdd?: boolean;
  goalsEnabled?: boolean;
};

export default function SessionsTab({
  user,
  goals,
  setGoals,
  setActiveTab,
  onRegisterStartFromGroup,
  showQuickAdd = false,
  goalsEnabled = true,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [sessions, setSessions] = useState<ClockitSession[]>(() => {
    if (typeof window === "undefined") { return []; }
    const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!storedSessions) { return []; }
    try {
      return JSON.parse(storedSessions) as ClockitSession[];
    } catch {
      return [];
    }
  });
  const [sessionsUpload, setSessionsUpload] = useState<Record<string, ClockitSessionUpload>>({});
  const [tickMap, setTickMap] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [primarySessionId, setPrimarySessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") { return null; }
    return localStorage.getItem(STORAGE_KEY_PRIMARY);
  });
  const [renderNow, setRenderNow] = useState<number>(() => (typeof window !== "undefined" ? Date.now() : 0));
  const removedIdsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const nowRef = useRef<number>(0);
  const connectSocketRef = useRef<() => void>(() => { });
  const shouldReconnectRef = useRef(true);

  const availableGoals = useMemo(() => goals.filter((g) => !g.completed), [goals]);
  const currentPrimaryId = useMemo(() => {
    if (primarySessionId && sessions.some((s) => s.id === primarySessionId)) {
      return primarySessionId;
    }
    return null;
  }, [primarySessionId, sessions]);

  useEffect(() => {
    if (typeof window === "undefined" || user) { return; }
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }, [sessions, user]);

  useEffect(() => {
    if (typeof window === "undefined") { return; }
    if (currentPrimaryId) {
      localStorage.setItem(STORAGE_KEY_PRIMARY, currentPrimaryId);
    } else {
      localStorage.removeItem(STORAGE_KEY_PRIMARY);
    }
  }, [currentPrimaryId]);

  useEffect(() => {
    nowRef.current = Date.now();
    setRenderNow(nowRef.current);
    const id = setInterval(() => {
      nowRef.current = Date.now();
      setRenderNow(nowRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      const reset = () => setWsToken(null);
      return reset();
    }
    const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        setWsToken(null);
        return;
      }
      const token = await firebaseUser.getIdToken();
      setWsToken(token);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const connectSocket = useCallback(() => {
    if (!wsToken) { return; }
    const url = `${CLOCKIT_SERVER_WS}?token=${encodeURIComponent(wsToken)}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener("open", () => setConnected(true));
    ws.addEventListener("close", () => {
      setConnected(false);
      socketRef.current = null;
      if (shouldReconnectRef.current) {
        setTimeout(() => connectSocketRef.current?.(), 1500);
      }
    });
    ws.addEventListener("error", () => {
      setConnected(false);
      ws.close();
    });
    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as
          | { type: "ready"; payload: SessionWire[] }
          | { type: "session-snapshot"; payload: SessionWire[] }
          | { type: "session-update"; payload: SessionWire | { sessionId: string; removed: true } }
          | { type: "tick"; payload: Array<{ sessionId: string; elapsedMs: number; running: boolean }> };
        if (data.type === "ready" || data.type === "session-snapshot") {
          nowRef.current = Date.now();
          const mapped: ClockitSession[] = data.payload.map((s) => ({
            id: s.sessionId,
            label: s.label,
            startedAt: s.startedAt,
            accumulatedMs: s.accumulatedMs,
            endedAt: s.endedAt,
            running: s.running,
            goals: s.goals || [],
            groupId: s.groupId,
            groupName: s.groupName,
            comment: s.comment,
            pausedAt: s.pausedAt,
          })).filter((s) => !removedIdsRef.current.has(s.id));
          setSessions(mapped);
        } else if (data.type === "session-update") {
          const s = data.payload;
          if ("removed" in s && s.sessionId) {
            removedIdsRef.current.add(s.sessionId);
            setSessions((prev) => prev.filter((sess) => sess.id !== s.sessionId));
            if (primarySessionId === s.sessionId) { setPrimarySessionId(null); }
            return;
          }
          if (!("sessionId" in s) || !("label" in s)) { return; }
          const mapped: ClockitSession = {
            id: s.sessionId,
            label: s.label,
            startedAt: s.startedAt,
            accumulatedMs: s.accumulatedMs,
            endedAt: s.endedAt,
            running: s.running,
            goals: "goals" in s && Array.isArray(s.goals) ? s.goals : [],
            groupId: s.groupId,
            groupName: s.groupName,
            comment: s.comment,
            pausedAt: s.pausedAt,
          };
          setSessions((prev) => {
            const exists = prev.some((p) => p.id === mapped.id);
            if (exists) {
              return prev.map((p) => (p.id === mapped.id ? mapped : p));
            }
            return [mapped, ...prev].filter((p) => !removedIdsRef.current.has(p.id));
          });
        } else if (data.type === "tick") {
          nowRef.current = Date.now();
          setTickMap((prev) => {
            const next = { ...prev };
            data.payload.forEach((t) => {
              next[t.sessionId] = t.elapsedMs;
            });
            return next;
          });
          setSessions((prev) =>
            prev.map((s) => {
              const tick = data.payload.find((t) => t.sessionId === s.id);
              if (!tick) { return s; }
              return { ...s, running: tick.running, accumulatedMs: tick.elapsedMs };
            }),
          );
        }
      } catch {
        // ignore parse errors
      }
    });
  }, [primarySessionId, wsToken]);

  useEffect(() => {
    connectSocketRef.current = connectSocket;
  }, [connectSocket]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    if (wsToken) {
      connectSocketRef.current?.();
    }
    return () => {
      shouldReconnectRef.current = false;
      socketRef.current?.close();
    };
  }, [wsToken]);

  const sessionDuration = (session: ClockitSession) => {
    const base = session.accumulatedMs ?? 0;
    if (session.running) {
      const tick = tickMap[session.id];
      if (typeof tick === "number") {
        return tick;
      }
      return base + Math.max(0, renderNow - session.startedAt);
    }
    return base;
  };

  // Local purge for long-paused sessions (offline/guest)
  useEffect(() => {
    const purge = () => {
      const cutoff = Date.now() - 12 * 60 * 60 * 1000;
      setSessions((prev) => prev.filter((s) => !(!s.running && !s.endedAt && s.pausedAt && s.pausedAt < cutoff)));
    };
    const id = setInterval(purge, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const sessionGroups = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      const id = s.groupId || s.id;
      const name = s.groupName || s.label;
      if (id && name) {
        map.set(id, name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const attachableGoals = useMemo(() => {
    const allowed = new Set(sessionGroups.map((g) => g.id));
    if (!allowed.size) { return []; }
    return availableGoals.filter((g) => allowed.has(g.groupId));
  }, [availableGoals, sessionGroups]);

  const primarySession = currentPrimaryId ? sessions.find((s) => s.id === currentPrimaryId) : null;
  const nonPrimarySessions = currentPrimaryId ? sessions.filter((s) => s.id !== currentPrimaryId) : sessions;

  const setPrimary = (id: string) => {
    setPrimarySessionId(id);
  };

  const stopSession = (sessionId: string) => {
    const finished = sessions.find((s) => s.id === sessionId);
    const endedAt = nowRef.current;
    if (finished) {
      const durationMs = sessionDuration(finished);
      finished.endedAt = endedAt;
      finished.accumulatedMs = durationMs ?? 0;
      if (user?.uid) {
        const data: ClockitSessionUpload = {
          ...finished,
          userEmail: user.email ?? undefined,
          userName: user.displayName ?? undefined,
          sessionId,
          createdAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          groupId: finished.groupId ?? null,
          groupName: finished.groupName ?? null,
          comment: finished.comment ?? null,
          goals: finished.goals ?? [],
          running: false,
          accumulatedMs: durationMs,
          pausedAt: finished.pausedAt ?? null
        }
        const csv = createCSVFromSessionUpload(data);
        const docData: ClockitSessionUpload = {
          ...data,
          csv,
        };

        // Save session via API
        const cleaned = Object.fromEntries(Object.entries(docData).filter(([, v]) => v !== undefined));
        sessionsApi.save([cleaned as unknown as ClockitSession])
          .then(() => {
            enqueueSnackbar("Session uploaded to cloud", { variant: "success" });
          }).catch((error) => {
            console.error("Failed to upload session:", error);
            enqueueSnackbar("Failed to upload session to cloud", { variant: "error" });
          });
        setSessionsUpload({
          [sessionId]: docData
        });
      }
    }
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-stop", payload: { sessionId } }));
      enqueueSnackbar("Session now ended", { variant: "success" });
    } else {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) { return s; }
          const accumulated = (s.accumulatedMs ?? 0) + (s.running ? endedAt - s.startedAt : 0);
          return { ...s, running: false, endedAt, accumulatedMs: accumulated };
        }),
      );
    }
  };

  const removeSession = (sessionId: string) => {
    removedIdsRef.current.add(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (primarySessionId === sessionId) {
      setPrimarySessionId(null);
    }
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-remove", payload: { sessionId } }));
    }
  };

  const resumeSession = (sessionId: string) => {
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-resume", payload: { sessionId } }));
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, running: true, startedAt: nowRef.current, endedAt: undefined, pausedAt: undefined }
            : s,
        ),
      );
    }
    enqueueSnackbar(`Session "${sessions.find(s => s.id === sessionId)?.label || sessionId}" resumed`, { variant: "success" });
  };

  const attachGoalToSession = (sessionId: string, goalId: string, goalOverride?: Goal) => {
    if (!goalsEnabled) {
      enqueueSnackbar("Goals are disabled for your account", { variant: "warning" });
      return;
    }
    const goal = goalOverride || goals.find((g) => g.id === goalId);
    if (!goal) { return; }
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-attach", payload: { sessionId, goal } }));
    } else {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, goals: s.goals.some((g) => g.id === goalId) ? s.goals : [...s.goals, goal] } : s)),
      );
    }
  };

  const detachGoalFromSession = (sessionId: string, goalId: string) => {
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-detach", payload: { sessionId, goalId } }));
    } else {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, goals: s.goals.filter((g) => g.id !== goalId) } : s)));
    }
  };

  const pauseSession = (sessionId: string) => {
    const current = sessions.find((s) => s.id === sessionId);
    if (!current || !current.running) { return; }
    const now = nowRef.current;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) { return s; }
        const accumulated = (s.accumulatedMs ?? 0) + (s.running ? now - s.startedAt : 0);
        return { ...s, running: false, accumulatedMs: accumulated, endedAt: undefined, pausedAt: now };
      }),
    );
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-pause", payload: { sessionId } }));
    }
    enqueueSnackbar(`Session "${current.label}" paused`, { variant: "info" });
  };

  const handleStartEmptySession = () => {
    const sessionId = `session-${Math.random().toString(36).slice(2, 8)}`;
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "session-start",
          payload: {
            sessionId,
            label: `Manual session #${sessions.length + 1}`,
            goals: [],
            comment: "Manual start from Clockit Online",
          },
        }),
      );
    } else {
      const session: ClockitSession = {
        id: sessionId,
        label: `Manual session #${sessions.length + 1}`,
        startedAt: nowRef.current,
        accumulatedMs: 0,
        running: true,
        goals: [],
        comment: "Manual start from Clockit Online",
      };
      setSessions((prev) => [session, ...prev]);
    }
    setActiveTab("sessions");
  };

  const startSessionFromGroup = useCallback((group: GroupView) => {
    const sessionId = `session-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      sessionId,
      label: `${group.label} session`,
      goals: goalsEnabled ? group.goals : [],
      groupId: group.groupId ?? group.id,
      groupName: group.label,
      comment: `${group.kind === "day" ? "Day bucket" : "Custom group"} via Clockit Online`,
    };
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "session-start", payload }));
    } else {
      const session: ClockitSession = {
        id: sessionId,
        label: payload.label,
        startedAt: nowRef.current,
        accumulatedMs: 0,
        running: true,
        goals: payload.goals,
        groupId: payload.groupId,
        groupName: payload.groupName,
        comment: payload.comment,
      };
      setSessions((prev) => [session, ...prev]);
    }
    setActiveTab("sessions");
  }, [connected, goalsEnabled, setActiveTab]);

  useEffect(() => {
    onRegisterStartFromGroup(startSessionFromGroup);
  }, [onRegisterStartFromGroup, startSessionFromGroup]);

  const toggleGoalCompletion = (sessionId: string, goalId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
            ...s,
            goals: s.goals.map((g) =>
              g.id === goalId ? { ...g, completed: !g.completed, completedAt: g.completed ? undefined : new Date().toISOString() } : g,
            ),
          }
          : s,
      ),
    );
  };

  return (
    <div className="space-y-5 pb-16" style={{ scrollBehavior: "smooth" }}>
      {showQuickAdd && goalsEnabled && (
        <QuickAddGoal
          visible={showQuickAdd}
          user={user}
          customGroups={sessionGroups.map((g) => ({ id: g.id, name: g.name, kind: "custom" }))}
          onCreateGoal={({ title, groupId, estimatedMinutes }) => {
            const createdAt = new Date().toISOString();
            const targetGroupId = groupId === "day" ? `day-${toDateKey(createdAt)}` : groupId;
            const groupName = targetGroupId.startsWith("day-")
              ? formatDayLabel(targetGroupId.replace("day-", ""))
              : sessionGroups.find((g) => g.id === targetGroupId)?.name || targetGroupId;
            const goal: Goal = {
              id: `goal-${Math.random().toString(36).slice(2, 9)}`,
              title: title.trim(),
              createdAt,
              completed: false,
              groupId: targetGroupId,
              groupName,
              estimatedGoalTime: typeof estimatedMinutes === "number" ? estimatedMinutes * 60 : undefined,
              locked: false,
            };
            setGoals((prev) => [goal, ...prev]);
            enqueueSnackbar("Goal created and ready to attach", { variant: "success" });
            return { id: goal.id, goal };
          }}
          onCreateGroup={() => null}
          sessionAttachOptions={{
            sessions: sessions.map((s) => ({ id: s.id, label: s.label })),
            onAttach: (sessionId, goalId, goal) => attachGoalToSession(sessionId, goalId, goal),
          }}
          showCreateGroup={false}
          sessionLayout
        />
      )}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-blue-500 flex items-center gap-2">
          <IconClockPlay size={16} /> Clockit Sessions
        </p>
        <h1 className="text-3xl font-bold text-[var(--text)]">Manage stopwatches and attached goals</h1>
        <p className="text-sm text-slate-400">
          Start multiple sessions, attach goals, and track your performance in real-time
        </p>
        {!user && (
          <div className="inline-flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm font-semibold">
            <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-amber-900 text-[10px]">
              !
            </span>
            <div className="space-y-2">
              <p>
                You are not signed in. Sessions are stored in your browser (localStorage/cookies) until you sign in.
              </p>
              <ul className="list-disc pl-5 text-xs font-medium text-amber-700 space-y-1">
                <li>Sign in to create goals</li>
                <li>Access performance stats</li>
                <li>And more features as they unlock</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleStartEmptySession}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-contrast)] font-semibold rounded-lg hover:opacity-90"
        >
          <IconPlayerPlayFilled size={16} /> Start empty session
        </button>
       {goalsEnabled && <button
          onClick={() => setActiveTab("goals")}
          className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-[var(--muted)] rounded-lg hover:text-[var(--text)]"
        >
          <IconArrowRight size={16} /> Jump to goals
        </button>}
      </div>



      {sessions.length === 0 ? (
        <div className="border border-[var(--border)] rounded-2xl bg-[var(--card)] p-6 text-center text-[var(--muted)]">
          No sessions yet. Start one from any goal group or launch an empty session above.
        </div>
      ) : (
        <>
          {primarySession && (
            <div className="mb-4 flex justify-center">
              <div className="w-full max-w-3xl">
                <SessionCard
                  session={primarySession}
                  duration={sessionDuration(primarySession)}
                  attachableGoals={attachableGoals.filter((g) => g.groupId === (primarySession.groupId || primarySession.id))}
                  onAttach={(sessionId, goalId) => attachGoalToSession(sessionId, goalId)}
                  onDetach={detachGoalFromSession}
                  onToggleGoal={toggleGoalCompletion}
                  onStop={stopSession}
                  onResume={resumeSession}
                  isPrimary
                  onPause={pauseSession}
                  onRemove={removeSession}
                  onDownload={(sessionId) => {
                    const target = sessions.find((s) => s.id === sessionId);
                    if (target) {
                      downloadSessionCsv(sessionsUpload[sessionId]);
                    }
                  }}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ scrollbarWidth: "thin" }}>
            {nonPrimarySessions.map((session) => {
              const cardGoals = attachableGoals.filter((g) => g.groupId === (session.groupId || session.id));
              return (
                <SessionCard
                  key={session.id}
                  session={session}
                  duration={sessionDuration(session)}
                  attachableGoals={cardGoals}
                  onAttach={(sessionId, goalId) => attachGoalToSession(sessionId, goalId)}
                  onDetach={detachGoalFromSession}
                  onToggleGoal={toggleGoalCompletion}
                  onStop={stopSession}
                  onResume={resumeSession}
                  onSetPrimary={setPrimary}
                  onPause={pauseSession}
                  onRemove={removeSession}
                  onDownload={(sessionId) => {
                    const target = sessions.find((s) => s.id === sessionId);
                    if (target) {
                      downloadSessionCsv(sessionsUpload[sessionId]);
                    }
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
