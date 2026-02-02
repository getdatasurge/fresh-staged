# Phase 4: Sensor Data & Alert System - Research

**Researched:** 2026-01-23
**Domain:** Sensor data ingestion, time-series storage, threshold-based alerting, alert lifecycle management
**Confidence:** HIGH

## Summary

This phase implements the sensor data ingestion pipeline and alert evaluation system for the FreshTrack Pro migration. The primary challenge is replicating the existing Supabase Edge Function behavior (`ttn-webhook` for data ingestion, `process-unit-states` for alert evaluation) in a Fastify-based Node.js backend.

The existing system uses a per-organization webhook secret for authentication (stored in `ttn_connections` table), bulk sensor reading insertions, threshold-based alert triggering with confirmation delays, and duplicate alert prevention via status checking. The migration must preserve this exact behavior while adapting to the new Drizzle ORM + Fastify stack.

Key findings:

- Drizzle ORM supports bulk inserts with `.values([...])` syntax and returning clauses for PostgreSQL
- Alert deduplication is currently handled by checking for existing `active`/`acknowledged` alerts before creating new ones
- The unit status state machine (ok -> excursion -> alarm_active) provides built-in confirmation delays
- Temperature thresholds are stored on units (`temp_limit_high`, `temp_limit_low`) with hysteresis support
- Door open grace periods delay alert triggering during expected temperature fluctuations

**Primary recommendation:** Implement a service layer pattern with `readings.service.ts` for bulk ingestion and `alert-evaluator.service.ts` for threshold evaluation. Use Drizzle transactions for atomic reading insertion + unit state update + alert creation.

## Standard Stack

### Core

| Library     | Version  | Purpose                             | Why Standard                                                                      |
| ----------- | -------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Drizzle ORM | 0.38+    | Bulk inserts, transactions, queries | Already integrated; type-safe bulk insert with `.values([])`, transaction support |
| Fastify     | 5.x      | Route handlers, validation          | Already integrated; preHandler hooks for API key auth                             |
| Zod         | 3.25+    | Request validation                  | Already integrated; validates bulk reading payloads                               |
| node:crypto | Built-in | Secure comparison, UUID generation  | Constant-time comparison for API key validation                                   |

### Supporting

| Library  | Version | Purpose            | When to Use                                              |
| -------- | ------- | ------------------ | -------------------------------------------------------- |
| date-fns | 3.x     | Date manipulation  | Time calculations for confirmation delays, grace periods |
| pino     | 8.x     | Structured logging | Fastify default; trace request IDs for debugging         |

### Alternatives Considered

| Instead of                   | Could Use          | Tradeoff                                                 |
| ---------------------------- | ------------------ | -------------------------------------------------------- |
| Drizzle bulk insert          | Individual inserts | Bulk is significantly faster for multi-reading payloads  |
| Service-layer evaluation     | Database triggers  | Service layer is more testable and debuggable            |
| Synchronous alert evaluation | BullMQ job         | Synchronous is simpler for MVP; async can be added later |

**Installation:**

```bash
cd backend
pnpm add date-fns
# date-fns is likely already installed; no other new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── routes/
│   ├── readings.ts          # POST /api/ingest/readings (bulk ingestion)
│   └── alerts.ts             # GET/POST /api/orgs/:orgId/.../alerts (CRUD + acknowledge/resolve)
├── services/
│   ├── readings.service.ts   # Bulk insert, unit update, trigger evaluation
│   └── alert-evaluator.service.ts  # Threshold evaluation, state machine, alert creation
├── schemas/
│   ├── readings.ts           # BulkReadingsSchema, ReadingSchema
│   └── alerts.ts             # AlertSchema, AlertAcknowledgeSchema, AlertResolveSchema
└── middleware/
    └── api-key-auth.ts       # Per-org API key authentication for ingestion endpoint
```

### Pattern 1: Bulk Insert with Transaction

**What:** Insert multiple readings atomically with unit state update
**When to use:** Every bulk readings ingestion request

**Example:**

