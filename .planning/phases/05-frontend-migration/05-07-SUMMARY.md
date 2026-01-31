---
phase: 05-frontend-migration
plan: 07
subsystem: hooks
tags: [stack-auth, sitesApi, hybrid-migration, notification-hooks, typescript]

# Dependency graph
requires:
  - phase: 05-frontend-migration
    plan: 04
    provides: Core identity hooks with Stack Auth (useEffectiveIdentity, useOrgScope, useUserRole)
  - phase: 05-frontend-migration
    plan: 05
    provides: Navigation and organization hooks using API client
provides:
  - Site location mutation via sitesApi (fully migrated)
  - Escalation contacts hooks with Stack Auth identity (hybrid)
  - Notification policies hooks with Stack Auth identity (hybrid)
affects: [05-08-and-beyond-remaining-hooks]

# Tech tracking
tech-stack:
  added: []
  patterns: [hybrid-migration, stack-auth-identity, supabase-data-temporary, todo-markers]

key-files:
  created: []
  modified:
    - src/hooks/useSiteLocationMutation.ts
    - src/hooks/useEscalationContacts.ts
    - src/hooks/useNotificationPolicies.ts

key-decisions:
  - 'Site location mutation fully migrated to sitesApi.updateSite (backend has sites CRUD)'
  - 'Escalation contacts use Stack Auth for identity but keep Supabase data calls (no backend endpoint yet)'
  - 'Notification policies use Stack Auth for identity but keep Supabase data calls (no backend endpoint yet)'
  - "All Supabase data calls marked with 'TODO Phase 6' comments for future migration"
  - 'Convert lat/lon from numbers to strings for UpdateSiteRequest API compliance'

patterns-established:
  - 'Hybrid migration: Stack Auth for identity, Supabase for data with TODO markers'
  - 'Full migration when backend endpoint exists (sitesApi pattern)'
  - 'Clear TODO comments marking temporary Supabase usage'
  - 'Authentication checks in all mutation functions before executing'

# Metrics
duration: 3min 32sec
completed: 2026-01-23
---

# Phase 05 Plan 07: Site Location & Notification Hooks Migration Summary

**Site location mutation fully migrated to sitesApi, notification/escalation hooks use Stack Auth with TODO-marked Supabase data calls**

## Performance

- **Duration:** 3 minutes 32 seconds
- **Started:** 2026-01-23T19:54:30Z
- **Completed:** 2026-01-23T19:58:02Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Fully migrated useSiteLocationMutation from Supabase to sitesApi.updateSite
- Migrated useEscalationContacts to Stack Auth identity with Supabase data (hybrid)
- Migrated useNotificationPolicies to Stack Auth identity with Supabase data (hybrid)
- All hooks use Stack Auth useUser() for authentication
- No supabase.auth calls remain in any migrated hook
- Query keys preserved for cache continuity
- TODO markers added for Phase 6 backend endpoint migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate useSiteLocationMutation to sitesApi** - `6149f0d` (feat)
   - Replace Supabase with sitesApi.updateSite
   - Use Stack Auth useUser() + useOrgScope()
   - Convert lat/lon numbers to strings for API
   - Update query invalidation to qk.site().details()

2. **Task 2: Migrate useEscalationContacts to Stack Auth (hybrid)** - `c95d9a9` (feat)
   - Use Stack Auth useUser() for identity
   - Keep Supabase data calls with TODO markers
   - All mutations check authentication
   - Query keys preserved (qk.org().escalationContacts())

3. **Task 3: Migrate useNotificationPolicies to Stack Auth (hybrid)** - `2d4c239` (feat)
   - Use Stack Auth useUser() for identity
   - Keep Supabase data calls with TODO markers
   - Console error logging added for debugging
   - Query keys preserved for all levels (org/site/unit)

## Files Created/Modified

- `src/hooks/useSiteLocationMutation.ts` - Site location update via sitesApi (fully migrated)
- `src/hooks/useEscalationContacts.ts` - Escalation contacts with Stack Auth identity (hybrid: 4 TODO markers)
- `src/hooks/useNotificationPolicies.ts` - Notification policies with Stack Auth identity (hybrid: 6 TODO markers)

## Decisions Made

**Full migration for useSiteLocationMutation:** Backend has sites CRUD endpoints with UpdateSiteRequest supporting lat/lon/timezone updates. This hook can be fully migrated using sitesApi.updateSite pattern. Numbers converted to strings for API compliance.

**Hybrid migration for notification hooks:** Backend doesn't have escalation-contacts or notification-policies endpoints yet (notification system is Phase 6+ work). These hooks use Stack Auth useUser() for identity verification but keep Supabase data calls temporarily with clear TODO markers.

**TODO marker pattern:** All Supabase data calls marked with "TODO Phase 6: Migrate to new API when backend endpoint available" comments. This makes temporary code easy to find and migrate when backend endpoints are ready.

**Authentication in all mutations:** All mutation hooks check `if (!user)` before executing to prevent unauthenticated operations, even though Supabase still handles the data layer.

**Query key preservation:** All hooks maintain existing query keys (qk.org().escalationContacts(), qk.org().notificationPolicies(), etc.) to avoid cache invalidation issues during migration.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed on all hooks.

## User Setup Required

None - hooks ready for use by components.

## Next Phase Readiness

**Ready for Phase 05-08 (remaining hooks migration):**

- Site location mutation fully operational via sitesApi
- Escalation contacts operational with Stack Auth identity
- Notification policies operational with Stack Auth identity
- Pattern established for hybrid migration (Stack Auth + Supabase data + TODO markers)

**Foundation established:**

- Full migration pattern when backend endpoint exists
- Hybrid migration pattern when backend endpoint doesn't exist yet
- TODO marker convention for temporary Supabase usage
- Authentication checks in all mutations

**Known limitations:**

- Escalation contacts still use Supabase for data (not blocking - TODO markers in place)
- Notification policies still use Supabase for data (not blocking - TODO markers in place)
- Backend needs escalation-contacts and notification-policies endpoints for full migration

**No blockers.** Ready to continue migrating remaining hooks in subsequent plans.

---

_Phase: 05-frontend-migration_
_Completed: 2026-01-23_
