---
phase: 47-trpc-proxy-call-migration
plan: 01
subsystem: frontend-hooks
tags: [trpc, hooks, vanilla-client, mutation-fix, query-fix]
dependency-graph:
  requires: [46-dependency-cleanup]
  provides: [hook-trpc-proxy-calls-fixed]
  affects: [47-02, 47-03, 48-production-redeploy]
tech-stack:
  patterns: [useTRPCClient-for-imperative-calls, useTRPC-for-queryOptions]
key-files:
  modified:
    - src/hooks/useAlertRules.ts
    - src/hooks/useAlertRulesHistory.ts
    - src/hooks/useSiteLocationMutation.ts
    - src/hooks/useWidgetHealthMetrics.ts
decisions:
  - id: TRPC-HOOK-01
    description: 'Keep useTRPC() alongside useTRPCClient() in hooks that use both .queryOptions() and imperative .mutate()'
  - id: TRPC-HOOK-02
    description: 'Replace useTRPC() entirely with useTRPCClient() in hooks that only use imperative calls (useWidgetHealthMetrics)'
metrics:
  duration: ~3 minutes
  completed: 2026-01-29
---

# Phase 47 Plan 01: Hook tRPC Proxy Call Migration Summary

Migrated 12 imperative `.mutate()`/`.query()` calls across 4 hook files from `useTRPC()` proxy to `useTRPCClient()` vanilla client, fixing the root cause of `TypeError: e[i] is not a function`.

## What Was Done

### Task 1: Fix .mutate() calls in 3 hook files

- **useAlertRules.ts**: Added `useTRPCClient` import, switched 3 mutations (upsert, delete, clearField) to `trpcClient`
- **useAlertRulesHistory.ts**: Added `useTRPCClient` import, switched 1 mutation (create) to `trpcClient`
- **useSiteLocationMutation.ts**: Added `useTRPCClient` import, switched 1 mutation (update) to `trpcClient`
- All query hooks using `.queryOptions()` left unchanged (correct pattern)
- Commit: `bf1077f`

### Task 2: Fix .mutate() and .query() calls in useWidgetHealthMetrics.ts

- Replaced `useTRPC` entirely with `useTRPCClient` (no `.queryOptions()` usage in this file)
- Switched 3 `.mutate()` calls: trackHealthChange, flushHealthMetrics, resetOrgCounters
- Switched 4 `.query()` calls: getHealthDistribution, getFailuresByLayer, hasCriticalIssues, getBufferedEvents
- Commit: `6c2db1e`

## Verification Results

1. Zero bare `trpc.X.Y.mutate()`/`trpc.X.Y.query()` calls remain in any of the 4 files
2. All 4 files import and use `useTRPCClient`
3. `pnpm run build` succeeds with zero TypeScript errors (8704 modules transformed)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| ID           | Decision                                                              | Rationale                                                                                             |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TRPC-HOOK-01 | Keep both `useTRPC()` and `useTRPCClient()` in hooks with mixed usage | Hooks like useAlertRules need `useTRPC()` for `.queryOptions()` and `useTRPCClient()` for `.mutate()` |
| TRPC-HOOK-02 | Replace `useTRPC()` entirely in useWidgetHealthMetrics                | File only uses imperative calls, no need for proxy at all                                             |

## Call Sites Fixed (12 total)

| File                       | Method    | Router Path                        |
| -------------------------- | --------- | ---------------------------------- |
| useAlertRules.ts           | .mutate() | alertRules.upsert                  |
| useAlertRules.ts           | .mutate() | alertRules.delete                  |
| useAlertRules.ts           | .mutate() | alertRules.clearField              |
| useAlertRulesHistory.ts    | .mutate() | alertHistory.create                |
| useSiteLocationMutation.ts | .mutate() | sites.update                       |
| useWidgetHealthMetrics.ts  | .mutate() | widgetHealth.trackHealthChange     |
| useWidgetHealthMetrics.ts  | .mutate() | widgetHealth.flushHealthMetrics    |
| useWidgetHealthMetrics.ts  | .mutate() | widgetHealth.resetOrgCounters      |
| useWidgetHealthMetrics.ts  | .query()  | widgetHealth.getHealthDistribution |
| useWidgetHealthMetrics.ts  | .query()  | widgetHealth.getFailuresByLayer    |
| useWidgetHealthMetrics.ts  | .query()  | widgetHealth.hasCriticalIssues     |
| useWidgetHealthMetrics.ts  | .query()  | widgetHealth.getBufferedEvents     |

## Next Phase Readiness

Plan 47-02 and 47-03 cover the remaining call sites in pages/components. This plan clears the hook files, which are the most reused across the app.
