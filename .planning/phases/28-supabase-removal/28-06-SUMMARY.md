---
phase: 28-supabase-removal
plan: 06
subsystem: ui
tags: [trpc, react, supabase-removal]

# Dependency graph
requires:
  - phase: 28-05
    provides: core dashboards migrated to tRPC
provides:
  - unit detail uses tRPC units.get with hierarchy lookup
  - site and area deletes use tRPC mutations
  - maintenance tools removed direct Supabase reads
affects: [supabase-removal, detail-views, admin-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - tRPC listByOrg lookup for unit hierarchy
    - tRPC delete mutations for site/area cleanup

key-files:
  created: []
  modified:
    - src/pages/UnitDetail.tsx
    - src/pages/SiteDetail.tsx
    - src/pages/AreaDetail.tsx
    - src/pages/DataMaintenance.tsx
    - src/pages/RecentlyDeleted.tsx

key-decisions:
  - "Resolve unit hierarchy via units.listByOrg before calling units.get"
  - "Placeholder recently deleted list pending tRPC endpoint"

patterns-established:
  - "Lookup hierarchy IDs for unit routes before scoped tRPC queries"

# Metrics
duration: 15 min
completed: 2026-01-26
---

# Phase 28 Plan 06: Detail Views Migration Summary

**Unit, site, and area detail views now use tRPC lookups with updated delete flows and maintenance pages no longer query Supabase directly.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-01-26T00:42:14Z
- **Completed:** 2026-01-26T00:57:52Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments
- Migrated Unit Detail to tRPC units.get with hierarchy lookup and manual log refresh.
- Switched Site and Area delete flows to tRPC mutations with error handling.
- Removed Supabase queries from Recently Deleted and clarified migration status.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Unit Detail** - `f844b76` (feat)
2. **Task 2: Migrate Site Detail** - `98854b5` (feat)
3. **Task 3: Migrate Area Detail** - `4c02ed0` (feat)
4. **Task 4: Migrate Maintenance Tools** - `3b6bf99` (feat)

**Plan metadata:** Pending

## Files Created/Modified
- `src/pages/UnitDetail.tsx` - Lookup hierarchy IDs and fetch latest manual log for alerts.
- `src/pages/SiteDetail.tsx` - Use tRPC delete mutation and surface errors.
- `src/pages/AreaDetail.tsx` - Use tRPC delete mutation and surface errors.
- `src/pages/DataMaintenance.tsx` - Remove unused org id reference.
- `src/pages/RecentlyDeleted.tsx` - Remove Supabase reads and add migration notice.

## Decisions Made
- Used units.listByOrg to resolve site/area IDs before calling units.get.
- Temporarily present an empty Recently Deleted list while the tRPC endpoint is pending.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 28-07-PLAN.md.

---
*Phase: 28-supabase-removal*
*Completed: 2026-01-26*
