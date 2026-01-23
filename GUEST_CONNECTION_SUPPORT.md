# Guest Connection Support

## Overview

The clockit-server now supports both **authenticated** and **guest (anonymous)** WebSocket connections.

## Changes Made

### Updated [clockit-server/src/index.ts](clockit-server/src/index.ts#L62-L101)

**Before:** Required authentication token, rejected connections without valid Firebase ID tokens.

**After:** Allows guest connections when no token is provided, while still supporting authenticated users.

## How It Works

### Connection Flow

```
┌─────────────────┐
│ Client connects │
└────────┬────────┘
         │
         ▼
   ┌────────────┐
   │ Has token? │
   └─────┬──────┘
         │
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ▼         ▼
┌───────┐  ┌──────┐
│Verify │  │Guest │
│Token  │  │ ID   │
└───┬───┘  └───┬──┘
    │          │
    ▼          ▼
┌────────────────┐
│Setup connection│
└────────────────┘
```

### 1. Guest Connections (No Token)

When a client connects **without** an authentication token:

```typescript
// Generate unique guest ID
const guestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
// Example: "guest_1735601234567_k3x9p2q"

setupConnection(guestId, true);
```

**Guest ID Format:**
- Prefix: `guest_`
- Timestamp: `Date.now()` (milliseconds since epoch)
- Random string: 7-character alphanumeric suffix
- Example: `guest_1735601234567_k3x9p2q`

**Characteristics:**
- ✅ Can create and manage sessions
- ✅ Receive real-time updates
- ✅ Full WebSocket functionality
- ⚠️ Sessions are **not persisted** (lost on disconnect/refresh)
- ⚠️ Cannot sync across devices
- ⚠️ No long-term session recovery

### 2. Authenticated Connections (With Token)

When a client connects **with** a Firebase authentication token:

```typescript
adminAuth()
  .verifyIdToken(token)
  .then((decoded) => {
    setupConnection(decoded.uid, false);
  })
```

**Characteristics:**
- ✅ Persistent sessions (stored in Redis/Firestore)
- ✅ Sync across devices
- ✅ Session recovery after reconnect
- ✅ Full feature access
- ✅ User-specific data

## Client Usage

### Connecting as Guest

**JavaScript/TypeScript:**
```typescript
// No token required
const ws = new WebSocket('wss://your-socket-server.com');

// Or explicitly without token
const ws = new WebSocket('wss://your-socket-server.com?token=');
```

**Expected Response:**
```json
{
  "type": "ready",
  "payload": []
}
```

Server logs:
```
[ws] guest connection { guestId: 'guest_1735601234567_k3x9p2q' }
[ws] connection established { userId: 'guest_1735601234567_k3x9p2q', isGuest: true }
[ws] sending ready snapshot { userId: 'guest_1735601234567_k3x9p2q', sessions: 0 }
```

### Connecting as Authenticated User

**JavaScript/TypeScript:**
```typescript
import { auth } from './firebase';

// Get Firebase ID token
const token = await auth.currentUser?.getIdToken();

// Connect with token in URL
const ws = new WebSocket(`wss://your-socket-server.com?token=${token}`);

