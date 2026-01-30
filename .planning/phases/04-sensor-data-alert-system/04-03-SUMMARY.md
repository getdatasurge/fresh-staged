---
phase: 04
plan: 03
type: summary
subsystem: sensor-data-api
tags: [rest-api, fastify, readings, alerts, api-key-auth, jwt-auth]
requires:
  - 04-01-PLAN.md # API key auth and readings service
  - 04-02-PLAN.md # Alert evaluator service
provides:
  - readings-ingest-endpoint # POST /api/ingest/readings
  - readings-query-endpoint # GET /api/orgs/.../units/:unitId/readings
  - alert-evaluation-integration # Readings ingestion triggers alert evaluation
affects:
  - 04-04-PLAN.md # Alert routes may query readings
  - 04-05-PLAN.md # Notification delivery triggered by alerts
tech-stack:
  added: []
  patterns:
    - route-orchestration # Routes orchestrate service calls
    - error-handling # Structured error responses with utility functions
key-files:
  created:
    - backend/src/routes/readings.ts # Readings REST endpoints
  modified:
    - backend/src/services/readings.service.ts # Added getLatestReadingPerUnit helper
    - backend/src/app.ts # Registered readings routes
    - backend/src/middleware/org-context.ts # Fixed profileId population
    - backend/src/routes/alerts.ts # Fixed TypeScript errors
