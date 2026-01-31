---
phase: 32-remaining-edge-function-migration
plan: 02
subsystem: reports
tags: [trpc, migration, reports, export]
dependency-graph:
  requires: [32-01]
  provides: [reports.export tRPC procedure]
  affects: [Reports, Inspector, ComplianceReportCard]
tech-stack:
  added: []
  patterns: [tRPC mutation for file download]
key-files:
  created:
    - backend/src/routers/reports.router.ts
  modified:
    - backend/src/trpc/router.ts
    - src/pages/Reports.tsx
    - src/pages/Inspector.tsx
    - src/components/reports/ComplianceReportCard.tsx
decisions:
  - id: '32-02-01'
    choice: 'Shared export mutation across all 3 components'
    rationale: 'Single tRPC procedure replaces 3 identical edge function calls'
metrics:
  duration: '~4m'
  completed: '2026-01-29'
---

# Phase 32 Plan 02: Reports Export Migration Summary

**One-liner:** Migrated 3 frontend files from export-temperature-logs edge function to shared tRPC reports.export procedure

## What Was Built

### Backend

1. **reports.router.ts** - New tRPC router with export procedure
   - Input: organizationId, startDate, endDate, reportType, format, siteId?, unitId?
   - Output: content, contentType, filename
   - Uses orgProcedure for authentication and organization context

2. **router.ts** - Registered reportsRouter in appRouter

### Frontend

3. **Reports.tsx** - Replaced supabase.functions.invoke with tRPC mutation
   - Added useEffectiveIdentity hook for organizationId
   - Added trpc.reports.export.useMutation with onSuccess file download
   - Changed from async function to synchronous mutate call
   - Replaced isExporting state with exportMutation.isPending

4. **Inspector.tsx** - Same migration pattern
   - Preserved inspector watermark in onSuccess callback
   - Uses organizationId from component state (supports token-based access)

5. **ComplianceReportCard.tsx** - Same migration pattern
   - Added useEffectiveIdentity hook
   - Removed supabase-placeholder import

## Key Changes

| File                     | Before                    | After                           |
| ------------------------ | ------------------------- | ------------------------------- |
| Reports.tsx              | supabase.functions.invoke | trpc.reports.export.useMutation |
| Inspector.tsx            | supabase.functions.invoke | trpc.reports.export.useMutation |
| ComplianceReportCard.tsx | supabase.functions.invoke | trpc.reports.export.useMutation |

## Decisions Made

1. **Shared mutation pattern** - All 3 components use identical tRPC mutation with file download in onSuccess callback

2. **Format mapping** - Frontend "pdf" maps to backend "html" format (edge function compatibility)

3. **Inspector watermark preserved** - Added in onSuccess callback rather than server-side

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] reports.router.ts exists with export procedure
- [x] Router registered in appRouter (`reports: reportsRouter`)
- [x] 0 supabase.functions.invoke calls for export-temperature-logs
- [x] Frontend builds without errors
- [x] All 3 files use trpc.reports.export.useMutation

## Commits

| Hash    | Message                                                       |
| ------- | ------------------------------------------------------------- |
| 4c681dc | feat(32-02): create reports tRPC router with export procedure |
| ed594f4 | feat(32-02): migrate frontend export calls to tRPC            |

## Next Phase Readiness

Ready for Phase 32 Plan 03 (if exists) or Phase 33.
