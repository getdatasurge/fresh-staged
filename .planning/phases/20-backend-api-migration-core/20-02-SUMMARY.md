---
phase: 20-backend-api-migration-core
plan: 02
subsystem: api
tags: [trpc, typescript, units, readings, alerts, crud, authorization]

# Dependency graph
requires:
  - phase: 20-backend-api-migration-core
    plan: 01
    provides: sitesRouter, areasRouter patterns, orgProcedure usage
provides:
  - unitsRouter with CRUD procedures (list, get, create, update, delete)
  - readingsRouter with query procedures (list, latest)
  - alertsRouter with workflow procedures (list, get, acknowledge, resolve)
  - Unit tests for all three routers (46 tests)
  - Role-based authorization (manager for units, staff for alerts)
affects: [21-frontend-api-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Query router pattern (readings) - read-only with pagination and filters'
    - 'Workflow router pattern (alerts) - state transition methods like acknowledge/resolve'
    - 'Staff role access for alert mutations (broader than admin/owner)'
    - 'Manager role access for unit mutations (includes manager/admin/owner)'

key-files:
  created:
    - backend/src/routers/units.router.ts
    - backend/src/routers/readings.router.ts
    - backend/src/routers/alerts.router.ts
    - backend/tests/trpc/units.router.test.ts
    - backend/tests/trpc/readings.router.test.ts
    - backend/tests/trpc/alerts.router.test.ts
  modified:
    - backend/src/trpc/router.ts

key-decisions:
  - "Manager/admin/owner role check for unit mutations (matches REST requireRole('manager'))"
  - "Staff/manager/admin/owner role check for alert mutations (matches REST requireRole('staff'))"
  - 'Readings router has list and latest only - bulk ingest stays REST (API key auth)'
  - 'CONFLICT error for already-acknowledged alerts (matches REST 409 response)'

patterns-established:
  - 'Query router pattern: minimal procedures for read-only data (list, latest)'
  - 'Workflow router pattern: status transitions as mutations (acknowledge, resolve)'
  - 'Role hierarchy: viewer < staff < manager < admin < owner for different operations'

# Metrics
duration: 6min
completed: 2026-01-25
---

# Phase 20 Plan 02: Units, Readings & Alerts tRPC Routers Summary

**Type-safe tRPC routers for units, readings, and alerts domains with full CRUD/workflow operations and role-based authorization**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-25T00:50:33Z
- **Completed:** 2026-01-25T00:56:40Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- Units tRPC router with list, get, create, update, delete procedures (manager/admin/owner)
- Readings tRPC router with list and latest procedures for sensor data queries
- Alerts tRPC router with list, get, acknowledge, resolve procedures (staff+)
- All routers registered in appRouter (total: 6 domain routers now active)
- Comprehensive unit tests (46 tests) covering all procedures and authorization

## Task Commits

Each task was committed atomically:

1. **Task 1: Create units tRPC router** - `583775b` (feat)
2. **Task 2: Create readings and alerts routers** - `445e17b` (feat)
3. **Task 3: Add unit tests for all routers** - `f3c3135` (test)

## Files Created/Modified

- `backend/src/routers/units.router.ts` - Units domain tRPC router with 5 procedures
- `backend/src/routers/readings.router.ts` - Readings domain tRPC router with 2 procedures
- `backend/src/routers/alerts.router.ts` - Alerts domain tRPC router with 4 procedures
- `backend/src/trpc/router.ts` - Updated to import and mount all three routers
- `backend/tests/trpc/units.router.test.ts` - 19 unit tests for units router
- `backend/tests/trpc/readings.router.test.ts` - 8 unit tests for readings router
- `backend/tests/trpc/alerts.router.test.ts` - 19 unit tests for alerts router

## Decisions Made

- Manager role for unit mutations matches REST `requireRole('manager')` pattern
- Staff role for alert mutations matches REST `requireRole('staff')` pattern
- Bulk ingest endpoint stays REST - uses API key auth, not tRPC
- Alert acknowledge returns CONFLICT when already acknowledged (mirrors REST 409)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Test assertion mismatch with Zod default values: CreateUnitSchema adds defaults (status, manualMonitoringRequired, sortOrder). Fixed by using `expect.objectContaining()` for service call assertions.
- Profile ID in test mocks needed to be valid UUID for output validation. Fixed by using proper UUID format.

## Verification Results

All plan verification checks passed:

1. TypeScript compiles: PASS
2. Units router registered: PASS
3. Readings router registered: PASS
4. Alerts router registered: PASS
5. Bulk ingest still REST: PASS
6. All new tests passing (46/46): PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All core domain routers now available in appRouter
- Pattern coverage complete: CRUD, query-only, and workflow routers
- Ready for frontend API migration (Plan 20-03)
- Devices and profiles routers remain for later plans

---

_Phase: 20-backend-api-migration-core_
_Completed: 2026-01-25_
