import dotenv from "dotenv";
// Load .env file if it exists (for local development)
// In production (Cloud Run), environment variables are provided by the runtime
dotenv.config({
  path: ".env"
});
import http from "http";
import express from "express";
import cors from "cors";
import { adminAuth } from "../config/firebase.config";
import { getRedisClient } from "../services/redis.provider";
import { RedisController } from "../controller/redis.controller";
import { WebSocket } from "ws";
import { WebsocketOrchestrator } from "../socket/orchestrator/websocket.orchestrator";
import { registerConnectionListener } from "../socket/handlers/listeners/connection.listener";
import { startListenersForSocket } from "../socket/handlers/listeners";
import type { SessionState } from "../types";
import { Cachier } from "../caching";




const app = express();

// Configure CORS to allow WebSocket connections
app.use(cors({
  origin: true, // Allow all origins in development, configure for production
  credentials: true,
}));

app.use(express.json());

const server = http.createServer(app);
let redisController: RedisController | null = null;


const extractBearer = (req: http.IncomingMessage) => {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
};


const serializeSessions = (userId: string) => Array.from(orchestrator.getSessionsByUser().get(userId)?.values() || []);


const initCache = async () => {
  try {
    const client = await getRedisClient();
    if (!client) {
      console.warn("[clockit-server] Redis not configured, running in memory-only mode");
      return;
    }
    redisController = RedisController.getInstance(client);
    const all = await Cachier.getInstance().getCache().getAllSessions();
    Object.entries(all).forEach(([userId, sessions]) => {
      WebsocketOrchestrator.getInstance().ensureUserMaps(userId);
      const map = orchestrator.getSessionsByUser().get(userId)!;
      (sessions as SessionState[]).forEach((s) => map.set(s.sessionId, s));
      orchestrator.updateRunningUsers(userId);
    });
    console.log("[clockit-server] Redis connected");
  } catch (err) {
    console.error("[clockit-server] Failed to init cache, continuing without Redis", err);
  }
};


const handleConnection = (socket: WebSocket, req: http.IncomingMessage) => {
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const tokenFromQuery = url?.searchParams.get("token");
  const token = extractBearer(req) || tokenFromQuery;

  // Helper function to set up connection after authentication
  const setupConnection = (userId: string, isGuest: boolean = false) => {
    console.info("[ws] connection established", { userId, isGuest });
    WebsocketOrchestrator.getInstance().ensureUserMaps(userId);
    orchestrator.getSocketsByUser().get(userId)!.add(socket);

    console.info("[ws] sending ready snapshot", { userId, sessions: serializeSessions(userId).length });
    socket.send(
      JSON.stringify({
        type: "ready",
        payload: serializeSessions(userId),
      }),
    );
    startListenersForSocket(socket, [], userId);
  };

  // If no token provided, allow as guest
  if (!token) {
    const guestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    console.info("[ws] guest connection", { guestId });
    setupConnection(guestId, true);
    return;
  }

  // If token provided, verify it
  adminAuth()
    .verifyIdToken(token)
    .then((decoded) => {
      setupConnection(decoded.uid, false);
    })
    .catch((err) => {
      console.warn("[ws] token verification failed", { reason: err instanceof Error ? err.message : "unknown" });
      socket.close(4401, "Unauthorized");
    });
};

void initCache();
const orchestrator = WebsocketOrchestrator.getInstance(server);
registerConnectionListener(orchestrator, handleConnection);

setInterval(() => {
  const now = Date.now();
  const runningUsers = orchestrator.getRunningUsers();
  if (!runningUsers.size) { return; }

  runningUsers.forEach((userId) => {
    const sessions = orchestrator.getSessionsByUser().get(userId);
    if (!sessions || !sessions.size) {
      runningUsers.delete(userId);
      return;
    }
    const running = Array.from(sessions.values()).filter((s) => s.running);
    if (!running.length) {
      runningUsers.delete(userId);
      return;
    }
    const ticks = running.map((s) => ({
      sessionId: s.sessionId,
      elapsedMs: s.accumulatedMs + (now - s.startedAt),
      running: true,
    }));
    orchestrator.broadcast(userId, { type: "tick", payload: ticks });
  });
}, 1000);

// Lightweight purge loop for stale paused sessions
setInterval(() => {
  const now = Date.now();
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  orchestrator.getSessionsByUser().forEach((sessions, userId) => {
    let changed = false;
    for (const [id, s] of sessions.entries()) {
      if (!s.running && !s.endedAt && s.pausedAt && now - s.pausedAt > TWELVE_HOURS) {
        sessions.delete(id);
        changed = true;
      }
    }
    if (changed) {
      orchestrator.updateRunningUsers(userId);
      Cachier.getInstance().getCache().saveUserSessions(userId, sessions);
    }
  });
}, 60_000);

app.get("/health", (_req, res) => {
  let sessionCount = 0;
  orchestrator.getSessionsByUser().forEach((map) => (sessionCount += map.size));
  res.json({
    status: "ok",
    sessions: sessionCount,
    usersConnected: orchestrator.getSocketsByUser().size,
  });
});

app.get("/", (_req, res) => {
  res.json({ message: "Clockit server running", sockets: orchestrator.getSocketsByUser().size });
});

const port = Number(process.env.PORT || 4000);
console.log(`[clockit-server] Starting server on port ${port}...`);
console.log(`[clockit-server] Environment: NODE_ENV=${process.env.NODE_ENV}`);
server.listen(port, '0.0.0.0', () => {
  console.log(`[clockit-server] Successfully listening on http://0.0.0.0:${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('[clockit-server] Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`[clockit-server] Port ${port} is already in use`);
  }
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[clockit-server] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[clockit-server] Unhandled rejection:', reason);
  process.exit(1);
});
