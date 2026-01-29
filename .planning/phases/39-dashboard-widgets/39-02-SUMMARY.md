---
phase: 39-dashboard-widgets
plan: 02
subsystem: ui
tags: [trpc, react-query, dashboard, widgets, useQueries]

# Dependency graph
requires:
  - phase: 38-test-infrastructure
    provides: "tRPC mock patterns and queryOptions pattern"
  - phase: 39-01
    provides: "Simple widget migration patterns"
provides:
  - "UnitComparisonWidget using tRPC"
  - "UnitComplianceScoreWidget using tRPC"
  - "SiteActivityGraphWidget using tRPC"
  - "DowntimeTrackerWidget using tRPC"
  - "useQueries pattern for parallel unit readings"
affects:
  - "39-03 (complex widget migration)"
  - "40-settings (component migration)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useQueries for parallel per-unit readings fetches"
    - "Client-side filtering of units.listByOrg by siteId"
    - "Multi-query compliance calculation from readings+logs+alerts"

key-files:
  created: []
  modified:
    - src/features/dashboard-layout/widgets/UnitComparisonWidget.tsx
    - src/features/dashboard-layout/widgets/UnitComplianceScoreWidget.tsx
    - src/features/dashboard-layout/widgets/SiteActivityGraphWidget.tsx
    - src/features/dashboard-layout/widgets/DowntimeTrackerWidget.tsx

key-decisions:
  - "Use units.listByOrg + client-side filter for site-scoped widgets"
  - "Use useQueries for parallel readings fetches across units"
  - "Replace useEffect+setState with useMemo+useQuery pattern"

patterns-established:
  - "useQueries: Parallel queries when fetching readings for multiple units"
  - "Site filtering: Filter units.listByOrg response by siteId client-side"
  - "Compliance calculation: Combine readings.list + readings.listManual + alerts.list"

# Metrics
duration: 8min
completed: 2026-01-29
---

# Phase 39 Plan 02: Medium Widgets Migration Summary

**Migrated 4 medium-complexity dashboard widgets from supabase to tRPC using useQueries for parallel data fetching**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-29T14:06:24Z
- **Completed:** 2026-01-29T14:14:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- UnitComparisonWidget now uses trpc.units.listByOrg with site filtering
- UnitComplianceScoreWidget uses 3 parallel queries for compliance calculation
- SiteActivityGraphWidget uses useQueries for parallel per-unit readings
- DowntimeTrackerWidget supports both unit and site level with tRPC

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate UnitComparisonWidget** - `3c7d3a0` (feat)
2. **Task 2: Migrate UnitComplianceScoreWidget** - `6c7816e` (feat)
3. **Task 3: Migrate SiteActivityGraphWidget and DowntimeTrackerWidget** - `29b7545` (feat)

## Files Modified

- `src/features/dashboard-layout/widgets/UnitComparisonWidget.tsx` - Unit comparison using listByOrg + site filter
- `src/features/dashboard-layout/widgets/UnitComplianceScoreWidget.tsx` - Compliance from readings + logs + alerts queries
- `src/features/dashboard-layout/widgets/SiteActivityGraphWidget.tsx` - Activity sparklines with useQueries for parallel fetches
- `src/features/dashboard-layout/widgets/DowntimeTrackerWidget.tsx` - Downtime detection for unit/site with gap detection

## Decisions Made

- **Client-side site filtering:** Rather than adding a site-scoped units endpoint, filter the existing listByOrg response by siteId. This reuses cached data across widgets.
- **useQueries for parallel fetches:** SiteActivityGraphWidget and DowntimeTrackerWidget use React Query's useQueries to fetch readings for each unit in parallel, improving performance over sequential fetches.
- **Replace useEffect with useQuery:** UnitComplianceScoreWidget converted from imperative useEffect+setState to declarative useQuery+useMemo pattern.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all widgets migrated cleanly following the established patterns.

## Next Phase Readiness

- 4 medium-complexity widgets now use tRPC
- useQueries pattern documented for future parallel fetches
- Ready for 39-03 complex widget migration

---
*Phase: 39-dashboard-widgets*
*Completed: 2026-01-29*
