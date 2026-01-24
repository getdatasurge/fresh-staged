# Phase 18: Stripe Billing - Research

**Researched:** 2026-01-24
**Domain:** Stripe Usage-Based Billing & Subscription Management
**Confidence:** HIGH

## Summary

This phase extends the existing Stripe integration (checkout, webhooks, portal) to add **usage-based metering** for active sensors and temperature readings. The project already has Stripe v20.2.0 installed with working checkout flows, webhook signature verification, and Customer Portal integration.

The key additions are:
1. **Billing Meters** - Stripe's new metering API (replaces deprecated usage records) to track active sensors and reading volume
2. **Meter Events** - Reporting usage to Stripe at key points (reading ingestion, sensor activation)
3. **Subscription Enforcement** - Middleware to check subscription status and enforce limits

**Primary recommendation:** Use Stripe Billing Meters (v2 API) with BullMQ background jobs for batched meter event reporting. Report sensor count at billing period boundaries using `last` aggregation, and reading volume incrementally using `sum` aggregation.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe | ^20.2.0 | Stripe API client | Already installed, official SDK |
| bullmq | ^5.67.0 | Background job queue | Already in use for SMS/email jobs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | ^5.9.2 | Redis client for BullMQ | Already in use |

### No New Dependencies

The existing stack covers all requirements:
- `stripe` for Meter Events API
- `bullmq` for batched usage reporting jobs
- `ioredis` for job queue persistence

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── services/
│   ├── stripe-meter.service.ts      # NEW: Meter event reporting
│   ├── subscription-guard.service.ts # NEW: Access control checks
│   ├── checkout.service.ts          # EXISTS: Checkout sessions
│   └── stripe-webhook.service.ts    # EXISTS: Webhook handling
├── middleware/
│   └── subscription.ts              # NEW: Subscription enforcement middleware
├── jobs/
│   └── index.ts                     # MODIFY: Add meter reporting job types
└── workers/
    └── processors/
        └── meter-reporting.processor.ts  # NEW: Batched meter reporting
```

### Pattern 1: Stripe Billing Meters (v2 API)

**What:** Stripe's new metering system that replaces deprecated usage records. Meters define aggregation rules, meter events report usage.

**When to use:** For any usage-based billing (per-sensor, per-reading, per-API-call).

**Key Concepts:**
- **Meter:** Configuration defining how to aggregate events (sum, count, last)
- **Meter Event:** Individual usage report sent to Stripe
- **Meter Event Session:** High-throughput authentication (10,000 events/sec)

**Example:**
```typescript
// Source: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api

// Standard meter event (1,000/sec limit)
const meterEvent = await stripe.billing.meterEvents.create({
  event_name: 'temperature_readings',
  payload: {
    stripe_customer_id: customerId,
    value: '150',  // Must be string, whole numbers only
  },
});

// With timestamp (for historical data, up to 35 days back)
const meterEvent = await stripe.billing.meterEvents.create({
  event_name: 'active_sensors',
  payload: {
    stripe_customer_id: customerId,
    value: '12',
  },
  timestamp: Math.floor(Date.now() / 1000),
});
```

### Pattern 2: Aggregation Strategies

**What:** Choose the right aggregation based on the metric type.

**For Active Sensors (BILL-02: last_during_period):**
```typescript
// Use 'last' aggregation - bills based on final sensor count
// Report periodically (e.g., hourly) with current active sensor count
// Stripe uses the last reported value for the billing period

// Meter configuration (via Stripe Dashboard or API):
{
  event_name: 'active_sensors',
  default_aggregation: { formula: 'last' },
  customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
  value_settings: { event_payload_key: 'value' }
}
```

**For Temperature Readings (BILL-03: sum):**
```typescript
// Use 'sum' aggregation - accumulates all readings
// Report batched (e.g., after each ingestion batch or hourly rollup)
// Stripe sums all values in the billing period

// Meter configuration:
{
  event_name: 'temperature_readings',
  default_aggregation: { formula: 'sum' },
  customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
  value_settings: { event_payload_key: 'value' }
}
```

### Pattern 3: BullMQ for Batched Reporting

**What:** Queue meter events for background processing to handle rate limits and failures.

**When to use:** High-volume ingestion (this project ingests readings frequently).

**Example:**
```typescript
// Job types (add to backend/src/jobs/index.ts)
export interface MeterReportJobData extends BaseJobData {
  stripeCustomerId: string;
  eventName: 'active_sensors' | 'temperature_readings';
  value: number;
  timestamp?: number;
}

