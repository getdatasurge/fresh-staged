# Codebase Report: Socket.io Client Configuration & Reconnection Behavior

Generated: 2026-01-29

## Summary

The application uses Socket.io for real-time updates with a **manual connection strategy** that reconnects on user authentication changes. The reconnection "flicker" observed in production is likely caused by **auth token refresh cycles** triggering full disconnect/reconnect sequences rather than Socket.io's built-in reconnection mechanism.

---

## Project Structure

```
src/
  lib/
    socket.ts              # Socket.io client initialization & config
  providers/
    RealtimeProvider.tsx   # Connection lifecycle & auth integration
  hooks/
    useRealtimeConnection.ts      # Subscription helper
    useRealtimeSensorData.ts      # Sensor reading handlers
    useRealtimeAlerts.tsx          # Alert notification handlers
    useRealtimeUnitState.ts        # Unit state change handlers
  components/
    common/
      ConnectionStatus.tsx   # UI indicator (Wifi icon)
```

---

## Questions Answered

### Q1: Where is the Socket.io client created?

**Location:** `/home/swoop/swoop-claude-projects/fresh-staged/src/lib/socket.ts`

**Initialization:**

```typescript
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin),
  {
    autoConnect: false, // Connect manually after auth
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  },
);
```

**Key Design Choice:** `autoConnect: false` means the socket does NOT connect automatically. Connection is triggered manually via `connectSocket(token)`.

---

### Q2: What are the reconnection settings?

| Setting                | Value   | Meaning                                    |
| ---------------------- | ------- | ------------------------------------------ |
| `reconnection`         | `true`  | Auto-reconnect enabled                     |
| `reconnectionAttempts` | `5`     | Max 5 retry attempts before giving up      |
| `reconnectionDelay`    | `2000`  | 2 seconds initial delay                    |
| `reconnectionDelayMax` | `10000` | 10 seconds max delay (exponential backoff) |
| `timeout`              | `20000` | 20 seconds connection timeout              |

**Reconnection Timeline:**

- Attempt 1: 2 seconds
- Attempt 2: 4 seconds (exponential)
- Attempt 3: 8 seconds
- Attempt 4: 10 seconds (capped at max)
- Attempt 5: 10 seconds (final attempt)

After 5 failed attempts, Socket.io stops trying and logs: `"giving up after 5 failed attempts"`

---

### Q3: How do connection events work?

**Location:** `/home/swoop/swoop-claude-projects/fresh-staged/src/providers/RealtimeProvider.tsx`

**Event Handlers:**

```typescript
function onConnect() {
  connectErrorCountRef.current = 0;
  setIsConnected(true);
  setIsConnecting(false);
  console.log('Socket.io connected');
}

function onDisconnect(reason: string) {
  setIsConnected(false);
  console.log('Socket.io disconnected:', reason);
}

function onConnectError(error: Error) {
  connectErrorCountRef.current += 1;
  setIsConnecting(false);
  setConnectionError(error.message);
  // Only log first error and final summary (avoid console spam)
  if (connectErrorCountRef.current === 1) {
    console.warn('Socket.io connection error:', error.message);
  } else if (connectErrorCountRef.current === 5) {
    console.warn(`Socket.io: giving up after 5 attempts (${error.message})`);
  }
}
```

**Event Registration:**

```typescript
socket.on('connect', onConnect);
socket.on('disconnect', onDisconnect);
socket.on('connect_error', onConnectError);
```

---

### Q4: What is the RealtimeProvider's connection lifecycle?

**Location:** `/home/swoop/swoop-claude-projects/fresh-staged/src/providers/RealtimeProvider.tsx`

**Lifecycle Flow:**

```
1. User authenticates → useUser() returns user object
2. Get access token from Stack Auth
3. Call connectSocket(token) → socket.auth = { token }; socket.connect()
4. Socket.io establishes WebSocket connection
5. Server validates JWT token
6. 'connect' event fires → setIsConnected(true)
7. RealtimeHandlers component mounts → sets up data/alert/state listeners
```

