---
phase: 05-frontend-migration
plan: 14
subsystem: ttn-integration
tags: [stack-auth, ttn, provisioning, edge-functions, migration]
requires: [05-04, 05-08]
provides: [ttn-provisioning-hooks, ttn-wizard-stack-auth, gateway-preflight-stack-auth]
affects: [05-15, 06-01]

tech-stack:
  added: []
  patterns: [stack-auth-edge-functions, hybrid-phase-5-pattern]

key-files:
  created: []
  modified:
    - src/hooks/useTTNSetupWizard.ts
    - src/hooks/useCheckTtnProvisioningState.ts
    - src/hooks/useGatewayProvisioningPreflight.ts

decisions:
  - decision: "Pass Stack Auth token via x-stack-access-token header to edge functions"
    rationale: "Consistent with Phase 5 hybrid pattern - edge functions validate token until Phase 6 backend migration"
  - decision: "useTTNDeprovision already migrated in 05-13"
    rationale: "Discovered during execution - file was part of broader device management hook migration"

metrics:
  completed: 2026-01-23
  duration: "6 minutes 8 seconds"
  tasks_completed: 4/4
  commits: 3
---

# Phase 05 Plan 14: TTN Provisioning Hooks Summary

**Migrated TTN setup wizard, provisioning state check, and gateway preflight hooks from Supabase auth to Stack Auth with edge function token passing**

## Performance

- **Duration:** 6 minutes 8 seconds
- **Started:** 2026-01-23T19:54:30Z
- **Completed:** 2026-01-23T20:00:38Z
- **Tasks:** 4/4 completed
- **Files modified:** 3

## Accomplishments

- TTN setup wizard (useTTNSetupWizard) migrated to Stack Auth with token-authenticated edge function calls
- Provisioning state check (useCheckTtnProvisioningState) uses Stack Auth for check-ttn-device-exists edge function
- Gateway preflight validation (useGatewayProvisioningPreflight) uses Stack Auth for permission checks
- All edge function calls pass Stack Auth access token via x-stack-access-token header
- TODO markers consistently placed for Phase 6 backend migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate useTTNSetupWizard to Stack Auth** - `39d6fd0` (feat)
   - Replaced Supabase auth with Stack Auth useUser hook
   - Updated loadSettings, setRegion, testConnection, saveApiKey to pass access token
   - Added useOrgScope import
   - Preserved wizard step interface and state management

2. **Task 2: Migrate useTTNDeprovision to Stack Auth** - Already complete in `f849515` (05-13)
   - File was migrated as part of broader device management hooks in plan 05-13
   - All deprovision hooks (useTTNDeprovisionJobs, useTTNJobStats, useScanTTNOrphans, useEnqueueOrphanCleanup, useRetryDeprovisionJob) already use Stack Auth

3. **Task 3: Migrate useCheckTtnProvisioningState to Stack Auth** - `3cbe1a5` (feat)
   - Added Stack Auth authentication check before edge function call
   - Pass access token to check-ttn-device-exists edge function
   - Preserved query invalidation and toast notification logic

4. **Task 4: Migrate useGatewayProvisioningPreflight to Stack Auth** - `ae33d7a` (feat)
   - Updated runPreflight to authenticate with Stack Auth
   - Pass access token to ttn-gateway-preflight edge function
   - Updated auto-run effect to check for Stack Auth user
   - Preserved preflight validation and caching behavior

## Files Created/Modified

- **src/hooks/useTTNSetupWizard.ts** - TTN setup wizard orchestration with Stack Auth
  - 4 edge function invocations now authenticated
  - useUser() hook for identity
  - x-stack-access-token header on all manage-ttn-settings calls
  - TODO markers for Phase 6 backend API migration

- **src/hooks/useTTNDeprovision.ts** - TTN deprovisioning operations (migrated in 05-13)
  - All mutation hooks use Stack Auth
  - Edge function calls authenticated
  - Query hooks check for user authentication

- **src/hooks/useCheckTtnProvisioningState.ts** - TTN provisioning state polling
  - Authentication check before edge function invocation
  - Stack Auth token passed to check-ttn-device-exists
  - Preserved multi-sensor batch checking

- **src/hooks/useGatewayProvisioningPreflight.ts** - Gateway provisioning validation
  - Stack Auth authentication in runPreflight
  - Token passed to ttn-gateway-preflight edge function
  - Auto-run logic updated for Stack Auth user check

## Decisions Made

1. **Stack Auth token header pattern:** Used `x-stack-access-token` header consistently across all edge function calls, matching the pattern established in plans 05-08 and 05-13

2. **Edge function preservation:** Kept all edge function calls intact with TODO markers rather than migrating to backend API, following Phase 5 hybrid approach (identity migration only)

3. **Task 2 already complete:** Discovered useTTNDeprovision was already migrated in plan 05-13 as part of device management hooks - no additional work needed

## Deviations from Plan

None - plan executed as written. Task 2 was already completed in a prior plan (05-13), which is a discovery rather than a deviation.

## Issues Encountered

None - all hooks migrated smoothly following established Phase 5 patterns.

## Verification Results

All success criteria met:

✅ `pnpm tsc --noEmit` passes - no TypeScript errors
✅ All 4 hooks import useUser from @stackframe/stack
✅ No supabase.auth calls remain in migrated hooks
✅ Edge function calls include x-stack-access-token header
✅ TODO comments clearly mark Phase 6 migration points
✅ Query keys preserved (no cache invalidation issues)
✅ Polling and caching behaviors preserved

## Next Phase Readiness

**Phase 5 continues with:** Plans 05-15 through 05-20 (remaining frontend hook migrations)

**Blockers:** None

**Concerns:**
- Edge functions still depend on Supabase session validation (to be replaced in Phase 6)
- TTN wizard state management could be simplified in Phase 6 with backend job queue

**Dependencies satisfied for:**
- 05-15: Additional TTN/LoRa provisioning hooks can follow same pattern
- Phase 6: Backend API can replace edge functions using same authentication flow

## Success Criteria Met

✅ All 4 TTN provisioning hooks use Stack Auth
✅ Supabase auth calls completely removed
✅ Edge function calls pass Stack Auth token
✅ Wizard step interface and state management preserved
✅ Preflight validation logic preserved
✅ Hooks continue to function in hybrid mode

All tasks completed successfully. Plan executed in 6 minutes 8 seconds.

---
*Phase: 05-frontend-migration*
*Plan: 14*
*Completed: 2026-01-23*
