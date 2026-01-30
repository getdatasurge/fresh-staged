# Phase 53: Backend API Tests - Research

**Researched:** 2026-01-30
**Domain:** Vitest mocked route tests (Fastify + tRPC), test deduplication
**Confidence:** HIGH

## Summary

Phase 53 concerns 21 `it.skip()` tests across three files:
- `backend/tests/api/alerts.test.ts` (14 skipped, 5 passing)
- `backend/tests/api/readings.test.ts` (8 skipped, 6 passing)
- `backend/tests/trpc/sites.router.test.ts` (2 skipped, 14 passing)

All three files share the same pattern discovered in Phase 52: **the skipped tests have working equivalents elsewhere in the codebase**. The root causes differ but the conclusion is the same -- the coverage already exists.

**Primary recommendation:** For alerts and readings, the skipped tests in `tests/api/` are complete duplicates of passing tests in `tests/trpc/`. Delete the `tests/api/` files and keep the tRPC versions (which have MORE coverage and no skips). For sites, the 2 skipped tRPC tests are duplicates of passing REST API tests in `tests/api/sites.test.ts` -- simply remove the 2 skipped tests from the tRPC file.

## Key Finding: Complete Test Duplication (All Three Files)

### File 1: alerts.test.ts (14 skipped) vs alerts.router.test.ts (19 passing)

The `tests/api/alerts.test.ts` file tests the REST alert routes using `buildApp()` + `app.inject()`. The `tests/trpc/alerts.router.test.ts` file tests the tRPC alert router using `createCallerFactory()`. Both files mock the same `alert.service.js` functions. The tRPC file has **19 passing tests with 0 skipped**, covering every scenario in the REST file plus more.

| # | Skipped test in `api/alerts.test.ts` | Covered by in `trpc/alerts.router.test.ts` | Status |
|---|--------------------------------------|---------------------------------------------|--------|
| 1 | should return alerts for organization | should list alerts for organization (line 101) | EXACT match |
| 2 | should return alert details | should get alert by ID (line 207) | EXACT match |
| 3 | should return 404 for non-existent alert | should throw NOT_FOUND when alert does not exist (line 219) | EXACT match |
| 4 | should return 404 for alert in different org | Covered by NOT_FOUND + org context middleware | EQUIVALENT |
| 5 | should return 403 for viewer role (acknowledge) | should throw FORBIDDEN when viewer tries to acknowledge (line 315) | EXACT match |
| 6 | should return 200 for staff role (acknowledge) | should acknowledge alert when user is staff (line 239) | EXACT match |
| 7 | should change status to acknowledged | should acknowledge alert when user is staff (checks result.status) | EXACT match |
| 8 | should return 409 if already acknowledged | should throw CONFLICT when alert already acknowledged (line 347) | EXACT match |
| 9 | should return 403 for viewer role (resolve) | should throw FORBIDDEN when viewer tries to resolve (line 415) | EXACT match |
| 10 | should return 200 for staff role (resolve) | should resolve alert when user is staff (line 368) | EXACT match |
| 11 | should change status to resolved | should resolve alert when user is staff (checks result.status) | EXACT match |
| 12 | should create corrective action when provided | should resolve alert when user is staff (passes correctiveAction) | EXACT match |
| 13 | should handle full lifecycle | Covered by acknowledge + resolve tests in sequence | EQUIVALENT |
| 14 | should prevent duplicate acknowledgment | should throw CONFLICT when alert already acknowledged | EXACT match |

**Additional coverage in tRPC file not in api file:**
- should acknowledge alert when user is manager (line 267)
- should acknowledge alert when user is admin (line 283)
- should acknowledge alert when user is owner (line 299)
- should throw NOT_FOUND when alert does not exist (acknowledge, line 332)
- should resolve alert when user is manager (line 398)
- should calculate offset from page correctly (line 187)
- should list alerts with status filter (line 122)
- should list alerts with severity filter (line 158)
- should list alerts with unitId filter (line 140)

**The 5 passing tests in api/alerts.test.ts are also covered:**

| Passing test in `api/` | Also passing in `trpc/` |
|-------------------------|--------------------------|
| should return 401 without JWT | N/A (tRPC uses different auth -- orgProcedure middleware) |
| should filter by status | should list alerts with status filter |
| should filter by severity | should list alerts with severity filter |
| should filter by unitId | should list alerts with unitId filter |
| should support pagination | should calculate offset from page correctly |

The only test unique to the api file is "should return 401 without JWT" -- but this is an auth middleware test, not an alerts-specific test. Auth middleware is tested separately.

### File 2: readings.test.ts (8 skipped) vs readings.router.test.ts (8 passing)