**Disconnection Flow:**

```
1. User logs out OR token expires → useUser() returns null
2. useEffect cleanup runs → disconnectSocket()
3. Socket.off() removes all event listeners
4. socket.disconnect() closes connection
5. RealtimeHandlers unmounts → cleans up data listeners
```

**CRITICAL FINDING - Auth Token Refresh:**

The `useEffect` dependency array is `[user]`. This means:

```typescript
useEffect(() => {
  if (!user) {
    disconnectSocket();
    return;
  }

  const connectWithAuth = async () => {
    const token = await user.getAccessToken();
    connectSocket(token);
  };

  connectWithAuth();

  return () => {
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('connect_error', onConnectError);
    disconnectSocket();
  };
}, [user]); // ⚠️ RECONNECTS WHEN USER OBJECT CHANGES
```

**If the Stack Auth user object reference changes** (e.g., on token refresh), this effect:

1. Runs cleanup → disconnects socket
2. Re-runs → reconnects with new token

This creates a **disconnect/reconnect cycle** that looks like flickering in the UI.

---

### Q5: How is the socket used across the app?

**Real-time Event Hooks:**

| Hook                    | Events Listened                                        | Purpose                                              |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `useRealtimeSensorData` | `sensor:readings:batch`                                | Update temperature/humidity data in cache            |
| `useRealtimeAlerts`     | `alert:triggered`, `alert:resolved`, `alert:escalated` | Show toast notifications, invalidate queries         |
| `useRealtimeUnitState`  | `unit:state:changed`                                   | Update unit status (normal/warning/critical/offline) |

**Subscription Pattern:**

Components use `useRealtimeSubscription(type, id)` to join Socket.io rooms:

```typescript
// Example: Subscribe to site updates
useRealtimeSubscription('site', siteId);

// Example: Subscribe to unit updates
useRealtimeSubscription('unit', unitId);
```

This emits `subscribe:site` or `subscribe:unit` events when `isConnected` becomes true.

---

## Connection Status UI

**Location:** `/home/swoop/swoop-claude-projects/fresh-staged/src/components/common/ConnectionStatus.tsx`

**Visual Indicators:**

| State        | Icon               | Color  | Tooltip                                           |
| ------------ | ------------------ | ------ | ------------------------------------------------- |
| Connecting   | Spinner (animated) | Yellow | "Connecting to real-time updates..."              |
| Connected    | Wifi               | Green  | "Real-time updates active"                        |
| Disconnected | WifiOff            | Red    | Error message or "Real-time updates disconnected" |

**Implementation:**

```typescript
const { isConnected, isConnecting, connectionError } = useRealtimeStatus();
```

This component reflects the state from `RealtimeProvider`, which means users will see:

- Yellow spinner during the 2-10 second reconnection delays
- Red icon if 5 reconnection attempts fail
- **Flickering** if auth token refreshes trigger reconnect cycles

---

## Root Cause Analysis: Reconnection Flicker

### Likely Causes (in order of probability):

#### 1. **Auth Token Refresh Triggering Reconnection** (MOST LIKELY)

**Hypothesis:** Stack Auth periodically refreshes the access token, which may update the `user` object reference. This triggers the `useEffect` cleanup in `RealtimeProvider.tsx`, causing:

```
Token expires → user object updates → useEffect cleanup runs →
disconnectSocket() → new token fetched → connectSocket(newToken) →
2-second delay → reconnect → UI flickers yellow → green
```

**Evidence:**

- `useEffect` depends on `[user]`
- `getAccessToken()` is called on every connection
- No token refresh handling in place

**Fix:** Separate token refresh from connection lifecycle using a stable user ID dependency instead of the full user object.

---

#### 2. **Socket.io Transport Switching**

**Hypothesis:** Socket.io may be switching between WebSocket and long-polling transports if the WebSocket connection is unstable.

**Evidence:**

- No `transports` option specified (defaults to `['polling', 'websocket']`)
- Socket.io will start with polling, then upgrade to WebSocket
- If upgrade fails, it falls back to polling (causes brief disconnect)

