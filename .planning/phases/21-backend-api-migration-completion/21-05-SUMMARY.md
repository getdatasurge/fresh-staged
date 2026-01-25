---
phase: 21-backend-api-migration-completion
plan: 05
subsystem: api
tags: [trpc, hooks, react, tanstack-query, frontend]

# Dependency graph
requires:
  - phase: 21-04
    provides: notificationPolicies tRPC router with listByOrg/listBySite/listByUnit/getEffective/upsert/delete procedures
  - phase: 21-02
    provides: ttnGateways/ttnDevices tRPC routers with CRUD + capacity procedures
  - phase: 21-01
    provides: preferences/smsConfig/payments tRPC routers
provides:
  - tRPC-based useNotificationPolicies hooks (list/effective/upsert/delete)
  - tRPC-based useGateways hooks (list/get/create/update/delete/provision/refreshStatus)
  - tRPC-based useLoraSensors hooks (list/get/create/update/delete/provision/bootstrap)
  - New usePreferences hooks (getDigest/updateDigest/disableAllDigests)
  - New useSmsConfig hooks (get/upsert)
  - New usePayments hooks (getSubscription/createCheckoutSession/createPortalSession)
affects: [phase-22, frontend-components, supabase-removal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useTRPC() + useQuery() pattern for queries"
    - "useTRPCClient() + useMutation() pattern for mutations"
    - "queryOptions() for cache key derivation"
    - "isPending from mutation for loading states"

key-files:
  created:
    - src/hooks/usePreferences.ts
    - src/hooks/useSmsConfig.ts
    - src/hooks/usePayments.ts
  modified:
    - src/hooks/useNotificationPolicies.ts
    - src/hooks/useGateways.ts
    - src/hooks/useLoraSensors.ts
    - src/hooks/useTTNSettings.ts
    - src/hooks/useTTNApiKey.ts
    - src/hooks/useTTNWebhook.ts
    - src/hooks/useTTNOperations.ts
    - src/hooks/useTTNSetupWizard.ts
    - src/hooks/useTTNDeprovision.ts
    - src/hooks/useGatewayProvisioningPreflight.ts
    - src/hooks/useCheckTtnProvisioningState.ts
    - src/hooks/useEscalationContacts.ts
    - src/components/settings/AlertTypePolicyCard.tsx

key-decisions:
  - "HOOKS-01: TTN edge function hooks marked for future migration"
  - "HOOKS-02: useEscalationContacts kept with Supabase (backend router not yet created)"

patterns-established:
  - "Hook migration pattern: Remove supabase import, add useTRPC/useTRPCClient, convert queries to trpc.router.procedure.queryOptions()"
  - "Mutation pattern: useMutation with client.router.procedure.mutate() in mutationFn"
  - "Cache invalidation: Use trpc.router.procedure.queryOptions().queryKey for invalidation"

# Metrics
duration: 25min
completed: 2026-01-25
---

# Phase 21 Plan 05: Frontend Hook Migration Summary

**Migrated 3 hook files to tRPC, created 3 new settings hooks, removed Supabase imports from useNotificationPolicies/useGateways/useLoraSensors**

## Performance

- **Duration:** 25 min
- **Started:** 2026-01-25T07:00:00Z
- **Completed:** 2026-01-25T07:25:00Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Notification policy hooks now use tRPC (listByOrg/listBySite/listByUnit/getEffective/upsert/delete)
- Gateway and LoRa sensor hooks migrated to tRPC (list/get/CRUD/provision/bootstrap)
- Created new settings hooks for preferences, SMS config, and payments
- Removed Supabase imports from 3 hook files
- Fixed AlertTypePolicyCard component to use hook-based mutations

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate notification policy hooks to tRPC** - `33987a3` (feat)
2. **Task 2: Migrate TTN hooks to tRPC** - `0da2fe1` (feat)
3. **Task 3: Create settings hooks (preferences, SMS, payments)** - `2c1b4ec` (feat)

**Auto-fix commit:** `01b6b4a` (fix: update AlertTypePolicyCard to use hook-based mutations)

## Files Created/Modified

### Created
- `src/hooks/usePreferences.ts` - tRPC hooks for digest preferences
- `src/hooks/useSmsConfig.ts` - tRPC hooks for organization SMS config
- `src/hooks/usePayments.ts` - tRPC hooks for Stripe billing operations

### Modified (Fully Migrated to tRPC)
- `src/hooks/useNotificationPolicies.ts` - Replaced Supabase with tRPC for all policy operations
- `src/hooks/useGateways.ts` - Replaced Supabase with tRPC for gateway management
- `src/hooks/useLoraSensors.ts` - Replaced Supabase with tRPC for device management

### Modified (TODO Comments Updated)
- `src/hooks/useTTNSettings.ts` - Updated TODO for future migration
- `src/hooks/useTTNApiKey.ts` - Updated TODO for future migration
- `src/hooks/useTTNWebhook.ts` - Updated TODO for future migration
- `src/hooks/useTTNOperations.ts` - Updated TODO for future migration
- `src/hooks/useTTNSetupWizard.ts` - Updated TODO for future migration
- `src/hooks/useTTNDeprovision.ts` - Updated TODO for future migration
- `src/hooks/useGatewayProvisioningPreflight.ts` - Updated TODO for future migration
- `src/hooks/useCheckTtnProvisioningState.ts` - Updated TODO for future migration
- `src/hooks/useEscalationContacts.ts` - Updated TODO (backend router needed)

### Modified (Component Fix)
- `src/components/settings/AlertTypePolicyCard.tsx` - Updated to use hook-based mutations

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| HOOKS-01 | TTN edge function hooks marked for future migration | Backend routers for edge functions not yet created (manage-ttn-settings, ttn-bootstrap, etc.) |
| HOOKS-02 | useEscalationContacts kept with Supabase | escalationContacts router not yet available in backend |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed AlertTypePolicyCard component to use hook-based mutations**
- **Found during:** Verification (npm run build)
- **Issue:** Component imported old `upsertNotificationPolicy` and `deleteNotificationPolicy` as direct functions, but hook file now exports `useUpsertNotificationPolicy` and `useDeleteNotificationPolicy` hooks
- **Fix:** Updated component to use hooks with `useUpsertNotificationPolicy()` and `useDeleteNotificationPolicy()`, replaced state variables with mutation.isPending
- **Files modified:** src/components/settings/AlertTypePolicyCard.tsx
- **Verification:** `npm run build` passes
- **Committed in:** `01b6b4a`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required fix for build to pass. No scope creep.

## Issues Encountered

- **TTN edge function hooks not migrated:** Many TTN operations (manage-ttn-settings, ttn-bootstrap, ttn-provision-org, etc.) use Supabase edge functions that don't have corresponding tRPC routers yet. These were marked with TODO comments for future migration.
- **escalationContacts router missing:** The useEscalationContacts hook couldn't be migrated because the backend router doesn't exist yet. Marked for future migration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 21 complete with 5 plans executed
- 6 hook files fully migrated to tRPC (no Supabase imports)
- 3 new settings hooks created
- Ready for Phase 22 or frontend component migration

### Remaining Work (Future Phases)
- TTN edge function hooks still use Supabase (8 files)
- escalationContacts hook still uses Supabase
- Numerous other hooks across codebase still need migration

---
*Phase: 21-backend-api-migration-completion*
*Completed: 2026-01-25*
