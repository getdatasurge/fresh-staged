---
phase: 28-supabase-removal
plan: 07
subsystem: ui
tags: [supabase, trpc, ttn, react]

# Dependency graph
requires:
  - phase: 28-06
    provides: tRPC migration for platform admin/detail flows
provides:
  - Supabase client removed with placeholder-backed fallbacks
  - TTN and Telnyx webhook URLs aligned to backend endpoints
  - Disabled legacy health/layout/restore checks pending backend APIs
affects: [phase-29-data-migration, phase-30-system-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Supabase placeholder module for removed integrations"]

key-files:
  created: [src/lib/supabase-placeholder.ts]
  modified:
    - package.json
    - package-lock.json
    - src/hooks/useTTNOperations.ts
    - src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts
    - src/hooks/useSoftDelete.ts
    - src/lib/health/healthChecks.ts
    - src/components/admin/TTNSetupWizard.tsx
    - src/components/settings/TelnyxWebhookUrlsCard.tsx

key-decisions:
  - "Use a placeholder client to keep UI stable while Supabase-backed flows are removed"

patterns-established:
  - "Placeholder module for disabled Supabase features with explicit errors"

# Metrics
duration: 29 min
completed: 2026-01-26
---

# Phase 28 Plan 07: Final Platform Clean-Up Summary

**Supabase client removal with placeholder-backed TTN/layout/health flows and backend-aligned webhook URLs**

## Performance

- **Duration:** 29 min
- **Started:** 2026-01-26T01:50:50Z
- **Completed:** 2026-01-26T02:19:50Z
- **Tasks:** 3
- **Files modified:** 32

## Accomplishments
- Removed the Supabase client dependency and integration files
- Replaced Supabase imports with placeholder-backed stubs across TTN, layouts, and restore flows
- Updated TTN/Telnyx webhook URLs and health/slug checks to backend-aligned fallbacks

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Platform Pages** - `7ee30ce` (feat)
2. **Task 2: Uninstall Dependency** - `cc77294` (chore)
3. **Task 3: Delete Integration Folder** - `0b91ac3` (chore)

_Note: Additional cleanup committed separately (see Deviations)_

## Files Created/Modified
- `src/lib/supabase-placeholder.ts` - Placeholder client/types for removed Supabase calls
- `src/hooks/useTTNOperations.ts` - Provisioning flow stubbed during migration
- `src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts` - Layout storage disabled without Supabase
- `src/hooks/useSoftDelete.ts` - Soft delete/restore operations return explicit unavailability
- `src/lib/health/healthChecks.ts` - Health checks skip Supabase edge/database probes
- `src/components/admin/TTNSetupWizard.tsx` - Webhook URL updated to backend endpoint
- `src/components/settings/TelnyxWebhookUrlsCard.tsx` - Telnyx webhook URL aligned to backend

## Decisions Made
- Use a placeholder client to keep UI stable while Supabase-backed flows are removed and backend replacements are pending.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added placeholder client and stubs for Supabase-backed features**
- **Found during:** Post-Task 3 (full removal sweep)
- **Issue:** Remaining Supabase imports and edge-function checks would break runtime after dependency removal
- **Fix:** Added `src/lib/supabase-placeholder.ts`, stubbed TTN/layout/soft-delete flows, and aligned webhook URLs
- **Files modified:** src/lib/supabase-placeholder.ts, src/hooks/useTTNOperations.ts, src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts, src/hooks/useSoftDelete.ts, src/lib/health/healthChecks.ts, src/components/admin/TTNSetupWizard.tsx, src/components/settings/TelnyxWebhookUrlsCard.tsx
- **Verification:** `grep` for `@/integrations/supabase` in src returns no matches
- **Committed in:** `cdf0230` (supplemental cleanup commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary to prevent runtime failures after Supabase removal; no scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 28 complete; ready to begin Phase 29 planning and data migration
- Follow-up needed: replace placeholder TTN/layout/restore/health flows with backend endpoints

---
*Phase: 28-supabase-removal*
*Completed: 2026-01-26*