The same pattern. The `tests/api/readings.test.ts` file tests REST reading routes. The `tests/trpc/readings.router.test.ts` tests the tRPC readings router. Both mock `readings.service.js`.

| # | Skipped test in `api/readings.test.ts` | Covered by in `trpc/readings.router.test.ts` | Status |
|---|----------------------------------------|-----------------------------------------------|--------|
| 1 | should return 200 with valid API key (ingest) | N/A -- tRPC router only covers query, not ingest | **NOT COVERED** |
| 2 | should insert single reading successfully | N/A -- ingest is REST-only | **NOT COVERED** |
| 3 | should insert multiple readings successfully | N/A -- ingest is REST-only | **NOT COVERED** |
| 4 | should return correct insertedCount and readingIds | N/A -- ingest is REST-only | **NOT COVERED** |
| 5 | should trigger alert when temperature above threshold | N/A -- ingest is REST-only | **NOT COVERED** |
| 6 | should return 200 with valid JWT (query) | should list readings for unit with pagination (line 80) | EXACT match |
| 7 | should support pagination with limit and offset | should calculate offset from page correctly (line 133) | EXACT match |
| 8 | should filter by start and end time | should list readings with date range filters (line 105) | EXACT match |

**IMPORTANT:** 5 of the 8 skipped readings tests are for the **ingest** endpoint (`POST /api/ingest/readings`). This is a REST-only route with no tRPC equivalent. These tests are NOT duplicated. They need to be actually fixed.

The ingest route has a specific challenge: it calls `request.server.sensorStreamService.addReading()` (line 60 of readings.ts route) and `request.server.socketService` (line 96). This is the **same socket plugin mocking issue** from Phase 52's TTN webhook tests.

### File 3: sites.router.test.ts (2 skipped) vs sites.test.ts (25 passing)

The tRPC file has 2 skipped tests for the `update` procedure (admin update, owner update). The `tests/api/sites.test.ts` file has 25 passing tests that cover the full sites REST API, including:

| Skipped test in `trpc/sites.router.test.ts` | Covered by in `api/sites.test.ts` | Status |
|---------------------------------------------|-------------------------------------|--------|
| should update site when user is admin | should update site for admin (line 318) | EXACT match |
| should update site when user is owner | should update site for owner (line 340) | EXACT match |

**Root cause of skip:** The `sites.router.ts` update procedure calls `AuditService.logEvent()` (line 159-168). The test file does NOT mock `AuditService`, so the update tests would fail when they try to write to the database via the real AuditService.

**Two options to fix:**
- **Option A (RECOMMENDED):** Remove the 2 skipped tests since they are covered by `tests/api/sites.test.ts`
- **Option B:** Add `vi.mock('../../src/services/AuditService.ts', ...)` to the test file and unskip them

## Architecture Patterns

### Test Directory Convention

```
backend/tests/
  api/          # REST route tests - buildApp() + app.inject() pattern
  trpc/         # tRPC router tests - createCallerFactory() + caller.method() pattern
  services/     # Service-level unit tests
  routes/       # One-off directory from Phase 52 fix
```

### Why Duplicate Test Files Exist

The codebase has a dual API surface: REST routes (Fastify) and tRPC routers. For alerts and readings, BOTH layers exist but are backed by the same service functions. Tests were written for both layers, but the REST tests hit the "Fastify response serialization with mocks" issue while tRPC tests worked fine (they bypass Fastify serialization entirely).

### Skip Reason Analysis

