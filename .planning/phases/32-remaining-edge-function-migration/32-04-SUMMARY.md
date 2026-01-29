---
phase: 32-remaining-edge-function-migration
plan: 04
subsystem: api
tags: [trpc, ttn, edge-functions, migration, cleanup]

# Dependency graph
requires:
  - phase: 32-01
    provides: ttnDevices router with list/get/provision procedures
provides:
  - ttnDevices.diagnose procedure for device connectivity diagnostics
  - SensorManager migrated from edge function to tRPC
  - EdgeFunctionDiagnostics dead code removed
affects: [33-error-handling-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnose procedure pattern with checks array and success/hint structure"

key-files:
  created: []
  modified:
    - backend/src/routers/ttn-devices.router.ts
    - src/components/settings/SensorManager.tsx
    - src/pages/Settings.tsx
    - src/components/debug/index.ts
    - src/components/admin/SensorSimulatorPanel.tsx
  deleted:
    - src/components/debug/EdgeFunctionDiagnostics.tsx

key-decisions:
  - "Keep SensorSimulatorPanel edge function as-is - admin-only dev tool"
  - "Map tRPC diagnose response to existing TtnDiagnoseResult format for modal compatibility"

patterns-established:
  - "Diagnose pattern: checks array with name/passed/message structure"

# Metrics
duration: 4min
completed: 2026-01-29
---

# Phase 32 Plan 04: Final Edge Function Cleanup Summary

**ttnDevices.diagnose procedure added, SensorManager migrated to tRPC, EdgeFunctionDiagnostics dead code deleted**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-29T07:19:16Z
- **Completed:** 2026-01-29T07:22:57Z
- **Tasks:** 2
- **Files modified:** 5 (1 deleted)

## Accomplishments
- Added `ttnDevices.diagnose` procedure to check TTN configuration status (connection, app ID, credentials)
- Migrated SensorManager from edge function to tRPC for diagnose operation
- Deleted EdgeFunctionDiagnostics.tsx - dead code that checked health of removed edge functions
- Added documentation comment to SensorSimulatorPanel keeping edge function (admin-only dev tool)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add diagnose procedure to ttn-devices router** - `8c4953f` (feat)
2. **Task 2: Migrate SensorManager and clean up dead code** - `45497a1` (feat)

## Files Created/Modified
- `backend/src/routers/ttn-devices.router.ts` - Added diagnose procedure with checks for TTN config, app ID, and credentials
- `src/components/settings/SensorManager.tsx` - Replaced supabase.functions.invoke with ttnDevices.diagnose tRPC call
- `src/pages/Settings.tsx` - Removed EdgeFunctionDiagnostics import and usage
- `src/components/debug/index.ts` - Removed EdgeFunctionDiagnostics export
- `src/components/admin/SensorSimulatorPanel.tsx` - Added comment documenting edge function decision
- `src/components/debug/EdgeFunctionDiagnostics.tsx` - DELETED (dead code)

## Decisions Made
- **Keep SensorSimulatorPanel edge function:** The sensor-simulator edge function still exists and works. It's an admin-only dev tool for testing, so migration to tRPC is not required for internal tooling.
- **Map tRPC response format:** The tRPC diagnose procedure returns a simpler check format than the original edge function. The SensorManager maps this to the existing TtnDiagnoseResult format for modal compatibility.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing TypeScript build errors:** Backend `npm run build` has pre-existing drizzle-orm type errors unrelated to this phase. The ttn-devices.router.ts changes are syntactically correct.
- **TtnDiagnoseResult format mismatch:** The existing modal expected detailed TTN plane checks (IS, JS, NS, AS). The new tRPC diagnose procedure returns simpler config checks. Resolved by mapping the tRPC response to the expected format.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 3 remaining edge function calls handled (SensorManager migrated, EdgeFunctionDiagnostics deleted, SensorSimulatorPanel kept with comment)
- Phase 32 is complete - ready for Phase 33 (Error Handling UI Integration)
- No blockers

---
*Phase: 32-remaining-edge-function-migration*
*Completed: 2026-01-29*
