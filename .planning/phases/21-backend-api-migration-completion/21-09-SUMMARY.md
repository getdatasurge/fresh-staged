---
phase: 21-backend-api-migration-completion
plan: 09
subsystem: api
tags: [ttn, edge-functions, migration, documentation, hooks]

# Dependency graph
requires:
  - phase: 21-06
    provides: ttnSettings router for settings CRUD
  - phase: 21-07
    provides: escalationContacts router
provides:
  - Clear documentation of 6 TTN hooks blocked on backend work
  - Edge function dependencies documented per hook
  - Migration paths outlined for future implementation
  - Inline TODOs before all edge function/Supabase calls
affects: [future-ttn-backend-phase, backend-api-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BLOCKED status header format for unmigrated hooks"
    - "Inline TODO with required procedure specification"
    - "Edge function dependency documentation"

key-files:
  created: []
  modified:
    - src/hooks/useTTNApiKey.ts
    - src/hooks/useTTNWebhook.ts
    - src/hooks/useTTNSetupWizard.ts
    - src/hooks/useCheckTtnProvisioningState.ts
    - src/hooks/useGatewayProvisioningPreflight.ts
    - src/hooks/useTTNDeprovision.ts

key-decisions:
  - "HOOKS-03: Mark 6 TTN hooks as BLOCKED requiring backend TTN SDK integration"
  - "HOOKS-04: Document direct DB access in useTTNDeprovision (ttn_deprovision_jobs table)"

patterns-established:
  - "BLOCKED status: Use 'Status: BLOCKED - Requires backend implementation' header format"
  - "Edge function docs: List all edge functions used with their actions"
  - "Migration path: Numbered steps outlining backend work required"

# Metrics
duration: 5min
completed: 2026-01-25
---

# Phase 21 Plan 09: Document Remaining TTN Hooks Summary

**Documentation of 6 TTN hooks blocked on backend TTN SDK integration with edge function dependencies and migration paths**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-25T04:05:19Z
- **Completed:** 2026-01-25T04:09:51Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- All 6 TTN hooks now have clear "BLOCKED - Requires backend implementation" headers
- Edge function dependencies documented in each hook header
- Inline TODOs added before all edge function invocations and direct DB queries
- Migration paths outlined with specific backend procedures needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Document TTN API key and webhook hooks** - `e17f43e` (docs)
2. **Task 2: Document TTN wizard and provisioning hooks** - `9a1407e` (docs)
3. **Task 3: Document TTN deprovision hooks** - `68ac35b` (docs)

## Files Modified

- `src/hooks/useTTNApiKey.ts` - BLOCKED status, ttn-bootstrap edge function dependency
- `src/hooks/useTTNWebhook.ts` - BLOCKED status, update-ttn-webhook and ttn-provision-org dependencies
- `src/hooks/useTTNSetupWizard.ts` - BLOCKED status, manage-ttn-settings dependency
- `src/hooks/useCheckTtnProvisioningState.ts` - BLOCKED status, check-ttn-device-exists dependency
- `src/hooks/useGatewayProvisioningPreflight.ts` - BLOCKED status, ttn-gateway-preflight dependency
- `src/hooks/useTTNDeprovision.ts` - BLOCKED status, ttn-list-devices + direct DB access documented

## Edge Functions Documented

| Hook | Edge Functions | Direct DB Access |
|------|----------------|------------------|
| useTTNApiKey | ttn-bootstrap | None |
| useTTNWebhook | update-ttn-webhook, ttn-provision-org | None |
| useTTNSetupWizard | manage-ttn-settings | None |
| useCheckTtnProvisioningState | check-ttn-device-exists | None |
| useGatewayProvisioningPreflight | ttn-gateway-preflight | None |
| useTTNDeprovision | ttn-list-devices | ttn_deprovision_jobs table, get_deprovision_job_stats RPC |

## Migration Blockers Summary

All 6 hooks share a common blocker:
- **Backend needs TTN SDK integration** (@ttn-lw/grpc-web-api-client or equivalent)

Additional blockers by hook:
- **useTTNApiKey**: API key validation, webhook configuration procedures
- **useTTNWebhook**: Webhook update, secret regeneration procedures
- **useTTNSetupWizard**: Partially migrated (settings CRUD done), needs API key validation
- **useCheckTtnProvisioningState**: Device existence check procedure
- **useGatewayProvisioningPreflight**: API key type/rights validation procedure
- **useTTNDeprovision**: BullMQ job queue integration for deprovision workflow

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| HOOKS-03 | Mark 6 TTN hooks as BLOCKED | Backend TTN SDK integration not yet available |
| HOOKS-04 | Document direct DB access in useTTNDeprovision | Table not in Drizzle schema, needs backend procedures |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in backend services (unrelated to this documentation plan)
- Verified changes with ESLint which passed for all modified hooks

## Next Phase Readiness

- Phase 21 backend API migration documentation complete
- Clear backlog of TTN backend work for future phase:
  - TTN SDK integration (5-6 hooks depend on this)
  - BullMQ job queue for deprovision workflow
  - 8 edge functions to eventually deprecate

---
*Phase: 21-backend-api-migration-completion*
*Plan: 09*
*Completed: 2026-01-25*