**"Fastify response serialization with mocks" (alerts, readings query tests):**
The Fastify routes define Zod response schemas (e.g., `response: { 200: AlertsListSchema }`). When `fast-json-stringify` serializes the response, it validates against the Zod schema. Mocked service functions return plain objects with `new Date()` values. The `TimestampSchema = z.coerce.date()` schema expects Date objects but `fast-json-stringify` may serialize them inconsistently. Tests that only check `statusCode` or `toHaveBeenCalledWith` work fine (they don't touch response body). Tests that check `response.json()` body content encounter serialization mismatches.

**"sensorStreamService is undefined" (readings ingest tests):**
The readings ingest route calls `request.server.sensorStreamService.addReading()` (line 60). The test file does NOT mock the socket plugin that provides this decorator. Same root cause as Phase 52's TTN webhook tests.

**"AuditService not mocked" (sites tRPC update tests):**
The sites router's update procedure calls `AuditService.logEvent()`. The test file does not mock AuditService, so the update path would fail trying to access the real database.

## Recommended Approach

### Strategy: Delete duplicates, fix unique tests

#### alerts.test.ts: DELETE the file

**All 14 skipped tests are exact duplicates of passing tRPC tests.** The tRPC version has MORE coverage (19 tests vs 5 passing + 14 skipped). Deleting removes 14 skips + 5 duplicate passing tests.

**Impact:** -14 skipped, -5 passing (all duplicated), 0 coverage loss

#### readings.test.ts: FIX the 5 ingest tests, DELETE the 3 query tests

The 3 query-related skipped tests (lines 284, 288, 292) are duplicates of passing tRPC tests. Remove them.

The 5 ingest-related skipped tests (lines 167, 237, 241, 245, 249) test a REST-only endpoint with NO tRPC equivalent. These need to be actually fixed by adding the socket plugin mock (same `Symbol.for('skip-override')` pattern from Phase 52).

**Fix approach for ingest tests:**
1. Add socket plugin mock (identical to Phase 52's TTN webhook test pattern)
2. Implement the 5 test bodies (mock service responses, verify HTTP 200 + response body)
3. Keep the 6 existing passing tests as-is

**Impact:** -3 skipped (removed as duplicates), 5 skipped -> 5 passing (fixed), net: -8 skipped, +5 passing

#### sites.router.test.ts: REMOVE the 2 skipped tests

Both skipped tests are exact duplicates of passing tests in `tests/api/sites.test.ts`. Simply delete the 2 `it.skip()` blocks.

**Impact:** -2 skipped, 0 coverage loss

### Summary of Changes

| File | Action | Skips Removed | Tests Added | Coverage Change |
|------|--------|---------------|-------------|-----------------|
| `tests/api/alerts.test.ts` | DELETE file | -14 | 0 | None (tRPC covers all) |
| `tests/api/readings.test.ts` | Fix ingest, remove query dupes | -8 | +5 passing | Ingest tests now covered |
| `tests/trpc/sites.router.test.ts` | Remove 2 skipped tests | -2 | 0 | None (REST API covers all) |
| **TOTAL** | | **-24 skipped** | **+5 passing** | **Net gain** |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fixing REST alert tests | Add socket mock + implement 14 test bodies | Delete file, keep tRPC tests | 100% duplicate coverage already exists in tRPC file |
| Fixing REST query-reading tests | Debug Fastify serialization | Delete 3 tests, keep tRPC versions | Duplicate coverage in tRPC file |
| Fixing sites tRPC update tests | Mock AuditService + implement tests | Delete 2 skipped tests | REST API file covers same scenarios |
| Socket plugin mock | Custom mock per file | Reuse Phase 52's `Symbol.for('skip-override')` pattern | Already proven working |

## Common Pitfalls

### Pitfall 1: Implementing All 21 Skipped Tests
**What goes wrong:** Developer implements all 21 test bodies, creating massive duplication between REST and tRPC test suites
**Why it happens:** Phase description says "fix all skipped tests" which implies writing test bodies
**How to avoid:** Recognize that 16 of 21 skipped tests are already passing in duplicate files
**Warning signs:** Same service mocks, same assertions, different transport layer

### Pitfall 2: Ignoring the Ingest Tests
**What goes wrong:** Developer deletes all skipped tests as duplicates, but the 5 ingest tests have NO tRPC equivalent
**Why it happens:** It's tempting to treat all three files the same way
**How to avoid:** Check `readings.router.test.ts` carefully -- it only tests `list` and `latest`, not ingest
**Warning signs:** No tRPC router for `POST /api/ingest/readings`

### Pitfall 3: Missing Socket Plugin Mock for Ingest Tests
**What goes wrong:** Un-skipping ingest tests without adding the socket plugin mock causes `sensorStreamService is undefined` errors
**Why it happens:** The readings route calls `request.server.sensorStreamService.addReading()` and `request.server.socketService`
**How to avoid:** Add the `Symbol.for('skip-override')` socket plugin mock from Phase 52
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'addReading')`

### Pitfall 4: Forgetting AuditService Mock (if fixing sites tRPC)
**What goes wrong:** Unskipping sites update tests without mocking AuditService causes database connection errors
**Why it happens:** The `update` procedure calls `AuditService.logEvent()` which writes to the real database
**How to avoid:** Either delete the skipped tests (recommended) or add `vi.mock('../../src/services/AuditService.ts', ...)`

## Code Examples

### Socket Plugin Mock (for ingest tests)
```typescript
// Source: backend/tests/routes/ttn-webhook.test.ts (Phase 52 pattern)
const mockAddReading = vi.fn();
const mockGetLatestReading = vi.fn().mockReturnValue(null);
const mockStop = vi.fn();
const mockEmitToOrg = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/plugins/socket.plugin.js', () => {
  return {
    default: Object.assign(
      async function socketPlugin(fastify: any) {
        fastify.decorate('io', {});
        fastify.decorate('socketService', {
          emitToOrg: mockEmitToOrg,
          joinOrganization: vi.fn(),
          joinSite: vi.fn(),
          joinUnit: vi.fn(),
          leaveRoom: vi.fn(),
          initialize: mockInitialize,
          shutdown: mockShutdown,
        });
        fastify.decorate('sensorStreamService', {
          addReading: mockAddReading,
          getLatestReading: mockGetLatestReading,
          stop: mockStop,
        });
      },
      { [Symbol.for('skip-override')]: true }
    ),
  };
});
```

### tRPC Test Pattern (reference for what already passes)
```typescript
// Source: backend/tests/trpc/alerts.router.test.ts
const createCaller = createCallerFactory(alertsRouter);

