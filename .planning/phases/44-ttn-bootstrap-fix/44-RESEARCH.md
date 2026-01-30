# Phase 44 Research: TTN Bootstrap Fix

## Problem Summary

15 tests in `tests/api/ttn-devices.test.ts` are failing. All failures are in the bootstrap and provision endpoints, where expected status codes (201, 400) are returning 500 instead.

## Root Cause Analysis

The tests mock the TTN device service (`ttn-device.service.js`) but do NOT mock:

1. **`requireSensorCapacity` middleware** (`middleware/subscription.ts`) - This middleware makes database calls to:
   - `organizations` table to get sensor limit
   - `devices`, `units`, `areas`, `sites` tables to count active sensors

2. When the middleware tries to query the database in tests, it fails because:
   - No test database is set up
   - The `db` client throws an unhandled error
   - This results in a 500 Internal Server Error

## Evidence

From test output:

```
expected 500 to be 201 // Object.is equality
expected 500 to be 400 // Object.is equality
```

From route definition (`routes/ttn-devices.ts:39,69`):

```typescript
preHandler: [requireAuth, requireOrgContext, requireRole('manager'), requireSensorCapacity],
```

The `requireSensorCapacity` middleware:

- Queries `organizations` table for sensor limit
- Queries joined `devices/units/areas/sites` tables for count
- Both queries will fail without proper mocking

## Solution Options

### Option A: Mock the subscription middleware (Recommended)

Add mocks for the subscription middleware functions in the test file:

```typescript
vi.mock('../../src/middleware/subscription.js', () => ({
  requireSensorCapacity: vi.fn((req, reply, done) => done?.()),
  requireActiveSubscription: vi.fn((req, reply, done) => done?.()),
}));
```

**Pros:**

- Simple, follows existing pattern (JWT, user service are mocked)
- Test stays focused on TTN device logic
- No database setup required

**Cons:**

- Doesn't test capacity enforcement (but that should be in subscription.test.ts)

### Option B: Mock the db client for subscription queries

Mock only the specific db queries needed by the middleware.

**Pros:**

- Tests middleware integration

**Cons:**

- Complex, brittle
- Subscription logic should be tested separately

### Option C: Set up test database

Initialize a test database with required tables/data.

**Pros:**

- More realistic integration test

**Cons:**

- Slower tests
- More setup required
- Overkill for these unit tests

## Recommendation

**Option A** - Mock the subscription middleware. This aligns with the existing test pattern where auth middleware is mocked. The subscription logic should have its own dedicated tests.

## Files to Modify

1. `backend/tests/api/ttn-devices.test.ts` - Add middleware mock

## Verification

After fix:

- All 45 tests in ttn-devices.test.ts should pass
- `npm test -- ttn-devices` returns 45/45 passing
