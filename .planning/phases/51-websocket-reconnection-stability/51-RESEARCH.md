# Phase 51: WebSocket Reconnection Stability - Research

**Researched:** 2026-01-30
**Domain:** Socket.io v4 + JWT auth + React connection lifecycle
**Confidence:** HIGH

## Summary

This research investigates the root cause of Socket.io reconnection flicker during JWT token refresh in FreshTrack Pro. The codebase was fully examined: backend server (`socket.plugin.ts`, `socket-auth.ts`, `socket.service.ts`), frontend client (`src/lib/socket.ts`, `src/providers/RealtimeProvider.tsx`), and the connection status UI (`ConnectionStatus.tsx`).

The existing PLAN.md (51-01-PLAN.md) identified the root cause as `useEffect` depending on `[user]` instead of `[user?.id]`. However, **reading the actual current code reveals the dependency is already `[userId]`** (line 142 of RealtimeProvider.tsx, where `userId = user?.id` at line 45). This means the originally diagnosed root cause may have already been partially addressed, OR the flicker persists for a different reason.

**Primary recommendation:** The fix requires two changes: (1) convert the Socket.io `auth` option from imperative assignment (`socket.auth = { token }`) to a callback function form (`auth: (cb) => cb({ token: await getLatestToken() })`) so every connection/reconnection automatically fetches a fresh token, and (2) ensure the `useEffect` does NOT disconnect/reconnect the socket when only the token refreshes (only on user identity change). The WebSocket-only transport is already correctly configured on both client and server.

## Current State Analysis

### VERIFIED: What the code actually does today

**Frontend Socket Client (`src/lib/socket.ts`):**

- Socket instance created as module-level singleton with `autoConnect: false`
- `transports: ['websocket']` is ALREADY set (WS-02 may already be satisfied)
- Reconnection configured: 5 attempts, 2s delay, 10s max delay, 20s timeout
- `connectSocket(token)` imperatively sets `socket.auth = { token }` then calls `socket.connect()`

**RealtimeProvider (`src/providers/RealtimeProvider.tsx`):**

- `useEffect` depends on `[userId]` (line 142) -- NOT `[user]` as the existing plan states
- Uses `userRef` pattern to always have fresh user reference
- `connectWithAuth()` calls `user.getAccessToken()` then `connectSocket(token)`
- Has `onReconnectAttempt` handler that refreshes token on `socket.io.on('reconnect_attempt')`
- On cleanup: removes all listeners AND calls `disconnectSocket()`
- `{isConnected && <RealtimeHandlers />}` conditionally renders event handler hooks

**Backend Socket Auth (`backend/src/middleware/socket-auth.ts`):**

- `io.use()` middleware extracts `socket.handshake.auth?.token`
- Verifies JWT using `jose.jwtVerify` with JWKS
- Populates `socket.data` with userId, organizationId, role, email, profileId
- Token is verified ONLY at handshake time (connection/reconnection)

**Backend Socket Plugin (`backend/src/plugins/socket.plugin.ts`):**

- `transports: ['websocket']` is ALREADY set on the server (no polling)
- pingTimeout: 20000, pingInterval: 25000

**ConnectionStatus UI (`src/components/common/ConnectionStatus.tsx`):**

- Shows spinning loader (yellow) when `isConnecting`
- Shows green wifi icon when `isConnected`
- Shows red wifi-off icon when disconnected
- Mounted in `DashboardLayout.tsx` (line 225), always visible in app header

### Root Cause Analysis

The flicker issue has TWO potential causes:

**Cause A: useEffect cleanup on userId change (unlikely to be the primary issue)**
The dependency is `[userId]` which is a stable `string | undefined`. This only changes on login/logout or user switching. This is NOT triggered by token refresh. The existing plan's diagnosis is inaccurate about this.

**Cause B: Stack Auth `getAccessToken()` triggers React re-render (LIKELY)**
Stack Auth's `getAccessToken()` returns a Promise that auto-refreshes expired tokens. When the token refreshes, `useUser()` returns a new object reference (the hook likely triggers a re-render). However, since the dependency is `[userId]` (a stable string), the useEffect should NOT re-run.

