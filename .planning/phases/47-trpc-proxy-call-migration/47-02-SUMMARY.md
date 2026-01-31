---
phase: 47-trpc-proxy-call-migration
plan: 02
subsystem: frontend-trpc
tags: [trpc, vanilla-client, proxy-migration, billing, dashboard-layouts]
dependency-graph:
  requires: [46]
  provides: [TRPC-02-entity-layout-billing-migrated]
  affects: [47-03, 48]
tech-stack:
  added: []
  patterns: [useTRPCClient-vanilla-client-for-imperative-calls]
key-files:
  created: []
  modified:
    - src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts
    - src/components/billing/BillingTab.tsx
decisions:
  - id: TRPC-02-01
    summary: 'Direct rename trpc -> trpcClient for clarity'
    rationale: 'Matches pattern from 47-01; trpcClient clearly signals vanilla client usage'
metrics:
  duration: '2 minutes'
  completed: '2026-01-29'
---

# Phase 47 Plan 02: Feature File tRPC Migration (Entity Layout + Billing) Summary

**One-liner:** Migrated useEntityLayoutStorage (5 calls) and BillingTab (3 calls) from useTRPC() proxy to useTRPCClient() vanilla client for imperative .query()/.mutate() compatibility.

## What Was Done

### Task 1: Fix useEntityLayoutStorage.ts

- Replaced `import { useTRPC }` with `import { useTRPCClient }`
- Changed `const trpc = useTRPC()` to `const trpcClient = useTRPCClient()`
- Migrated 1 `.query()` call: `dashboardLayouts.list.query()`
- Migrated 4 `.mutate()` calls: `create`, `update`, `remove`, `setDefault`
- Commit: `fc8bd0d`

### Task 2: Fix BillingTab.tsx

- Replaced `import { useTRPC }` with `import { useTRPCClient }`
- Changed `const trpc = useTRPC()` to `const trpcClient = useTRPCClient()`
- Migrated 1 `.query()` call: `payments.getSubscription.query()`
- Migrated 2 `.mutate()` calls: `createCheckoutSession`, `createPortalSession`
- Commit: `b86b7e0`

## Verification Results

1. `grep 'useTRPC()' useEntityLayoutStorage.ts` -- zero matches (PASS)
2. `grep 'useTRPC()' BillingTab.tsx` -- zero matches (PASS)
3. `grep 'useTRPCClient' useEntityLayoutStorage.ts` -- 1 import + 1 usage (PASS)
4. `grep 'useTRPCClient' BillingTab.tsx` -- 1 import + 1 usage (PASS)
5. All `.query()` and `.mutate()` calls on `trpcClient` (PASS)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| #   | Hash    | Message                                                     |
| --- | ------- | ----------------------------------------------------------- |
| 1   | fc8bd0d | fix(47-02): migrate useEntityLayoutStorage to useTRPCClient |
| 2   | b86b7e0 | fix(47-02): migrate BillingTab to useTRPCClient             |

## Call Sites Migrated (8 total)

| File                      | Method    | Router Path                    |
| ------------------------- | --------- | ------------------------------ |
| useEntityLayoutStorage.ts | .query()  | dashboardLayouts.list          |
| useEntityLayoutStorage.ts | .mutate() | dashboardLayouts.create        |
| useEntityLayoutStorage.ts | .mutate() | dashboardLayouts.update        |
| useEntityLayoutStorage.ts | .mutate() | dashboardLayouts.remove        |
| useEntityLayoutStorage.ts | .mutate() | dashboardLayouts.setDefault    |
| BillingTab.tsx            | .query()  | payments.getSubscription       |
| BillingTab.tsx            | .mutate() | payments.createCheckoutSession |
| BillingTab.tsx            | .mutate() | payments.createPortalSession   |

## Next Phase Readiness

Plan 47-03 can proceed. Remaining files to migrate are listed in that plan.
