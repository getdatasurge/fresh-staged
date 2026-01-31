# Phase 55: Test Suite Health Validation - Research

**Researched:** 2026-01-30
**Domain:** Vitest test suite validation (backend + frontend)
**Confidence:** HIGH

## Summary

Phase 55 is the final validation gate of the v2.9 QA milestone. Phases 52-54 did the heavy lifting of eliminating skipped tests. This research ran both test suites to determine their current state.

**Frontend**: CLEAN. All 150 tests across 10 files pass. Zero skipped tests. Exit code 0.

**Backend**: 10 FAILURES in 1 file. 56 test files total, 55 pass, 1 fails (`reading-ingestion.service.test.ts`). 1246 of 1256 tests pass. The 10 failures all share a single root cause: the `vi.mock` for the `db` client uses nested `vi.fn()` chain mocks, and `vi.resetAllMocks()` in `afterEach` destroys the mock implementations, causing `db.select()` to return `undefined` instead of the expected `{ from: ... }` chain object. This is a well-known Vitest/Jest pitfall.

Zero `.skip`, `.todo`, `xit`, `xdescribe`, `xtest`, `skipIf`, or `runIf` patterns exist in either codebase.

**Primary recommendation:** Fix the 10 backend test failures by replacing `vi.resetAllMocks()` with `vi.clearAllMocks()` in `reading-ingestion.service.test.ts`, then re-run both suites to confirm zero failures and zero skips.

## Standard Stack

### Core

| Library                   | Version | Purpose                    | Why Standard                             |
| ------------------------- | ------- | -------------------------- | ---------------------------------------- |
| vitest                    | ^4.0.18 | Backend test runner        | Configured in `backend/vitest.config.ts` |
| vitest                    | ^2.1.8  | Frontend test runner       | Configured in `vitest.config.ts` (root)  |
| happy-dom                 | ^20.4.0 | Frontend DOM environment   | Configured as `environment: 'happy-dom'` |
| @testing-library/react    | ^16.3.1 | Frontend component testing | Used in `.tsx` test files                |
| @testing-library/jest-dom | ^6.9.1  | DOM matchers               | Extended matchers for assertions         |

### Test Infrastructure

| Component       | Location                   | Details                                                                                |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Backend config  | `backend/vitest.config.ts` | `environment: 'node'`, `include: ['tests/**/*.test.ts']`, timeout 10s, hookTimeout 30s |
| Frontend config | `vitest.config.ts`         | `environment: 'happy-dom'`, `include: ['src/**/*.{test,spec}.{ts,tsx}']`               |
| Backend setup   | `backend/tests/setup.ts`   | Mocks for BullMQ/Redis                                                                 |
| Frontend setup  | `src/test/setup.ts`        | tRPC mock patterns documentation                                                       |

### Commands

```bash
# Backend tests
cd backend && npx vitest run

# Frontend tests (from project root)
npx vitest run

# Equivalently via pnpm
cd backend && pnpm test
pnpm test  # from root
```

## Architecture Patterns

### Current Test Suite State (as of 2026-01-30)

#### Backend: `backend/`

```
Test Files:  1 failed | 55 passed (56 total)
Tests:       10 failed | 1246 passed (1256 total)
Duration:    ~8s
```

**56 test files across:**

```
backend/tests/
  services/     (19 files - service unit tests)
  trpc/         (17 files - tRPC router tests)
  api/          (11 files - REST API tests)
  workers/      (1 file - worker tests)
  middleware/   (1 file - middleware tests)
  auth.test.ts  (1 file - auth tests)
  rbac.test.ts  (1 file - RBAC tests)
```

#### Frontend: `src/`

```
Test Files:  10 passed (10 total)
Tests:       150 passed (150 total)
Duration:    ~2.5s
```

**10 test files across:**

```
src/
  features/dashboard-layout/__tests__/  (3 files: widgetHealthStates, payloadClassification, layoutValidation)
  lib/actions/                          (2 files: gatewayEligibility, sensorEligibility)
  lib/                                  (1 file: orgScopedInvalidation)
  hooks/__tests__/                      (3 files: useAlerts, useOrganizations, useSites)
  components/settings/__tests__/        (1 file: TTNCredentialsPanel)
```

### Pattern: Vitest Mock Lifecycle