// Or in Authorization header (if your WebSocket client supports it)
const ws = new WebSocket('wss://your-socket-server.com', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Expected Response:**
```json
{
  "type": "ready",
  "payload": [
    // ... existing sessions if any
  ]
}
```

Server logs:
```
[ws] connection established { userId: 'abc123...', isGuest: false }
[ws] sending ready snapshot { userId: 'abc123...', sessions: 3 }
```

## Server Logs

### Guest Connection Logs
```
[ws] guest connection { guestId: 'guest_1735601234567_k3x9p2q' }
[ws] connection established { userId: 'guest_1735601234567_k3x9p2q', isGuest: true }
[ws] sending ready snapshot { userId: 'guest_1735601234567_k3x9p2q', sessions: 0 }
```

### Authenticated Connection Logs
```
[ws] connection established { userId: 'firebase-uid-123', isGuest: false }
[ws] sending ready snapshot { userId: 'firebase-uid-123', sessions: 5 }
```

### Failed Authentication Logs
```
[ws] token verification failed { reason: 'Firebase ID token has expired' }
```

## Implementation Details

### Code Structure

```typescript
const handleConnection = (socket: WebSocket, req: http.IncomingMessage) => {
  // 1. Extract token from header or query parameter
  const token = extractBearer(req) || tokenFromQuery;

  // 2. Shared setup function
  const setupConnection = (userId: string, isGuest: boolean = false) => {
    // Initialize user maps
    // Add socket to user's socket set
    // Send ready snapshot
    // Start message listeners
  };

  // 3. Branch based on token presence
  if (!token) {
    // Generate guest ID and setup
    setupConnection(guestId, true);
  } else {
    // Verify token and setup
    verifyIdToken(token).then(decoded => setupConnection(decoded.uid, false));
  }
};
```

### Guest ID Generation

**Format:** `guest_${timestamp}_${random}`

**Why this format?**
- **Uniqueness**: Timestamp + random string ensures no collisions
- **Identifiable**: `guest_` prefix makes it easy to identify guest users
- **Sortable**: Timestamp allows chronological sorting
- **Short**: Random suffix keeps IDs reasonably short

**Collision Probability:**
- Timestamp resolution: 1 millisecond
- Random space: 36^7 ≈ 78 billion combinations
- Probability of collision: ~0% in practical scenarios

## Security Considerations

### What Guests CAN Do
- ✅ Create WebSocket connection
- ✅ Create and manage sessions during connection
- ✅ Receive real-time updates
- ✅ Use all WebSocket message types

### What Guests CANNOT Do
- ❌ Persist sessions to database (no Redis/Firestore writes for guest IDs)
- ❌ Recover sessions after disconnect
- ❌ Access other users' data
- ❌ Sync across devices

### Rate Limiting Considerations

Guest users are subject to the same rate limiting as authenticated users. Consider:
- Implement stricter rate limits for guest users
- Add connection limits per IP for guests
- Consider adding a CAPTCHA for guest connections if abuse occurs

## Migration Notes

### Backward Compatibility

✅ **Fully backward compatible** - Authenticated connections work exactly as before.

### Frontend Changes Required

Update your frontend to handle both connection types:

```typescript
// Example React hook
const useClockitSocket = () => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket;

    if (user) {
      // Authenticated connection
      const token = await user.getIdToken();
      ws = new WebSocket(`${SOCKET_URL}?token=${token}`);
    } else {
      // Guest connection
      ws = new WebSocket(SOCKET_URL);
    }

    ws.onopen = () => console.log('Connected as', user ? 'user' : 'guest');
    setSocket(ws);

    return () => ws.close();
  }, [user]);

  return socket;
};
```

## Testing

### Test Guest Connection

```bash
# Using wscat (npm install -g wscat)
wscat -c ws://localhost:8080

# Expected response:
# Connected (press CTRL+C to quit)
# < {"type":"ready","payload":[]}
```

### Test Authenticated Connection

```bash
# Get Firebase ID token first
TOKEN="your-firebase-id-token"

wscat -c "ws://localhost:8080?token=$TOKEN"

# Expected response:
# Connected (press CTRL+C to quit)
# < {"type":"ready","payload":[...your sessions...]}
```

### Test Invalid Token

```bash
wscat -c "ws://localhost:8080?token=invalid-token"

# Expected:
# error: Unexpected server response: 401
```

## Future Enhancements

Consider adding:

1. **Guest Session Persistence (Optional)**
   - Store guest sessions in browser localStorage
   - Restore on reconnect using guest ID
   - Expire after 24 hours

2. **Guest-to-User Migration**
   - Allow guests to sign up/login
   - Transfer guest sessions to authenticated account

3. **Enhanced Guest Tracking**
   - Track guest connections per IP
   - Add metrics for guest vs. authenticated usage
   - Monitor for abuse patterns

4. **Guest Limitations**
   - Max sessions per guest
   - Connection timeout for idle guests
   - Storage quota limits

## Summary

Guest connection support enables:
- ✅ Try-before-signup experience
- ✅ No authentication barrier for new users
- ✅ Easier testing and development
- ✅ Better user onboarding flow

While maintaining:
- ✅ Full security for authenticated users
- ✅ Backward compatibility
- ✅ Clear separation between guest and user data