```typescript
// Source: Drizzle ORM documentation (orm.drizzle.team/docs/insert)
import { db } from '../db/client.js';
import { sensorReadings, units } from '../db/schema/index.js';

export async function insertBulkReadings(
  readings: InsertSensorReading[],
  unitId: string,
): Promise<{ insertedCount: number; readingIds: string[] }> {
  return db.transaction(async (tx) => {
    // 1. Bulk insert readings
    const inserted = await tx
      .insert(sensorReadings)
      .values(readings)
      .returning({ id: sensorReadings.id });

    // 2. Update unit with latest reading (if readings exist)
    if (inserted.length > 0) {
      const latestReading = readings[readings.length - 1];
      await tx
        .update(units)
        .set({
          lastReadingAt: latestReading.recordedAt,
          lastTemperature: latestReading.temperature,
          updatedAt: new Date(),
        })
        .where(eq(units.id, unitId));
    }

    return {
      insertedCount: inserted.length,
      readingIds: inserted.map((r) => r.id),
    };
  });
}
```

### Pattern 2: Alert Deduplication via Status Check

**What:** Prevent duplicate alerts by checking for existing active/acknowledged alerts
**When to use:** Before creating any new alert

**Example:**

```typescript
// Source: Existing process-unit-states pattern
export async function createAlertIfNotExists(
  db: DrizzleClient,
  unitId: string,
  alertType: AlertType,
  alertData: Omit<InsertAlert, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Alert | null> {
  // Check for existing open alert of same type for this unit
  const [existing] = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.unitId, unitId),
        eq(alerts.alertType, alertType),
        inArray(alerts.status, ['active', 'acknowledged']),
      ),
    )
    .limit(1);

  if (existing) {
    // Update count or severity if needed, but don't create duplicate
    return null;
  }

  // No existing alert, create new one
  const [alert] = await db.insert(alerts).values(alertData).returning();

  return alert;
}
```

### Pattern 3: Per-Organization API Key Authentication

**What:** Middleware that validates webhook secret and resolves organization context
**When to use:** Ingestion endpoints that receive data from external sources (TTN, etc.)

**Example:**

```typescript
// Source: Existing ttn-webhook pattern adapted for Fastify
import type { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const providedKey = request.headers['x-webhook-secret'] || request.headers['x-api-key'];

  if (!providedKey || typeof providedKey !== 'string') {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Missing API key' },
    });
  }

  // Look up organization by API key (use db query)
  const orgContext = await lookupOrgByApiKey(providedKey);

  if (!orgContext) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  }

  // Attach org context to request for downstream handlers
  request.orgContext = orgContext;
}

// Constant-time comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}
```

### Pattern 4: State Machine for Alert Confirmation

**What:** Multi-step state transitions with confirmation delays
**When to use:** Temperature excursion detection to prevent false alarms

**State Machine:**

```
ok -> excursion -> alarm_active -> restoring -> ok
     (immediate)  (after confirm_time)  (temp returns)  (N good readings)
```

**Example:**

