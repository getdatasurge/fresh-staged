---
phase: 33-error-handling-ui-integration
plan: 03
subsystem: ui
tags: [react, error-boundary, trpc, gap-closure]

# Dependency graph
requires:
  - phase: 33-01
    provides: MigrationErrorBoundary component
  - phase: 33-02
    provides: isSupabaseMigrationError integration in UI components
provides:
  - MigrationErrorBoundary integrated into DashboardLayout render tree
  - Fixed tRPC pattern consistency across codebase
  - Human-verified app loads without crashes
affects: [phase-33-complete, error-handling, app-stability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - createTRPCContext from @trpc/tanstack-react-query for queryOptions pattern
    - MigrationErrorBoundary wrapping page content (not entire layout)

key-files:
  created: []
  modified:
    - src/components/DashboardLayout.tsx
    - src/lib/trpc.ts
    - src/App.tsx
    - src/pages/Dashboard.tsx
    - src/pages/Reports.tsx
    - src/pages/Units.tsx
    - (17 additional files migrated to queryOptions pattern)

key-decisions:
  - "Use createTRPCContext (queryOptions pattern) since ~80 files use this vs ~20 using direct hooks"
  - "MigrationErrorBoundary wraps {children} only, preserving header/sidebar on errors"
  - "All tRPC calls standardized to trpc.router.procedure.queryOptions()/mutationOptions()"

patterns-established:
  - "tRPC calls: use useQuery(trpc.x.queryOptions()) not trpc.x.useQuery()"
  - "tRPC mutations: use useMutation(trpc.x.mutationOptions()) not trpc.x.useMutation()"

# Metrics
duration: 45min
completed: 2026-01-29
---

# Phase 33 Plan 03: Gap Closure Summary

**Integrated MigrationErrorBoundary into DashboardLayout and fixed tRPC pattern inconsistencies causing app crashes**

## Performance

- **Duration:** 45 min
- **Started:** 2026-01-29T09:00:00Z
- **Completed:** 2026-01-29T09:45:00Z
- **Tasks:** 2/2
- **Files modified:** 20+

## Accomplishments
- Integrated MigrationErrorBoundary into DashboardLayout render tree
- Discovered and fixed tRPC pattern inconsistency causing `contextMap[utilName] is not a function` crash
- Standardized src/lib/trpc.ts to use createTRPCContext from @trpc/tanstack-react-query
- Fixed TRPCProvider props in App.tsx (trpcClient, not client)
- Migrated 20+ files from direct hook pattern (.useQuery()) to queryOptions pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate MigrationErrorBoundary into DashboardLayout** - Completed
2. **Task 2: Human verification** - Approved after tRPC pattern fix

## Critical Bug Fix: tRPC Pattern Inconsistency

During human verification, app crashed with:
```
contextMap[utilName] is not a function
```

**Root Cause:** The codebase had evolved to use the queryOptions pattern:
```typescript
useQuery(trpc.organizations.stats.queryOptions({ organizationId }))
```

But src/lib/trpc.ts was using `createTRPCReact` which provides direct hooks:
```typescript
trpc.organizations.stats.useQuery({ organizationId })
```

**Fix:** Changed src/lib/trpc.ts to use `createTRPCContext` from `@trpc/tanstack-react-query`:
```typescript
import { createTRPCContext } from '@trpc/tanstack-react-query'
const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()
```

This provides the `.queryOptions()` and `.mutationOptions()` methods used throughout the codebase.

## Files Modified

**Core tRPC fixes:**
- `src/lib/trpc.ts` - Changed to createTRPCContext from @trpc/tanstack-react-query
- `src/App.tsx` - Fixed TRPCProvider prop from `client` to `trpcClient`

**Pages migrated to queryOptions pattern:**
- src/pages/Dashboard.tsx
- src/pages/Inspector.tsx
- src/pages/AreaDetail.tsx
- src/pages/Areas.tsx
- src/pages/DataMaintenance.tsx
- src/pages/EventHistory.tsx
- src/pages/SiteDetail.tsx
- src/pages/UnitDetail.tsx
- src/pages/platform/PlatformAuditLog.tsx
- src/pages/platform/PlatformDeveloperTools.tsx
- src/pages/platform/PlatformOrganizationDetail.tsx
- src/pages/platform/PlatformOrganizations.tsx
- src/pages/platform/PlatformUserDetail.tsx
- src/pages/platform/PlatformUsers.tsx

**Hooks migrated:**
- src/hooks/useAlertRules.ts
- src/hooks/useAlertRulesHistory.ts
- src/hooks/useUnitAlerts.ts

**Component:**
- src/components/reports/ComplianceReportCard.tsx

**Error boundary integration:**
- src/components/DashboardLayout.tsx

## Decisions Made
- **Use createTRPCContext pattern:** Chose to standardize on queryOptions pattern since majority of codebase (~80 files) already uses it
- **Wrap children only:** MigrationErrorBoundary wraps page content, not entire layout, so header/sidebar remain functional during errors

## Issues Encountered
- Initial tRPC pattern mismatch caused app crashes
- Required migration of ~20 files using outdated direct hook pattern
- Solution: Standardized entire codebase to queryOptions pattern

## User Verification
User tested in browser:
- App loads without crashes ✓
- Navigation works ✓
- Only expected errors: `ERR_CONNECTION_REFUSED` (backend not running) ✓
- Console shows `[supabase-placeholder] Supabase calls are disabled` as expected ✓

## Phase 33 Complete

All three plans completed:
- 33-01: Error handling infrastructure (MigrationErrorBoundary, errorHandler.ts)
- 33-02: UI component migration error wiring
- 33-03: Gap closure (boundary integration + tRPC pattern fix)

---
*Phase: 33-error-handling-ui-integration*
*Completed: 2026-01-29*