**Cause C: Actual network/auth issue causing real disconnects (POSSIBLE)**
If the JWT expires and Socket.io's server-side ping/pong detects a stale connection, or if the self-signed certificate causes intermittent TLS errors, the socket could genuinely disconnect and reconnect. The `onReconnectAttempt` handler already refreshes the token, but:

- The async `getAccessToken()` may not complete before the reconnect attempt sends the handshake
- There is a race condition: `socket.auth = { token }` is set in a `.then()` callback while reconnection may have already started

**Most likely actual root cause:** The `onReconnectAttempt` handler (lines 108-118) has a race condition. It calls `currentUser.getAccessToken()` which returns a Promise, but the reconnect attempt does NOT wait for this Promise to resolve before sending the handshake with the old token. The reconnect sends a stale/expired token, the server rejects it, and the cycle repeats until the async token arrives.

## Standard Stack

### Core (Already Installed)

| Library                  | Version     | Purpose                   | Status    |
| ------------------------ | ----------- | ------------------------- | --------- |
| socket.io                | ^4.8.3      | Server-side WebSocket     | Installed |
| socket.io-client         | ^4.8.3      | Client-side WebSocket     | Installed |
| @socket.io/redis-adapter | ^8.3.0      | Multi-instance scaling    | Installed |
| jose                     | (installed) | JWT verification (server) | Installed |
| @stackframe/react        | (installed) | Stack Auth React SDK      | Installed |

### No Additional Libraries Needed

This phase requires zero new dependencies. All fixes are code-level changes to existing files.

## Architecture Patterns

### Pattern 1: Auth Callback Function (CRITICAL FIX)

**What:** Use Socket.io's `auth` option as a callback function instead of imperative assignment.
**When:** Socket.io client initialization.
**Why:** The callback form is invoked on EVERY connection and reconnection attempt, eliminating the race condition where `socket.auth` is updated asynchronously.

**Current (BROKEN) pattern:**

```typescript
// src/lib/socket.ts - current
export const socket = io(url, {
  autoConnect: false,
  transports: ['websocket'],
  // ... no auth here
});

export function connectSocket(token: string) {
  socket.auth = { token }; // Imperative, static at connection time
  socket.connect();
}
```

```typescript
// RealtimeProvider.tsx - current reconnect handler
function onReconnectAttempt() {
  currentUser.getAccessToken().then((token) => {
    if (token) {
      socket.auth = { token }; // RACE CONDITION: may not complete before handshake
    }
  });
}
```

**Target (FIXED) pattern:**

```typescript
// src/lib/socket.ts - target
// Store a token getter function that the socket calls on every connect/reconnect
let tokenGetter: (() => Promise<string | null>) | null = null;

export const socket = io(url, {
  autoConnect: false,
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
  auth: (cb) => {
    // Called on EVERY connection and reconnection attempt
    if (tokenGetter) {
      tokenGetter()
        .then((token) => {
          cb({ token: token || '' });
        })
        .catch(() => {
          cb({ token: '' });
        });
    } else {
      cb({ token: '' });
    }
  },
});

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

export function connectSocket() {
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
```

