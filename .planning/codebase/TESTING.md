# Testing Patterns

**Analysis Date:** 2026-01-29

**Test Coverage:**
- Test files: 75 files total (65 backend, 10 frontend)
- Source files: 742 files
- Test ratio: ~10% (test files / source files)
- Note: Backend has significantly better test coverage than frontend

## Test Framework

**Runner:**
- Vitest 2.1.8
- Config files: `vitest.config.ts` (frontend), `backend/vitest.config.ts` (backend), `vite.config.ts` (legacy)

**Frontend Config:**
```typescript
// vitest.config.ts
{
  globals: true,
  environment: 'happy-dom',
  include: ['src/**/*.{test,spec}.{ts,tsx}'],
  setupFiles: ['./src/test/setup.ts']
}
```

**Backend Config:**
```typescript
// backend/vitest.config.ts
{
  globals: true,
  environment: 'node',
  include: ['tests/**/*.test.ts'],
  setupFiles: ['./tests/setup.ts'],
  testTimeout: 10000,
  hookTimeout: 30000
}
```

**Assertion Library:**
- Vitest built-in assertions (Jest-compatible)
- `@testing-library/jest-dom` for frontend DOM assertions

**Run Commands:**
```bash
npm test              # Run all tests (frontend)
npm run test:watch    # Watch mode (frontend)
cd backend && npm test           # Run backend tests
cd backend && npm run test:watch # Backend watch mode
```

## Test File Organization

**Location:**
- Frontend: Co-located with source in `__tests__` directories or separate `tests/` directory
- Backend: Separate `backend/tests/` directory mirroring `backend/src/` structure

**Naming:**
- Pattern: `*.test.ts` or `*.test.tsx`
- Matches source file name: `ttn.service.ts` → `ttn.service.test.ts`
- Components: `TTNCredentialsPanel.tsx` → `TTNCredentialsPanel.test.tsx`

**Frontend Structure:**
```
src/
  components/
    settings/
      TTNCredentialsPanel.tsx
      __tests__/
        TTNCredentialsPanel.test.tsx
  hooks/
    useAlerts.ts
    __tests__/
      useAlerts.test.tsx
  features/
    dashboard-layout/
      __tests__/
        payloadClassification.test.ts
```

**Backend Structure:**
```
backend/
  src/
    services/
      ttn.service.ts
  tests/
    services/
      ttn.service.test.ts
    setup.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('ComponentName or FeatureName', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    vi.clearAllMocks();
  });

  describe('Nested Feature Group', () => {
    it('describes expected behavior', () => {
      // Arrange
      const mockData = { ... };

      // Act
      const result = functionUnderTest(mockData);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

**Patterns:**
- Nested `describe` blocks for logical grouping
- `beforeEach` for setup/teardown
- `it` blocks describe behavior in present tense
- Arrange-Act-Assert pattern (implicit, not commented)
- Comprehensive test comments for complex scenarios

**Example from `backend/tests/services/ttn.service.test.ts`:**
```typescript
describe('TTN Service', () => {
  const testConfig: TTNConfig = { ... };
  let client: TTNClient;

  beforeEach(() => {
    client = new TTNClient(testConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listDevices', () => {
    it('should list devices from TTN application', async () => {
      const mockDevices = { ... };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDevices)
      });

      const devices = await client.listDevices();

      expect(mockFetch).toHaveBeenCalledWith(...);
      expect(devices).toHaveLength(1);
    });
  });
});
```

## Mocking

**Framework:** Vitest's `vi` mocking utilities

**Frontend Patterns:**
```typescript
// Mock external dependencies
vi.mock('@stackframe/react', () => ({
  useUser: vi.fn(() => ({
    getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' })
  }))
}));

// Mock internal modules
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC()
}));

// Use vi.hoisted for mock references
const { toastMock, mutateMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  mutateMock: vi.fn()
}));
```

**Backend Patterns:**
```typescript
// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock external libraries
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null })
    };
  }
}));
```

**What to Mock:**
- External APIs (TTN, Stripe, AWS SDK, Resend)
- Authentication providers (Stack Auth)
- Database clients (in unit tests)
- HTTP clients (`fetch`, `ky`)
- Toast notifications (`sonner`)
- Optional runtime dependencies

**What NOT to Mock:**
- Business logic under test
- Pure utility functions
- Type definitions
- Simple data transformations

## Fixtures and Factories

**Test Data:**
```typescript
// Inline fixtures at top of test file
const mockCredentialsReady = {
  organization_name: 'Test Organization',
  organization_id: 'org-test-123',
  ttn_application_id: 'ft-test-app',
  // ... all fields
};

