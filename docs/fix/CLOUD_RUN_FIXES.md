# Cloud Run Deployment Fixes

## Issues

Both services (clockit-api and clockit-socket) were failing to deploy to Cloud Run with:
```
ERROR: The user-provided container failed to start and listen on the port defined
provided by the PORT=8080 environment variable within the allocated timeout.
```

## Root Causes

There were **two separate issues**:

### 1. clockit-api: TypeScript Path Alias Resolution

The API service used TypeScript path aliases (`@/`) that weren't being resolved at runtime, causing module resolution errors and immediate crashes.

### 2. Both Services: Network Binding to localhost

Both services were binding to `localhost` instead of `0.0.0.0`, preventing Cloud Run's health checks from reaching the services.

---

## Fix #1: TypeScript Path Aliases (clockit-api only)

### The Problem

The codebase uses TypeScript path aliases defined in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

All source files use imports like:
```typescript
import { logger } from '@/utils/logger';
import { config } from '@/config/env';
```

When TypeScript compiles these files, it generates JavaScript with the **same `@/` imports**, which Node.js cannot resolve at runtime.

### The Solution

Added `tsc-alias` to resolve TypeScript path aliases during the build process.

**Modified Files:**

1. **[clockit_api/package.json](clockit_api/package.json)**
   - Added dependency: `"tsc-alias": "^1.8.16"`
   - Updated build script: `"build": "tsc && tsc-alias -p tsconfig.json"`

2. **[clockit_api/Dockerfile](clockit_api/Dockerfile)** - Already had correct PORT configuration, no changes needed

### How It Works

1. **Development**: `ts-node` with `tsconfig-paths/register` resolves `@/` imports on the fly
2. **Production Build**:
   - `tsc` compiles TypeScript to JavaScript (with `@/` imports intact)
   - `tsc-alias` post-processes the output, replacing `@/` with relative paths
   - Result: Clean JavaScript files with proper relative imports like `"./utils/logger"`
3. **Production Runtime**: Node.js runs the compiled JavaScript with no path resolution needed

---

## Fix #2: Network Binding (Both Services)

### The Problem

Both services were calling `server.listen(port, callback)` without specifying a hostname, which defaults to binding on `localhost` (127.0.0.1).

In Cloud Run containers:
- Health checks come from **outside the container**
- Services bound to `localhost` are only accessible from within the container
- External connections (including health checks) are **rejected**
- Cloud Run thinks the service never started

### The Solution

Changed both services to bind to `0.0.0.0` to accept connections on all network interfaces.

**Modified Files:**

#### 1. [clockit_api/src/server.ts](clockit_api/src/server.ts#L14)

**Before:**
```typescript
const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});
```

**After:**
```typescript
logger.info(`Starting server on port ${config.port}...`);
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server running on port ${config.port} in ${process.env.NODE_ENV} mode`);
  logger.info(`API available at ${config.apiBaseUrl}/api/v1`);
  logger.info(`Listening on http://0.0.0.0:${config.port}`);
});
```

#### 2. [clockit-server/src/index.ts](clockit-server/src/index.ts#L160)

**Before:**
```typescript
server.listen(port, () => {
  console.log(`[clockit-server] listening on http://localhost:${port}`);
});
```

**After:**
```typescript
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
```

### Why 0.0.0.0 vs localhost

| Binding | Description | Cloud Run Compatible? |
|---------|-------------|----------------------|
| `localhost` or `127.0.0.1` | Only accepts connections from within the container | ❌ No |
| `0.0.0.0` | Accepts connections from any network interface | ✅ Yes |

---

## Summary of Changes

### clockit-api
1. ✅ Added `tsc-alias` to resolve TypeScript path aliases
2. ✅ Updated build script to run `tsc-alias` after compilation
3. ✅ Changed server to bind to `0.0.0.0`
4. ✅ Added startup logging

### clockit-socket
1. ✅ Changed server to bind to `0.0.0.0`
2. ✅ Added startup logging
3. ✅ Added comprehensive error handlers
4. ✅ Added environment logging

---

## Testing Locally

### clockit-api
```bash
cd clockit_api

# Install dependencies
npm install

# Build with path resolution
npm run build

# Verify imports are resolved (should return nothing)
cat dist/server.js | grep "require.*@/"

# Start the server
PORT=8080 npm start

# Test health check
curl http://localhost:8080/api/v1/health
```

### clockit-socket
```bash
cd clockit-server

# Install dependencies
npm install

# Start with PORT=8080
PORT=8080 npm start

# Test health check
curl http://localhost:8080/
# Should return: {"message":"Clockit server running","sockets":0}
```

---

## Verification Checklist

After deployment, verify:

- ✅ Both containers build successfully
- ✅ Compiled JavaScript has relative imports (API only)
- ✅ Services bind to 0.0.0.0
- ✅ Cloud Run health checks pass
- ✅ Services are accessible at their Cloud Run URLs
- ✅ WebSocket connections work (socket server)
- ✅ API endpoints respond correctly
- ✅ Environment variables are loaded

---

## Next Steps

1. Commit all changes:
   ```bash
   git add clockit_api/package.json clockit_api/Dockerfile clockit_api/src/server.ts
   git add clockit-server/src/index.ts
   git commit -m "fix: Cloud Run deployment - resolve path aliases and bind to 0.0.0.0"
   ```

2. Push to trigger GitHub Actions deployment

3. Monitor deployment in GitHub Actions:
   - Go to repository → Actions
   - Watch the deploy-api and deploy-socket workflows

4. Check Cloud Run logs if issues persist:
   - API logs: https://console.cloud.google.com/run/detail/europe-west4/clockit-api/logs
   - Socket logs: https://console.cloud.google.com/run/detail/europe-west4/clockit-socket/logs

5. Verify services are running:
   ```bash
   # Get service URLs
   gcloud run services describe clockit-api --region europe-west4 --format 'value(status.url)'
   gcloud run services describe clockit-socket --region europe-west4 --format 'value(status.url)'

   # Test endpoints
   curl <API_URL>/api/v1/health
   curl <SOCKET_URL>/
   ```

---

## References

- [tsc-alias documentation](https://www.npmjs.com/package/tsc-alias)
- [Cloud Run container contract](https://cloud.google.com/run/docs/container-contract)
- [Node.js server.listen() documentation](https://nodejs.org/api/net.html#serverlisten)
- [Docker networking and 0.0.0.0 binding](https://docs.docker.com/network/)