export const QueueNames = {
  SMS_NOTIFICATIONS: 'sms-notifications',
  EMAIL_DIGESTS: 'email-digests',
  METER_REPORTING: 'meter-reporting',  // NEW
} as const;

export const JobNames = {
  SMS_SEND: 'sms:send',
  EMAIL_DIGEST: 'email:digest',
  METER_REPORT: 'meter:report',  // NEW
} as const;
```

### Pattern 4: Subscription Enforcement Middleware

**What:** Fastify middleware that checks subscription status before allowing actions.

**When to use:** Any route that should be gated by subscription status.

**Example:**
```typescript
// Source: Project pattern from existing rbac.ts middleware

import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { subscriptions, organizations } from '../db/schema/tenancy.js';
import { eq } from 'drizzle-orm';

export async function requireActiveSubscription(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const organizationId = request.user?.organizationId;
  if (!organizationId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  if (!sub || !['active', 'trial'].includes(sub.status)) {
    return reply.code(403).send({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Active subscription required',
        status: sub?.status || 'none',
      },
    });
  }
}

export async function requireSensorCapacity(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const organizationId = request.user?.organizationId;
  if (!organizationId) {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }

  const [org] = await db
    .select({ sensorLimit: organizations.sensorLimit })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  // Count active sensors (existing logic from checkout.service.ts)
  const currentCount = await getActiveSensorCount(organizationId);

  if (currentCount >= (org?.sensorLimit || 0)) {
    return reply.code(403).send({
      error: {
        code: 'SENSOR_LIMIT_REACHED',
        message: `Sensor limit (${org?.sensorLimit}) reached. Upgrade your plan.`,
        currentCount,
        limit: org?.sensorLimit,
      },
    });
  }
}
```

### Anti-Patterns to Avoid

- **Synchronous meter reporting:** Never report meter events in the request path. Use background jobs.
- **Per-reading meter events:** Don't send a meter event for every single reading. Batch them.
- **Trusting client subscription status:** Always verify subscription status server-side.
- **Ignoring webhook failures:** Always implement idempotency and proper error handling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC | `stripe.webhooks.constructEvent()` | Timing-safe comparison, handles versioning |
| Raw body parsing for webhooks | Custom parser | Fastify `addContentTypeParser` with `parseAs: 'buffer'` | Already implemented in project |
| Usage aggregation | Custom tracking DB | Stripe Billing Meters | Handles proration, currency, invoicing automatically |
| Customer portal | Custom billing UI | Stripe Customer Portal | PCI compliant, handles all edge cases |
| Idempotency | Custom dedup logic | Store and check Stripe event IDs | Stripe retries for 3 days with exponential backoff |

**Key insight:** Stripe handles the hard billing problems (proration, currency conversion, tax calculation, dunning). Your job is to report accurate usage and respond to subscription status changes.

## Common Pitfalls

### Pitfall 1: Raw Body Modification (Already Solved)

**What goes wrong:** Webhook signature verification fails with "No signatures found matching expected signature"
**Why it happens:** Fastify parses JSON by default, modifying the raw body
**How to avoid:** Use `addContentTypeParser` with `parseAs: 'buffer'` (already implemented in `stripe-webhooks.ts`)
**Warning signs:** 400 errors on webhook endpoint, signature verification exceptions

### Pitfall 2: Duplicate Event Processing

**What goes wrong:** Same subscription activated twice, double charges, inconsistent state
**Why it happens:** Stripe retries failed webhooks up to 3 days
**How to avoid:** Store processed event IDs, check before processing
**Warning signs:** Duplicate entries in database, users charged twice

**Implementation:**
```typescript
// Add to database schema
export const stripeEvents = pgTable('stripe_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: varchar('event_id', { length: 256 }).notNull().unique(),
  eventType: varchar('event_type', { length: 256 }).notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});

// Check before processing
const [existing] = await db
  .select()
  .from(stripeEvents)
  .where(eq(stripeEvents.eventId, event.id))
  .limit(1);

if (existing) {
  return; // Already processed
}

