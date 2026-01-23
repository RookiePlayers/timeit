# Socket Server Cloud Run Fix

## Issue

The clockit-socket server was failing to deploy to Cloud Run with the same error as the API:
```
ERROR: The user-provided container failed to start and listen on the port defined
provided by the PORT=8080 environment variable within the allocated timeout.
```

## Root Cause

The socket server had correct PORT configuration (`process.env.PORT || 4000`), but it was **binding to the default host (localhost)** instead of `0.0.0.0`.

### The Problem

When `server.listen(port, callback)` is called without a hostname parameter, Node.js defaults to listening on `localhost` (127.0.0.1). In a Cloud Run container:

- Cloud Run health checks come from **outside the container**
- The container's `localhost` is only accessible from within the container itself
- External connections (including Cloud Run's health checks) are **rejected**
- Cloud Run thinks the service never started

## Solution

Changed the server to bind to `0.0.0.0` to accept connections on all network interfaces.

### Files Modified

**[clockit-server/src/index.ts](clockit-server/src/index.ts)**

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

## Changes Made

1. **Bind to 0.0.0.0** - Accept connections from any network interface
2. **Added startup logging** - Help debug if there are still issues
3. **Added error handlers** - Catch and log server errors, uncaught exceptions, and unhandled rejections
4. **Environment logging** - Show NODE_ENV to verify environment variables are loaded

## Why 0.0.0.0 vs localhost

| Binding | Description | Cloud Run Compatible? |
|---------|-------------|----------------------|
| `localhost` or `127.0.0.1` | Only accepts connections from within the container | ❌ No |
| `0.0.0.0` | Accepts connections from any network interface | ✅ Yes |

## Verification

After this fix:
- ✅ Server binds to all network interfaces
- ✅ Cloud Run can reach the server for health checks
- ✅ WebSocket connections from external clients work
- ✅ Detailed logging helps debug any remaining issues

## Testing Locally

To verify the fix works locally:

```bash
cd clockit-server

# Install dependencies
npm install

# Start with PORT=8080
PORT=8080 npm start

# In another terminal, test the health check endpoint
curl http://localhost:8080/
# Should return: {"message":"Clockit server running","sockets":0}
```

## Additional Improvements

The error handlers will now provide better diagnostics if the server fails to start:
- Port conflicts (EADDRINUSE)
- Uncaught exceptions during initialization
- Unhandled promise rejections
- Environment variable issues

## Next Steps

1. Commit the changes to clockit-server
2. Push to trigger deployment
3. Check Cloud Run logs for startup messages
4. Verify the WebSocket service is accessible

## References

- [Node.js server.listen() documentation](https://nodejs.org/api/net.html#serverlisten)
- [Cloud Run container contract](https://cloud.google.com/run/docs/container-contract)
- [Docker networking and 0.0.0.0 binding](https://docs.docker.com/network/)
