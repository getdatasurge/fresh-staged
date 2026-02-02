---
phase: 20
plan: 03
subsystem: frontend-api
tags: [tRPC, React Query, hooks, TypeScript]
depends_on:
  requires: [20-02]
  provides: [tRPC hooks for sites, areas, units, readings, alerts]
  affects: [20-04]
tech_stack:
  added: []
  patterns: [tRPC React Query hooks, cache invalidation, queryOptions pattern]
key_files:
  created:
    - src/hooks/useSites.ts
    - src/hooks/useAreas.ts
    - src/hooks/useUnits.ts
    - src/hooks/useReadings.ts
    - src/hooks/useAlerts.ts
  modified:
    - src/lib/api/sites.ts
    - src/lib/api/areas.ts
    - src/lib/api/units.ts
    - src/lib/api/readings.ts
    - src/lib/api/alerts.ts
decisions: []
metrics:
  duration: ~6 minutes
  completed: 2026-01-25
---

# Phase 20 Plan 03: Frontend Hooks Migration Summary

**One-liner:** Five domain hook files created using useTRPC() pattern with proper cache invalidation, Ky API wrappers deprecated.

## What Was Built

### New Hook Files (5 files created)

**src/hooks/useSites.ts**

- `useSites(organizationId, options?)` - List sites for organization
- `useSite(organizationId, siteId, options?)` - Get single site
- `useCreateSite()` - Create site mutation (admin/owner)
- `useUpdateSite()` - Update site mutation (admin/owner)
- `useDeleteSite()` - Delete site mutation (admin/owner)

**src/hooks/useAreas.ts**

- `useAreas(organizationId, siteId, options?)` - List areas for site
- `useArea(organizationId, siteId, areaId, options?)` - Get single area
- `useCreateArea()` - Create area mutation (admin/owner)
- `useUpdateArea()` - Update area mutation (admin/owner)
- `useDeleteArea()` - Delete area mutation (admin/owner)

**src/hooks/useUnits.ts**

- `useUnits(organizationId, siteId, areaId, options?)` - List units for area
- `useUnit(organizationId, siteId, areaId, unitId, options?)` - Get single unit
- `useCreateUnit()` - Create unit mutation (manager/admin/owner)
- `useUpdateUnit()` - Update unit mutation (manager/admin/owner)
- `useDeleteUnit()` - Delete unit mutation (manager/admin/owner)

**src/hooks/useReadings.ts**

- `useReadings(organizationId, unitId, filters?, options?)` - Query readings with pagination/date filters
- `useLatestReading(organizationId, unitId, options?)` - Get most recent reading

**src/hooks/useAlerts.ts**

- `useAlerts(organizationId, filters?, options?)` - List alerts with status/severity/unit/site filters
- `useAlert(organizationId, alertId, options?)` - Get single alert
- `useAcknowledgeAlert()` - Acknowledge alert mutation (staff+)
- `useResolveAlert()` - Resolve alert mutation (staff+)
- `useUnitAlerts(organizationId, unitId, filters?, options?)` - Convenience wrapper

### API Wrappers Deprecated (5 files updated)

All functions in the following files now have `@deprecated` JSDoc tags with migration instructions:

- `src/lib/api/sites.ts` - sitesApi (5 methods)
- `src/lib/api/areas.ts` - areasApi (5 methods)
- `src/lib/api/units.ts` - unitsApi (5 methods)
- `src/lib/api/readings.ts` - readingsApi (2 methods)
- `src/lib/api/alerts.ts` - alertsApi (5 methods)

## Patterns Established

### Hook Structure (consistent across all domains)

```typescript
export function useSites(organizationId: string | undefined, options?: { enabled?: boolean }) {
  const trpc = useTRPC();

  const queryOptions = trpc.sites.list.queryOptions({
    organizationId: organizationId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && options?.enabled !== false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
```

### Cache Invalidation Pattern

```typescript
export function useUpdateSite() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => client.sites.update.mutate(variables),
    onSuccess: (_data, variables) => {
      // Invalidate list query
      const listOptions = trpc.sites.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({ queryKey: listOptions.queryKey });

      // Invalidate detail query
      const getOptions = trpc.sites.get.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
      });
      queryClient.invalidateQueries({ queryKey: getOptions.queryKey });
    },
  });
}
```

### Stale Time by Domain

| Domain   | staleTime | gcTime | Notes                                |
| -------- | --------- | ------ | ------------------------------------ |
| Sites    | 60s       | 5m     | Changes infrequently                 |
| Areas    | 60s       | 5m     | Changes infrequently                 |
| Units    | 60s       | 5m     | Changes infrequently                 |
| Readings | 30s       | 2m     | Real-time data, frequent updates     |
| Alerts   | 30s       | 2m     | Time-sensitive, refetchOnWindowFocus |

## Commits

| Commit  | Description                                       |
| ------- | ------------------------------------------------- |
| 493e848 | feat(20-03): create sites and areas tRPC hooks    |
| 84189b2 | feat(20-03): create units and readings tRPC hooks |
| 1d1d771 | feat(20-03): create alerts tRPC hooks             |

## Verification Results

1. **TypeScript compiles**: Build successful with no errors
2. **All hooks export correctly**: 23 exported functions across 5 files
3. **tRPC types flow from AppRouter**: All hooks import from `@/lib/trpc`
4. **API wrappers deprecated**: 22+ `@deprecated` tags across 5 API files

## Deviations from Plan

None - plan executed exactly as written.

## Next Steps

- Plan 20-04: Component Migration - Update frontend components to use new tRPC hooks
- Components will migrate from deprecated Ky-based API calls to direct tRPC hook usage

## Notes

- Readings hooks are query-only (bulk ingestion stays REST with API key auth)
- Alerts hooks include both query and mutation capabilities
- All mutations include proper cache invalidation for related queries
- Type safety flows automatically from backend AppRouter through tRPC client