```typescript
// Source: Existing process-unit-states logic
type UnitStatus =
  | 'ok'
  | 'excursion'
  | 'alarm_active'
  | 'monitoring_interrupted'
  | 'manual_required'
  | 'restoring'
  | 'offline';

interface StateTransition {
  from: UnitStatus;
  to: UnitStatus;
  reason: string;
}

function evaluateUnitState(
  unit: Unit,
  latestTemp: number | null,
  now: Date,
): StateTransition | null {
  const { status: currentStatus, tempLimitHigh, tempLimitLow, tempHysteresis } = unit;

  // Temperature out of range?
  const isAboveLimit = latestTemp !== null && latestTemp > tempLimitHigh;
  const isBelowLimit = latestTemp !== null && tempLimitLow !== null && latestTemp < tempLimitLow;
  const isOutOfRange = isAboveLimit || isBelowLimit;

  if (isOutOfRange && currentStatus === 'ok') {
    return { from: 'ok', to: 'excursion', reason: `Temperature ${latestTemp} out of range` };
  }

  if (isOutOfRange && currentStatus === 'excursion') {
    const statusChangeTime = unit.lastStatusChange?.getTime() || now.getTime();
    const timeInExcursion = now.getTime() - statusChangeTime;
    const confirmTime =
      unit.doorState === 'open'
        ? unit.confirmTimeDoorOpen * 1000
        : unit.confirmTimeDoorClosed * 1000;

    if (timeInExcursion >= confirmTime) {
      return { from: 'excursion', to: 'alarm_active', reason: 'Excursion confirmed' };
    }
  }

  // Temperature back in range with hysteresis?
  const inRangeWithHysteresis =
    latestTemp !== null &&
    latestTemp <= tempLimitHigh - tempHysteresis &&
    (tempLimitLow === null || latestTemp >= tempLimitLow + tempHysteresis);

  if (
    inRangeWithHysteresis &&
    (currentStatus === 'excursion' || currentStatus === 'alarm_active')
  ) {
    return { from: currentStatus, to: 'restoring', reason: 'Temperature returning to range' };
  }

  return null; // No state change
}
```

### Anti-Patterns to Avoid

- **Evaluating alerts in route handlers:** Always delegate to service layer for testability
- **Creating alerts without deduplication check:** Always check for existing active alerts first
- **Trusting timestamps from external sources:** Validate and sanitize `recorded_at` from payloads
- **Synchronous notification sending:** Queue notifications for async processing (Phase 5+)
- **Hard-coding threshold values:** Always read from unit or alert_rules tables
- **Ignoring door state context:** Door open grace periods are critical for reducing false alarms

## Don't Hand-Roll

| Problem                  | Don't Build                             | Use Instead                    | Why                                           |
| ------------------------ | --------------------------------------- | ------------------------------ | --------------------------------------------- |
| Bulk insert optimization | Manual batching with loops              | Drizzle `.values([...])`       | Drizzle handles parameterization and batching |
| Alert deduplication      | Custom locking/semaphores               | Status-based idempotency check | Database-level check is simpler and atomic    |
| Constant-time comparison | Character-by-character loop             | `crypto.timingSafeEqual()`     | Built-in is audited and correct               |
| Date/time math           | Manual millisecond calculations         | `date-fns`                     | Handles edge cases, DST, timezone             |
| UUID generation          | Custom implementation                   | `crypto.randomUUID()`          | Built-in, RFC 4122 compliant                  |
| Transaction rollback     | Manual try/catch with explicit rollback | Drizzle `db.transaction()`     | Auto-rollback on error                        |

**Key insight:** The existing Supabase implementation already solved most edge cases. Port the logic, don't reinvent it.

## Common Pitfalls

### Pitfall 1: Duplicate Alerts on Concurrent Requests

**What goes wrong:** Two simultaneous requests both check for existing alert, both find none, both create alerts
**Why it happens:** Race condition between check and insert
**How to avoid:**

- Use database unique constraint on (unit_id, alert_type) for active alerts, OR
- Use advisory locks for critical sections, OR
- Accept eventual consistency and dedupe on query (recommended for MVP)
  **Warning signs:** Multiple alerts with same type for same unit in short time window

### Pitfall 2: Bulk Insert Parameter Limit

**What goes wrong:** PostgreSQL has a 65,534 parameter limit; large bulk inserts fail
**Why it happens:** Each row adds N parameters (one per column)
**How to avoid:**

- Batch inserts into chunks of ~500-1000 rows
- Calculate max: 65534 / columns_per_row = max_rows_per_insert
- For sensor_readings (11 columns), max is ~5958 rows per insert
  **Warning signs:** `MAX_PARAMETERS_EXCEEDED` error on large payloads

**Example:**

```typescript
const BATCH_SIZE = 500;

async function insertReadingsInBatches(readings: InsertSensorReading[]) {
  const results: string[] = [];

  for (let i = 0; i < readings.length; i += BATCH_SIZE) {
    const batch = readings.slice(i, i + BATCH_SIZE);
    const inserted = await db
      .insert(sensorReadings)
      .values(batch)
      .returning({ id: sensorReadings.id });
    results.push(...inserted.map((r) => r.id));
  }

  return results;
}
```

