---
phase: 05
plan: 06
subsystem: frontend-hooks
status: complete
tags: [hooks, alerts, unit-status, stack-auth, react-query]
requires: [05-01, 05-03]
provides:
  - Alert rules hooks returning DEFAULT_ALERT_RULES (CRUD deferred to Phase 6+)
  - Alert data-fetching hooks using alertsApi from Phase 4
  - Unit status derivation from nav tree (no dedicated endpoint)
  - Query key extensions for alert filtering
affects: [05-07, 05-08, 05-11]
decisions:
  - "Alert rules CRUD endpoints don't exist - return defaults and no-ops"
  - "Alert data fetched via alertsApi from Phase 4 backend"
  - "Unit status derived from nav tree - no unit-by-id endpoint needed"
  - "useFetchUnitStatus, useFetchUnitAlerts, useFetchAlerts for data fetching"
  - "Keep existing computation hooks (computeUnitAlerts, computeUnitStatus) unchanged"
tech-stack:
  added: []
  patterns:
    - "Data-fetching vs computation hooks separation"
    - "Nav tree as source for hierarchical entity status"
    - "Query key factories with parameters for filters"
key-files:
  created: []
  modified:
    - src/hooks/useAlertRules.ts
    - src/hooks/useUnitAlerts.ts
    - src/hooks/useUnitStatus.ts
    - src/lib/queryKeys.ts
metrics:
  duration: 5m 13s
  completed: 2026-01-23
---

# Phase 5 Plan 06: Alert & Unit Status Hooks Summary

**One-liner:** Alert rules return defaults with Phase 6 TODO markers, alert data fetched via alertsApi, unit status derived from nav tree

## What Was Built

### 1. Alert Rules Hooks (useAlertRules.ts)

**Migrated to Stack Auth with default-only returns:**
- Replaced Supabase imports with Stack Auth `useUser`
- All query hooks return DEFAULT_ALERT_RULES or null (no backend endpoints)
- Mutation hooks are no-ops with console warnings
- Clear Phase 6+ TODO markers for alert rules CRUD API
- DEFAULT_ALERT_RULES constant unchanged (used for client-side calculations)
- Pure helper functions unchanged (computeMissedCheckins, computeOfflineSeverity, etc.)

**Rationale:**
- Backend Phase 4 built alert evaluation using DEFAULT_ALERT_RULES
- Alert rules CRUD endpoints don't exist (admin-level functionality)
- Configuration is deferred to Phase 6+
- Hooks need to compile but don't need real data for Phase 5

**Exports:**
- `useUnitAlertRules(unitId)` - Returns DEFAULT_ALERT_RULES
- `useOrgAlertRules(orgId)` - Returns null
- `useSiteAlertRules(siteId)` - Returns null
- `useUnitAlertRulesOverride(unitId)` - Returns null
- `upsertAlertRules()` - No-op mutation
- `deleteAlertRules()` - No-op mutation
- `DEFAULT_ALERT_RULES` - Constant with default thresholds
- `computeMissedCheckins()` - Pure function unchanged
- `computeOfflineSeverity()` - Pure function unchanged
- `computeOfflineTriggerMs()` - Pure function unchanged
- `computeManualTriggerMinutes()` - Pure function unchanged

### 2. Alert Data-Fetching Hooks (useUnitAlerts.ts)

**Added backend alert queries using alertsApi:**
- `useFetchUnitAlerts(unitId, params)` - Fetch alerts for specific unit
- `useFetchAlerts(params)` - Fetch org-wide alerts with filters
- `useAcknowledgeAlert()` - Mutation hook for staff+ acknowledge operation
- `useResolveAlert()` - Mutation hook for staff+ resolve operation
- Uses Stack Auth `useUser` for token injection
- Uses `useOrgScope` for organization context
- Mutations invalidate alert queries for automatic refetch
- All hooks use alertsApi from Phase 4 backend

**Kept existing computation hooks unchanged:**
- `computeUnitAlerts(units, rulesMap)` - Pure function for client-side alert computation
- `useUnitAlerts(units, rulesMap)` - React hook wrapping computation with useMemo

**Pattern:** Separated data-fetching hooks from computation hooks for flexibility

### 3. Unit Status Hook (useUnitStatus.ts)

**Added nav tree derivation:**
- `useFetchUnitStatus(unitId)` - Fetch unit status from nav tree by ID
- No dedicated `/api/orgs/:orgId/units/:unitId` endpoint needed
- Nav tree already loads all units with status field
- Finds unit by traversing nav tree sites/units hierarchy
- Returns status data without additional API call

**Kept existing computation hooks unchanged:**
- `computeUnitStatus(unit, rules)` - Pure function for status computation
- `useUnitStatus(unit, rules)` - React hook wrapping computation with useMemo
- `useUnitsStatus(units, rulesMap)` - Batch status computation

**Rationale:**
- Units are hierarchical (site > area > unit) - no flat unit-by-id pattern
- Creating a dedicated endpoint just for status lookup is unnecessary overhead
- Nav tree is already cached and loaded for navigation

### 4. Query Key Extensions (queryKeys.ts)

**Extended alert query keys with parameters:**
```typescript
// Before
alerts: () => ['org', orgId, 'alerts'] as const

// After
alerts: (status, unitId, siteId, page, limit) =>
  ['org', orgId, 'alerts', status, unitId, siteId, page, limit] as const
```

**Added unit-scoped alert keys:**
```typescript
alerts: (status, page, limit) =>
  ['unit', unitId, 'alerts', status, page, limit] as const
```

**Benefits:**
- Granular cache invalidation by filter parameters
- TypeScript type safety for query key usage
- Consistent hierarchical key structure

