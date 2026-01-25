---
phase: 20-backend-api-migration-core
plan: 01
subsystem: api
tags: [trpc, typescript, sites, areas, crud, authorization]

# Dependency graph
requires:
  - phase: 19-backend-api-migration-foundation
    provides: tRPC infrastructure, orgProcedure middleware, organizations.router.ts pattern
provides:
  - sitesRouter with full CRUD procedures (list, get, create, update, delete)
  - areasRouter with full CRUD procedures (list, get, create, update, delete)
  - Unit tests for sites and areas routers (34 tests)
  - Role-based authorization (admin/owner for mutations)
affects: [20-backend-api-migration-core, 21-frontend-api-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain router CRUD pattern following organizations.router.ts"
    - "Role-based access control with ['admin', 'owner'].includes(ctx.user.role)"
    - "Hierarchical entity validation (areas validate site access before operations)"

key-files:
  created:
    - backend/src/routers/sites.router.ts
    - backend/src/routers/areas.router.ts
    - backend/tests/trpc/sites.router.test.ts
    - backend/tests/trpc/areas.router.test.ts
  modified:
    - backend/src/trpc/router.ts

key-decisions:
  - "Sites/areas follow same pattern as organizations.router.ts for consistency"
  - "Admin/owner role check matches existing REST route authorization"
  - "Areas router validates site access via service layer, returns NOT_FOUND for invalid site"

patterns-established:
  - "CRUD router pattern: list/get as queries, create/update/delete as mutations"
  - "Role check pattern: if (!['admin', 'owner'].includes(ctx.user.role)) throw FORBIDDEN"
  - "NOT_FOUND pattern: service returns null, router throws TRPCError"

# Metrics
duration: 6min
completed: 2026-01-24
---

# Phase 20 Plan 01: Sites & Areas tRPC Routers Summary

**Type-safe tRPC routers for sites and areas domains with full CRUD operations and role-based authorization**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-25T00:41:51Z
- **Completed:** 2026-01-25T00:47:34Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments
- Sites tRPC router with list, get, create, update, delete procedures
- Areas tRPC router with list, get, create, update, delete procedures matching REST functionality
- Both routers registered in appRouter with proper namespace mounting
- Comprehensive unit tests (34 tests) covering all CRUD operations and authorization

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sites tRPC router** - `ead838b` (feat)
2. **Task 2: Create areas tRPC router and register in appRouter** - `0fdd236` (feat)
3. **Task 3: Add unit tests for sites and areas routers** - `63d1013` (test)

## Files Created/Modified
- `backend/src/routers/sites.router.ts` - Sites domain tRPC router with 5 procedures
- `backend/src/routers/areas.router.ts` - Areas domain tRPC router with 5 procedures
- `backend/src/trpc/router.ts` - Updated to import and mount sites/areas routers
- `backend/tests/trpc/sites.router.test.ts` - 16 unit tests for sites router
- `backend/tests/trpc/areas.router.test.ts` - 18 unit tests for areas router

## Decisions Made
- Followed organizations.router.ts pattern exactly for consistency
- Role check uses `['admin', 'owner'].includes()` matching REST route permissions
- Areas router delegates site validation to area service, throws NOT_FOUND for invalid site

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test assertion mismatch with Zod default values: UpdateSiteSchema and UpdateAreaSchema apply defaults (timezone: 'UTC', sortOrder: 0) when fields are not provided. Fixed by using `expect.objectContaining()` for service call assertions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Sites and areas routers ready for frontend integration
- Pattern established for remaining domain routers (units, readings, alerts)
- Units router (Plan 02) can follow same CRUD pattern

---
*Phase: 20-backend-api-migration-core*
*Completed: 2026-01-24*
