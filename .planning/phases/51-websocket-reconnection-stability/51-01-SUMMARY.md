---
phase: 51-websocket-reconnection-stability
plan: 01
status: complete
completed: 2026-01-30
---

## Result

**PASS** — Socket.io reconnection flicker eliminated. The useEffect now depends on `user.id` (stable string) instead of the `user` object reference, preventing disconnect/reconnect cycles on JWT token refresh. WebSocket-only transport configured on both client and server. Fresh tokens fetched on reconnect attempts.

## What Changed

### RealtimeProvider useEffect Stabilization (`src/providers/RealtimeProvider.tsx`)

| Before | After |
|--------|-------|
| `useEffect(..., [user])` — re-runs on every user object reference change | `useEffect(..., [userId])` — only re-runs when user identity changes |
| `user.getAccessToken()` captured in effect closure (stale on reconnect) | `userRef.current.getAccessToken()` always uses latest user ref |
| No reconnect token refresh | `socket.io.on('reconnect_attempt')` fetches fresh JWT before each attempt |

### WebSocket-Only Transport

| File | Before | After |
|------|--------|-------|
| `src/lib/socket.ts` | No `transports` option (defaults to polling first) | `transports: ['websocket']` |
| `backend/src/plugins/socket.plugin.ts` | `transports: ['websocket', 'polling']` | `transports: ['websocket']` |

## Evidence

### TypeScript Checks

- Frontend: `pnpm exec tsc --noEmit` → 0 errors
- Backend: `npx tsc --noEmit` → 0 errors

## Requirements Satisfied

- **WS-01** ✅ Socket.io connection persists through JWT token refresh (useEffect depends on `userId` not `user`)
- **WS-02** ✅ Socket.io uses WebSocket transport only (no polling fallback/upgrade)
- **WS-03** ✅ Fresh token supplied on reconnect attempts via `reconnect_attempt` handler

## Files Modified

| File | Action |
|------|--------|
| `src/providers/RealtimeProvider.tsx` | Stabilized useEffect dep to `userId`, added `userRef` for fresh token access, added reconnect token refresh |
| `src/lib/socket.ts` | Added `transports: ['websocket']` |
| `backend/src/plugins/socket.plugin.ts` | Changed transports to WebSocket only |