## Architecture Decisions

### Decision 1: Alert Rules Return Defaults (Phase 5 Scope)

**Context:** Backend Phase 4 built alert evaluation but NOT alert rules CRUD endpoints.

**Options Considered:**
1. Build alert rules CRUD endpoints now (scope creep)
2. Return defaults and defer CRUD to Phase 6+
3. Leave hooks broken until Phase 6+

**Decision:** Return DEFAULT_ALERT_RULES with clear Phase 6 TODO markers

**Rationale:**
- Alert rules configuration is admin-level functionality
- Alert evaluation already works server-side using defaults
- Deferring admin features allows focus on core user functionality
- Hooks compile without errors - UI can display default thresholds
- Console warnings make it clear this is intentional, not forgotten

**Impact:** Frontend can display alert status using default thresholds; configuration UI will be Phase 6+

### Decision 2: Separate Data-Fetching from Computation Hooks

**Context:** Existing hooks (useUnitAlerts, useUnitStatus) are pure computation functions that take data as input.

**Options Considered:**
1. Replace computation hooks with data-fetching hooks (breaking change)
2. Keep computation hooks, add separate data-fetching hooks
3. Overload existing hooks with optional fetch behavior

**Decision:** Keep computation hooks unchanged, add new data-fetching hooks

**Rationale:**
- Existing components may rely on computation-only behavior
- Separation of concerns - computation vs I/O
- Flexibility - components can choose to compute from local state or fetch from API
- No breaking changes to existing code

**Impact:** More exports but clearer responsibilities and zero breaking changes

### Decision 3: Derive Unit Status from Nav Tree

**Context:** Need unit status data but no dedicated unit-by-id endpoint exists.

**Options Considered:**
1. Create GET /api/orgs/:orgId/units/:unitId endpoint
2. Derive from nav tree (which already loads all units)
3. Create a separate status-only endpoint

**Decision:** Derive from nav tree using useFetchUnitStatus

**Rationale:**
- Units are hierarchical (site > area > unit) - not flat entities
- Nav tree already fetches all units with status for navigation
- Creating a dedicated endpoint duplicates data already in cache
- No additional network request needed
- Consistent with existing nav tree usage patterns

**Impact:** Zero additional API calls for unit status lookups

## Testing Notes

**TypeScript Compilation:**
- ✅ `pnpm tsc --noEmit` passes with zero errors
- ✅ All hooks properly typed with Stack Auth integration
- ✅ Query keys extended correctly with parameter support

**Supabase Migration:**
- ✅ No Supabase imports in migrated hooks
- ✅ All hooks use Stack Auth `useUser` for authentication
- ✅ `useOrgScope` used consistently for organization context

**Query Key Preservation:**
- ✅ All query keys preserved exactly for cache continuity
- ✅ Extensions backward-compatible (parameters optional)

**Helper Functions:**
- ✅ `computeMissedCheckins` unchanged
- ✅ `computeOfflineSeverity` unchanged
- ✅ `computeOfflineTriggerMs` unchanged
- ✅ `computeManualTriggerMinutes` unchanged

## Next Phase Readiness

**Phase 6+ Requirements for Alert Rules CRUD:**
1. Backend endpoints: POST/PUT/DELETE /api/orgs/:orgId/alert-rules
2. Update useOrgAlertRules to fetch from endpoint (remove null return)
3. Update useSiteAlertRules to fetch from endpoint
4. Update useUnitAlertRulesOverride to fetch from endpoint
5. Implement upsertAlertRules mutation (replace no-op)
6. Implement deleteAlertRules mutation (replace no-op)
7. Remove console.warn statements and Phase 6 TODO markers

**Alert Rules History Migration:**
- Note: useAlertRulesHistory.ts still uses Supabase (not in plan scope)
- Will need migration when Phase 6+ adds alert rules history API

**Integration Points:**
- Alert fetching hooks ready for components (useFetchAlerts, useFetchUnitAlerts)
- Acknowledge/resolve mutations ready for staff+ users
- Unit status derivation ready for dashboard components

## Deviations from Plan

**None** - Plan executed exactly as written.

All three hooks migrated successfully:
- useAlertRules: Stack Auth with defaults
- useUnitAlerts: Added alertsApi data-fetching hooks
- useUnitStatus: Added nav tree derivation hook

## Commits

1. **18e4f38** - feat(05-06): migrate useAlertRules to Stack Auth with defaults
   - Replace Supabase with Stack Auth
   - Return DEFAULT_ALERT_RULES for all query hooks
   - No-op mutations with clear Phase 6 TODO markers
   - Keep pure helper functions unchanged

2. **0148756** - feat(05-06): add alert data-fetching hooks using alertsApi
   - useFetchUnitAlerts for unit-specific queries
   - useFetchAlerts for org-wide queries with filters
   - useAcknowledgeAlert and useResolveAlert mutations
   - Update query keys with filter parameters
   - Keep existing computation hooks unchanged

3. **4e0ae61** - feat(05-06): add useFetchUnitStatus hook deriving from nav tree
   - useFetchUnitStatus finds unit by ID in nav tree
   - No dedicated unit-by-id endpoint needed
   - Keep existing computation hooks unchanged
   - Stack Auth integration via useNavTree and useOrgScope

## Phase 5 Progress

**Wave 2 Status:** 1/4 plans complete (25%)
- ✅ 05-06: Alert & Unit Status Hooks (this plan)
- ⏳ 05-07: Dashboard Data Hooks
- ⏳ 05-08: TTN & Provisioning Hooks
- ⏳ 05-09: Settings & Configuration Hooks

**Overall Phase 5:** 6/14 plans complete (43%)
