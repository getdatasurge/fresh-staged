---
phase: 42-admin-debug-components
plan: 01
subsystem: admin
tags: [trpc, migration, debug, superadmin]

requires:
  - phase: 41-pages-migration
    provides: tRPC patterns for component migration
provides:
  - SuperAdminContext without supabase imports
  - RBACDebugPanel with static debug values
  - SensorSimulatorPanel with tRPC units loading
  - UnitDebugBanner without supabase dependency
affects: [43-cleanup]

tech-stack:
  added: []
  patterns: [static-values-for-removed-features]

key-files:
  modified:
    - src/contexts/SuperAdminContext.tsx
    - src/components/debug/RBACDebugPanel.tsx
    - src/components/admin/SensorSimulatorPanel.tsx
    - src/components/debug/UnitDebugBanner.tsx

key-decisions:
  - 'DEC-42-01-A: Replace supabase RPC calls with static values in RBACDebugPanel'
  - 'DEC-42-01-B: Show unavailable toast for sensor simulator edge function calls'
  - 'DEC-42-01-C: Replace RLS check with user auth check in UnitDebugBanner'

duration: 12min
completed: 2026-01-29
---

# Phase 42 Plan 01: Admin/Debug Components Migration Summary

**Removed supabase-placeholder imports from 4 admin/debug components, using tRPC for units and static values for removed features**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-29T16:00:00Z
- **Completed:** 2026-01-29T16:12:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- SuperAdminContext no longer imports from supabase-placeholder
- RBACDebugPanel displays static debug info (supabase RPC removed)
- SensorSimulatorPanel fetches units via tRPC instead of supabase
- UnitDebugBanner uses user auth check instead of supabase RLS check

## Task Commits

1. **Task 1: Migrate SuperAdminContext and RBACDebugPanel** - `1274dea` (feat)
2. **Task 2: Migrate SensorSimulatorPanel to tRPC** - `60235fd` (feat)
3. **Task 3: Migrate UnitDebugBanner** - `0bfa771` (feat)

## Files Created/Modified

- `src/contexts/SuperAdminContext.tsx` - Removed isSupabaseMigrationError import and usage
- `src/components/debug/RBACDebugPanel.tsx` - Replaced supabase RPC with static values
- `src/components/admin/SensorSimulatorPanel.tsx` - Uses tRPC for units, shows unavailable for simulator
- `src/components/debug/UnitDebugBanner.tsx` - Uses user auth check instead of supabase RLS

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| DEC-42-01-A | Replace supabase RPC calls with static values in RBACDebugPanel | Debug panel still useful for showing context state without live RPC |
| DEC-42-01-B | Show unavailable toast for sensor simulator edge function calls | Edge function removed during migration, direct API alternative exists |
| DEC-42-01-C | Replace RLS check with user auth check in UnitDebugBanner | Supabase RLS no longer used, Stack Auth provides auth state |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 admin/debug components migrated
- Ready for 42-02 (remaining components) or phase 43 (cleanup)
- TypeScript compiles without errors

---

_Phase: 42-admin-debug-components_
_Completed: 2026-01-29_