// Process event, then record
await processEvent(event);
await db.insert(stripeEvents).values({
  eventId: event.id,
  eventType: event.type,
});
```

### Pitfall 3: Wrong Meter Value Type

**What goes wrong:** Meter events rejected, usage not recorded
**Why it happens:** Stripe meters only accept whole number strings
**How to avoid:** Always convert to whole numbers, send as strings
**Warning signs:** API errors about invalid value format

```typescript
// WRONG
payload: { value: 12.5 }  // Floats not allowed
payload: { value: 12 }    // Numbers not allowed

// CORRECT
payload: { value: '12' }  // String of whole number
payload: { value: Math.floor(value).toString() }
```

### Pitfall 4: Meter Events Rate Limiting

**What goes wrong:** 429 errors during high-volume ingestion
**Why it happens:** Standard endpoint: 1,000/sec, Connect platforms: 100/sec
**How to avoid:** Batch meter events, use high-throughput endpoint for >1000/sec
**Warning signs:** 429 status codes, missing usage data

### Pitfall 5: Subscription Status Race Conditions

**What goes wrong:** User accesses features after cancellation
**Why it happens:** Caching subscription status, not checking server-side
**How to avoid:** Always fetch fresh status for sensitive operations
**Warning signs:** Canceled users still using paid features

## Code Examples

### Creating Meter Events Service

```typescript
// Source: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api

