# Phase 54: Frontend Test Restoration - Research

**Researched:** 2026-01-30
**Domain:** Frontend testing (Vitest + React Testing Library + TanStack Query mocking)
**Confidence:** HIGH

## Summary

Phase 54 has two distinct workstreams: (1) expanding TTNCredentialsPanel test coverage from 5 to ~21 tests, and (2) fixing the `describe.skip` block in widgetHealthStates.test.ts containing 12 skipped tests.

The TTNCredentialsPanel currently has 5 passing tests covering only basic rendering. The test file header explicitly documents deferred scenarios: "Full async data loading, mutations, error handling across states." The component is complex (500+ lines, 3 mutations, 2 queries with manual refetch, multiple dialog states) and currently uses a `vi.mock('@tanstack/react-query')` approach that replaces the real useQuery/useMutation with stubs. To test async scenarios, this mock strategy must be replaced with the project's established pattern: `createQueryOptionsMock` from `@/test/trpc-test-utils.ts` with a `mockUseTRPC` function-based mock.

The widgetHealthStates.test.ts `describe.skip('Widget Health Metrics')` block contains 12 tests that call deprecated functions from `widgetHealthMetrics.ts`. These functions are all stub implementations that log deprecation warnings and return zeroed defaults. The tests will trivially fail because `trackHealthChange()` is a no-op, `getHealthDistribution()` always returns all zeros, and `hasCriticalIssues()` always returns false. The fix is either: (a) delete these tests since the functions are deprecated stubs, or (b) restore the implementations to match what the tests expect. Given Phase 52-53 precedent of deleting duplicate/obsolete tests, option (a) is strongly recommended.

**Primary recommendation:** Restructure TTNCredentialsPanel tests to use the established `mockUseTRPC` + `createQueryOptionsMock` pattern (matching useSites/useAlerts test files), and delete the 12 deprecated-function tests from widgetHealthStates.test.ts.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library                | Version      | Purpose                       | Why Standard                                                           |
| ---------------------- | ------------ | ----------------------------- | ---------------------------------------------------------------------- |
| vitest                 | 2.1.9        | Test runner                   | Configured in vitest.config.ts, used across all 10 frontend test files |
| @testing-library/react | (installed)  | Component rendering + queries | Standard for React component tests                                     |
| @tanstack/react-query  | (installed)  | Data fetching layer           | All components use useQuery/useMutation                                |
| happy-dom              | (configured) | DOM environment               | Set in vitest.config.ts                                                |

### Supporting

| Library                     | Version     | Purpose               | When to Use                                       |
| --------------------------- | ----------- | --------------------- | ------------------------------------------------- |
| @testing-library/jest-dom   | (installed) | Extended DOM matchers | Imported in src/test/setup.ts, available globally |
| src/test/trpc-test-utils.ts | N/A         | tRPC mock factories   | All tests that mock tRPC procedures               |

### Not Needed

| Instead of                | Could Use      | Tradeoff                                                                    |
| ------------------------- | -------------- | --------------------------------------------------------------------------- |
| msw (Mock Service Worker) | Direct vi.mock | Project already uses vi.mock pattern consistently; no need to introduce msw |
| jest                      | vitest         | Already on vitest, no migration needed                                      |

**Installation:** No new packages needed. All testing infrastructure is already in place.

## Architecture Patterns

### Recommended Test File Structure

```
src/
  components/settings/__tests__/
    TTNCredentialsPanel.test.tsx    # Component integration test
  features/dashboard-layout/__tests__/
    widgetHealthStates.test.ts      # Pure logic unit tests
  hooks/__tests__/
    useAlerts.test.tsx              # Hook tests (established pattern)
    useSites.test.tsx               # Hook tests (established pattern)
  test/
    setup.ts                        # Global test setup (imports jest-dom)
    trpc-test-utils.ts              # tRPC mock factories
```

### Pattern 1: tRPC Mock Pattern (ESTABLISHED - Use This)

**What:** Mock `useTRPC` as a vi.fn() and configure per-test return values using `createQueryOptionsMock`
**When to use:** Any test that renders components using tRPC hooks
**Source:** src/hooks/**tests**/useSites.test.tsx, src/hooks/**tests**/useAlerts.test.tsx

