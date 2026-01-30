---
phase: 05-frontend-migration
plan: 13
subsystem: device-hooks
tags: [stack-auth, lora-sensors, gateways, device-management, hybrid-migration]

# Dependency graph
requires:
  - phase: 05-frontend-migration
    plan: 04
    provides: Stack Auth identity hooks (useUser, useOrgScope)
  - phase: 05-frontend-migration
    plan: 05
    provides: Pattern for hybrid migration (Stack Auth + Supabase data)
provides:
  - LoRa sensor hooks using Stack Auth with Supabase data calls marked for Phase 6
  - Gateway hooks using Stack Auth with Supabase data calls marked for Phase 6
  - Primary sensor mutation using Stack Auth with clear migration path
affects: [05-14, 06-device-crud-endpoints]

# Tech tracking
tech-stack:
  added: []
  patterns: [hybrid-auth-migration, todo-phase-6-markers, console-warn-migration-tracking]

key-files:
  created: []
  modified:
    - src/hooks/useLoraSensors.ts
    - src/hooks/useGateways.ts
    - src/hooks/useSetPrimarySensor.ts

key-decisions:
  - 'Hybrid approach: Stack Auth for identity, Supabase data calls kept temporarily with TODO Phase 6 markers'
  - 'Add console.warn for runtime migration tracking during Phase 6'
  - 'Preserve all existing query keys and interfaces for zero downstream impact'

patterns-established:
  - 'Device management hooks use Stack Auth useUser() for identity validation'
  - 'useOrgScope() provides org context with optional orgId parameter override'
  - 'All Supabase data calls marked with consistent TODO Phase 6 comment pattern'
  - 'Console warnings added for runtime visibility of pending migrations'

# Metrics
duration: 4min 31sec
completed: 2026-01-23
---

# Phase 05 Plan 13: Device Management Hooks Migration Summary

**LoRa sensor and gateway hooks migrated to Stack Auth with Supabase data layer marked for Phase 6 backend endpoint creation**

## Performance

- **Duration:** 4 minutes 31 seconds
- **Started:** 2026-01-23T19:54:30Z
- **Completed:** 2026-01-23T19:59:01Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Migrated useLoraSensors (5 query hooks, 5 mutation hooks) to Stack Auth
- Migrated useGateways (2 query hooks, 4 mutation hooks) to Stack Auth
- Migrated useSetPrimarySensor mutation hook to Stack Auth
- All hooks use useUser() from Stack Auth for authentication checks
- Replaced all supabase.auth calls with Stack Auth
- Preserved all query keys for cache continuity
- Added TODO Phase 6 markers for all Supabase data calls
- Added console.warn calls for runtime migration tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate useLoraSensors to Stack Auth (hybrid)** - `c493a99` (feat)
   - 10 hooks migrated: useLoraSensors, useLoraSensor, useLoraSensorByDevEui, useLoraSensorsByUnit, useCreateLoraSensor, useUpdateLoraSensor, useDeleteLoraSensor, useLinkSensorToUnit, useProvisionLoraSensor
   - Stack Auth useUser() for identity in all hooks
   - useOrgScope() added for org context with parameter override
   - TODO Phase 6 markers on all Supabase data calls
   - Query enablement: isReady && !!user && !!orgId

2. **Task 2: Migrate useGateways to Stack Auth (hybrid)** - `f849515` (feat)
   - 6 hooks migrated: useGateways, useGateway, useCreateGateway, useUpdateGateway, useDeleteGateway, useProvisionGateway
   - Stack Auth useUser() for identity in all hooks
   - useOrgScope() added for org context with parameter override
   - TODO Phase 6 markers on all Supabase data calls
   - Preserved TTN provisioning error handling logic

3. **Task 3: Migrate useSetPrimarySensor to Stack Auth (hybrid)** - `4e17ac6` (feat)
   - useSetPrimarySensor mutation migrated
   - Stack Auth useUser() for identity validation
   - Preserved sensor type group logic for primary mutual exclusivity
   - TODO Phase 6 marker added
   - Query invalidation preserved

## Files Created/Modified

- `src/hooks/useLoraSensors.ts` - LoRa sensor queries and mutations with Stack Auth
- `src/hooks/useGateways.ts` - Gateway queries and mutations with Stack Auth
- `src/hooks/useSetPrimarySensor.ts` - Primary sensor mutation with Stack Auth

## Decisions Made

**Hybrid migration approach:** Device management hooks use Stack Auth for identity validation but keep Supabase data calls temporarily. Backend Phase 4 focused on readings ingestion - sensor/gateway CRUD endpoints don't exist yet. This allows frontend migration to proceed while backend endpoints are built in Phase 6.

**Console.warn for migration tracking:** Added console.warn('[hookName] Using Supabase - TODO: migrate to new API') in all data-fetching functions. This provides runtime visibility during Phase 6 migration - developers can see which hooks still need backend endpoints by checking browser console.

**Optional orgId parameter pattern:** useLoraSensors and useGateways accept optional orgIdParam, defaulting to useOrgScope() if not provided. This preserves existing call sites while supporting explicit org context when needed.

**Authentication checks in mutations:** All mutation hooks validate user authentication with `if (!user) throw new Error('Not authenticated')` before Supabase operations. This ensures consistent auth behavior even with temporary Supabase data layer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation passed on all hooks.

## User Setup Required

None - hooks ready for use in components.

## Next Phase Readiness

**Ready for Phase 05-14 (remaining hook migrations):**

- Device management hooks migrated to Stack Auth
- Pattern established for hybrid migration (Stack Auth + Supabase data)
- TODO markers document Phase 6 work (backend endpoint creation)

**Foundation established:**

- Stack Auth useUser() replaces all supabase.auth calls
- useOrgScope() provides org context for data queries
- console.warn tracks pending migrations at runtime
- Query keys preserved for zero downstream impact

**Phase 6 migration path clear:**

- Create /api/orgs/:orgId/sensors endpoint (GET, POST, PATCH, DELETE)
- Create /api/orgs/:orgId/gateways endpoint (GET, POST, PATCH, DELETE)
- Create /api/orgs/:orgId/units/:unitId/primary-sensor endpoint (PATCH)
- Replace Supabase data calls with API calls in all hooks
- Remove supabase import and TODO markers
- Console warnings will guide which hooks need updates

**Known limitations:**

- Device CRUD still uses Supabase (backend endpoints don't exist yet)
- TTN provisioning edge functions continue to work (no changes needed)
- Primary sensor logic still in frontend (may move to backend in Phase 6)

**No blockers.** Ready to continue Phase 5 hook migrations.

---

_Phase: 05-frontend-migration_
_Completed: 2026-01-23_
