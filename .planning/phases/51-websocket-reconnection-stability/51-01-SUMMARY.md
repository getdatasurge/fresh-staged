---
phase: 51-websocket-reconnection-stability
plan: 01
status: complete
completed: 2026-01-30
---

## Result

**PASS** — Socket.io reconnection race condition eliminated. The imperative `socket.auth = { token }` pattern (which had a race condition in the `onReconnectAttempt` handler where `getAccessToken()` might not resolve before the handshake was sent) is replaced by the `auth: (cb) => {...}` callback function that Socket.io invokes on every connection and reconnection attempt, waiting for `cb()` before transmitting. A 500ms debounce on the ConnectionStatus UI suppresses brief visual transitions.

## What Changed

### Socket Client (`src/lib/socket.ts`)

- Added module-level `tokenGetter` variable and `setTokenGetter` export
- Added `auth: (cb) => {...}` callback to socket options — Socket.io calls this on every connect/reconnect and waits for `cb()` before sending the handshake
- Changed `connectSocket()` to take no arguments (token is fetched by the auth callback)
- Preserved all existing socket options (`transports: ['websocket']`, reconnection config, timeout)

### RealtimeProvider (`src/providers/RealtimeProvider.tsx`)

- Replaced `connectWithAuth()` async function with `setTokenGetter()` + `connectSocket()` (no token arg)
- Removed `onReconnectAttempt` handler entirely (race condition source eliminated)
- Added `setTokenGetter(null)` in useEffect cleanup
- Kept `userId` dependency array (already correct), `userRef` pattern, connection error handling

### ConnectionStatus (`src/components/common/ConnectionStatus.tsx`)

- Added 500ms debounce before showing the connecting spinner
- `showConnecting` state only becomes `true` after 500ms of continuous `isConnecting` state
- Brief reconnections (under 500ms) produce no visible UI change

## Evidence

### TypeScript Check

```
pnpm exec tsc --noEmit → 0 errors (frontend)
npx tsc --noEmit → 0 errors (backend)
```

### Code Verification

- `auth: (cb) =>` present in socket.ts (callback pattern)
- `setTokenGetter` used in RealtimeProvider useEffect
- No `socket.auth = { token }` anywhere in src/ (imperative pattern removed)
- No `reconnect_attempt` handler in RealtimeProvider (race condition removed)
- `showConnecting` debounce in ConnectionStatus (500ms)

## Requirements Satisfied

- **WS-01** - Socket.io auth uses callback function that fetches fresh JWT on every connect/reconnect (no race condition)
- **WS-02** - Socket.io client has `transports: ['websocket']` (preserved from previous state)
- **WS-03** - No visible connecting flicker — auth callback eliminates unnecessary disconnects, debounce suppresses brief transitions

## Files Modified

| File                                         | Action                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/socket.ts`                          | Added auth callback, setTokenGetter export, removed token param from connectSocket |
| `src/providers/RealtimeProvider.tsx`         | Use setTokenGetter + connectSocket(), removed onReconnectAttempt handler           |
| `src/components/common/ConnectionStatus.tsx` | Added 500ms debounce for connecting state                                          |