const mockCredentialsFailed = {
  ...mockCredentialsReady,
  provisioning_status: 'failed',
  provisioning_error: 'Application already exists'
};
```

**Location:**
- Test fixtures defined inline at top of test file
- Shared fixtures in test setup files: `src/test/setup.ts`, `backend/tests/setup.ts`
- Sample payloads in dedicated constants: `SAMPLE_PAYLOADS` in `payloadClassification.test.ts`

## Coverage

**Requirements:** No enforced coverage threshold detected

**View Coverage:**
```bash
# No coverage command configured
# Vitest supports coverage via @vitest/coverage-* plugins (not installed)
```

**Current State:**
- Backend has comprehensive service-level test coverage
- Frontend has selective testing (critical components, hooks, complex logic)
- Widget components largely untested (UI-heavy, visual testing challenging)
- Integration tests focused on tRPC flows and provisioning workflows

## Test Types

**Unit Tests:**
- Scope: Individual functions, services, hooks
- Approach: Mock all external dependencies
- Location: Most tests are unit tests
- Example: `ttn.service.test.ts` tests TTN API client methods in isolation

**Integration Tests:**
- Scope: Component + hooks + tRPC queries
- Approach: Mock external APIs but test React Query integration
- Location: `src/components/settings/__tests__/TTNCredentialsPanel.test.tsx`
- Example: Tests component rendering with tRPC queries and mutations

**E2E Tests:**
- Framework: Not detected (no Playwright, Cypress, or Puppeteer config)
- Status: No E2E tests present

## Common Patterns

**Async Testing:**
```typescript
it('should fetch data asynchronously', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) });

  const result = await client.getData();

  expect(result).toEqual(expectedData);
});

// React Query with waitFor
it('renders data after loading', async () => {
  render(<Component />);

  await waitFor(() => {
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

**Error Testing:**
```typescript
it('should throw TTNApiError on API error', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' }))
  });

  await expect(client.listDevices()).rejects.toThrow(TTNApiError);
});

// Frontend error handling
it('shows error toast on provision failure', async () => {
  provisionMutateMock.mockResolvedValue({
    success: false,
    error: 'Application creation failed'
  });

  fireEvent.click(screen.getByRole('button', { name: /retry/i }));

  await waitFor(() => {
    expect(toastMock.error).toHaveBeenCalledWith('Application creation failed', {
      description: expect.any(String)
    });
  });
});
```

**React Component Testing:**
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

it('renders and responds to user interaction', async () => {
  const queryClient = new QueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <Component prop="value" />
    </QueryClientProvider>
  );

  expect(screen.getByText('Initial State')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button'));

  await waitFor(() => {
    expect(screen.getByText('Updated State')).toBeInTheDocument();
  });
});
```

**Mock Reset Patterns:**
```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Reset call counts and results
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
});

afterEach(() => {
  vi.clearAllMocks(); // Also in afterEach for cleanup
});
```

## Test Documentation

**Test File Headers:**
```typescript
/**
 * TTNCredentialsPanel Integration Tests
 *
 * Tests the tRPC-migrated TTNCredentialsPanel component.
 * Covers rendering states, credential loading, action buttons, error handling, and permissions.
 */
```

**Section Comments:**
```typescript
// ============ RENDERING TESTS ============
describe('Rendering', () => { ... });

// ============ STATUS BADGE TESTS ============
describe('Status Badges', () => { ... });
```

**CI Gate Tests:**
```typescript
/**
 * Deterministic Payload Classification Tests
 *
 * CI Gate: These tests ensure every sample payload matches exactly one versioned
 * payload type, or is explicitly classified as "unclassified".
 *
 * Ambiguous matches MUST fail CI (no silent ambiguity allowed).
 */
```

---

*Testing analysis: 2026-01-29*