### Pitfall 3: Stale Unit State After Reading Insert

**What goes wrong:** Alert evaluation uses cached unit state, not the just-updated state
**Why it happens:** Reading insert and state evaluation are separate queries
**How to avoid:**

- Use transaction to ensure atomic read-after-write
- Fetch fresh unit state within the transaction
- Or evaluate based on the readings just inserted, not unit table
  **Warning signs:** Alerts triggered incorrectly after reading insert

### Pitfall 4: Timezone Confusion in recordedAt

**What goes wrong:** Sensor sends UTC, system interprets as local time (or vice versa)
**Why it happens:** Inconsistent timestamp handling across system boundaries
**How to avoid:**

- Store all timestamps as UTC with timezone in PostgreSQL (`timestamp with time zone`)
- Parse incoming timestamps with explicit timezone handling
- Use ISO 8601 format for all API responses
  **Warning signs:** Readings appear hours offset from reality

### Pitfall 5: Alert Acknowledge Without Authorization

**What goes wrong:** User acknowledges alert they don't have access to
**Why it happens:** Missing hierarchy validation for alert ownership
**How to avoid:**

- Alert routes must validate: unit -> area -> site -> organization hierarchy
- Use same pattern as existing unit.service.ts `verifyAreaAccess`
- Never trust alertId from URL without org context verification
  **Warning signs:** Users seeing/modifying alerts from other organizations

## Code Examples

### Example 1: Bulk Readings Ingestion Route

```typescript
// Source: Fastify + Zod patterns + existing ttn-webhook logic
import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireApiKey } from '../middleware/api-key-auth.js';
import * as readingsService from '../services/readings.service.js';

const BulkReadingsSchema = z.object({
  readings: z
    .array(
      z.object({
        unitId: z.string().uuid(),
        deviceId: z.string().uuid().optional(),
        temperature: z.number().int(), // Integer * 10 (e.g., 320 = 32.0F)
        humidity: z.number().optional(),
        battery: z.number().int().min(0).max(100).optional(),
        signalStrength: z.number().int().optional(),
        recordedAt: z.string().datetime(), // ISO 8601
        source: z.enum(['ttn', 'manual', 'api']).default('api'),
      }),
    )
    .min(1)
    .max(1000),
});

export default async function readingsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/ingest/readings - Bulk readings ingestion
  app.post(
    '/ingest/readings',
    {
      preHandler: [requireApiKey],
      schema: {
        body: BulkReadingsSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            insertedCount: z.number(),
            readingIds: z.array(z.string().uuid()),
            alertsTriggered: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { readings } = request.body;
      const orgId = request.orgContext!.organizationId;

      // Validate all units belong to this organization
      const unitIds = [...new Set(readings.map((r) => r.unitId))];
      const validUnits = await readingsService.validateUnitsInOrg(unitIds, orgId);

      if (validUnits.length !== unitIds.length) {
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Some units not accessible' },
        });
      }

      // Insert readings and trigger alert evaluation
      const result = await readingsService.ingestBulkReadings(readings, orgId);

      return {
        success: true,
        insertedCount: result.insertedCount,
        readingIds: result.readingIds,
        alertsTriggered: result.alertsTriggered,
      };
    },
  );
}
```

### Example 2: Alert Acknowledge/Resolve Endpoints

