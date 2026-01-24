---
phase: 04-sensor-data-alert-system
plan: 01
subsystem: api
tags: [fastify, drizzle, zod, api-auth, sensor-data, bulk-insert, webhook]

# Dependency graph
requires:
  - phase: 03-core-api-endpoints
    provides: Service layer patterns, Zod validation infrastructure, Drizzle ORM setup
  - phase: 02-authentication-rbac
    provides: Middleware patterns, authentication infrastructure
provides:
  - API key authentication middleware for webhook endpoints
  - Readings Zod schemas for sensor data validation
  - Readings service with bulk ingestion and hierarchy validation
  - ttnConnections table for per-org webhook secret storage
affects:
  - 04-02-readings-routes (will use requireApiKey middleware and readings service)
  - 04-03-alert-evaluation (will use ingestBulkReadings for alert triggering)
  - 04-05-integration-tests (will test API key auth and bulk ingestion)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API key authentication via webhook secret lookup with constant-time comparison"
    - "Bulk database insert with batching (500 records per batch)"
    - "Unit hierarchy validation via joined queries (unit -> area -> site -> org)"
    - "Temperature precision handling: numeric(7,2) in DB, integer*100 in unit cache"

key-files:
  created:
    - backend/src/middleware/api-key-auth.ts
    - backend/src/schemas/readings.ts
    - backend/src/services/readings.service.ts
  modified:
    - backend/src/middleware/index.ts
    - backend/src/services/index.ts
    - backend/src/db/schema/tenancy.ts

key-decisions:
  - "Store webhook secrets in ttnConnections table (per-org, not shared)"
  - "Use constant-time comparison for API key validation (prevents timing attacks)"
  - "Batch bulk inserts at 500 readings (PostgreSQL parameter limit safety)"
  - "Temperature stored as numeric(7,2) in readings, integer*100 in unit.lastTemperature"
  - "Silent filtering for invalid units (return valid subset, don't fail entire batch)"

patterns-established:
  - "Pattern: requireApiKey middleware attaches orgContext to request"
  - "Pattern: validateUnitsInOrg performs hierarchy joins for BOLA prevention"
  - "Pattern: Bulk operations use Drizzle transactions for atomicity"
  - "Pattern: Unit state updates happen within ingestion transaction"

# Metrics
duration: 3min
completed: 2026-01-23
---

# Phase 4 Plan 1: API Key Auth & Readings Service Summary

**API key webhook authentication with ttnConnections table, bulk sensor reading ingestion with 500-record batching, and hierarchy-validated reading queries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-23T17:57:45Z
- **Completed:** 2026-01-23T18:00:55Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created requireApiKey middleware with secure constant-time API key comparison
- Built ttnConnections table for per-organization webhook secret storage
- Implemented bulk readings ingestion service with batch processing and unit state updates
- Established readings Zod schemas with 1-1000 reading validation limits
- Added hierarchy validation pattern to prevent cross-organization data leakage

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API key authentication middleware** - `94feb18` (feat)
2. **Task 2: Create readings Zod schemas** - `0bc409f` (feat)
3. **Task 3: Create readings service** - `c7660c3` (feat)

## Files Created/Modified

- `backend/src/middleware/api-key-auth.ts` - API key authentication middleware with constant-time comparison
- `backend/src/middleware/index.ts` - Export requireApiKey middleware
- `backend/src/db/schema/tenancy.ts` - Added ttnConnections table for webhook secrets
- `backend/src/schemas/readings.ts` - Zod schemas for reading validation and responses
- `backend/src/services/readings.service.ts` - Bulk ingestion, unit validation, and query service
- `backend/src/services/index.ts` - Export readings service

## Decisions Made

1. **ttnConnections table placement**: Added to tenancy schema (org-scoped configuration) rather than creating separate integrations schema
2. **Constant-time comparison**: Used crypto.timingSafeEqual to prevent timing attacks on webhook secret validation
3. **Batch size of 500**: Conservative limit below PostgreSQL's 65,534 parameter limit for bulk inserts
4. **Temperature precision handling**: Store as numeric(7,2) in sensorReadings table, convert to integer*100 for unit.lastTemperature cache
5. **Silent unit filtering**: validateUnitsInOrg returns valid subset rather than throwing error, allowing partial batch success
6. **Query ordering**: Readings ordered by recordedAt descending (newest first) for typical dashboard use case

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ttnConnections table to tenancy schema**
- **Found during:** Task 1 (API key middleware implementation)
- **Issue:** Plan referenced ttnConnections table but it didn't exist in database schema
- **Fix:** Added ttnConnections table to backend/src/db/schema/tenancy.ts with organizationId FK, webhookSecret, applicationId, isActive, and lastUsedAt fields
- **Files modified:** backend/src/db/schema/tenancy.ts
- **Verification:** TypeScript compilation passed, table exports available
- **Committed in:** 94feb18 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Adjusted ReadingResponseSchema to match DB schema**
- **Found during:** Task 2 (Zod schema creation)
- **Issue:** Plan specified createdAt field but sensorReadings table only has recordedAt and receivedAt timestamps
- **Fix:** Removed createdAt from ReadingResponseSchema, kept only recordedAt and receivedAt to match actual DB schema
- **Files modified:** backend/src/schemas/readings.ts
- **Verification:** Schema matches DB column structure from telemetry.ts
- **Committed in:** 0bc409f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes required for correct operation. Adding ttnConnections table was essential infrastructure. Schema adjustment prevents runtime validation errors.

## Issues Encountered

None - all tasks executed as specified after auto-fixes applied.

## User Setup Required

None - no external service configuration required. This plan provides internal API infrastructure.

## Next Phase Readiness

**Ready for next phase:**
- API key authentication infrastructure complete
- Readings service ready for route integration
- Bulk ingestion supports up to 1000 readings per request
- Unit hierarchy validation prevents BOLA vulnerabilities

**For 04-02 (Readings Routes):**
- Apply requireApiKey middleware to POST /api/ingest/readings endpoint
- Use ingestBulkReadings service for bulk ingestion
- Use queryReadings service for GET endpoints with pagination

**For 04-03 (Alert Evaluation):**
- Hook alert evaluator into ingestBulkReadings transaction
- Increment alertsTriggered count in BulkIngestResponse

**Known considerations:**
- Temperature conversion between numeric and integer*100 must be consistent across codebase
- Webhook secret rotation not yet implemented (add in future phase if needed)
- Query performance on large reading datasets not yet profiled (add indexes if needed)

---
*Phase: 04-sensor-data-alert-system*
*Completed: 2026-01-23*