```typescript
import { createQueryOptionsMock } from '@/test/trpc-test-utils';

const mockUseTRPC = vi.fn();

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC(),
}));

beforeEach(() => {
  mockUseTRPC.mockReturnValue({
    ttnSettings: {
      getCredentials: {
        queryOptions: createQueryOptionsMock(mockCredentialsData, {
          queryKey: ['ttnSettings', 'getCredentials', { organizationId: 'test-org' }],
        }),
      },
      provision: {
        mutationOptions: vi.fn().mockReturnValue({
          mutationKey: ['ttnSettings', 'provision'],
          mutationFn: mockProvisionFn,
        }),
      },
    },
  });
});
```

### Pattern 2: Mutation Testing Pattern (ESTABLISHED)

**What:** Mock mutationOptions with controllable mutationFn
**When to use:** Testing mutation success/failure/loading states
**Source:** src/hooks/**tests**/useAlerts.test.tsx (useAcknowledgeAlert, useResolveAlert)

```typescript
const mockMutationFn = vi.fn().mockResolvedValue({ success: true });

mockUseTRPC.mockReturnValue({
  ttnSettings: {
    provision: {
      mutationOptions: vi.fn().mockReturnValue({
        mutationKey: ['ttnSettings', 'provision'],
        mutationFn: mockMutationFn,
      }),
    },
  },
});

// Test success
await act(async () => {
  await result.current.mutateAsync({ organizationId: 'test-org', action: 'retry' });
});
expect(mockMutationFn).toHaveBeenCalledWith(
  expect.objectContaining({ organizationId: 'test-org' }),
  expect.anything(),
);

// Test failure
const mockFailFn = vi.fn().mockRejectedValue(new Error('API Error'));
```

### Pattern 3: Component Rendering with QueryClientProvider (ESTABLISHED)

**What:** Wrap component in QueryClientProvider for tests
**When to use:** Testing React components that use TanStack Query hooks
**Source:** src/components/settings/**tests**/TTNCredentialsPanel.test.tsx (existing)

```typescript
let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

render(
  <QueryClientProvider client={queryClient}>
    <TTNCredentialsPanel organizationId="test-org" />
  </QueryClientProvider>
)
```

### Anti-Patterns to Avoid

- **Mocking the entire @tanstack/react-query module:** The current TTNCredentialsPanel test replaces useQuery/useMutation globally. This prevents testing async behavior because refetch() is a never-resolving stub. Use the mockUseTRPC pattern instead.
- **Testing deprecated stub functions:** The widgetHealthMetrics.ts functions are all no-ops. Writing tests for them produces false passes (testing that stubs return stubs).
- **Over-mocking:** Don't mock what you can test through the real QueryClient. Let TanStack Query's real useQuery/useMutation run, and control behavior through the mock tRPC queryFn/mutationFn.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem            | Don't Build            | Use Instead                                                   | Why                                                     |
| ------------------ | ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| tRPC query mocking | Manual vi.fn chains    | `createQueryOptionsMock()` from trpc-test-utils.ts            | Handles queryKey, queryFn, enabled, staleTime correctly |
| tRPC error mocking | Manual rejection setup | `createErrorMock()` from trpc-test-utils.ts                   | Handles error wrapping correctly                        |
| Query client setup | Custom providers       | QueryClient with `retry: false` + QueryClientProvider wrapper | Standard pattern used in all 4 hook test files          |
| DOM assertions     | Manual querySelector   | @testing-library/jest-dom matchers (toBeInTheDocument, etc.)  | Already imported in setup.ts                            |

**Key insight:** The project has a well-established test mock infrastructure in `trpc-test-utils.ts`. The TTNCredentialsPanel test predates this infrastructure and uses a less capable approach. The fix is to adopt the newer pattern.

## Common Pitfalls

### Pitfall 1: TTNCredentialsPanel Uses Manual refetch() Pattern

**What goes wrong:** The component calls `enabled: false` on its queries and uses `refetch()` manually in a `useCallback`. Standard mock patterns that set `enabled: true` won't trigger the component's data flow correctly.
**Why it happens:** Component was designed for manual fetch control (refetch on mount, on org change, after mutations).
**How to avoid:** Mock useQuery to return the correct data directly and ensure refetch returns a resolved promise with the expected data shape. The component's fetchCredentials function calls `getCredentialsRefetchRef.current()` and processes `result.data`.
**Warning signs:** Tests pass but component shows loading skeleton forever (refetch never resolves).