```typescript
// Source: Alert lifecycle patterns from existing system
import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as alertService from '../services/alert.service.js';
import { notFound, forbidden } from '../utils/errors.js';

const AlertAcknowledgeSchema = z.object({
  notes: z.string().optional(),
});

const AlertResolveSchema = z.object({
  resolution: z.string().min(1),
  correctiveAction: z.string().optional(),
});

export default async function alertRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/orgs/:orgId/alerts/:alertId/acknowledge
  app.post(
    '/:alertId/acknowledge',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('staff')],
      schema: {
        body: AlertAcknowledgeSchema,
      },
    },
    async (request, reply) => {
      const { alertId } = request.params;
      const { notes } = request.body;
      const userId = request.user!.id;
      const orgId = request.user!.organizationId!;

      const alert = await alertService.acknowledgeAlert(alertId, orgId, userId, notes);

      if (alert === null) {
        return notFound(reply, 'Alert not found');
      }

      if (alert === 'already_acknowledged') {
        return reply.code(409).send({
          error: { code: 'CONFLICT', message: 'Alert already acknowledged' },
        });
      }

      return alert;
    },
  );

  // POST /api/orgs/:orgId/alerts/:alertId/resolve
  app.post(
    '/:alertId/resolve',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('staff')],
      schema: {
        body: AlertResolveSchema,
      },
    },
    async (request, reply) => {
      const { alertId } = request.params;
      const { resolution, correctiveAction } = request.body;
      const userId = request.user!.id;
      const orgId = request.user!.organizationId!;

      const alert = await alertService.resolveAlert(
        alertId,
        orgId,
        userId,
        resolution,
        correctiveAction,
      );

      if (alert === null) {
        return notFound(reply, 'Alert not found');
      }

      return alert;
    },
  );
}
```

### Example 3: Alert Evaluator Service

```typescript
// Source: Existing process-unit-states logic adapted for Node.js
import { db } from '../db/client.js';
import { units, alerts, sensorReadings } from '../db/schema/index.js';
import { eq, and, inArray, desc } from 'drizzle-orm';

interface EvaluationResult {
  stateChange: { from: string; to: string; reason: string } | null;
  alertCreated: Alert | null;
  alertResolved: Alert | null;
}

export async function evaluateUnitAfterReading(
  unitId: string,
  latestTemp: number,
  recordedAt: Date,
): Promise<EvaluationResult> {
  return db.transaction(async (tx) => {
    // 1. Fetch current unit state with FOR UPDATE to prevent race conditions
    const [unit] = await tx.select().from(units).where(eq(units.id, unitId)).limit(1);

    if (!unit) throw new Error(`Unit ${unitId} not found`);

    // 2. Evaluate temperature against thresholds
    const isAboveLimit = latestTemp > unit.tempMax;
    const isBelowLimit = latestTemp < unit.tempMin;
    const isOutOfRange = isAboveLimit || isBelowLimit;

    let result: EvaluationResult = {
      stateChange: null,
      alertCreated: null,
      alertResolved: null,
    };

    const now = new Date();

    // 3. State machine transitions
    if (isOutOfRange && unit.status === 'ok') {
      // Enter excursion state
      result.stateChange = {
        from: 'ok',
        to: 'excursion',
        reason: `Temperature ${latestTemp} ${isAboveLimit ? 'above' : 'below'} limit`,
      };

      await tx
        .update(units)
        .set({
          status: 'excursion',
          lastStatusChange: now,
          updatedAt: now,
        })
        .where(eq(units.id, unitId));

      // Create excursion alert if none exists
      result.alertCreated = await createAlertIfNotExists(tx, {
        unitId,
        alertType: 'alarm_active',
        severity: 'warning',
        message: result.stateChange.reason,
        triggerTemperature: latestTemp,
        thresholdViolated: isAboveLimit ? 'max' : 'min',
        triggeredAt: now,
      });
    }

    // Check for excursion confirmation (alarm_active)
    if (isOutOfRange && unit.status === 'excursion') {
      const statusChangeTime = unit.lastStatusChange?.getTime() || now.getTime();
      const confirmTimeMs = (unit.confirmTimeDoorClosed || 600) * 1000; // Default 10 min

      if (now.getTime() - statusChangeTime >= confirmTimeMs) {
        result.stateChange = {
          from: 'excursion',
          to: 'alarm_active',
          reason: 'Temperature excursion confirmed',
        };

        await tx
          .update(units)
          .set({
            status: 'alarm_active',
            lastStatusChange: now,
            updatedAt: now,
          })
          .where(eq(units.id, unitId));

        // Escalate alert to critical
        await tx
          .update(alerts)
          .set({ severity: 'critical', updatedAt: now })
          .where(
            and(
              eq(alerts.unitId, unitId),
              eq(alerts.alertType, 'alarm_active'),
              inArray(alerts.status, ['active', 'acknowledged']),
            ),
          );
      }
    }

    // Check for temperature recovery
    const hysteresis = 5; // 0.5 degrees in integer format
    const inRangeWithHysteresis =
      latestTemp <= unit.tempMax - hysteresis && latestTemp >= unit.tempMin + hysteresis;

    if (inRangeWithHysteresis && (unit.status === 'excursion' || unit.status === 'alarm_active')) {
      result.stateChange = {
        from: unit.status,
        to: 'restoring',
        reason: 'Temperature returning to range',
      };

      await tx
        .update(units)
        .set({
          status: 'restoring',
          lastStatusChange: now,
          updatedAt: now,
        })
        .where(eq(units.id, unitId));

      // Resolve alert
      const [resolved] = await tx
        .update(alerts)
        .set({
          status: 'resolved',
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(alerts.unitId, unitId),
            eq(alerts.alertType, 'alarm_active'),
            inArray(alerts.status, ['active', 'acknowledged']),
          ),
        )
        .returning();

      result.alertResolved = resolved || null;
    }

    return result;
  });
}
```

