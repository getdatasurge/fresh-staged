---
phase: 31-ttn-provisioning-ui-migration
plan: 01
subsystem: api
tags: [ttn, trpc, provisioning, credentials, drizzle]

# Dependency graph
requires:
  - phase: 27-ttn-sdk-integration
    provides: TtnProvisioningService, TtnCrypto, TtnWebhookService base classes
provides:
  - getCredentials tRPC procedure for decrypted TTN credentials
  - getStatus tRPC procedure for provisioning state
  - provision (retry) tRPC procedure
  - startFresh tRPC procedure
  - deepClean tRPC procedure
affects: [32-remaining-edge-function-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Role-based credential access (manager read-only, admin/owner write)
    - Graceful decryption failure handling with status tracking
    - Legacy status value mapping (not_started->idle, completed->ready)

key-files:
  created: []
  modified:
    - backend/src/routers/ttn-settings.router.ts
    - backend/src/services/ttn/provisioning.ts
    - backend/src/schemas/ttn-settings.ts
    - backend/src/db/schema/tenancy.ts
    - backend/tests/trpc/ttn-settings.router.test.ts

key-decisions:
  - 'Use Drizzle schema extension for additional ttn_connections columns'
  - 'Graceful decryption failure with status enum (empty/decrypted/failed)'
  - 'Admin/owner only for mutations, manager allowed for getCredentials read'

patterns-established:
  - 'SafeDecrypt pattern: return { value, status } for tracked decryption'
  - 'TTN provisioning flow: retry -> startFresh -> deepClean escalation'

# Metrics
duration: 12min
completed: 2026-01-29
---

# Phase 31 Plan 01: TTN Provisioning Backend Procedures Summary

**5 new tRPC procedures for TTN provisioning: getCredentials, getStatus, provision (retry), startFresh, and deepClean with role-based access control**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-29T05:01:51Z
- **Completed:** 2026-01-29T05:14:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added getCredentials procedure returning decrypted TTN secrets with status tracking (empty/decrypted/failed)
- Added getStatus procedure returning provisioning state (with legacy status value mapping)
- Added provision procedure to retry failed provisioning, with use_start_fresh guidance
- Added startFresh procedure to clear credentials and prepare for reprovisioning
- Added deepClean procedure to delete all TTN resources via admin API
- Extended Drizzle schema with additional ttn_connections columns for provisioning state
- Added comprehensive test suite (35 tests) covering all new procedures and RBAC

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getCredentials and getStatus procedures** - `a3468c2` (feat)
2. **Task 2: Add provision, startFresh, and deepClean mutation procedures** - `1b41eb5` (feat)
3. **Task 3: Add backend tests for new procedures** - `d34426e` (test)

## Files Created/Modified

- `backend/src/routers/ttn-settings.router.ts` - Added 5 new tRPC procedures (getCredentials, getStatus, provision, startFresh, deepClean)
- `backend/src/services/ttn/provisioning.ts` - Added retryProvisioning, startFresh, deepClean methods
- `backend/src/schemas/ttn-settings.ts` - Added Zod schemas for credentials, status, and response types
- `backend/src/db/schema/tenancy.ts` - Extended ttnConnections with provisioning state columns
- `backend/tests/trpc/ttn-settings.router.test.ts` - Added 18 new tests (35 total)

## Decisions Made

- **Drizzle schema extension:** Added additional columns to ttnConnections table definition to match database schema. This allows type-safe access to provisioning state fields.
- **SafeDecrypt pattern:** Return { value, status } object to distinguish empty vs decrypted vs failed states, matching edge function behavior.
- **Role-based access:** getCredentials allows manager for read-only access; all mutations require admin/owner.
- **Legacy status mapping:** Map not_started->idle and completed->ready for consistency with new state machine.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing test failures in ttn-devices.test.ts (15 failures) are unrelated to this plan. These are documented in STATE.md as requiring subscription middleware mocks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend procedures ready for frontend consumption
- Frontend can now call tRPC procedures instead of edge functions for:
  - Viewing decrypted credentials (developer panel)
  - Checking provisioning status
  - Retrying failed provisioning
  - Starting fresh with new TTN resources
  - Deep cleaning stuck provisioning
- Next plan should wire frontend UI to these new endpoints

---

_Phase: 31-ttn-provisioning-ui-migration_
_Completed: 2026-01-29_