### Pitfall 2: Deprecated widgetHealthMetrics Functions Always Return Defaults

**What goes wrong:** If you un-skip the describe.skip block, all 12 tests will fail because:

- `trackHealthChange()` is a no-op (just logs a warning)
- `getHealthDistribution()` always returns all zeros
- `getBufferedEvents()` always returns empty array
- `hasCriticalIssues()` always returns false
- `getFailuresByLayer()` always returns all zeros
  **Why it happens:** These functions were deprecated in favor of `useWidgetHealthMetrics` hook (which calls tRPC endpoints). The old module-level functions were gutted.
  **How to avoid:** Delete the skipped tests (they test deprecated no-op stubs). The 21 non-skipped tests in the same file (Schema Validation, Payload Type Inference, Schema Registry, Widget Contracts, Out of Order Detection) all pass and test real logic.
  **Warning signs:** Tests asserting `distribution.healthy === 1` will fail because `getHealthDistribution` hardcodes return of all zeros.

### Pitfall 3: Toast Mock Must Use vi.hoisted()

**What goes wrong:** Toast assertions fail because mock reference is lost.
**Why it happens:** Vitest hoists vi.mock() calls, but regular variable declarations happen after. Using `vi.hoisted()` ensures the mock variable is available when vi.mock() runs.
**How to avoid:** Use the pattern already in TTNCredentialsPanel.test.tsx: `const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))`
**Warning signs:** `toastMock.success` is `undefined` or a different fn than what the component calls.

### Pitfall 4: Component Has Many State Branches

**What goes wrong:** Trying to test every UI state (isLoading, fetchError, credentials present/missing, provisioning status variants, dialog states) leads to an explosion of test scenarios.
**Why it happens:** TTNCredentialsPanel has ~15 state variables and multiple conditional render paths.
**How to avoid:** Focus on the ~21 test target. Group by behavior domain: initial rendering (existing 5), data loading (3-4), mutation actions (4-5), error handling (3-4), credential display (3-4).

### Pitfall 5: The enabled:false + refetch Pattern Creates Test Isolation Challenges

**What goes wrong:** The component comment on line 7-8 says: "Full test coverage for all scenarios is deferred due to test isolation challenges inherent in the component's design."
**Why it happens:** The component uses `enabled: false` queries with manual `refetch()` via refs, which means the standard TanStack Query test patterns (render, waitFor data) don't work out of the box.
**How to avoid:** Instead of fighting the component's design, mock `useQuery` to return different states per test (data loaded, error, loading). Control refetch behavior by returning a resolved/rejected promise from the mock. The key is that `useQuery` mock must return `{ data, error, isLoading, isPending, refetch }` and `refetch` must return `Promise.resolve({ data, error })` matching what the component expects.

## Code Examples

### Example 1: Restructured TTNCredentialsPanel Test Setup (Replacing Current Pattern)

```typescript
// Source: Derived from src/hooks/__tests__/useAlerts.test.tsx pattern
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@stackframe/react', () => ({
  useUser: vi.fn(() => ({
    getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
  })),
}))

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/components/ttn/TTNDiagnosticsPanel', () => ({
  TTNDiagnosticsPanel: () => <div data-testid="diagnostics-panel" />,
}))

// Key change: mock at the tRPC level, NOT at the react-query level
const mockUseTRPC = vi.fn()
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC(),
}))

// Now useQuery/useMutation are REAL - data flows through mock queryFn/mutationFn
```

### Example 2: Testing Data Loaded State

```typescript
it('displays credentials when data loads successfully', async () => {
  const mockCredentials = {
    organization_name: 'Test Org',
    ttn_application_id: 'test-app',
    provisioning_status: 'ready',
    // ... other fields
  }

  mockUseTRPC.mockReturnValue({
    ttnSettings: {
      getCredentials: {
        queryOptions: vi.fn().mockReturnValue({
          queryKey: ['ttnSettings', 'getCredentials'],
          queryFn: () => Promise.resolve(mockCredentials),
          enabled: false,
        }),
      },
      getStatus: {
        queryOptions: vi.fn().mockReturnValue({
          queryKey: ['ttnSettings', 'getStatus'],
          queryFn: () => Promise.resolve(null),
          enabled: false,
        }),
      },
      provision: {
        mutationOptions: vi.fn().mockReturnValue({
          mutationKey: ['ttnSettings', 'provision'],
          mutationFn: vi.fn(),
        }),
      },
      startFresh: {
        mutationOptions: vi.fn().mockReturnValue({
          mutationKey: ['ttnSettings', 'startFresh'],
          mutationFn: vi.fn(),
        }),
      },
      deepClean: {
        mutationOptions: vi.fn().mockReturnValue({
          mutationKey: ['ttnSettings', 'deepClean'],
          mutationFn: vi.fn(),
        }),
      },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <TTNCredentialsPanel organizationId="test-org" />
    </QueryClientProvider>
  )

  // Component calls refetch() on mount - need to handle async
  await waitFor(() => {
    expect(screen.getByText('TTN Credentials')).toBeInTheDocument()
  })
})
```

