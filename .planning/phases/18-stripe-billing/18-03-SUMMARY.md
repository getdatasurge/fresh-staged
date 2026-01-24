---
phase: 18-stripe-billing
plan: 03
subsystem: api
tags: [middleware, subscription, access-control, billing, fastify]

# Dependency graph
requires:
  - phase: 18-01
    provides: stripeEvents table, subscriptions schema, billing foundation
provides:
  - requireActiveSubscription middleware for route protection
  - requireSensorCapacity middleware for plan limit enforcement
  - getActiveSensorCount utility for metering integration
affects: [18-04, 18-05, any route needing subscription enforcement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subscription middleware pattern matching rbac.ts"
    - "Hierarchical device count via join chain"

key-files:
  created:
    - backend/src/middleware/subscription.ts
  modified:
    - backend/src/routes/ttn-devices.ts

key-decisions:
  - "ACTIVE_STATUSES includes only 'active' and 'trial'"
  - "Sensor count traverses devices -> units -> areas -> sites hierarchy"

patterns-established:
  - "Subscription enforcement via preHandler hooks"
  - "Error response format with code, message, and diagnostic info"

# Metrics
duration: 2min
completed: 2026-01-24
---

# Phase 18 Plan 03: Subscription Enforcement Middleware Summary

**Subscription status and sensor limit enforcement middleware following rbac.ts pattern with preHandler hooks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-24T18:28:49Z
- **Completed:** 2026-01-24T18:31:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created requireActiveSubscription middleware blocking access without active/trial subscription
- Created requireSensorCapacity middleware enforcing plan-based sensor limits
- Added getActiveSensorCount utility for use in meter reporting
- Applied sensor capacity check to both device provisioning routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create subscription enforcement middleware** - `0807189` (feat)
2. **Task 2: Apply requireSensorCapacity to device creation route** - `5ad9f0b` (feat)

## Files Created/Modified

- `backend/src/middleware/subscription.ts` - Subscription status and capacity enforcement middleware
- `backend/src/routes/ttn-devices.ts` - Added requireSensorCapacity to POST routes

## Decisions Made

- **ACTIVE_STATUSES = ['active', 'trial']**: Only these two statuses allow access; canceled, past_due, and other statuses block access
- **Hierarchical device count**: Count traverses devices -> units -> areas -> sites -> organization chain to ensure multi-tenant isolation
- **Both POST routes protected**: Applied to both `/ttn/devices` and `/ttn/devices/bootstrap` to cover all device creation paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Plan specified `backend/src/routes/devices.ts` but actual route file is `backend/src/routes/ttn-devices.ts` - located correct file and applied changes there

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Middleware ready for use on any route requiring subscription enforcement
- getActiveSensorCount utility ready for meter reporting (18-04)
- requireActiveSubscription available for protecting additional routes as needed

---
*Phase: 18-stripe-billing*
*Completed: 2026-01-24*
