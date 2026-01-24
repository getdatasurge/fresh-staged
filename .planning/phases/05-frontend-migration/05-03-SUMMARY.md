---
phase: 05-frontend-migration
plan: 03
subsystem: api
tags: [readings-api, alerts-api, sensor-data, alert-lifecycle, typescript]

# Dependency graph
requires:
  - phase: 05-frontend-migration
    plan: 01
    provides: API client infrastructure with Ky and TypeScript types
  - phase: 05-frontend-migration
    plan: 02
    provides: Core entity CRUD API functions
  - phase: 04-sensor-data-alert-system
    provides: Backend readings and alerts routes
provides:
  - Typed API functions for sensor readings queries
  - Typed API functions for alert lifecycle operations (list, get, acknowledge, resolve)
  - Alert filtering by status, unit, site
affects: [06-frontend-hooks, 07-realtime-subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns: [typed-api-functions, hierarchy-params, alert-lifecycle-operations]

key-files:
  created:
    - src/lib/api/readings.ts
    - src/lib/api/alerts.ts
  modified:
    - src/lib/api/index.ts

key-decisions:
  - "Full hierarchy params for readings API (orgId, siteId, areaId, unitId) matching backend routes"
  - "Alert acknowledge/resolve accept separate params (notes, resolution, correctiveAction) vs single object"
  - "List functions return arrays directly (not wrapped in {data, pagination} yet)"
  - "Convenience method listUnitAlerts delegates to listAlerts with unitId filter"

patterns-established:
  - "Readings API uses full resource hierarchy for queries"
  - "Alert mutations (acknowledge, resolve) require staff+ role per backend RBAC"
  - "Alert status can be single value or array for multi-status filtering"

# Metrics
duration: 4min 46sec
completed: 2026-01-23
---

# Phase 05-03: Readings & Alerts API Functions Summary

**Typed API functions for sensor data queries and alert management operations**

## Performance

- **Duration:** 4 minutes 46 seconds
- **Started:** 2026-01-23T19:34:01Z
- **Completed:** 2026-01-23T19:38:47Z
- **Tasks:** 3
- **Files created:** 2 (readings.ts, alerts.ts)
- **Files modified:** 1 (index.ts)

## Accomplishments

- Created readingsApi module with listReadings and getLatestReading functions
- Created alertsApi module with full lifecycle operations (list, get, acknowledge, resolve)
- Added listUnitAlerts convenience method for unit-scoped alert queries
- Updated barrel export to include readingsApi and alertsApi
- All functions accept accessToken parameter for Stack Auth integration
- Support for pagination and filtering (status, unitId, siteId, date ranges)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create readings API module** - `72beacb` (feat)
   - readingsApi with listReadings and getLatestReading
   - Full hierarchy params (orgId, siteId, areaId, unitId)
   - Pagination and date filtering (start, end)
   - Note: Also committed api-types.ts and api-client.ts infrastructure (Rule 3 - blocking dependencies)

2. **Task 2: Create alerts API module** - `c078ba2` (feat)
   - alertsApi with listAlerts, getAlert, acknowledgeAlert, resolveAlert
   - Status, unitId, siteId filters for list operations
   - listUnitAlerts convenience method

3. **Task 3: Update API barrel export** - `fe51b09` (feat)
   - Added readingsApi and alertsApi to barrel export
   - Single import point for all API modules

## Files Created/Modified

- `src/lib/api/readings.ts` - Readings queries with pagination and date filtering
- `src/lib/api/alerts.ts` - Alert lifecycle operations with filtering
- `src/lib/api/index.ts` - Updated barrel export to include new modules

## Decisions Made

**Full hierarchy params for readings:** Readings API accepts full resource hierarchy (orgId, siteId, areaId, unitId) matching backend route structure. This ensures proper authorization via backend hierarchy validation.

**Separate params for alert mutations:** acknowledgeAlert accepts notes as optional string parameter, resolveAlert accepts resolution and correctiveAction as separate params. This matches backend schema structure and provides clear function signatures.

**Direct array returns:** List functions return arrays directly (ReadingResponse[], AlertResponse[]) rather than wrapped pagination objects. Backend routes currently return arrays; pagination wrapper can be added later if needed.

**Convenience method pattern:** listUnitAlerts demonstrates pattern for domain-specific convenience methods that delegate to more general list functions with filters applied.

## Deviations from Plan

**[Rule 3 - Blocking] Created missing infrastructure:** Plans 05-01 and 05-02 dependencies (api-types.ts, api-client.ts) were created as part of Task 1 commit to unblock execution. These files were required but didn't exist, so they were auto-generated following their plan specifications.

## Issues Encountered

None - TypeScript compilation passed on all modules.

## User Setup Required

None - API functions ready for use in hooks once Stack Auth token is available.

## Next Phase Readiness

**Ready for Phase 05-04 (Hook migration):**
- Readings API ready for useReadings, useLatestReading hooks
- Alerts API ready for useAlerts, useAlert, useAcknowledgeAlert, useResolveAlert hooks
- All functions accept accessToken for Stack Auth integration
- Filtering and pagination supported

**Foundation established:**
- Type-safe API functions matching backend routes
- Full hierarchy validation via backend enforcement
- Alert lifecycle operations (acknowledge, resolve) mapped to backend
- Convenience methods pattern for domain-specific queries

**No blockers.** Ready to migrate hooks from Supabase to new API client.

---
*Phase: 05-frontend-migration*
*Completed: 2026-01-23*
