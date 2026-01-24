---
phase: 14-real-time-foundation
plan: 04
subsystem: realtime
tags: [socket.io-client, react, tanstack-query, websocket, jwt]

# Dependency graph
requires:
  - phase: 14-02
    provides: Socket.io server with JWT authentication
provides:
  - Socket.io React client with TanStack Query integration
  - RealtimeProvider for connection state management
  - Real-time sensor data hooks
  - Automatic cache updates on WebSocket events
affects: [14-05-streaming, dashboard, unit-detail, site-detail]

# Tech tracking
tech-stack:
  added: [socket.io-client]
  patterns:
    - "React context provider for Socket.io connection lifecycle"
    - "TanStack Query cache updates from WebSocket events"
    - "Room subscription hooks for site/unit filtering"

key-files:
  created:
    - src/lib/socket.ts
    - src/providers/RealtimeProvider.tsx
    - src/hooks/useRealtimeConnection.ts
    - src/hooks/useRealtimeSensorData.ts
  modified:
    - src/App.tsx

key-decisions:
  - "Use Stack Auth getAccessToken() for JWT retrieval"
  - "TanStack Query cache updates via setQueryData"
  - "RealtimeProvider placed after QueryClientProvider in component tree"
  - "Automatic reconnection with exponential backoff configured"

patterns-established:
  - "Socket.io client as singleton with typed event interfaces"
  - "Connection state exposed via React context hook pattern"
  - "Room subscriptions managed via useEffect with cleanup"
  - "Multiple query cache keys updated per batch event"

# Metrics
duration: 4min
completed: 2026-01-24
---

# Phase 14 Plan 04: React Socket.io Client Integration Summary

**Socket.io-client integrated with TanStack Query cache updates, JWT authentication from Stack Auth, and connection state management via React context**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-24T08:45:51Z
- **Completed:** 2026-01-24T08:49:29Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Socket.io-client installed and configured with typed event interfaces
- RealtimeProvider manages WebSocket connection lifecycle with JWT authentication
- Real-time sensor data updates TanStack Query cache without polling
- Room subscription hooks for site/unit-scoped data filtering
- Automatic reconnection on network interruption with exponential backoff

## Task Commits

Each task was committed atomically:

1. **Task 1: Install socket.io-client and create client library** - `6438f24` (feat)
2. **Task 2: Create RealtimeProvider and connection status hook** - `7697737` (feat)
3. **Task 3: Create useRealtimeSensorData hook with TanStack Query integration** - `eb5328d` (feat)

## Files Created/Modified

- `src/lib/socket.ts` - Socket.io client singleton with typed ServerToClientEvents and ClientToServerEvents interfaces, exports connectSocket/disconnectSocket helpers
- `src/providers/RealtimeProvider.tsx` - React context provider managing socket lifecycle, connects with JWT from Stack Auth, exposes useRealtimeStatus hook
- `src/hooks/useRealtimeConnection.ts` - useRealtimeSubscription hook for managing site/unit room subscriptions with automatic cleanup
- `src/hooks/useRealtimeSensorData.ts` - Hook that updates TanStack Query cache on sensor:readings:batch events, handles unit-latest-reading, unit status, and readings arrays
- `src/App.tsx` - Added RealtimeProvider wrapper after QueryClientProvider to ensure auth and query client are available

## Decisions Made

**D1: Stack Auth token retrieval**
- Used `user.getAccessToken()` async method for JWT retrieval
- Wrapped in try/catch for error handling
- Logs warning if no token available

**D2: TanStack Query cache update strategy**
- Update multiple cache keys per batch: unit-latest-reading, unit status, sensor-readings
- Append to history arrays with 100-item limit to prevent memory growth
- Use setQueryData with updater function to merge with existing cache

**D3: RealtimeProvider placement**
- Placed after QueryClientProvider (needs queryClient context)
- Placed inside StackProvider (needs user context for auth)
- Placed before BrowserRouter (connection state available to all routes)

**D4: Connection lifecycle**
- Event listeners registered outside connect event to prevent duplicates
- Clean disconnect on user logout or unmount
- Check socket.connected state on mount for reconnect scenarios

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Pre-existing build issue:** PWA plugin fails due to bundle size exceeding 2MB limit. This is unrelated to Socket.io integration and was present before Task 1. TypeScript compilation succeeds without errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 14-05 (Real-time Sensor Data Streaming):**
- Socket.io client connects with JWT authentication
- TanStack Query cache updates configured
- Room subscription hooks ready for dashboard integration
- Connection status tracking available for UI indicators

**No blockers.**

**Integration points:**
- Dashboard components can call useRealtimeSensorData(organizationId)
- Unit/Site detail pages can call useRealtimeSubscription('unit', unitId)
- Connection status available via useRealtimeStatus() for UI badges

---
*Phase: 14-real-time-foundation*
*Completed: 2026-01-24*