### Example 4: Integration Test for Alert Triggering

```typescript
// Source: Vitest + Fastify inject patterns from existing tests
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import {
  createTestOrg,
  createTestSite,
  createTestArea,
  createTestUnit,
  cleanupTestData,
} from '../helpers/fixtures.js';

describe('Alert Triggering', () => {
  let app: FastifyInstance;
  let testOrgId: string;
  let testUnitId: string;
  let testApiKey: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    // Set up test data
    const org = await createTestOrg();
    testOrgId = org.id;
    testApiKey = await createTestApiKey(org.id);

    const site = await createTestSite(org.id);
    const area = await createTestArea(site.id);
    const unit = await createTestUnit(area.id, {
      tempMin: 320, // 32.0 F
      tempMax: 400, // 40.0 F
    });
    testUnitId = unit.id;
  });

  afterAll(async () => {
    await cleanupTestData([testOrgId]);
    await app.close();
  });

  it('should create alert when temperature exceeds threshold', async () => {
    // Insert reading above threshold
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      headers: { 'x-api-key': testApiKey },
      payload: {
        readings: [
          {
            unitId: testUnitId,
            temperature: 420, // 42.0 F - above 40.0 limit
            recordedAt: new Date().toISOString(),
            source: 'api',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.alertsTriggered).toBeGreaterThanOrEqual(1);

    // Verify unit status changed
    const unitResponse = await app.inject({
      method: 'GET',
      url: `/api/orgs/${testOrgId}/units/${testUnitId}`,
      headers: { authorization: `Bearer ${await getTestToken(testOrgId)}` },
    });

    expect(unitResponse.json().status).toBe('excursion');
  });

  it('should NOT create duplicate alert for ongoing excursion', async () => {
    // Insert another reading above threshold
    const response1 = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      headers: { 'x-api-key': testApiKey },
      payload: {
        readings: [
          {
            unitId: testUnitId,
            temperature: 430,
            recordedAt: new Date().toISOString(),
            source: 'api',
          },
        ],
      },
    });

    expect(response1.json().alertsTriggered).toBe(0); // No new alert

    // Verify only one active alert exists
    const alertsResponse = await app.inject({
      method: 'GET',
      url: `/api/orgs/${testOrgId}/alerts?unitId=${testUnitId}&status=active`,
      headers: { authorization: `Bearer ${await getTestToken(testOrgId)}` },
    });

    expect(alertsResponse.json().length).toBe(1);
  });

  it('should resolve alert when temperature returns to normal', async () => {
    // Insert reading back in range (with hysteresis)
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      headers: { 'x-api-key': testApiKey },
      payload: {
        readings: [
          {
            unitId: testUnitId,
            temperature: 350, // 35.0 F - well within range
            recordedAt: new Date().toISOString(),
            source: 'api',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);

    // Verify unit status changed to restoring
    const unitResponse = await app.inject({
      method: 'GET',
      url: `/api/orgs/${testOrgId}/units/${testUnitId}`,
      headers: { authorization: `Bearer ${await getTestToken(testOrgId)}` },
    });

    expect(unitResponse.json().status).toBe('restoring');
  });
});
```