### Example 3: Testing Mutation Error (Toast Verification)

```typescript
it('shows error toast when provision mutation fails', async () => {
  const mockProvisionFn = vi.fn().mockRejectedValue(new Error('Provisioning failed'));

  // Setup tRPC mock with failing mutation
  mockUseTRPC.mockReturnValue({
    ttnSettings: {
      // ... query mocks ...
      provision: {
        mutationOptions: vi.fn().mockReturnValue({
          mutationKey: ['ttnSettings', 'provision'],
          mutationFn: mockProvisionFn,
        }),
      },
    },
  });

  // Render, trigger mutation, verify toast
  expect(toastMock.error).toHaveBeenCalled();
});
```

## State of the Art

| Old Approach                                                      | Current Approach                                                | When Changed             | Impact                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| `vi.mock('@tanstack/react-query')` replacing useQuery/useMutation | Mock at tRPC level via `mockUseTRPC` + `createQueryOptionsMock` | During v2.4 Tech Debt    | All newer tests use the tRPC-level mock pattern      |
| Module-level health metric functions (widgetHealthMetrics.ts)     | `useWidgetHealthMetrics` hook via tRPC                          | During feature evolution | Old module functions deprecated, all return defaults |

**Deprecated/outdated:**

- `widgetHealthMetrics.ts` functions (trackHealthChange, getHealthDistribution, etc.): All deprecated stubs, replaced by useWidgetHealthMetrics hook
- Direct `vi.mock('@tanstack/react-query')` pattern: Works but prevents testing async flows; newer mockUseTRPC pattern is preferred

## Critical Analysis: The 12 Skipped Tests

The `describe.skip('Widget Health Metrics')` block at line 161 of widgetHealthStates.test.ts contains 12 tests in 4 groups:

| Group                        | Tests | What They Test                                                | Why They Will Fail                                                     |
| ---------------------------- | ----- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Health Tracking              | 3     | trackHealthChange + getHealthDistribution + getBufferedEvents | All functions are no-op stubs returning zeroed defaults                |
| Failure Layer Classification | 4     | trackHealthChange + getFailuresByLayer                        | Same: trackHealthChange is no-op, getFailuresByLayer returns all zeros |
| Critical Issues Detection    | 3     | trackHealthChange + hasCriticalIssues                         | hasCriticalIssues always returns false                                 |
| State Transitions            | 2     | trackHealthChange + getHealthDistribution sequences           | getHealthDistribution always returns all zeros                         |

**Recommendation:** DELETE these 12 tests. They test deprecated no-op stubs. This matches Phase 52-53 precedent where duplicate/obsolete tests were deleted rather than artificially resurrected. The 21 passing tests in the same file test real runtime logic (schema validation, payload inference, schema registry, contracts, timestamp detection).

## TTNCredentialsPanel Test Gap Analysis

### Current: 5 tests (all passing)

| Test                                       | What It Covers               |
| ------------------------------------------ | ---------------------------- |
| Shows "No organization selected" when null | Null org guard               |
| Renders loading skeleton                   | Initial loading state        |
| Renders without crashing                   | Smoke test                   |
| Renders card header                        | Title text presence          |
| Renders card description                   | Description element presence |

### Target: ~21 tests (16 new tests needed)

Recommended additional test groups:

| Group               | Suggested Tests                                                                                                                           | Count  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Data Loading States | Credentials loaded and displayed, loading skeleton while fetching, fetch error banner shown, retry button works                           | 4      |
| Credential Display  | Shows provisioned badge when all credentials present, shows partial badge, shows not configured badge, displays secret field last4 values | 4      |
| Mutation Actions    | Retry provisioning success toast, retry provisioning error toast, start fresh flow (dialog confirm), deep clean flow (dialog confirm)     | 4      |
| Error Handling      | Session expired handling, fetch error with toast, unowned app error detection, structured error response handling                         | 4      |
| **Total new**       |                                                                                                                                           | **16** |

