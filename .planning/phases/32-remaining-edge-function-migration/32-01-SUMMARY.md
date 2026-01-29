---
phase: 32-remaining-edge-function-migration
plan: 01
subsystem: api
tags: [trpc, edge-functions, react-query, ttn, iot]

# Dependency graph
requires:
  - phase: 31-ttn-provisioning-ui-migration
    provides: tRPC ttnSettings router with get, test, getStatus procedures
provides:
  - EmulatorTTNRoutingCard using tRPC for TTN settings management
  - Onboarding page using tRPC for TTN provisioning status polling
affects: [32-02, 32-03, 32-04, edge-function-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useQuery with enabled:false + refetch() for manual polling
    - useMutation with onSuccess/onError callbacks for TTN operations

key-files:
  modified:
    - src/components/admin/EmulatorTTNRoutingCard.tsx
    - src/pages/Onboarding.tsx

key-decisions:
  - "Database trigger handles initial TTN provisioning, frontend just polls for status"
  - "Use interval-based polling with cleanup on unmount for Onboarding status checks"

patterns-established:
  - "tRPC query with enabled:false for imperative status polling"
  - "Derive component state from query data instead of manual state management"

# Metrics
duration: 5min
completed: 2026-01-29
---

# Phase 32 Plan 01: TTN Domain Migration Summary

**Migrated 4 edge function calls to tRPC in EmulatorTTNRoutingCard and Onboarding pages**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-29T07:11:08Z
- **Completed:** 2026-01-29T07:16:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed all supabase.functions.invoke calls from EmulatorTTNRoutingCard.tsx
- Removed all supabase.functions.invoke calls from Onboarding.tsx
- Both files now use type-safe tRPC procedures for TTN operations
- Maintained existing UI behavior while improving type safety

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate EmulatorTTNRoutingCard to tRPC** - `08b221e` (feat)
   - Replaced get action with trpc.ttnSettings.get.useQuery
   - Replaced test action with trpc.ttnSettings.test.useMutation
   - Removed supabase-placeholder import
   - Derived status from query data

2. **Task 2: Migrate Onboarding TTN provisioning to tRPC** - `1538812` (feat)
   - Replaced provision/status edge function calls with tRPC polling
   - Used trpc.ttnSettings.getStatus for status polling
   - Added cleanup for polling interval on unmount

## Files Created/Modified
- `src/components/admin/EmulatorTTNRoutingCard.tsx` - TTN routing card for emulator, now uses tRPC for settings and connection testing
- `src/pages/Onboarding.tsx` - Organization onboarding flow, now uses tRPC for TTN provisioning status polling

## Decisions Made
- Database trigger `queue_tts_provisioning` handles initial provisioning when org is created, so Onboarding only needs to poll for status (not explicitly invoke provisioning)
- Used interval-based polling with Promise wrapper for async status updates in Onboarding
- Kept state derivation pattern from TTNCredentialsPanel for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TTN domain edge function calls fully migrated
- Pattern established for remaining edge function migrations in plans 02-04
- Both components ready for production use with tRPC backend

---
*Phase: 32-remaining-edge-function-migration*
*Completed: 2026-01-29*