The backend tests use this pattern:

```typescript
// Module-level: vi.mock sets up factory
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => ...) })) })),
    })),
  },
}));

// Test-level lifecycle
beforeEach(() => { vi.clearAllMocks(); });  // Clears call counts, keeps implementations
afterEach(() => { vi.resetAllMocks(); });   // DESTROYS implementations - THE BUG
```

### Anti-Patterns to Avoid

- **`vi.resetAllMocks()` with module-level `vi.mock` factories:** `resetAllMocks()` clears mock implementations set by factory functions. Use `clearAllMocks()` instead (which only resets call history, not implementations). Or re-setup the mock implementations in `beforeEach`.

## Don't Hand-Roll

| Problem               | Don't Build             | Use Instead                                                                         | Why                                         |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| Finding skipped tests | Manual grep for `.skip` | `grep -rn '\.skip\|\.todo\|xdescribe\|xit\|xtest\|skipIf\|runIf'` across both trees | Comprehensive check for all skip mechanisms |
| Verifying clean exit  | Manual inspection       | Check process exit code: `pnpm test; echo "exit: $?"`                               | Exit code 0 = all pass                      |
| Counting test totals  | Parsing output manually | Vitest summary line: `Tests: X passed (Y)`                                          | Built-in summary                            |

## Common Pitfalls

### Pitfall 1: `vi.resetAllMocks()` Destroys Module-Level Mock Implementations

**What goes wrong:** `vi.mock()` factories create mock implementations once at module load. `vi.resetAllMocks()` in `afterEach` removes those implementations, so subsequent tests get `undefined` return values.
**Why it happens:** `resetAllMocks()` clears both call history AND implementations. Developers confuse it with `clearAllMocks()` which only clears call history.
**How to avoid:** Use `vi.clearAllMocks()` in `afterEach` instead of `vi.resetAllMocks()`, or re-setup mock implementations in `beforeEach`.
**Warning signs:** Tests pass individually but fail when run together; tests later in the file fail while earlier ones pass; `TypeError: Cannot read properties of undefined` from mock chains.

### Pitfall 2: React `act()` Warnings in Frontend Tests

**What goes wrong:** TTNCredentialsPanel tests produce `act(...)` warnings in stderr.
**Why it happens:** Async state updates from React Query happen outside `act()` wrappers.
**How to avoid:** These are cosmetic warnings, not failures. Tests still pass. Can be suppressed by wrapping assertions with `waitFor()` or adding `act()` wrappers, but this is NOT blocking for Phase 55.
**Warning signs:** `stderr` output mentioning "An update to X inside a test was not wrapped in act(...)".

### Pitfall 3: Confusing "Zero Skip" with "All Pass"

**What goes wrong:** A test suite might have zero skipped tests but still have failures.
**Why it happens:** Skipped tests and failing tests are different categories in Vitest output.
**How to avoid:** Phase 55 requires BOTH: zero skipped AND zero failures AND exit code 0.

## Code Examples

### Root Cause Fix for Backend Failures

The 10 failing tests are all in `backend/tests/services/reading-ingestion.service.test.ts`. All share the same root cause.

**Error:**

```
TypeError: Cannot read properties of undefined (reading 'from')
 at upsertHourlyMetrics src/services/reading-ingestion.service.ts:204:13
```

**Current code (line 80-82 of test file):**

```typescript
afterEach(() => {
  vi.resetAllMocks(); // BUG: destroys db mock chain implementations
});
```

**Fix option A (simplest - change resetAllMocks to clearAllMocks):**

```typescript
afterEach(() => {
  vi.clearAllMocks(); // Only clears call counts, preserves implementations
});
```

**Fix option B (redundant beforeEach already does clearAllMocks):**
Since `beforeEach` already calls `vi.clearAllMocks()` (line 77), and `afterEach` calls `vi.resetAllMocks()` (line 81), the simplest fix is to just remove the `afterEach` block entirely, since `clearAllMocks` in `beforeEach` handles test isolation.

**Fix option C (re-mock in beforeEach if reset is needed):**

```typescript
import { db } from '../../src/db/client.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Re-setup db mock chain after reset
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => Promise.resolve([])),
      })),
      orderBy: vi.fn(() => Promise.resolve([])),
    })),
  } as any);
});
```

