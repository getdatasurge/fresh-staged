---
phase: 14-real-time-foundation
plan: 05
subsystem: realtime
tags: [socket.io, alerts, react-query, sonner, toasts, real-time-notifications]

# Dependency graph
requires:
  - phase: 14-01
    provides: Socket.io plugin with Fastify 5 integration
  - phase: 14-02
    provides: Organization-scoped room isolation and authentication
  - phase: 14-03
    provides: Real-time sensor streaming patterns
  - phase: 14-04
    provides: React Socket.io client with TanStack Query integration
provides:
  - Real-time alert notification delivery from backend to connected clients
  - Toast UI components for alert triggered/resolved/escalated events
  - TanStack Query cache invalidation on alert state changes
  - Organization-scoped alert broadcast via Socket.io rooms
affects: [15-billing-foundation, alert-rules, notification-policies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Alert evaluator emits Socket.io events after database mutations"
    - "useRealtimeAlerts hook for client-side alert event handling"
    - "Toast notifications via sonner library with severity-based styling"
    - "TanStack Query cache updates via setQueryData on real-time events"

key-files:
  created:
    - src/hooks/useRealtimeAlerts.ts
    - src/components/common/AlertToast.tsx
  modified:
    - backend/src/services/alert-evaluator.service.ts
    - backend/src/types/socket.d.ts
    - backend/src/routes/readings.ts
    - src/lib/socket.ts
    - src/providers/RealtimeProvider.tsx

key-decisions:
  - "Pass socketService as optional parameter to evaluateUnitAfterReading"
  - "Emit alert events immediately after database mutations in transaction"
  - "Use qk.org().alerts() and qk.unit().status() query keys for cache updates"
  - "Toast duration based on severity: 10s critical, 5s warning/resolved"

patterns-established:
  - "Real-time event handlers in RealtimeProvider via RealtimeHandlers component"
  - "Socket event listeners with cleanup in useEffect return"
  - "Invalidate queries for list views, update cache for detail views"

# Metrics
duration: 4min
completed: 2026-01-24
---

# Phase 14 Plan 05: Alert Notification Streaming Summary

**Real-time alert notifications delivered via Socket.io with toast UI and automatic TanStack Query cache updates**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-24T08:55:25Z
- **Completed:** 2026-01-24T08:59:20Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Backend alert evaluator emits Socket.io events on alert creation, resolution, and escalation
- Frontend displays toast notifications with severity-based styling
- TanStack Query cache automatically updates on real-time alert events
- Organization-scoped broadcasts ensure no cross-organization data leakage

## Task Commits

Each task was committed atomically:

1. **Task 1: Update backend to emit alerts via Socket.io** - `c5c318b` (feat)
2. **Task 2: Create frontend alert notification hook and toast** - `bb1b9b9` (feat)
3. **Task 3: Wire up alert hook in RealtimeProvider** - `825cb71` (feat)

## Files Created/Modified

**Created:**
- `src/hooks/useRealtimeAlerts.ts` - Hook for real-time alert event handling with toast notifications and cache updates
- `src/components/common/AlertToast.tsx` - Toast UI component with severity-based icon and styling

**Modified:**
- `backend/src/services/alert-evaluator.service.ts` - Added socketService parameter, emits events after alert mutations
- `backend/src/types/socket.d.ts` - Added AlertNotification interface and alert:escalated event
- `backend/src/routes/readings.ts` - Pass socketService to evaluateUnitAfterReading
- `src/lib/socket.ts` - Updated AlertNotification interface with full fields
- `src/providers/RealtimeProvider.tsx` - Added RealtimeHandlers component to initialize alert listeners

## Decisions Made

**REALTIME-15: Optional socketService parameter for alert evaluator**
- Pass via function parameter rather than global singleton
- Enables testing without Socket.io dependency
- Clear dependency injection pattern

**REALTIME-16: Emit events after database mutations in transaction**
- Events emitted after successful alert creation/resolution/escalation
- Organization ID retrieved from unit hierarchy join
- Ensures event delivery only for committed database changes

**REALTIME-17: Toast duration based on severity**
- Critical alerts: 10 seconds (more time to notice)
- Warning/resolved: 5 seconds (standard notification duration)
- Toast ID based on alertId prevents duplicate notifications

**REALTIME-18: Query cache strategy for alerts**
- Invalidate qk.org().alerts() for list refresh
- Update qk.unit().status() via setQueryData for instant UI feedback
- Combines optimistic updates with eventual consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Real-time alert delivery complete
- Toast notifications working for all alert state transitions
- Ready for Phase 15 (Billing Foundation) and alert rules/notification policies
- Alert escalation events stream correctly, ready for escalation policy integration

**Verification performed:**
- TypeScript compilation passes on backend and frontend
- Alert event types match between backend and frontend interfaces
- Organization-scoped room isolation ensures multi-tenancy security

---
*Phase: 14-real-time-foundation*
*Completed: 2026-01-24*
