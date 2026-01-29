---
phase: 38
plan: 01
name: "tRPC Test Mock Pattern Fix"
subsystem: test-infrastructure
tags: [trpc, testing, vitest, tanstack-query, mocking]
dependency-graph:
  requires: []
  provides:
    - "Reusable tRPC mock utilities"
    - "Fixed useSites.test.tsx as reference"
    - "Documented mock pattern"
  affects:
    - "38-02 (remaining test file migrations)"
    - "39-43 (component migration phases)"
tech-stack:
  added: []
  patterns:
    - "queryOptions mock pattern for @trpc/tanstack-react-query"
    - "createQueryOptionsMock factory"
key-files:
  created:
    - src/test/trpc-test-utils.ts
  modified:
    - src/hooks/__tests__/useSites.test.tsx
    - src/test/setup.ts
decisions:
  - id: DEC-38-01-A
    title: "Use queryOptions mock pattern for tRPC"
    choice: "Mock queryOptions() returning { queryKey, queryFn } instead of useQuery"
    rationale: "@trpc/tanstack-react-query uses queryOptions pattern, not useQuery hooks"
metrics:
  duration: "~5 minutes"
  completed: "2026-01-29"
---

# Phase 38 Plan 01: tRPC Test Mock Pattern Fix Summary

**One-liner:** Created reusable tRPC mock utilities and fixed useSites.test.tsx demonstrating queryOptions pattern for subsequent migration.

## What Was Done

### Task 1: Create reusable tRPC mock utility
- Created `src/test/trpc-test-utils.ts` with:
  - `createQueryOptionsMock(data, options)` - Factory that returns properly structured queryOptions mock
  - `createProcedureMock(data, options)` - Shorthand for creating procedure objects with queryOptions
  - `createErrorMock(error, options)` - For testing error scenarios
  - `createMockTRPC(routers)` - Type-safe wrapper for complete mock structure

### Task 2: Fix useSites.test.tsx
- Migrated all 6 tests from broken `.useQuery` mock to `.queryOptions()` pattern
- All 6 tests now pass:
  - "fetches sites and units using tRPC"
  - "builds navigation tree structure"
  - "detects single site correctly"
  - "handles multiple sites"
  - "returns empty when organizationId is null"
  - "handles errors gracefully"

### Task 3: Document pattern and verify test suite
- Added comprehensive JSDoc to `src/test/setup.ts` explaining:
  - Why `.useQuery` mocks don't work
  - The correct `queryOptions()` pattern
  - Example mock setup code
- Ran full test suite to identify remaining failures

## Test Results After This Phase

| Category | Count |
|----------|-------|
| Test Files Passing | 8 |
| Test Files Failing | 2 |
| Tests Passing | 113 |
| Tests Failing | 32 |
| Tests Skipped | 12 |

## Remaining Test Failures

Two test files still have queryOptions/mutationOptions mock issues:

### 1. `src/hooks/__tests__/useAlerts.test.tsx` (11 failing tests)
Needs mocks for:
- `trpc.alerts.listByOrg.queryOptions`
- `trpc.alerts.acknowledge.mutationOptions`
- `trpc.alerts.resolve.mutationOptions`

### 2. `src/components/settings/__tests__/TTNCredentialsPanel.test.tsx` (21 failing tests)
Needs mocks for:
- `trpc.ttnSettings.getCredentials.queryOptions`
- Multiple mutation options (provision, startFresh, deepClean, getStatus)

## Pattern Reference

**Production code uses:**
```typescript
useQuery(trpc.router.procedure.queryOptions(input, opts))
useMutation(trpc.router.procedure.mutationOptions())
```

**Test mocks must provide:**
```typescript
mockUseTRPC.mockReturnValue({
  router: {
    procedure: {
      queryOptions: createQueryOptionsMock(mockData, { queryKey: [...] }),
      // For mutations:
      mutationOptions: vi.fn().mockReturnValue({
        mutationKey: [...],
        mutationFn: (input) => Promise.resolve(result)
      })
    }
  }
})
```

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 784ad5d | feat | Add reusable tRPC test mock utility |
| da88e0f | fix | Migrate useSites.test.tsx to queryOptions mock pattern |
| 388746c | docs | Document tRPC test mock pattern in setup.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- Pattern established and documented
- Remaining test files (useAlerts, TTNCredentialsPanel) identified
- These can be addressed in subsequent plans following the documented pattern