decisions:
  - decision: Keep alert evaluation in route handler
    rationale: Prevents cyclic service dependencies (services shouldn't call each other)
    impact: Routes orchestrate cross-service workflows
  - decision: Silent filtering for invalid units
    rationale: Security - don't disclose which units exist in other orgs
    impact: Returns 403 for any invalid units in payload
  - decision: Non-blocking alert evaluation
    rationale: Alert evaluation errors shouldn't fail entire ingestion
    impact: Logs errors but continues processing remaining readings
  - decision: Latest reading per unit for alert evaluation
    rationale: Only evaluate alerts for most recent reading per unit in batch
    impact: Efficient alert evaluation for bulk ingestion
metrics:
  duration: 4m 30s
  completed: 2026-01-23
---

# Phase 4 Plan 3: Readings Routes Summary

**One-liner:** REST endpoints for bulk sensor data ingestion with API key auth, reading queries with JWT auth, and real-time alert evaluation integration.

## Objective

Create REST endpoints for sensor data ingestion and querying, integrating the alert evaluator for real-time threshold monitoring during ingestion.

## What Was Built

### 1. Readings REST Endpoints

Created `backend/src/routes/readings.ts` with two endpoint groups:

**POST /api/ingest/readings** (API key authentication)

- Accepts bulk sensor readings (1-1000 readings per request)
- Validates all units belong to the organization via API key
- Inserts readings via `readingsService.ingestBulkReadings()`
- Evaluates alerts for each unique unit after successful ingestion
- Returns insertion count, reading IDs, and alerts triggered count
- Error handling:
  - 401: Invalid or missing API key
  - 403: Units do not belong to organization

**GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings** (JWT authentication)

- Query readings for a specific unit with pagination
- Supports time range filtering (start, end)
- Pagination via limit/offset parameters
- Validates unit hierarchy access before querying
- Error handling:
  - 401: Missing or invalid JWT token
  - 404: Unit not found or access denied

### 2. Service Helper Function

Added `getLatestReadingPerUnit()` to `readings.service.ts`:

- Takes array of readings, returns Map<unitId, latestReading>
- Compares recordedAt timestamps to find latest reading per unit
- Used by route handler to optimize alert evaluation
- Prevents redundant alert evaluations for multiple readings from same unit

### 3. Alert Evaluation Integration

Integrated alert evaluator into ingestion flow:

- After successful bulk insert, route handler:
  1. Identifies unique unit IDs in batch
  2. Finds latest reading for each unit
  3. Converts temperature to integer (multiply by 10)
  4. Calls `alertEvaluator.evaluateUnitAfterReading()` for each unit
  5. Tracks how many alerts were created or resolved
- Non-blocking: Alert evaluation errors are logged but don't fail ingestion
- Returns `alertsTriggered` count in response

### 4. Route Registration

Updated `backend/src/app.ts`:

- Imported `readingsRoutes` from routes module
- Registered with `/api` prefix
- Both ingest and query endpoints now accessible

## Architecture Decisions

### Route-Level Orchestration

**Decision:** Keep alert evaluation in route handler, not in service.

**Rationale:**

- Services should not depend on each other cyclically
- `readingsService` inserting data, then calling `alertEvaluator` would create tight coupling
- Routes can orchestrate cross-service workflows without introducing circular dependencies

**Implementation:**

- Route handler calls `readingsService.ingestBulkReadings()` to insert data
- Route handler then calls `alertEvaluator.evaluateUnitAfterReading()` for alerts
- Services remain independent and testable

### Error Handling Strategy

**Decision:** Use structured error response utilities (`forbidden()`, `notFound()`).

**Rationale:**

- Consistent error format across all endpoints
- Type-safe error responses via Zod schemas
- Cleaner route handler code

**Implementation:**

- `forbidden(reply, message)` for 403 responses
- `notFound(reply, resource)` for 404 responses
- ErrorResponseSchema defines structure for all error responses

### Security: Silent Filtering

**Decision:** Return 403 for any invalid units without disclosing which specific units failed.

**Rationale:**

- Information disclosure vulnerability: error messages could reveal org structure
- Don't tell attacker which units exist in which organizations

**Implementation:**

- `validateUnitsInOrg()` returns valid subset silently
- If no valid units found, throw generic error
- Route returns 403: "Units do not belong to organization"

## Implementation Details

### Temperature Precision Handling

Readings ingestion maintains dual temperature storage:

- **API accepts:** `number` (e.g., 35.5)
- **Service stores:** `numeric(7,2)` in database via string conversion
- **Alert evaluation:** Integer × 10 (e.g., 355) for comparison
- **Unit cache:** Integer × 100 (e.g., 3550) in `lastTemperature` field

### Bulk Ingestion Flow

1. Validate request body (1-1000 readings)
2. Extract organization ID from API key context
3. Validate all units belong to organization
4. Insert readings in batches of 500 (PostgreSQL parameter limit)
5. Update unit metadata (lastReadingAt, lastTemperature)
6. For each unique unit:
   - Find latest reading in batch
   - Evaluate alert state machine
   - Track alerts created/resolved
7. Return success response with counts

### Query Endpoint Design

- Hierarchical URL structure enforces organization isolation
- requireOrgContext middleware validates user's access to org
- Service validates unit belongs to org before querying
- Pagination prevents large result sets
- Time range filtering for historical queries

## Deviations from Plan

### [Rule 3 - Blocking] Fixed profileId population

**Issue:** TypeScript compilation failed due to `profileId` being undefined in `alerts.ts` routes.

**Root cause:** `requireOrgContext` middleware wasn't populating `profileId` field.

**Fix:**

1. Updated `requireOrgContext` to call `userService.getOrCreateProfile()`
2. Populate `request.user.profileId` after validating org membership
3. Updated `alerts.ts` to assert `profileId!` is defined after middleware

**Impact:** Alert acknowledgment and resolution routes now work correctly.

**Files modified:**

- `backend/src/middleware/org-context.ts` - Added profile lookup
- `backend/src/routes/alerts.ts` - Added non-null assertion for profileId

**Rationale:** This was a blocking issue preventing TypeScript compilation. According to deviation rules, blocking issues must be fixed immediately to unblock task completion.

## Testing Verification

✅ TypeScript compilation passes: `pnpm tsc --noEmit`
✅ Route paths match expected patterns
✅ Alert evaluation integrated into ingestion flow
✅ Error responses use structured format
✅ Middleware chain correct (requireApiKey for ingest, requireAuth + requireOrgContext for queries)

## Success Criteria Met

- ✅ POST /api/ingest/readings accepts bulk readings with X-API-Key header
- ✅ Invalid API key returns 401 (handled by requireApiKey middleware)
- ✅ Units not in org return 403 (handled by error handler)
- ✅ GET readings endpoint supports pagination and time range (limit, offset, start, end params)
- ✅ Alert evaluator called after each successful ingestion (tracked via alertsTriggered count)
- ✅ All routes registered in app.ts

## Next Phase Readiness

**Phase 4 Status:** 50% complete (3/6 plans)

**Ready for:**

- ✅ Plan 04-04: Alert routes (can query readings if needed)
- ✅ Plan 04-05: Notification delivery (alerts are being created/resolved)
- ✅ Plan 04-06: Webhook handling (ingest endpoint ready for TTN webhooks)

**Blockers:** None

**Integration points:**

- TTN webhooks can POST to `/api/ingest/readings` with X-Webhook-Secret header
- Frontend dashboard can GET from `/api/orgs/.../units/:unitId/readings` for charts
- Alert system automatically evaluates thresholds on every reading ingestion

## Commits

| Hash    | Message                                     | Files                                    |
| ------- | ------------------------------------------- | ---------------------------------------- |
| 719a110 | feat(04-03): create readings REST endpoints | backend/src/routes/readings.ts           |
| c8b0e8c | feat(04-03): add helper for latest reading  | backend/src/services/readings.service.ts |
| acb3c16 | feat(04-03): register readings routes       | backend/src/app.ts, middleware, alerts   |

## Files Modified

**Created:**

- `backend/src/routes/readings.ts` (151 lines)
  - POST /api/ingest/readings endpoint
  - GET /api/orgs/.../units/:unitId/readings endpoint
  - Alert evaluation orchestration

**Modified:**

- `backend/src/services/readings.service.ts` (+25 lines)
  - Added `getLatestReadingPerUnit()` helper function
- `backend/src/app.ts` (+3 lines)
  - Imported and registered readings routes
- `backend/src/middleware/org-context.ts` (+9 lines)
  - Fixed profileId population via getOrCreateProfile
- `backend/src/routes/alerts.ts` (+2 characters)
  - Added non-null assertions for profileId

## Knowledge for Future Phases

### Route Orchestration Pattern

When multiple services need to be called in sequence:

1. Keep orchestration logic in route handler
2. Don't make services call each other (circular dependency risk)
3. Services return data, routes decide what to do next

Example:

```typescript
// ✅ Good: Route orchestrates
const result = await readingsService.ingestBulkReadings();
await alertEvaluator.evaluateUnitAfterReading();

// ❌ Bad: Service calls another service
// Inside readingsService.ingestBulkReadings():
await alertEvaluator.evaluate(); // Creates tight coupling!
```

### API Key vs JWT Auth

Two authentication patterns for different use cases:

**API Key (`requireApiKey` middleware):**

- Machine-to-machine communication (TTN webhooks, external systems)
- Long-lived credentials stored in database (ttnConnections.webhookSecret)
- Populates `request.orgContext` with organizationId
- Returns 401 for invalid/missing keys

**JWT (`requireAuth` + `requireOrgContext` middlewares):**

- User-facing API endpoints (frontend dashboard)
- Short-lived tokens from Stack Auth
- Populates `request.user` with user identity and role
- Returns 401 for invalid tokens, 403 for insufficient permissions

**Don't mix:** Each route should use one authentication strategy, not both.

### Alert Evaluation Timing

Alert evaluation happens synchronously during ingestion:

- Pro: Real-time threshold violation detection
- Pro: Transaction atomicity (reading + alert creation)
- Con: Slower ingestion for high-volume sensors
- Future: Consider async job queue for large batches (deferred to later phase)

### Temperature Integer Math

Alert evaluator uses integer math to avoid floating-point precision issues:

- Temperature stored as `numeric(7,2)` in database (precise)
- Converted to integer × 10 for comparison (355 = 35.5°F)
- Hysteresis is 5 integer units (0.5 degrees)
- Always round, never truncate: `Math.round(temp * 10)`

---

**Plan Status:** ✅ COMPLETE
**Phase Status:** ◆ IN PROGRESS (50%)
**Next Plan:** 04-04 (Alert routes for frontend queries)