import Stripe from 'stripe';
import { db } from '../db/client.js';
import { subscriptions } from '../db/schema/tenancy.js';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export class StripeMeterService {
  /**
   * Report active sensor count for an organization
   * Uses 'last' aggregation - only the final value in period is billed
   */
  async reportActiveSensors(
    organizationId: string,
    sensorCount: number
  ): Promise<void> {
    const customerId = await this.getStripeCustomerId(organizationId);
    if (!customerId) {
      console.warn(`[Meter] No Stripe customer for org ${organizationId}`);
      return;
    }

    await stripe.billing.meterEvents.create({
      event_name: 'active_sensors',
      payload: {
        stripe_customer_id: customerId,
        value: Math.max(0, Math.floor(sensorCount)).toString(),
      },
    });
  }

  /**
   * Report temperature reading volume for an organization
   * Uses 'sum' aggregation - all values in period are added together
   */
  async reportReadingVolume(
    organizationId: string,
    readingCount: number
  ): Promise<void> {
    const customerId = await this.getStripeCustomerId(organizationId);
    if (!customerId) {
      console.warn(`[Meter] No Stripe customer for org ${organizationId}`);
      return;
    }

    await stripe.billing.meterEvents.create({
      event_name: 'temperature_readings',
      payload: {
        stripe_customer_id: customerId,
        value: Math.max(0, Math.floor(readingCount)).toString(),
      },
    });
  }

  private async getStripeCustomerId(organizationId: string): Promise<string | null> {
    const [sub] = await db
      .select({ customerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    return sub?.customerId || null;
  }
}
```

### High-Throughput Meter Event Stream

```typescript
// Source: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api

import Stripe from 'stripe';

let meterEventSession: { authentication_token: string; expires_at: number } | null = null;

async function refreshMeterEventSession(): Promise<void> {
  if (
    meterEventSession === null ||
    new Date(meterEventSession.expires_at * 1000) <= new Date()
  ) {
    const client = new Stripe(process.env.STRIPE_SECRET_KEY!);
    meterEventSession = await client.v2.billing.meterEventSession.create();
  }
}

async function sendHighThroughputMeterEvents(
  events: Array<{
    event_name: string;
    payload: { stripe_customer_id: string; value: string };
  }>
): Promise<void> {
  await refreshMeterEventSession();

  const client = new Stripe(meterEventSession!.authentication_token);
  await client.v2.billing.meterEventStream.create({
    events,
  });
}
```

### Webhook Idempotency Handler

```typescript
// Based on: https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks

import { db } from '../db/client.js';
import { stripeEvents } from '../db/schema/billing.js';
import { eq } from 'drizzle-orm';

export async function processWebhookIdempotently(
  event: Stripe.Event,
  handler: () => Promise<void>
): Promise<boolean> {
  // Check if already processed
  const [existing] = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, event.id))
    .limit(1);

  if (existing) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`);
    return false;
  }

  // Process the event
  await handler();

  // Record as processed
  await db.insert(stripeEvents).values({
    eventId: event.id,
    eventType: event.type,
  });

  return true;
}
```

### Integration with Reading Ingestion

```typescript
// Hook into existing ingestReadings function

import { getQueueService } from './queue.service.js';
import { QueueNames, JobNames, type MeterReportJobData } from '../jobs/index.js';

// After successful reading ingestion
export async function ingestReadingsWithMetering(
  readings: SingleReading[],
  organizationId: string,
  // ... other params
): Promise<IngestionResult> {
  // Existing ingestion logic
  const result = await ingestReadings(readings, organizationId, /* ... */);

  // Queue meter event for reading count
  const queueService = getQueueService();
  if (queueService?.isEnabled()) {
    await queueService.addJob<MeterReportJobData>(
      QueueNames.METER_REPORTING,
      JobNames.METER_REPORT,
      {
        organizationId,
        stripeCustomerId: '', // Resolved by processor
        eventName: 'temperature_readings',
        value: result.insertedCount,
      }
    );
  }

  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Usage Records API | Billing Meters API | 2024-09 (v2024-09-30.acacia) | Legacy API removed in 2025-03-31.basil |
| `subscription_items/:id/usage_records` | `billing/meter_events` | 2024 | New aggregation options, higher throughput |
| Manual proration | Automatic via meters | 2024 | Stripe handles mid-cycle changes |

**Deprecated/outdated:**
- `aggregate_usage` on prices: Replaced by meter `default_aggregation.formula`
- Usage records API: Removed in API version 2025-03-31.basil
- Manual usage reporting timestamps: Now optional (defaults to current time)

## Open Questions

1. **Meter Configuration**
   - What we know: Meters must be created in Stripe Dashboard or via API before use
   - What's unclear: Should meters be created during deployment or manually in Dashboard?
   - Recommendation: Create via API in a setup script, store meter IDs in env vars

2. **High-Throughput Threshold**
   - What we know: Standard API: 1,000/sec, Meter Event Stream: 10,000/sec
   - What's unclear: Expected reading ingestion rate for production
   - Recommendation: Start with standard API + BullMQ batching, monitor 429s

3. **Sensor Count Reporting Frequency**
   - What we know: 'last' aggregation uses final value, so frequency matters less
   - What's unclear: Optimal reporting interval (hourly? daily? on change?)
   - Recommendation: Report hourly via scheduled job, plus on sensor add/remove

## Sources

### Primary (HIGH confidence)
- Stripe Official Documentation - Usage-Based Billing: https://docs.stripe.com/billing/subscriptions/usage-based
- Stripe Official Documentation - Recording Usage API: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api
- Stripe Official Documentation - Meter Configuration: https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure
- Stripe API Reference - Meters: https://docs.stripe.com/api/billing/meter
- Stripe Official Documentation - Customer Portal Integration: https://docs.stripe.com/customer-management/integrate-customer-portal
- Stripe Official Documentation - Entitlements: https://docs.stripe.com/billing/entitlements
- Stripe Official Documentation - Webhooks: https://docs.stripe.com/webhooks
- Stripe Official Documentation - Idempotent Requests: https://docs.stripe.com/api/idempotent_requests

### Secondary (MEDIUM confidence)
- Stripe Webhook Best Practices (Stigg): https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks
- Fastify Raw Body for Stripe Webhooks (GitHub Issue): https://github.com/fastify/fastify/issues/1965
- Medium Article on Webhook Idempotency: https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5

### Tertiary (LOW confidence)
- None - all critical claims verified with official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already installed and verified in package.json
- Architecture: HIGH - Follows existing project patterns, verified with Stripe docs
- Pitfalls: HIGH - Documented in official Stripe docs and verified with project code

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - Stripe API is stable)

---

## Appendix: Existing Implementation Reference

The project already has substantial Stripe integration:

**Files to extend (not replace):**
- `backend/src/services/checkout.service.ts` - Has `createCheckoutSession`, `createPortalSession`, `getSubscription`
- `backend/src/services/stripe-webhook.service.ts` - Has webhook handlers for checkout, subscription updates
- `backend/src/routes/stripe-webhooks.ts` - Raw body parsing already configured
- `backend/src/routes/payments.ts` - Payment routes with auth middleware

**Database schema (already exists):**
- `subscriptions` table with `stripeCustomerId`, `stripeSubscriptionId`, `status`, `plan`
- `organizations` table with `sensorLimit`

**What needs to be added:**
1. New `stripeEvents` table for idempotency
2. New meter reporting service
3. New meter reporting BullMQ queue/worker
4. New subscription enforcement middleware
5. Scheduled job for sensor count reporting
