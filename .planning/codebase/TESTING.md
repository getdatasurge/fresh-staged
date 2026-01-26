# Testing Patterns

**Analysis Date:** 2026-01-26

## Test Framework

**Runner:**
- Vitest (frontend) with config in `vitest.config.ts`
- Vitest (backend) with config in `backend/vitest.config.ts`

**Assertion Library:**
- Vitest built-in `expect`
- DOM matchers via `@testing-library/jest-dom` loaded in `src/test/setup.ts`

**Run Commands:**
```bash
npm test                                  # Run frontend tests via Vitest
npm run test:watch                        # Frontend watch mode
npm test -- src/lib/orgScopedInvalidation.test.ts
cd backend && npm test                    # Run backend tests via Vitest
cd backend && npm run test:watch          # Backend watch mode
cd backend && npm test -- tests/api/sites.test.ts
```

## Test File Organization

**Location:**
- Frontend tests live under `src/**` and match `src/**/*.{test,spec}.{ts,tsx}` (see `vitest.config.ts`)
- Backend tests live under `backend/tests/**/*.test.ts` (see `backend/vitest.config.ts`)

**Naming:**
- Unit/integration tests use `*.test.ts`/`*.test.tsx` naming
- Some feature-specific locations use `__tests__` (examples: `src/lib/__tests__/api-client.test.ts`, `src/hooks/__tests__/useSites.test.tsx`)

**Structure:**
```
src/
  lib/
    api-client.ts
    __tests__/api-client.test.ts
  hooks/
    __tests__/useSites.test.tsx
  features/
    dashboard-layout/
      __tests__/layoutValidation.test.ts
backend/
  tests/
    api/
      sites.test.ts
    services/
      availability.service.test.ts
    trpc/
      e2e.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('moduleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles the happy path', () => {
    // arrange
    // act
    // assert
  });
});
```

**Patterns:**
- `describe`/`it` structure with Vitest globals
- `beforeEach` used to reset mocks/state in frontend hooks tests (example: `src/hooks/__tests__/useSites.test.tsx`)
- Arrange/act/assert comments appear when tests are complex

## Mocking

**Framework:**
- Vitest built-in mocking via `vi`
- Module mocking with `vi.mock()` at top of test files

**Patterns:**
```typescript
import { vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  sitesApi: { listSites: vi.fn() },
}));

const mockFn = vi.mocked(sitesApi.listSites);
mockFn.mockResolvedValueOnce([] as any);
```

**What to Mock:**
- External services and SDKs (examples mocked in `backend/tests/setup.ts`)
- API modules and auth hooks in frontend tests (example: `src/hooks/__tests__/useSites.test.tsx`)
- Network or storage boundaries

**What NOT to Mock:**
- Pure helper functions when they are the unit under test (pattern implied in `src/lib/actions/sensorEligibility.test.ts`)

## Fixtures and Factories

**Test Data:**
```typescript
// backend/tests/helpers/fixtures.ts
export async function createTestOrg(...) { /* ... */ }
export async function createTestUser(...) { /* ... */ }
export function createTestReading(...) { /* ... */ }
```

**Location:**
- Backend factories and fixtures live in `backend/tests/helpers/fixtures.ts`
- Frontend shared fixtures: Not detected

## Coverage

**Requirements:**
- Not detected (no coverage target in package scripts)

**Configuration:**
- Not detected (no coverage config in `vitest.config.ts` or `backend/vitest.config.ts`)

**View Coverage:**
```bash
Not detected
```

## Test Types

**Unit Tests:**
- Frontend utilities/hooks are tested in isolation with mocked dependencies (examples: `src/lib/actions/sensorEligibility.test.ts`, `src/hooks/__tests__/useSites.test.tsx`)

**Integration Tests:**
- Backend service and API tests exercise multiple modules (examples: `backend/tests/services/availability.service.test.ts`, `backend/tests/api/sites.test.ts`)

**E2E Tests:**
- Vitest-based E2E-style coverage exists in backend (example: `backend/tests/trpc/e2e.test.ts`)

## Common Patterns

**Async Testing:**
```typescript
it('handles async work', async () => {
  const result = await asyncFn();
  expect(result).toBeDefined();
});
```

**Error Testing:**
```typescript
it('throws on invalid input', () => {
  expect(() => fn(null)).toThrow();
});

it('rejects on failure', async () => {
  await expect(asyncFn()).rejects.toThrow();
});
```

**Snapshot Testing:**
- Not detected in frontend/backend tests
- Opencode subproject includes snapshots (example: `opencode/packages/opencode/test/tool/__snapshots__/tool.test.ts.snap`)

---

*Testing analysis: 2026-01-26*
*Update when test patterns change*