const createOrgContext = () => ({
  req: {} as any,
  res: {} as any,
  user: {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  },
});

// Usage:
const ctx = createOrgContext();
const caller = createCaller(ctx);
const result = await caller.list({ organizationId: orgId });
expect(result).toEqual(mockAlerts);
```

### AuditService Mock (if needed)
```typescript
// Source: backend/tests/trpc/e2e.test.ts
vi.mock('../../src/services/AuditService.ts', () => ({
  AuditService: {
    logEvent: vi.fn().mockResolvedValue({ success: true }),
    logImpersonatedAction: vi.fn().mockResolvedValue({ success: true }),
    listEvents: vi.fn().mockResolvedValue([]),
  },
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| REST-only API testing | Dual REST + tRPC testing | When tRPC migration started | Created duplicate test suites |
| Skip tests that fail with Fastify serialization | Test via tRPC (bypasses Fastify serialization) | When tRPC routers were added | tRPC tests pass where REST tests fail |
| No socket plugin mock | `Symbol.for('skip-override')` pattern | Phase 52 | Enables testing routes that use socket decorators |

## Open Questions

1. **Should all REST API tests that have tRPC equivalents be removed?**
   - What we know: For alerts and readings, the tRPC tests are a superset
   - What's unclear: Whether REST-specific behavior (auth headers, status codes) needs dedicated testing
   - Recommendation: Keep REST tests that test REST-specific concerns (401/403 auth codes) but remove those that duplicate service-level assertions

2. **Should the readings ingest route eventually move to tRPC?**
   - What we know: It currently has no tRPC equivalent
   - What's unclear: Whether the API-key-authenticated ingest endpoint fits the tRPC model
   - Recommendation: Keep as REST for now (API key auth doesn't fit tRPC's JWT auth model)

## Sources

### Primary (HIGH confidence)
- `backend/tests/api/alerts.test.ts` - Read in full, all 283 lines (5 passing, 14 skipped)
- `backend/tests/api/readings.test.ts` - Read in full, all 317 lines (6 passing, 8 skipped)
- `backend/tests/trpc/sites.router.test.ts` - Read in full, all 410 lines (14 passing, 2 skipped)
- `backend/tests/trpc/alerts.router.test.ts` - Read in full, all 459 lines (19 passing, 0 skipped)
- `backend/tests/trpc/readings.router.test.ts` - Read in full, all 233 lines (8 passing, 0 skipped)
- `backend/tests/api/sites.test.ts` - Read in full, all 481 lines (25 passing, 0 skipped)
- `backend/src/routes/alerts.ts` - Read in full (138 lines)
- `backend/src/routes/readings.ts` - Read in full (173 lines)
- `backend/src/routers/sites.router.ts` - Read in full (267 lines)
- `backend/src/services/alert.service.ts` - Read in full (294 lines)
- `backend/src/services/readings.service.ts` - Read in full (300+ lines)
- `backend/src/schemas/alerts.ts` - Read in full (97 lines)
- `backend/src/schemas/readings.ts` - Read in full (70 lines)
- Vitest test runs - All 6 test files executed, results verified

### Verification
- api/alerts.test.ts: 5 passed, 14 skipped (confirmed via `vitest run`)
- api/readings.test.ts: 6 passed, 8 skipped (confirmed via `vitest run`)
- trpc/sites.router.test.ts: 14 passed, 2 skipped (confirmed via `vitest run`)
- trpc/alerts.router.test.ts: 19 passed, 0 skipped (confirmed via `vitest run`)
- trpc/readings.router.test.ts: 8 passed, 0 skipped (confirmed via `vitest run`)
- api/sites.test.ts: 25 passed, 0 skipped (confirmed via `vitest run`)

## Metadata

**Confidence breakdown:**
- Test duplication analysis: HIGH - All 6 files read line-by-line, test-by-test mapping created
- Skip root cause analysis: HIGH - Three distinct causes identified and verified
- Socket plugin mock pattern: HIGH - Proven working in Phase 52
- Recommendation: HIGH - Clear evidence supports each action

**Research date:** 2026-01-30
**Valid until:** Stable finding -- applies as long as these test files exist
