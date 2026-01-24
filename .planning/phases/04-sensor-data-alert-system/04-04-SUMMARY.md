---
phase: 04
plan: 04
subsystem: alerts
tags: [fastify, zod, rbac, alerts, rest-api]
depends_on:
  requires: [04-02]
  provides: [alert-service, alert-routes]
  affects: [04-05, 04-06]
tech_stack:
  added: []
  patterns: [hierarchy-validation, service-layer, rest-endpoints]
key_files:
  created:
    - backend/src/schemas/alerts.ts
    - backend/src/services/alert.service.ts
    - backend/src/routes/alerts.ts
  modified:
    - backend/src/schemas/index.ts
    - backend/src/services/index.ts
    - backend/src/app.ts
    - backend/src/routes/readings.ts
decisions:
  - decision: Alert hierarchy validation via service layer
    rationale: Consistent with existing patterns for org/site/area/unit isolation
  - decision: Already-acknowledged returns 409 Conflict
    rationale: Indicates concurrent acknowledgement attempt, client can handle gracefully
  - decision: Resolve operation updates unit status to ok
    rationale: Resolving alert should clear alarm state when staff confirms issue addressed
metrics:
  duration: 233 seconds
  completed: 2026-01-23
---

# Phase 04 Plan 04: Alert Service & Routes Summary

**One-liner:** REST API for alert management with acknowledge/resolve lifecycle and RBAC enforcement

## What Was Built

### Alert Zod Schemas (`backend/src/schemas/alerts.ts`)

Created comprehensive validation schemas for alert operations:

**Enum schemas (match database):**
- `AlertTypeSchema`: alarm_active, monitoring_interrupted, missed_manual_entry, low_battery, sensor_fault, door_open, calibration_due
- `AlertSeveritySchema`: info, warning, critical
- `AlertStatusSchema`: active, acknowledged, resolved, escalated

**Response schemas:**
- `AlertSchema`: Complete alert object with all database columns
- `AlertsListSchema`: Array of alerts

**Request body schemas:**
- `AlertAcknowledgeSchema`: Optional notes field (max 1000 chars)
- `AlertResolveSchema`: Required resolution (1-2000 chars), optional correctiveAction (max 2000 chars)

**Query params:**
- `AlertQuerySchema`: Filtering by unitId, status, severity, time range (start/end), pagination (limit/offset)

**Route params:**
- `AlertParamsSchema`: organizationId + alertId for alert-specific routes

### Alert Service (`backend/src/services/alert.service.ts`)

Implemented alert lifecycle management with hierarchy validation:

**verifyAlertAccess(alertId, organizationId):**
- Validates alert belongs to org via `alerts -> units -> areas -> sites -> organizations` hierarchy
- Enforces isActive filtering on units/areas/sites
- Returns alert if accessible, null otherwise (silent filtering for security)

**listAlerts(organizationId, params):**
- Queries alerts with full hierarchy joins for org isolation
- Filters by status, severity, unitId, time range
- Pagination with limit/offset (default 100 limit, max 1000)
- Orders by triggeredAt descending (newest first)

**getAlert(alertId, organizationId):**
- Wrapper around verifyAlertAccess for single alert retrieval

**acknowledgeAlert(alertId, organizationId, profileId, notes?):**
- Checks if already acknowledged → returns 'already_acknowledged' sentinel
- Updates status to 'acknowledged'
- Sets acknowledgedAt timestamp and acknowledgedBy profileId
- Stores optional notes in metadata JSON field
- Returns updated alert or null if not found

**resolveAlert(alertId, organizationId, profileId, resolution, correctiveAction?):**
- Updates status to 'resolved' with resolvedAt/resolvedBy
- Stores resolution in metadata JSON field
- If correctiveAction provided: creates correctiveActions record
- Updates unit status to 'ok' if in excursion/alarm_active/restoring state
- All operations in transaction for atomicity

### Alert Routes (`backend/src/routes/alerts.ts`)

REST endpoints for alert management:

**GET /api/orgs/:organizationId/alerts**
- Middleware: requireAuth, requireOrgContext
- Returns paginated alerts filtered by query params
- Response: 200 with AlertsListSchema

**GET /api/orgs/:organizationId/alerts/:alertId**
- Middleware: requireAuth, requireOrgContext
- Returns single alert or 404
- Response: 200 AlertSchema | 404 ErrorResponse

**POST /api/orgs/:organizationId/alerts/:alertId/acknowledge**
- Middleware: requireAuth, requireOrgContext, requireRole('staff')
- Acknowledges alert with optional notes
- Response: 200 AlertSchema | 404 not found | 409 already acknowledged