### Key Technical Challenge

The component's `fetchCredentials` callback uses `enabled: false` queries with manual `refetch()`. The current test file mocks `@tanstack/react-query` globally to make useQuery return a never-resolving refetch. This approach must be replaced to test async scenarios.

**Two viable approaches:**

1. **Remove the react-query mock entirely:** Let real useQuery/useMutation run, control data through mock queryFn/mutationFn in the tRPC mock. This requires the component's `refetch()` call to trigger the mock queryFn. The challenge: with `enabled: false`, TanStack Query may not call queryFn until refetch() is invoked, and the component's useEffect triggers refetch() on mount. This should work with `waitFor`.

2. **Keep a targeted useQuery mock but make it configurable:** Instead of returning a never-resolving refetch, have the mock return configurable data/error/loading states per test. This is more predictable but less realistic.

**Recommendation:** Approach 1 (remove react-query mock) is cleaner and matches the established project pattern. If it proves too brittle due to the `enabled: false` + manual refetch pattern, fall back to Approach 2.

## Open Questions

Things that couldn't be fully resolved:

1. **Will removing the @tanstack/react-query mock break the component's refetch flow in tests?**
   - What we know: The component calls `refetch()` in a useEffect on mount. With real useQuery and `enabled: false`, refetch() should trigger the mock queryFn and return the result.
   - What's unclear: Whether TanStack Query's refetch() with `enabled: false` works correctly in happy-dom environment without additional setup.
   - Recommendation: Try Approach 1 first. If refetch doesn't trigger queryFn correctly, use a targeted useQuery mock that returns configurable results per test.

2. **Should userEvent be added for button click testing?**
   - What we know: The component has buttons (Retry Provisioning, Start Fresh, Deep Clean) that trigger mutations. Testing these requires click simulation.
   - What's unclear: Whether @testing-library/user-event is already installed (it's commonly bundled with RTL).
   - Recommendation: Check if `userEvent` is available. If not, use `fireEvent.click()` from @testing-library/react which is definitely available.

3. **Exact test count for "~21"**
   - What we know: Current 5 + 16 suggested = 21 exactly. But some scenarios may be redundant or need splitting.
   - Recommendation: Aim for 18-24 tests. The ~21 target is approximate.

## Sources

### Primary (HIGH confidence)

- `src/components/settings/__tests__/TTNCredentialsPanel.test.tsx` - Read in full (155 lines, 5 tests)
- `src/features/dashboard-layout/__tests__/widgetHealthStates.test.ts` - Read in full (511 lines, 33 total tests, 12 skipped)
- `src/lib/observability/widgetHealthMetrics.ts` - Read in full (122 lines, all functions are deprecated stubs)
- `src/test/trpc-test-utils.ts` - Read in full (184 lines, all mock utilities documented)
- `src/test/setup.ts` - Read (68 lines, documents tRPC mock pattern)
- `src/hooks/__tests__/useSites.test.tsx` - Read (200+ lines, established test pattern)
- `src/hooks/__tests__/useAlerts.test.tsx` - Read (289+ lines, mutation testing pattern)
- `src/hooks/__tests__/useOrganizations.test.tsx` - Read (100+ lines, query mock pattern)
- `src/components/settings/TTNCredentialsPanel.tsx` - Read (500+ lines, component under test)
- `vitest.config.ts` - Read (19 lines, happy-dom environment, setup file)
- `pnpm test` execution output - 10 files pass, 129 passing, 12 skipped

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` - Phase 54 requirements FE-01, FE-02, FE-03
- `.planning/STATE.md` - Phase 52-53 precedent on deleting obsolete tests

### Tertiary (LOW confidence)

- None - all findings verified from source code

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Read vitest.config.ts, setup.ts, all existing test files
- Architecture: HIGH - Analyzed 4 passing test files to extract established patterns
- Pitfalls: HIGH - Traced component source code to understand refetch pattern; read deprecated module to confirm stubs
- Widget Health Skip Analysis: HIGH - Read both the test file and the source module, confirmed functions are no-op stubs

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (stable codebase, no moving targets)