**Fix:** Force WebSocket-only transport:

```typescript
{
  transports: ['websocket'],
  upgrade: false
}
```

---

#### 3. **Network Instability / Load Balancer Health Checks**

**Hypothesis:** Production environment may have:

- Load balancer idle connection timeouts
- Network proxies closing inactive connections
- Health check systems disrupting WebSocket connections

**Evidence:**

- Only occurs in production (not localhost)
- May correlate with load balancer timeout intervals (typically 60-300 seconds)

**Fix:** Implement heartbeat/ping-pong to keep connection alive:

```typescript
{
  pingInterval: 25000,  // Send ping every 25 seconds
  pingTimeout: 10000    // Wait 10 seconds for pong before reconnecting
}
```

---

#### 4. **React Strict Mode Double Mounting** (DEV ONLY)

**Hypothesis:** In React 18 Strict Mode, effects run twice in development, which could cause double connection/disconnection.

**Evidence:**

- Only happens in development mode with Strict Mode enabled
- Should NOT occur in production build

**Fix:** This is expected behavior in dev mode. To verify, check if flicker happens in production build (`npm run build && npm run preview`).

---

## Key Files

| File                                         | Purpose                      | Entry Points                                      |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------- |
| `src/lib/socket.ts`                          | Socket.io client singleton   | `socket`, `connectSocket()`, `disconnectSocket()` |
| `src/providers/RealtimeProvider.tsx`         | Connection lifecycle manager | `<RealtimeProvider>`, `useRealtimeStatus()`       |
| `src/hooks/useRealtimeConnection.ts`         | Subscription helper          | `useRealtimeSubscription()`                       |
| `src/components/common/ConnectionStatus.tsx` | UI indicator                 | `<ConnectionStatus>`                              |

---

## Architecture Map

```
[User Auth (Stack)]
       ↓
[RealtimeProvider] → connectSocket(token)
       ↓
[Socket.io Client] ← src/lib/socket.ts
       ↓
[WebSocket Connection] → Backend Socket.io Server
       ↓
[Real-time Events]
       ↓
┌──────┴──────┬──────────────┬────────────────┐
│             │              │                │
useRealtimeSensorData  useRealtimeAlerts  useRealtimeUnitState
│             │              │                │
React Query   Toast          React Query      Toast
Cache         Notifications  Cache            Notifications
```

---

## Recommendations

### Immediate Fixes:

1. **Stabilize Auth Token Refresh** (HIGH PRIORITY)
   - Change `useEffect([user])` to `useEffect([user?.id])`
   - Or implement token rotation without disconnecting

2. **Force WebSocket Transport** (MEDIUM PRIORITY)

   ```typescript
   {
     transports: ['websocket'],
     upgrade: false
   }
   ```

3. **Add Connection Heartbeat** (MEDIUM PRIORITY)
   ```typescript
   {
     pingInterval: 25000,
     pingTimeout: 10000
   }
   ```

### Diagnostic Steps:

1. Add logging to track when `useEffect` in RealtimeProvider runs:

   ```typescript
   useEffect(() => {
     console.log('[RealtimeProvider] Effect triggered', {
       userId: user?.id,
       userRef: user,
     });
     // ... rest of effect
   }, [user]);
   ```

2. Monitor production console for patterns:
   - "Socket.io disconnected" followed by "Socket.io connected"
   - Timing between disconnect/reconnect (2+ seconds = reconnection delay)

3. Check if flicker correlates with:
   - JWT token expiry intervals (typically 15-60 minutes)
   - User activity (token refresh may trigger on API calls)

---

## Open Questions

- **What triggers the Stack Auth user object to update?** (token refresh? profile updates?)
- **What is the JWT token expiry time in production?** (does it match flicker frequency?)
- **Are there any reverse proxies/load balancers in front of the Socket.io server?** (may have connection timeouts)
- **Does the backend log connection/disconnection events?** (can correlate with frontend flicker)