**Source:** [Socket.IO Client Options - auth](https://socket.io/docs/v4/client-options/) -- "auth: (cb) => { cb({ token: ... }) }" is the officially documented pattern for dynamic token resolution.

### Pattern 2: Stable useEffect with Ref-Based Token Access

**What:** Keep the useEffect dependency on `userId` only, use refs for accessing the current user.
**When:** RealtimeProvider connection lifecycle.
**Why:** Prevents disconnect/reconnect when anything other than user identity changes.

```typescript
// RealtimeProvider.tsx - target
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const userRef = useRef(user);
  userRef.current = user;

  const userId = user?.id;
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      disconnectSocket();
      return;
    }

    // Set the token getter so socket.auth callback can fetch fresh tokens
    setTokenGetter(() => {
      const currentUser = userRef.current;
      if (!currentUser) return Promise.resolve(null);
      return currentUser.getAccessToken();
    });

    setIsConnecting(true);
    setConnectionError(null);
    connectSocket(); // No token arg -- auth callback handles it

    function onConnect() {
      setIsConnected(true);
      setIsConnecting(false);
    }

    function onDisconnect(reason: string) {
      setIsConnected(false);
      // Only show "connecting" if socket.io will auto-reconnect
      if (reason !== 'io client disconnect') {
        setIsConnecting(true);
      }
    }

    function onConnectError(error: Error) {
      setIsConnecting(false);
      setConnectionError(error.message);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      disconnectSocket();
      setTokenGetter(null); // Clean up token getter
    };
  }, [userId]);

  // ... render
}
```

**Key difference from current code:** No separate `onReconnectAttempt` handler needed. The `auth` callback function automatically gets called on every reconnect attempt, and it always fetches a fresh token via the ref.

### Pattern 3: Suppress Flicker with Debounced Status

**What:** Avoid showing "connecting" state for brief reconnections.
**When:** ConnectionStatus component rendering.
**Why:** Even with the auth fix, brief network hiccups might cause a flash. A small debounce (200-500ms) before showing "connecting" prevents visual noise.

```typescript
// Optional enhancement for ConnectionStatus
const [showConnecting, setShowConnecting] = useState(false);

useEffect(() => {
  if (isConnecting) {
    const timer = setTimeout(() => setShowConnecting(true), 500);
    return () => clearTimeout(timer);
  }
  setShowConnecting(false);
}, [isConnecting]);
```

### Anti-Patterns to Avoid

- **Imperative `socket.auth = { token }`:** Static assignment at connection time. Does not help on reconnection. Use the callback form instead.
- **Reconnect attempt handler with async token fetch:** Race condition between async token retrieval and synchronous handshake transmission. The `auth` callback is the proper solution.
- **useEffect depending on user object reference:** Causes unnecessary disconnect/reconnect on every user object change.
- **Disconnect/reconnect cycle for token refresh:** Never disconnect a healthy socket just to update the auth token. The token only matters at handshake time (initial connect or reconnect).
- **Custom `update-token` server event:** Overengineered for this case. Socket.io auth middleware only runs at handshake, so sending a fresh token mid-session is unnecessary since the live connection does not re-verify tokens on each message.

## Don't Hand-Roll

| Problem                     | Don't Build                        | Use Instead                            | Why                                     |
| --------------------------- | ---------------------------------- | -------------------------------------- | --------------------------------------- |
| Dynamic auth on reconnect   | Manual `reconnect_attempt` handler | `auth: (cb) => {...}` callback         | Built into Socket.io, no race condition |
| Connection state recovery   | Custom event replay system         | Socket.io connection state recovery    | Built-in, handles rooms + missed events |
| Token refresh timing        | Custom timer to pre-refresh tokens | Stack Auth `getAccessToken()`          | Auto-refreshes when called if expired   |
| Reconnection backoff        | Custom retry logic                 | Socket.io built-in reconnection config | Configurable via options                |
| Transport upgrade detection | Manual transport probing           | `transports: ['websocket']` option     | Already handled by both client + server |

## Common Pitfalls

### Pitfall 1: Auth Callback Race Condition

**What goes wrong:** Using `socket.io.on('reconnect_attempt')` with async token fetch. The handshake may be sent before the Promise resolves.
**Why it happens:** `reconnect_attempt` fires synchronously, but `getAccessToken()` is async.
**How to avoid:** Use the `auth: (cb) => {...}` callback form. Socket.io waits for `cb()` before sending the handshake.
**Warning signs:** Intermittent "Token expired" errors in server logs on reconnect.

### Pitfall 2: Self-Signed Certificate Rejection

**What goes wrong:** WebSocket connections fail with TLS errors on self-signed certs.
**Why it happens:** Browsers and Node.js reject self-signed certificates by default.
**How to avoid:** The app already handles this via Caddy with static certs. Users must accept the certificate once. Socket.io client option `rejectUnauthorized: false` is for Node.js only, not browser.
**Warning signs:** `connect_error` with "websocket error" message in browser console.

### Pitfall 3: Connection State Recovery Not Available with Redis Adapter

**What goes wrong:** Enabling `connectionStateRecovery` on server has no effect.
**Why it happens:** Connection state recovery is NOT supported with the Redis (pub/sub) adapter. Only built-in adapter and Redis Streams adapter support it.
**How to avoid:** Don't enable this feature since the project uses `@socket.io/redis-adapter`. If state recovery is needed later, migrate to `@socket.io/redis-streams-adapter`.
**Warning signs:** Socket reconnects but missed events are not replayed.

### Pitfall 4: Cleanup Function Disconnects Socket on Re-render

**What goes wrong:** If React re-renders and the cleanup runs, the socket disconnects and reconnects even when the user hasn't changed.
**Why it happens:** Cleanup function calls `disconnectSocket()`.
**How to avoid:** Ensure the useEffect dependency array only contains `userId` (a stable string), not the user object. The current code already does this correctly.
**Warning signs:** Console shows "Socket.io disconnected" followed by "Socket.io connected" without user action.

### Pitfall 5: Stack Auth getAccessToken is Async

**What goes wrong:** Attempting to use `getAccessToken()` synchronously or assuming it returns immediately.
**Why it happens:** Stack Auth refreshes expired tokens automatically, which requires an HTTP request.
**How to avoid:** Always await the result. The `auth` callback pattern handles this correctly since `cb()` can be called asynchronously.
**Warning signs:** Token is `undefined` or `null` when passed to socket auth.

## Code Examples

### Complete Fixed Socket Client (`src/lib/socket.ts`)

```typescript
// Source: Socket.io official docs - auth callback pattern
// https://socket.io/docs/v4/client-options/

import { io, Socket } from 'socket.io-client';

// Token getter function - set by RealtimeProvider
let tokenGetter: (() => Promise<string | null>) | null = null;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin),
  {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    auth: (cb) => {
      if (tokenGetter) {
        tokenGetter()
          .then((token) => cb({ token: token || '' }))
          .catch(() => cb({ token: '' }));
      } else {
        cb({ token: '' });
      }
    },
  },
);

export function setTokenGetter(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter;
}

export function connectSocket() {
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
```

### Server-Side Auth Middleware (No Changes Needed)

The backend `socket-auth.ts` middleware reads `socket.handshake.auth?.token` which is populated from the client's `auth` callback. No server changes are required for this fix.

### Backend Socket Plugin (No Changes Needed)

`transports: ['websocket']` is already configured on the server at line 56 of `socket.plugin.ts`.

## State of the Art

| Old Approach                                      | Current Approach                 | When Changed     | Impact                                   |
| ------------------------------------------------- | -------------------------------- | ---------------- | ---------------------------------------- |
| `socket.auth = { token }` imperative              | `auth: (cb) => cb(...)` callback | Socket.io v3+    | Eliminates race condition on reconnect   |
| Polling -> WebSocket upgrade                      | WebSocket-only transport         | Always available | Removes 1 HTTP round-trip                |
| Manual reconnect_attempt handler                  | Auth callback                    | Socket.io v3+    | Built-in, no custom code needed          |
| Connection state recovery (built-in adapter only) | Redis Streams adapter            | Socket.io v4.6+  | Not available with Redis pub/sub adapter |

**Already correct in codebase:**

- WebSocket-only transport on both client and server
- `useEffect` depends on `userId` string (not user object)
- `userRef` pattern for accessing fresh user in callbacks

**Needs fixing:**

- Socket auth: change from imperative to callback function
- Remove `connectSocket(token)` parameter -- token fetched in auth callback
- Remove `onReconnectAttempt` handler -- no longer needed
- RealtimeProvider: use `setTokenGetter` + `connectSocket()` instead of `connectSocket(token)`

## Open Questions

1. **Is the flicker actually occurring in the current code?**
   - The existing code has `[userId]` dependency (stable string) and `onReconnectAttempt` handler
   - The flicker might be caused by the async race condition in `onReconnectAttempt` rather than useEffect re-running
   - Recommendation: Implement the auth callback fix and test. If flicker persists, investigate further.

2. **Should we add a debounce to the ConnectionStatus UI?**
   - Even with perfect reconnection, brief network hiccups may cause a flash
   - A 300-500ms debounce before showing "connecting" would mask brief transitions
   - Recommendation: Implement as a nice-to-have after the core fix is verified

3. **Should Connection State Recovery be considered for the future?**
   - Currently using `@socket.io/redis-adapter` which does NOT support it
   - Would require migrating to `@socket.io/redis-streams-adapter`
   - Not needed for this phase (reconnection stability), but relevant for missed-event recovery
   - Recommendation: Defer to a future phase if missed events become an issue

## Sources

### Primary (HIGH confidence)

- **Codebase files read directly:** `src/lib/socket.ts`, `src/providers/RealtimeProvider.tsx`, `src/hooks/useRealtimeConnection.ts`, `src/hooks/useRealtimeSensorData.ts`, `src/hooks/useRealtimeAlerts.tsx`, `src/hooks/useRealtimeUnitState.ts`, `src/components/common/ConnectionStatus.tsx`, `backend/src/plugins/socket.plugin.ts`, `backend/src/middleware/socket-auth.ts`, `backend/src/services/socket.service.ts`, `backend/src/types/socket.d.ts`, `backend/src/utils/jwt.ts`
- [Socket.IO Client Options (auth callback)](https://socket.io/docs/v4/client-options/) - Official docs confirming auth function form
- [Socket.IO How to Use with React](https://socket.io/how-to/use-with-react) - Official React integration guide
- [Socket.IO Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery) - Official docs on state recovery limitations
- [Socket.IO How to Use with JWT](https://socket.io/how-to/use-with-jwt) - Official JWT guide
- Stack Auth SDK type definitions (`@stackframe/react/dist/index.d.ts`) - `getAccessToken()` returns `Promise<string | null>` and auto-refreshes

### Secondary (MEDIUM confidence)

- [Socket.IO Discussion #3902 - Update query/auth on connect](https://github.com/socketio/socket.io/discussions/3902) - Maintainer confirms auth callback pattern
- [Socket.IO Discussion #4936 - Reconnect with new JWT](https://github.com/socketio/socket.io/discussions/4936) - Community discussion on JWT reconnection

### Tertiary (LOW confidence)

- [Stack Auth OAuth Documentation](https://docs.stack-auth.com/docs/apps/oauth) - Limited info on `getAccessToken()` behavior for session tokens (docs mostly cover OAuth provider tokens)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries verified from installed `package.json` and `node_modules`
- Architecture: HIGH - Root cause identified from direct code reading; auth callback pattern verified from official Socket.io docs
- Pitfalls: HIGH - Race condition identified from code reading; Redis adapter limitation verified from official docs

**Files that need modification:**

1. `src/lib/socket.ts` - Add `auth` callback, `setTokenGetter`, remove token param from `connectSocket`
2. `src/providers/RealtimeProvider.tsx` - Use `setTokenGetter` + `connectSocket()`, remove `onReconnectAttempt` handler
3. (Optional) `src/components/common/ConnectionStatus.tsx` - Add debounce for connecting state

**Files that need NO modification:**

- `backend/src/plugins/socket.plugin.ts` - Already has `transports: ['websocket']`
- `backend/src/middleware/socket-auth.ts` - Already reads from `handshake.auth.token`
- `backend/src/services/socket.service.ts` - No auth-related code
- All `useRealtime*` hooks - They depend on `isConnected` from context, not auth

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (stable - Socket.io v4 API is mature)