**Recommendation:** Fix option A or B. They are the simplest and least risky.

### Failing Tests (all 10, same root cause)

```
1. ingestReadings > should add readings to stream service when provided
2. ingestReadings > should evaluate alerts for each unique unit
3. ingestReadings > should use latest reading per unit for alert evaluation
4. ingestReadings > should count alerts triggered
5. ingestReadings > should count anomalies detected
6. ingestReadings > should emit metrics:updated event when metrics are calculated
7. ingestReadings > should continue processing when threshold resolution fails
8. Real-time Dashboard Updates > should format streaming reading correctly
9. Real-time Dashboard Updates > should handle null deviceId correctly
10. ingestReadings > should call ingestBulkReadings with correct parameters
```

All fail at `upsertHourlyMetrics` -> `db.select().from(readingMetrics)` because `db.select()` returns `undefined` after `vi.resetAllMocks()` runs.

### Verification Commands

```bash
# Full backend validation
cd /home/swoop/swoop-claude-projects/fresh-staged/backend && npx vitest run 2>&1
# Expected: "Test Files  56 passed (56)" and "Tests  1256 passed (1256)"

# Full frontend validation
cd /home/swoop/swoop-claude-projects/fresh-staged && npx vitest run 2>&1
# Expected: "Test Files  10 passed (10)" and "Tests  150 passed (150)"

# Check for any skip patterns in entire codebase
grep -rn '\.skip\|\.todo\b\|xdescribe\|xit\b\|xtest\|skipIf\|runIf' \
  backend/tests/ src/ --include='*.test.*' --include='*.spec.*'
# Expected: no output (zero matches)
```

## State of the Art

| Old Approach                      | Current Approach             | When Changed   | Impact                             |
| --------------------------------- | ---------------------------- | -------------- | ---------------------------------- |
| 14 skipped TTN webhook tests      | All eliminated (Phase 52)    | This milestone | Backend TTN test coverage complete |
| 24 skipped backend API tests      | All eliminated (Phase 53)    | This milestone | Backend API test coverage complete |
| 12 deprecated widget health tests | Deleted (Phase 54)           | This milestone | Frontend test debt cleared         |
| Skipped TTNCredentialsPanel tests | 26 tests restored (Phase 54) | This milestone | Frontend coverage restored         |

## Open Questions

1. **Queue service mock in reading-ingestion test**
   - What we know: The `reading-ingestion.service.ts` calls `getQueueService()` which is not mocked in the test file. It works because `getQueueService()` returns `null` when uninitialized, and the code handles this with try/catch.
   - What's unclear: Whether this should be explicitly mocked for correctness.
   - Recommendation: Not blocking. The current behavior is correct since the try/catch handles the null case. Add mock only if needed later.

2. **React act() warnings in TTNCredentialsPanel tests**
   - What we know: Multiple `act()` warnings appear in stderr during TTNCredentialsPanel tests.
   - What's unclear: Whether these should be fixed as part of Phase 55.
   - Recommendation: Not blocking. Tests pass. These are cosmetic warnings from React Query's async patterns. Out of scope for Phase 55 which focuses on zero-skip-zero-fail.

## Sources

### Primary (HIGH confidence)

- Direct test execution: `npx vitest run` in both `backend/` and project root -- ran 2026-01-30
- Source code inspection: `backend/tests/services/reading-ingestion.service.test.ts` -- read lines 1-690
- Source code inspection: `backend/src/services/reading-ingestion.service.ts` -- read lines 1-500
- Grep for skip patterns: searched `.skip`, `.todo`, `xit`, `xdescribe`, `xtest`, `skipIf`, `runIf` across entire `backend/` and `src/` trees -- zero matches

### Secondary (MEDIUM confidence)

- Vitest documentation on `clearAllMocks` vs `resetAllMocks` behavior (verified from training knowledge, consistent with observed behavior)

## Metadata

**Confidence breakdown:**

- Current test state: HIGH - obtained by running actual test suites
- Root cause of failures: HIGH - traced through source code and mock setup
- Fix approach: HIGH - well-understood Vitest mock lifecycle issue
- Skip pattern check: HIGH - comprehensive grep across all skip mechanisms

**Research date:** 2026-01-30
**Valid until:** Until any test files or source files are modified