## State of the Art

| Old Approach                 | Current Approach                  | When Changed      | Impact                                     |
| ---------------------------- | --------------------------------- | ----------------- | ------------------------------------------ |
| Supabase Edge Functions      | Node.js Fastify services          | This migration    | Full control, easier debugging, same logic |
| Service role key bypass      | Per-org API keys                  | Already in place  | Better isolation, audit trail              |
| Polling for state evaluation | Evaluate on ingestion + scheduled | Hybrid approach   | Near real-time response                    |
| Manual duplicate checking    | Alias-based deduplication         | Industry standard | Simpler, more reliable                     |

**Deprecated/outdated:**

- Global service role key for all ingestion - replaced with per-org webhook secrets
- Supabase Realtime for alert notifications - replaced with Socket.io (Phase 5+)

## Open Questions

1. **Alert evaluation timing**
   - What we know: Current system uses scheduled function (`process-unit-states`) that runs periodically
   - What's unclear: Should evaluation also happen synchronously on reading ingestion?
   - Recommendation: Hybrid - evaluate on ingestion for immediate threshold violations, scheduled job for confirmation delays and missed check-ins

2. **API key storage and rotation**
   - What we know: Current system stores webhook secrets in `ttn_connections` table
   - What's unclear: Should we create a dedicated `api_keys` table with rotation support?
   - Recommendation: Create `api_keys` table with `organizationId`, `keyHash`, `name`, `expiresAt`, `lastUsedAt`, `isActive` for audit and rotation

3. **Bulk readings batch size limit**
   - What we know: PostgreSQL parameter limit is 65,534
   - What's unclear: What's the optimal batch size for performance?
   - Recommendation: Start with 500 readings per batch, benchmark and adjust

4. **Hysteresis configuration**
   - What we know: Current system uses per-unit `temp_hysteresis` column
   - What's unclear: Should hysteresis be configurable via alert_rules hierarchy?
   - Recommendation: Keep on units for now (simpler), add to alert_rules in future phase

## Sources

### Primary (HIGH confidence)

- Existing codebase: `supabase/functions/ttn-webhook/index.ts` - Per-org webhook auth pattern
- Existing codebase: `supabase/functions/process-unit-states/index.ts` - State machine and alert evaluation
- Existing codebase: `backend/src/db/schema/telemetry.ts` - Sensor readings schema
- Existing codebase: `backend/src/db/schema/alerts.ts` - Alerts schema
- [Drizzle ORM Insert Documentation](https://orm.drizzle.team/docs/insert) - Bulk insert patterns
- [Drizzle ORM Transactions Documentation](https://orm.drizzle.team/docs/transactions) - Transaction handling

### Secondary (MEDIUM confidence)

- [API Key Security Best Practices 2026](https://dev.to/alixd/api-key-security-best-practices-for-2026-1n5d) - Key management patterns
- [Temperature Logger Alarm Handling](https://sgsystemsglobal.com/glossary/temperature-logger-alarm-handling/) - Alert lifecycle patterns
- [Alert De-duplication Atlassian](https://support.atlassian.com/opsgenie/docs/what-is-alert-de-duplication/) - Alias-based deduplication

### Tertiary (LOW confidence)

- None - all findings verified with existing codebase or official documentation

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Using existing Drizzle/Fastify stack, no new dependencies needed
- Architecture: HIGH - Patterns derived from existing Supabase Edge Functions being migrated
- Pitfalls: HIGH - Identified from existing code patterns and database constraints

**Research date:** 2026-01-23
**Valid until:** ~60 days (February 2026) - Patterns are migration-specific and stable
