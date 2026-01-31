# Phase 53 Plan 02: Fix Readings Ingest Tests and Remove Duplicate Query Tests Summary

**One-liner:** Fixed 5 REST-only ingest tests via socket plugin mock (Symbol.for skip-override pattern) and removed 3 duplicate query tests covered by tRPC

## Results

| Metric          | Value      |
| --------------- | ---------- |
| Tasks completed | 2/2        |
| Duration        | ~8 minutes |
| Completed       | 2026-01-30 |

### Task Results

| Task | Name                                          | Commit  | Files                              |
| ---- | --------------------------------------------- | ------- | ---------------------------------- |
| 1    | Add socket plugin mock and fix 5 ingest tests | e3d65e0 | backend/tests/api/readings.test.ts |
| 2    | Remove 3 duplicate query tests                | bb0e6b0 | backend/tests/api/readings.test.ts |

## What Changed

### Socket Plugin Mock Added

Added the `Symbol.for('skip-override')` socket plugin mock pattern (from Phase 52) to `readings.test.ts`. This provides `sensorStreamService` (addReading, getLatestReading, stop) and `socketService` (emitToOrg, joinOrganization, etc.) decorators that the ingest route requires at `request.server.sensorStreamService.addReading()` and `request.server.socketService`.

### 5 Ingest Tests Fixed

The 5 previously-skipped ingest tests for `POST /api/ingest/readings` now pass:

1. **should return 200 with valid API key** - Verifies successful ingest response shape (success, insertedCount, readingIds, alertsTriggered)
2. **should insert single reading successfully** - Verifies service called with correct args, sensorStreamService.addReading invoked
3. **should insert multiple readings successfully** - Verifies multi-reading bulk insert and multiple addReading calls
4. **should return correct insertedCount and readingIds** - Verifies 3-reading insert returns exact count and IDs
5. **should trigger alert when temperature above threshold** - Verifies alertsTriggered=1 and evaluateUnitAfterReading called with temp\*10

### 3 Duplicate Query Tests Removed

Removed 3 `it.skip()` query tests duplicated by `tests/trpc/readings.router.test.ts` (8 passing):

- "should return 200 with valid JWT" (covered by tRPC "should list readings for unit with pagination")
- "should support pagination with limit and offset" (covered by tRPC "should calculate offset from page correctly")
- "should filter by start and end time" (covered by tRPC "should list readings with date range filters")

### Bug Fix: Invalid UUID in TEST_READING_ID

The original `TEST_READING_ID` (`12345678-1234-1234-1234-123456789012`) was not a valid UUID per Zod's `z.string().uuid()` validation (version digit must be 1-8, variant digit must be 8/9/a/b). Changed to `a1234567-89ab-4cde-8012-123456789abc`. This was the root cause of the `FST_ERR_RESPONSE_SERIALIZATION` error -- Fastify's Zod serializer rejected the response because `readingIds` contained invalid UUIDs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid TEST_READING_ID causing response serialization failure**

- **Found during:** Task 1, first test run
- **Issue:** `TEST_READING_ID = '12345678-1234-1234-1234-123456789012'` fails Zod UUID validation (wrong version/variant digits). The `BulkIngestResponseSchema` uses `z.array(UuidSchema)` for `readingIds`, so Fastify's response serializer rejected the response with `FST_ERR_RESPONSE_SERIALIZATION`.
- **Fix:** Changed to valid UUID `a1234567-89ab-4cde-8012-123456789abc` and used valid UUIDs for all new test reading IDs
- **Files modified:** backend/tests/api/readings.test.ts
- **Commit:** e3d65e0

**2. [Rule 1 - Bug] Fixed mock return shape for evaluateUnitAfterReading**

- **Found during:** Task 1, implementing first test
- **Issue:** The original skipped test mocked `evaluateUnitAfterReading` returning `{ alertCreated: false, alertResolved: false }` but the actual return type uses `{ stateChange: null, alertCreated: null, alertResolved: null }` (nullable objects, not booleans)
- **Fix:** Updated mock to return correct shape with null values
- **Files modified:** backend/tests/api/readings.test.ts
- **Commit:** e3d65e0

## Decisions Made

| #   | Decision                                              | Rationale                                                       |
| --- | ----------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Used `Symbol.for('skip-override')` socket plugin mock | Proven pattern from Phase 52 TTN webhook tests                  |
| 2   | Fixed UUID format rather than relaxing schema         | The schema correctly validates UUIDs; test data should be valid |
| 3   | Removed query tests rather than fixing serialization  | Query coverage already exists in tRPC file with 8 passing tests |

## Test Results

### Before (baseline)

```
readings.test.ts: 6 passed, 8 skipped (14 total)
```

### After

```
readings.test.ts: 11 passed, 0 skipped (11 total)
readings.router.test.ts: 8 passed, 0 skipped (8 total) -- unchanged
Full backend suite: 1246 passed, 10 failed (pre-existing), 0 new failures
```

## Key Files

### Modified

- `backend/tests/api/readings.test.ts` - Added socket plugin mock, fixed 5 ingest tests, removed 3 duplicate query tests, fixed invalid UUID

### Referenced (unchanged)

- `backend/tests/api/ttn-webhooks.test.ts` - Socket plugin mock pattern source
- `backend/tests/trpc/readings.router.test.ts` - Query test coverage (8 passing)
- `backend/src/routes/readings.ts` - Ingest route source (sensorStreamService/socketService usage)
- `backend/src/schemas/readings.ts` - BulkIngestResponseSchema with UuidSchema validation

## Next Phase Readiness

No blockers. Plan 53-03 (remove sites duplicates) is independent and ready to execute.
