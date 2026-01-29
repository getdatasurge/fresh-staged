---
phase: 47-trpc-proxy-call-migration
plan: 03
subsystem: frontend-trpc
tags: [trpc, proxy-migration, useTRPCClient, v11]
depends_on:
  requires: ["47-01", "47-02"]
  provides: ["complete-trpc-proxy-migration", "zero-proxy-misuse"]
  affects: ["48-production-redeploy"]
tech-stack:
  added: []
  patterns: ["useTRPCClient-for-imperative-calls", "useTRPC-for-queryOptions-mutationOptions"]
key-files:
  created: []
  modified:
    - src/pages/Inspector.tsx
    - src/pages/PilotSetup.tsx
    - src/features/dashboard-layout/widgets/SiteAlertsSummaryWidget.tsx
    - src/features/dashboard-layout/widgets/AlertHistoryWidget.tsx
decisions: []
metrics:
  duration: "3 minutes"
  completed: "2026-01-29"
---

# Phase 47 Plan 03: Remaining Page/Widget tRPC Proxy Call Migration Summary

**One-liner:** Migrated final 4 files (Inspector, PilotSetup, 2 widgets) from proxy .mutate()/.query() to useTRPCClient, achieving zero proxy misuse across entire codebase.

## What Was Done

### Task 1: Fix .mutate()/.query() calls in 4 files

**Inspector.tsx** (1 .mutate() + 4 .query() calls):
- Added `useTRPCClient` import alongside existing `useTRPC`
- Added `const trpcClient = useTRPCClient()` alongside existing `const trpc = useTRPC()`
- Migrated `trpc.inspector.validateSession.mutate()` to `trpcClient`
- Migrated 4 query calls: `checkUserAccess`, `getOrgData`, `getUnits`, `getInspectionData` to `trpcClient`
- Preserved `trpc.reports.export.mutationOptions()` on proxy (correct pattern)

**PilotSetup.tsx** (2 .query() calls):
- Added `useTRPCClient` import alongside existing `useTRPC`
- Added `const trpcClient = useTRPCClient()`
- Migrated `trpc.sites.list.query()` and `trpc.organizations.stats.query()` to `trpcClient`
- Preserved `trpc.pilotFeedback.upsert.mutationOptions()` on proxy (correct pattern)

**SiteAlertsSummaryWidget.tsx** (1 .query() call):
- Replaced `useTRPC` import with `useTRPCClient` (no proxy patterns needed)
- Changed `const trpc = useTRPC()` to `const trpcClient = useTRPCClient()`
- Migrated `trpc.alerts.list.query()` to `trpcClient`
- Updated useEffect dependency array

**AlertHistoryWidget.tsx** (1 .query() call):
- Replaced `useTRPC` import with `useTRPCClient` (no proxy patterns needed)
- Changed `const trpc = useTRPC()` to `const trpcClient = useTRPCClient()`
- Migrated `trpc.alerts.list.query()` to `trpcClient`
- Updated useEffect dependency array

### Task 2: Full codebase verification

- **Zero `.mutate()` proxy misuse**: 2 grep hits are false positives (1 JSDoc comment in useAuditedWrite.ts, 1 vanilla client in eventLogger.ts)
- **Zero `.query()` proxy misuse**: grep returns no matches
- **239 correct proxy usages** preserved across 80 files (`.queryOptions()`/`.mutationOptions()`)
- **105 `useTRPCClient` occurrences** across 38 files
- **`pnpm run build` succeeds** with zero errors

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c177d25 | feat(47-03): migrate remaining page/widget files to useTRPCClient |

## Phase 47 Completion Status

All 3 plans in phase 47 are now complete:
- **47-01**: Hook file migrations (useAlertRules, useAlertRulesHistory, useOfflineSync, useTTNApiKey, useUnitAlerts)
- **47-02**: Page file migrations (Dashboard, Areas, AreaDetail, SiteDetail, Units, DataMaintenance, EventHistory, Onboarding, PlatformAuditLog, PlatformDeveloperTools, PlatformOrganizationDetail, PlatformOrganizations, PlatformUserDetail, PlatformUsers, ComplianceReportCard, TTNCredentialsPanel)
- **47-03**: Remaining page/widget migrations (Inspector, PilotSetup, SiteAlertsSummaryWidget, AlertHistoryWidget) + full codebase verification

**Root cause eliminated**: The `TypeError: e[i] is not a function` caused by `.mutate()`/`.query()` on the tRPC v11 proxy is now fully resolved across the entire codebase.

## Next Phase Readiness

Phase 48 (Production Redeploy & Verification) is unblocked. The frontend build succeeds and all proxy misuse patterns are eliminated.