**POST /api/orgs/:organizationId/alerts/:alertId/resolve**
- Middleware: requireAuth, requireOrgContext, requireRole('staff')
- Resolves alert with resolution + optional corrective action
- Response: 200 AlertSchema | 404 not found

All routes registered in app.ts at `/api/orgs/:organizationId/alerts`

## Decisions Made

### Alert Hierarchy Validation via Service Layer
Following established patterns from org/site/area/unit services, alert access validation uses innerJoin through the complete hierarchy. This ensures alerts are only accessible to users in the owning organization and prevents BOLA attacks.

### Already-Acknowledged Returns 409 Conflict
When attempting to acknowledge an already-acknowledged alert, return 409 instead of 200. This signals to clients that a concurrent operation occurred, allowing UI to handle appropriately (e.g., refresh alert state).

### Resolve Operation Updates Unit Status
When staff resolves an alert, the unit status is updated to 'ok' if currently in alarm state (excursion/alarm_active/restoring). This represents staff confirmation that the issue is addressed and unit is safe to return to normal operation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed readings route TypeScript error**
- **Found during:** Task 1 verification
- **Issue:** Readings route POST /ingest/readings had 403 response in handler but not in schema response types
- **Fix:** Added `403: ErrorResponseSchema` to readings route schema, imported ErrorResponseSchema
- **Files modified:** backend/src/routes/readings.ts
- **Commit:** b2e17f0

## Testing Notes

**Manual testing required:**
- Start backend server
- Create test organization, site, area, unit via existing APIs
- Trigger alert via readings ingestion (temp out of range)
- Test GET /alerts - verify alert appears
- Test GET /alerts/:id - verify single alert retrieval
- Test POST /acknowledge - verify status change and 409 on repeat
- Test POST /resolve - verify status change and unit status update to 'ok'
- Test RBAC - verify staff role required for acknowledge/resolve

**Integration test scenarios:**
1. List alerts with various filters (status, severity, unitId, time range)
2. Pagination with limit/offset
3. Acknowledge flow with concurrent requests (409 handling)
4. Resolve flow with corrective action creation
5. Hierarchy validation (cross-org access denied)
6. RBAC enforcement (viewer cannot acknowledge/resolve)

## Phase 4 Status

**Plans completed:** 4/6 (67%)

**Remaining plans:**
- 04-05: Background job worker for alert notifications
- 04-06: Integration tests for readings and alerts

**Next phase readiness:**
Phase 4 is on track. Alert management API is complete and ready for integration testing. Background job worker will enable automated notification delivery for alert lifecycle events.

## Files Changed

**Created (3 files):**
- `backend/src/schemas/alerts.ts` - Zod validation schemas for alerts
- `backend/src/services/alert.service.ts` - Alert CRUD with hierarchy validation
- `backend/src/routes/alerts.ts` - REST endpoints for alert management

**Modified (4 files):**
- `backend/src/schemas/index.ts` - Added alerts export
- `backend/src/services/index.ts` - Added alertService export
- `backend/src/app.ts` - Registered alert routes
- `backend/src/routes/readings.ts` - Fixed TypeScript error (403 response schema)

## Git Commits

```
b2e17f0 feat(04-04): create alert Zod validation schemas
3213855 feat(04-04): create alert service with CRUD operations
549f541 feat(04-04): create alert routes and register in app
```

**Total commits:** 3 (one per task)

## Success Criteria Met

- ✅ GET /api/orgs/:orgId/alerts returns alerts filtered by org hierarchy
- ✅ GET /api/orgs/:orgId/alerts/:alertId returns single alert or 404
- ✅ POST acknowledge changes status, requires staff+ role
- ✅ POST resolve changes status and optionally creates corrective action
- ✅ Already-acknowledged returns 409 Conflict
- ✅ All operations validate org hierarchy
- ✅ TypeScript compilation passes
- ✅ All routes enforce org context and RBAC
- ✅ Alert status transitions validated

## Key Learnings

**Sentinel values for service responses:**
Using 'already_acknowledged' string literal as sentinel value works well for distinguishing error types without throwing exceptions. Allows route layer to handle with appropriate HTTP status codes.

**profileId assertion:**
After requireAuth + requireOrgContext middleware, profileId is guaranteed to be populated, but TypeScript sees it as optional. Using `request.user!.profileId!` double assertion is correct pattern.

**Metadata JSON fields:**
Storing acknowledgement notes and resolution in metadata JSON field provides flexibility without schema changes. Future: Consider dedicated columns if querying on these fields becomes common.
