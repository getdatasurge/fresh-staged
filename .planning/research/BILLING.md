# Stripe Billing Integration Research

**Project:** FreshTrack Pro v2.0
**Researched:** 2026-01-24
**Confidence:** HIGH

## Executive Summary

FreshTrack Pro requires a SaaS billing system with subscription management and usage-based metering for IoT sensors and temperature readings. Stripe provides a complete solution via the stripe-node library (v19.1.0) with three key capabilities:

1. **Subscription Management** - Handle plan tiers, trials, upgrades/downgrades, cancellations
2. **Usage-Based Billing** - Meter sensor counts and reading volumes via V2 Billing Meters API
3. **Customer Self-Service** - Stripe-hosted Customer Portal for billing management

The integration requires webhook handling with raw body support (critical for Fastify), database schema for local billing state, and comprehensive testing strategies using Stripe's test mode and test clocks.

## Stack Recommendation

### Core Library

**stripe-node v19.1.0** (Context7 verified)

- HIGH confidence - Official Stripe Node.js library
- Full TypeScript support with generated types
- V2 API support for high-throughput metering
- Built-in webhook signature verification
- Auto-pagination for large datasets

### Installation

```bash
npm install stripe
npm install -D @types/node
```

### Configuration

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil', // Latest API version as of 2026
  typescript: true,
});
```

## Subscription Lifecycle Management

### 1. Customer Creation

Link Stripe customers to FreshTrack Pro organizations in a 1:1 relationship.

```typescript
// Create Stripe customer when organization is created
const customer = await stripe.customers.create({
  email: organization.ownerEmail,
  name: organization.name,
  metadata: {
    organization_id: organization.id,
    owner_id: organization.ownerId,
  },
});

// Store stripe_customer_id on organizations table
await db
  .update(organizations)
  .set({ stripeCustomerId: customer.id })
  .where(eq(organizations.id, organization.id));
```

**Source:** [Create and Manage Customers - Context7](https://context7.com/stripe/stripe-node)

### 2. Subscription Plans

FreshTrack Pro should offer tiered pricing with usage-based components.

**Recommended Plan Structure:**

| Plan         | Base Price | Included                     | Overage                     |
| ------------ | ---------- | ---------------------------- | --------------------------- |
| Starter      | $49/month  | 5 sensors, 10K readings/mo   | $10/sensor, $5/10K readings |
| Professional | $149/month | 25 sensors, 100K readings/mo | $8/sensor, $4/10K readings  |
| Enterprise   | $499/month | 100 sensors, 1M readings/mo  | $6/sensor, $3/10K readings  |

**Implementation:**

```typescript
// Create product
const product = await stripe.products.create({
  name: 'FreshTrack Pro - Professional Plan',
  description: 'Temperature monitoring for food safety compliance',
  metadata: {
    plan_tier: 'professional',
  },
});

// Create base subscription price
const basePrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 14900, // $149.00
  currency: 'usd',
  recurring: {
    interval: 'month',
    usage_type: 'licensed',
  },
  metadata: {
    included_sensors: '25',
    included_readings: '100000',
  },
});

// Create metered price for sensor overage
const sensorOveragePrice = await stripe.prices.create({
  product: product.id,
  currency: 'usd',
  recurring: {
    interval: 'month',
    usage_type: 'metered',
  },
  billing_scheme: 'per_unit',
  unit_amount: 800, // $8.00 per sensor
  metadata: {
    metric: 'sensor_overage',
  },
});

// Create metered price for readings overage
const readingsOveragePrice = await stripe.prices.create({
  product: product.id,
  currency: 'usd',
  recurring: {
    interval: 'month',
    usage_type: 'metered',
  },
  billing_scheme: 'tiered',
  tiers_mode: 'graduated',
  tiers: [
    { up_to: 10000, unit_amount: 400 }, // $4 per 10K
    { up_to: 'inf', unit_amount: 300 }, // $3 per 10K at volume
  ],
  metadata: {
    metric: 'readings_overage',
  },
});
```

**Source:** [Define Products and Create Recurring and Tiered Pricing - Context7](https://context7.com/stripe/stripe-node)

### 3. Creating Subscriptions

Use Checkout Sessions for new subscriptions (recommended) or direct API for programmatic creation.

**Option A: Checkout Session (Recommended)**

```typescript
// Create checkout session for subscription
const session = await stripe.checkout.sessions.create({
  customer: customer.id,
  line_items: [
    { price: basePrice.id, quantity: 1 },
    { price: sensorOveragePrice.id }, // Metered, no quantity
    { price: readingsOveragePrice.id }, // Metered, no quantity
  ],
  mode: 'subscription',
  success_url: `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.APP_URL}/billing/plans`,
  subscription_data: {
    trial_period_days: 14,
    metadata: {
      organization_id: organization.id,
      plan_tier: 'professional',
    },
  },
  allow_promotion_codes: true,
});

// Redirect user to session.url
return { checkoutUrl: session.url };
```

**Option B: Direct API (for internal upgrades)**

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [
    { price: basePrice.id, quantity: 1 },
    { price: sensorOveragePrice.id },
    { price: readingsOveragePrice.id },
  ],
  payment_behavior: 'default_incomplete',
  payment_settings: {
    save_default_payment_method: 'on_subscription',
  },
  trial_period_days: 14,
  metadata: {
    organization_id: organization.id,
    plan_tier: 'professional',
  },
  expand: ['latest_invoice.payment_intent'],
});
```

**Sources:**

- [Create Hosted Checkout Sessions - Context7](https://context7.com/stripe/stripe-node)
- [Create and Manage Subscriptions - Context7](https://context7.com/stripe/stripe-node)

### 4. Upgrades & Downgrades

Handle plan changes with proration.

```typescript
// Get current subscription
const subscription = await stripe.subscriptions.retrieve(subscriptionId);

// Find subscription item for base plan
const baseItem = subscription.items.data.find((item) => item.price.metadata.metric === undefined);

// Update to new plan
const updated = await stripe.subscriptions.update(subscriptionId, {
  items: [
    {
      id: baseItem!.id,
      price: newPlanPriceId, // New base price
    },
    // Metered items remain unchanged
  ],
  proration_behavior: 'create_prorations', // Pro-rate the difference
  metadata: {
    plan_tier: 'enterprise',
    upgraded_at: new Date().toISOString(),
  },
});
```

**Source:** [Create and Manage Subscriptions - Context7](https://context7.com/stripe/stripe-node)

### 5. Cancellations

Support immediate and end-of-period cancellations.

```typescript
// Cancel at period end (recommended - customer keeps access)
const cancelled = await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true,
});

// Immediate cancellation (revoke access immediately)
const cancelledNow = await stripe.subscriptions.cancel(subscriptionId, {
  prorate: true,
  invoice_now: true, // Create final invoice with prorations
});
```

**Source:** [Create and Manage Subscriptions - Context7](https://context7.com/stripe/stripe-node)

## Usage-Based Billing & Metering

### V2 Billing Meters API (HIGH Throughput)

Stripe's V2 API supports high-volume event streaming for usage metering. This is critical for IoT applications.

### 1. Create Billing Meters

Set up meters in Stripe Dashboard or via API:

```typescript
// Sensor count meter (via Dashboard recommended)
// - Name: "Active Sensors"
// - Event Name: "active_sensors"
// - Aggregation: "last_during_period" (snapshot of active count)

// Readings volume meter
// - Name: "Temperature Readings"
// - Event Name: "temperature_readings"
// - Aggregation: "sum" (total readings count)
```

### 2. Attach Meters to Prices

When creating metered prices, reference the meter:

```typescript
const readingsPrice = await stripe.prices.create({
  product: product.id,
  currency: 'usd',
  recurring: {
    interval: 'month',
    usage_type: 'metered',
  },
  meter: 'meter_readings_id', // Reference to meter
  billing_scheme: 'per_unit',
  unit_amount: 500, // $5 per 10K readings
});
```

**Note:** As of API version 2025-03-31.basil, metered prices MUST be backed by meters.

**Source:** [Breaking Changes > Billing - Stripe Node Migration Guide](https://github.com/stripe/stripe-node/wiki/Migration-guide-for-v18)

### 3. Report Usage Events

Use session-based streaming for high throughput:

```typescript
// Initialize meter event session (cache this)
let meterEventSession: Stripe.V2.Billing.MeterEventSession | null = null;

async function refreshMeterEventSession() {
  if (!meterEventSession || new Date(meterEventSession.expires_at) <= new Date()) {
    meterEventSession = await stripe.v2.billing.meterEventSession.create();
  }
}

// Report sensor usage (called daily or on sensor activation)
async function reportActiveSensors(customerId: string, sensorCount: number) {
  await refreshMeterEventSession();

  const streamClient = new Stripe(meterEventSession!.authentication_token);
  await streamClient.v2.billing.meterEventStream.create({
    events: [
      {
        event_name: 'active_sensors',
        payload: {
          stripe_customer_id: customerId,
          value: sensorCount.toString(),
        },
        identifier: `${Date.now()}-${Math.random()}`, // Unique ID
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// Report readings volume (called on each batch ingest)
async function reportReadings(customerId: string, readingCount: number) {
  await refreshMeterEventSession();

  const streamClient = new Stripe(meterEventSession!.authentication_token);
  await streamClient.v2.billing.meterEventStream.create({
    events: [
      {
        event_name: 'temperature_readings',
        payload: {
          stripe_customer_id: customerId,
          value: readingCount.toString(),
        },
        identifier: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
```

**Sources:**

- [Stream Metered Billing Events via V2 API - Context7](https://context7.com/stripe/stripe-node)
- [POST /v2/billing/meter_event_stream - Context7](https://context7.com/stripe/stripe-node)

### 4. Usage Reporting Patterns

**For FreshTrack Pro:**

1. **Sensor Count** (last_during_period meter)
   - Report daily at midnight UTC
   - Query active sensors from database
   - Send single event with current count

2. **Reading Volume** (sum meter)
   - Report after each bulk reading ingestion
   - Send event with batch size
   - Accumulates throughout billing period

```typescript
// Daily cron job for sensor count
async function dailySensorCountReport() {
  const orgsWithSubscriptions = await db
    .select()
    .from(organizations)
    .where(isNotNull(organizations.stripeCustomerId));

  for (const org of orgsWithSubscriptions) {
    const activeSensors = await db
      .select({ count: count() })
      .from(units)
      .where(and(eq(units.organizationId, org.id), eq(units.isActive, true)));

    await reportActiveSensors(org.stripeCustomerId!, activeSensors[0].count);
  }
}

// After each bulk reading ingestion
async function afterReadingsIngested(organizationId: string, batchSize: number) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  if (org?.stripeCustomerId) {
    await reportReadings(org.stripeCustomerId, batchSize);
  }
}
```

**Best Practices:**

- Store metering events locally for audit trail
- Include `identifier` for idempotency (prevents double-billing on retries)
- Use dimensions for granular analytics if needed (region, sensor type, etc.)
- Monitor for metering failures and implement retry logic

**Sources:**

- [Usage metering: A guide for businesses](https://stripe.com/resources/more/usage-metering)
- [Record usage for billing - Stripe Documentation](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage)

## Webhook Handling with Fastify

### Critical: Raw Body Requirement

Stripe webhook signature verification requires access to the **raw request body** before JSON parsing. This is a common pitfall with Fastify.

### Solution: Built-in rawBody Option

Fastify 4+ supports `rawBody: true` in route configuration:

```typescript
// In your Fastify routes file
import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function webhookRoutes(app: FastifyInstance) {
  app.post(
    '/webhooks/stripe',
    {
      rawBody: true, // CRITICAL: Access raw body for signature verification
    },
    async (request, reply) => {
      const sig = request.headers['stripe-signature'] as string;

      if (!sig) {
        return reply.status(400).send({ error: 'No signature header' });
      }

      let event: Stripe.Event;

      try {
        // Use rawBody for signature verification
        event = stripe.webhooks.constructEvent(
          request.rawBody as Buffer, // Raw buffer
          sig,
          webhookSecret,
          300, // tolerance in seconds
        );
      } catch (err) {
        const error = err as Error;
        app.log.error(`Webhook signature verification failed: ${error.message}`);
        return reply.status(400).send({ error: `Webhook Error: ${error.message}` });
      }

      // Handle the event
      await handleWebhookEvent(event);

      return reply.send({ received: true });
    },
  );
}
```

**Alternative: fastify-raw-body plugin** (if using Fastify < 4)

```bash
npm install fastify-raw-body
```

```typescript
import rawBody from 'fastify-raw-body';

app.register(rawBody, {
  field: 'rawBody',
  global: false, // Only enable on specific routes
  encoding: false, // Keep as buffer
});
```

**Sources:**

- [Issues creating Stripe webhooks - Fastify GitHub](https://github.com/fastify/help/issues/158)
- [Documentation and example of webhook signature check - Fastify GitHub](https://github.com/fastify/fastify/issues/5491)
- [Validating Stripe Webhooks using Fastify - Medium](https://voxelcoder.medium.com/validating-stripe-webhooks-using-fastify-passport-and-nestjs-b7cbf702b132)

### Security Best Practices

1. **Always verify signatures** - Never process webhooks without verification
2. **Use constant-time comparison** - Stripe library handles this automatically
3. **Rotate secrets every 90 days** - Configure in Stripe Dashboard
4. **Log verification failures** - Monitor for potential attacks
5. **Use HTTPS** - Required for production webhooks

**Source:** [Webhook Signature Verification - Apidog](https://apidog.com/blog/webhook-signature-verification/)

### Event Handling

Handle subscription lifecycle events:

```typescript
async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    // Customer created
    case 'customer.created':
      await handleCustomerCreated(event.data.object as Stripe.Customer);
      break;

    // Subscription lifecycle
    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(event.data.object as Stripe.Subscription);
      break;

    // Payment events
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_action_required':
      await handlePaymentActionRequired(event.data.object as Stripe.Invoice);
      break;

    case 'payment_intent.succeeded':
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}
```

**Key Events for FreshTrack Pro:**

| Event                                  | When Fired                          | Action Required                                    |
| -------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| `customer.subscription.created`        | New subscription starts             | Update local subscription status, provision access |
| `customer.subscription.updated`        | Plan change, cancellation scheduled | Update plan tier, handle cancellation flag         |
| `customer.subscription.deleted`        | Subscription ends                   | Revoke access, archive data                        |
| `customer.subscription.trial_will_end` | 3 days before trial ends            | Send reminder email, verify payment method         |
| `invoice.paid`                         | Payment successful                  | Extend subscription period, send receipt           |
| `invoice.payment_failed`               | Payment failed                      | Notify customer, trigger Smart Retries             |
| `invoice.payment_action_required`      | 3DS authentication needed           | Send authentication link to customer               |

**Sources:**

- [Webhook Events for Subscription Lifecycle Management - Stripe Documentation](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Verify Webhook Signatures and Handle Events - Context7](https://context7.com/stripe/stripe-node)

### Webhook Processing Pattern

Use asynchronous queue for reliable processing:

```typescript
// Webhook route immediately acknowledges receipt
app.post('/webhooks/stripe', { rawBody: true }, async (request, reply) => {
  // Verify signature
  const event = stripe.webhooks.constructEvent(/*...*/);

  // Queue event for async processing (use BullMQ)
  await webhookQueue.add('stripe-webhook', {
    eventId: event.id,
    eventType: event.type,
    data: event.data.object,
  });

  // Immediately respond to Stripe
  return reply.send({ received: true });
});

// Background worker processes events
webhookQueue.process('stripe-webhook', async (job) => {
  await handleWebhookEvent(job.data);
});
```

**Why this matters:**

- Prevents webhook timeouts (Stripe expects response < 5s)
- Enables retry logic for failed processing
- Handles concurrent events safely

**Source:** [Best practices for testing Stripe webhook event processing - LaunchDarkly](https://launchdarkly.com/blog/best-practices-for-testing-stripe-webhook-event-processing/)

## Customer Portal Integration

### Overview

Stripe Customer Portal provides self-service billing management without building custom UI.

**Features:**

- Update payment methods
- View billing history and invoices
- Upgrade/downgrade subscriptions
- Cancel subscriptions
- Update billing information
- Manage tax IDs (if using Stripe Tax)

### Configuration

Configure portal in Stripe Dashboard or via API:

**Dashboard Configuration:**

1. Go to Settings > Customer Portal
2. Enable features:
   - ✅ Update payment methods
   - ✅ View invoices
   - ✅ Cancel subscriptions (with retention offers)
   - ✅ Update subscription (configure product catalog)
3. Set cancellation behavior:
   - Collect feedback: "Why are you canceling?"
   - Offer retention discount: 20% off for 3 months
   - Allow cancellation at period end or immediately

**Product Catalog:**

- Define which plans customers can upgrade/downgrade to
- FreshTrack Pro example: Allow Professional ↔ Enterprise, block downgrades to Starter

**Sources:**

- [Configure the customer portal - Stripe Documentation](https://docs.stripe.com/customer-management/configure-portal)
- [Customer self-service with a customer portal - Stripe Documentation](https://docs.stripe.com/customer-management)

### Creating Portal Sessions

Generate one-time access links:

```typescript
// API route: POST /api/billing/portal
app.post(
  '/api/billing/portal',
  { preHandler: [requireAuth, requireOrgContext] },
  async (request, reply) => {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, request.user!.organizationId),
    });

    if (!org?.stripeCustomerId) {
      return reply.status(400).send({
        error: 'No billing account found',
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${process.env.APP_URL}/settings/billing`,
    });

    return { url: session.url };
  },
);
```

**Frontend:**

```typescript
async function openBillingPortal() {
  const response = await fetch('/api/billing/portal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const { url } = await response.json();

  // Redirect to Stripe-hosted portal
  window.location.href = url;
}
```

**Source:** [Integrate the customer portal with the API - Stripe Documentation](https://docs.stripe.com/customer-management/integrate-customer-portal)

### Custom vs. Portal Trade-offs

| Aspect               | Stripe Portal               | Custom UI           |
| -------------------- | --------------------------- | ------------------- |
| **Development Time** | Minutes                     | Weeks               |
| **Maintenance**      | None (Stripe handles)       | Ongoing             |
| **Customization**    | Limited (branding + config) | Full control        |
| **Mobile Support**   | Built-in responsive         | You build           |
| **Compliance**       | PCI handled by Stripe       | Your responsibility |
| **Features**         | Standard billing tasks      | Any custom flow     |

**Recommendation for FreshTrack Pro:**

- **Use Stripe Portal for v2.0** - Faster time to market, covers 90% of use cases
- **Consider custom UI in v3.0+** - If you need:
  - Custom plan recommendation logic
  - Usage analytics dashboards
  - Organization-specific pricing
  - Advanced invoice customization

## Database Schema

### Storing Billing State

While Stripe is the source of truth, store critical billing state locally for performance and reliability.

**Recommended Schema:**

```typescript
// backend/src/db/schema/billing.ts
import { pgTable, text, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { organizations } from './tenancy.js';

// Subscription status enum
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

// Plan tier enum
export const planTierEnum = pgEnum('plan_tier', [
  'starter',
  'professional',
  'enterprise',
  'custom',
]);

// Subscriptions table
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(), // Stripe subscription ID
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),

  // Plan details
  planTier: planTierEnum('plan_tier').notNull(),
  status: subscriptionStatusEnum('status').notNull(),

  // Periods
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),

  // Cancellation
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  canceledAt: timestamp('canceled_at'),
  endedAt: timestamp('ended_at'),

  // Pricing
  basePriceId: text('base_price_id').notNull(),
  currency: text('currency').notNull().default('usd'),

  // Usage limits (from plan metadata)
  includedSensors: integer('included_sensors').notNull(),
  includedReadings: integer('included_readings').notNull(),

  // Raw Stripe object for audit
  stripeData: jsonb('stripe_data'), // Full subscription object

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Usage records table (for audit trail)
export const usageRecords = pgTable('usage_records', {
  id: text('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),

  // Metering
  metricName: text('metric_name').notNull(), // 'active_sensors' | 'temperature_readings'
  value: integer('value').notNull(),
  billingPeriodStart: timestamp('billing_period_start').notNull(),
  billingPeriodEnd: timestamp('billing_period_end').notNull(),

  // Stripe references
  stripeMeterEventId: text('stripe_meter_event_id'),
  stripeInvoiceItemId: text('stripe_invoice_item_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Invoices table (cache for quick access)
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(), // Stripe invoice ID
  subscriptionId: text('subscription_id').references(() => subscriptions.id, {
    onDelete: 'set null',
  }),
  stripeCustomerId: text('stripe_customer_id').notNull(),

  // Invoice details
  status: text('status').notNull(), // 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  amountDue: integer('amount_due').notNull(), // in cents
  amountPaid: integer('amount_paid').notNull(),
  currency: text('currency').notNull(),

  // Periods
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),

  // URLs
  invoicePdfUrl: text('invoice_pdf_url'),
  hostedInvoiceUrl: text('hosted_invoice_url'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Update Pattern via Webhooks

```typescript
// Handle subscription created/updated webhooks
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata;

  // Extract plan details from price metadata
  const baseItem = subscription.items.data.find((item) => item.price.metadata.metric === undefined);

  await db
    .insert(subscriptions)
    .values({
      id: subscription.id,
      organizationId: metadata.organization_id,
      stripeCustomerId: subscription.customer as string,
      planTier: metadata.plan_tier as PlanTier,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      basePriceId: baseItem!.price.id,
      currency: subscription.currency,
      includedSensors: parseInt(baseItem!.price.metadata.included_sensors),
      includedReadings: parseInt(baseItem!.price.metadata.included_readings),
      stripeData: subscription as any,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
        stripeData: subscription as any,
      },
    });
}
```

**Best Practices:**

- Use Stripe IDs as primary keys (easier correlation)
- Store full Stripe object in JSONB for debugging
- Keep status in sync via webhooks
- Query local DB for performance, Stripe API for authoritative state
- Never modify billing state directly - always via Stripe API + webhook sync

**Sources:**

- [A database model for SaaS subscriptions in Postgres](https://axellarsson.com/blog/modeling-saas-subscriptions-in-postgres/)
- [Suggested database architecture for SaaS with Stripe - Indie Hackers](https://www.indiehackers.com/post/suggested-database-architecture-for-my-first-saas-with-stripe-7b6ff9927f)
- [Best practices for SaaS billing - Stripe](https://stripe.com/resources/more/best-practices-for-saas-billing)

## Testing Strategies

### 1. Test Mode

Stripe provides separate test and live API keys.

**Environment Setup:**

```bash
# .env.development
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# .env.production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Test Cards:**

```typescript
// Use these card numbers in test mode
const TEST_CARDS = {
  success: '4242424242424242', // Succeeds
  declined: '4000000000000002', // Declined
  requires_3ds: '4000002500003155', // Requires 3D Secure
  insufficient_funds: '4000000000009995', // Insufficient funds
};
```

**Source:** [Testing use cases - Stripe Documentation](https://docs.stripe.com/testing-use-cases)

### 2. Stripe CLI for Webhook Testing

Install Stripe CLI for local webhook testing:

```bash
# Install
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/webhooks/stripe

# Copy webhook signing secret to .env
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

**Trigger Specific Events:**

```bash
# Trigger subscription events
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger customer.subscription.trial_will_end

# Trigger payment events
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger payment_intent.succeeded
```

**Sources:**

- [Test a webhooks integration with the Stripe CLI](https://docs.stripe.com/webhooks/test)
- [Stripe - Setting up Webhook - Ultimate Member](https://docs.ultimatemember.com/article/1607-stripe-setting-up-webhook-and-test-public-keys)

### 3. Test Clocks for Subscription Testing

Simulate time progression without waiting for actual billing cycles.

```typescript
// Create test clock
const testClock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: 'Annual subscription test',
});

// Create customer attached to test clock
const customer = await stripe.customers.create({
  email: 'test@example.com',
  test_clock: testClock.id,
});

// Create subscription (will use test clock time)
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: 'price_annual' }],
  trial_period_days: 14,
});

// Advance time by 14 days (trial end)
await stripe.testHelpers.testClocks.advance(testClock.id, {
  frozen_time: testClock.frozen_time + 14 * 24 * 60 * 60,
});

// Subscription will transition to active, webhooks fire
// Invoice will be created and payment attempted

// Advance to end of billing period
await stripe.testHelpers.testClocks.advance(testClock.id, {
  frozen_time: testClock.frozen_time + 365 * 24 * 60 * 60,
});

// Renewal invoice created, payment attempted
```

**Key Benefits:**

- Test annual renewals without waiting a year
- Test trial → active → renewal lifecycle
- Test payment failures at specific points
- Test dunning (retry) logic
- Webhooks fire as if time actually passed

**Sources:**

- [Test your integration with test clocks - Stripe Documentation](https://docs.stripe.com/billing/testing/test-clocks)
- [Test clocks: How we made it easier to test Stripe Billing integrations](https://stripe.com/blog/test-clocks-how-we-made-it-easier-to-test-stripe-billing-integrations)

### 4. Integration Testing Strategy

**Test Suite Structure:**

```typescript
// tests/billing/subscription-lifecycle.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_TEST_KEY!);

describe('Subscription Lifecycle', () => {
  let testClock: Stripe.TestHelpers.TestClock;
  let customer: Stripe.Customer;

  beforeEach(async () => {
    // Create test clock
    testClock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });

    // Create test customer
    customer = await stripe.customers.create({
      email: 'test@freshtrackpro.com',
      test_clock: testClock.id,
      metadata: { organization_id: 'test-org-123' },
    });
  });

  it('should transition from trial to active', async () => {
    // Create subscription with trial
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PROFESSIONAL_PRICE_ID }],
      trial_period_days: 14,
    });

    expect(subscription.status).toBe('trialing');

    // Advance to end of trial
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: testClock.frozen_time + 14 * 24 * 60 * 60,
    });

    // Fetch updated subscription
    const updated = await stripe.subscriptions.retrieve(subscription.id);
    expect(updated.status).toBe('active');
  });

  it('should handle payment failure', async () => {
    // Attach failing card
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_chargeDeclined' },
    });

    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customer.id,
    });

    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PROFESSIONAL_PRICE_ID }],
    });

    // Should be incomplete
    expect(subscription.status).toBe('incomplete');
  });
});

// tests/billing/webhook-handling.test.ts
describe('Webhook Handling', () => {
  it('should verify webhook signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_test',
      object: 'event',
      type: 'customer.subscription.created',
      data: { object: mockSubscription },
    });

    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

    const event = stripe.webhooks.constructEvent(payload, header, WEBHOOK_SECRET);

    expect(event.type).toBe('customer.subscription.created');
  });

  it('should reject invalid signature', async () => {
    const payload = JSON.stringify({ id: 'evt_test' });

    expect(() => {
      stripe.webhooks.constructEvent(payload, 'invalid_signature', WEBHOOK_SECRET);
    }).toThrow('No signatures found');
  });
});
```

**Sources:**

- [Generate Test Webhook Signatures - Context7](https://context7.com/stripe/stripe-node)
- [Testing Stripe Billing - Stripe Documentation](https://docs.stripe.com/billing/testing)

### 5. Usage Metering Testing

```typescript
// tests/billing/usage-metering.test.ts
describe('Usage Metering', () => {
  it('should report sensor count', async () => {
    const session = await stripe.v2.billing.meterEventSession.create();
    const streamClient = new Stripe(session.authentication_token);

    const result = await streamClient.v2.billing.meterEventStream.create({
      events: [
        {
          event_name: 'active_sensors',
          payload: {
            stripe_customer_id: customer.id,
            value: '10',
          },
          identifier: `test-${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(result.events_processed).toBe(1);
  });

  it('should accumulate reading events', async () => {
    // Report multiple batches
    await reportReadings(customer.id, 5000);
    await reportReadings(customer.id, 3000);
    await reportReadings(customer.id, 2000);

    // Query meter events (verify accumulation)
    const events = await stripe.v2.billing.meterEvents.list({
      meter: READINGS_METER_ID,
      customer: customer.id,
    });

    // Should have 3 events totaling 10,000 readings
    expect(events.data.length).toBe(3);
  });
});
```

### 6. Fixture-Based Testing

Create reusable test fixtures:

```typescript
// tests/billing/fixtures.ts
export const TEST_FIXTURES = {
  customers: {
    basic: {
      email: 'basic@test.com',
      name: 'Basic Test Org',
      metadata: { organization_id: 'org-basic' },
    },
    enterprise: {
      email: 'enterprise@test.com',
      name: 'Enterprise Test Org',
      metadata: { organization_id: 'org-enterprise' },
    },
  },

  subscriptions: {
    professional: {
      items: [
        { price: 'price_professional_base' },
        { price: 'price_sensor_overage' },
        { price: 'price_readings_overage' },
      ],
      metadata: {
        plan_tier: 'professional',
      },
    },
  },
};
```

## Multi-Tenant Organization Billing

### Organization-Level Billing

Each FreshTrack Pro organization = 1 Stripe Customer.

**Mapping:**

```
Organization (FreshTrack) ←→ Customer (Stripe)
   └── Subscription ←→ Subscription (Stripe)
   └── Users (multiple) → No direct Stripe mapping
```

**Implications:**

- Organization owner manages billing
- All users in org share subscription benefits
- Usage metering aggregated per organization
- Billing alerts go to organization owner

### Handling Team Changes

```typescript
// When organization owner changes
async function transferOwnership(organizationId: string, newOwnerId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });

  const newOwner = await db.query.users.findFirst({
    where: eq(users.id, newOwnerId),
  });

  // Update Stripe customer email
  if (org?.stripeCustomerId) {
    await stripe.customers.update(org.stripeCustomerId, {
      email: newOwner!.email,
      metadata: {
        ...org.metadata,
        owner_id: newOwnerId,
      },
    });
  }

  // Update local organization
  await db
    .update(organizations)
    .set({ ownerId: newOwnerId })
    .where(eq(organizations.id, organizationId));
}
```

### Enforcing Subscription Limits

```typescript
// Middleware to check sensor limit
async function enforceSensorLimit(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user!.organizationId;

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.organizationId, orgId),
  });

  if (!subscription || subscription.status !== 'active') {
    return reply.status(403).send({
      error: 'Active subscription required',
    });
  }

  const activeSensors = await db
    .select({ count: count() })
    .from(units)
    .where(and(eq(units.organizationId, orgId), eq(units.isActive, true)));

  if (activeSensors[0].count >= subscription.includedSensors) {
    // Check if overage is allowed (based on plan)
    const canExceed = subscription.planTier !== 'starter';

    if (!canExceed) {
      return reply.status(403).send({
        error: 'Sensor limit reached. Upgrade to add more sensors.',
        limit: subscription.includedSensors,
        current: activeSensors[0].count,
      });
    }
  }
}

// Apply to sensor creation endpoint
app.post(
  '/api/orgs/:organizationId/sensors',
  {
    preHandler: [requireAuth, requireOrgContext, enforceSensorLimit],
  },
  async (request, reply) => {
    // Create sensor...
  },
);
```

**Sources:**

- [Best practices for SaaS billing - Stripe](https://stripe.com/resources/more/best-practices-for-saas-billing)
- [Multi-tenant SaaS model with PostgreSQL - Checkly](https://www.checklyhq.com/blog/building-a-multi-tenant-saas-data-model/)

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

1. **Install Dependencies**

   ```bash
   npm install stripe
   ```

2. **Database Schema**
   - Add billing schema (subscriptions, invoices, usage_records)
   - Add `stripe_customer_id` to organizations table
   - Run migrations

3. **Environment Configuration**
   - Set up Stripe test keys
   - Configure webhook secret (from Stripe CLI)

4. **Basic Integration**
   - Initialize Stripe client
   - Create customer on organization creation
   - Store customer ID

### Phase 2: Subscriptions (Week 2)

1. **Product & Price Setup**
   - Create products in Stripe Dashboard
   - Create pricing for Starter, Professional, Enterprise
   - Create metered prices for overages

2. **Checkout Integration**
   - Implement checkout session creation
   - Handle success/cancel callbacks
   - Update subscription status from webhooks

3. **Subscription Management**
   - Implement upgrade/downgrade
   - Implement cancellation (immediate + period end)
   - Implement reactivation

### Phase 3: Usage Metering (Week 3)

1. **Meter Setup**
   - Create billing meters in Stripe
   - Configure aggregation rules

2. **Event Reporting**
   - Implement sensor count reporting (daily cron)
   - Implement reading volume reporting (on ingest)
   - Add usage records to database (audit trail)

3. **Limit Enforcement**
   - Middleware for sensor limit checks
   - Soft limits (allow overage) vs hard limits
   - Usage notifications

### Phase 4: Webhooks (Week 4)

1. **Webhook Endpoint**
   - Implement Fastify route with raw body
   - Signature verification
   - Event routing

2. **Event Handlers**
   - Subscription lifecycle handlers
   - Payment event handlers
   - Update local database state

3. **Async Processing**
   - Integrate with BullMQ (from v2.0 roadmap)
   - Queue webhook events
   - Implement retry logic

### Phase 5: Customer Portal (Week 5)

1. **Portal Configuration**
   - Configure in Stripe Dashboard
   - Enable features (payment, invoices, subscription changes)
   - Set cancellation retention offers

2. **Portal Integration**
   - Create portal session endpoint
   - Add "Manage Billing" button to settings
   - Handle return flow

3. **Custom Billing UI**
   - Display current plan
   - Show usage vs limits
   - Link to invoices

### Phase 6: Testing & Launch (Week 6)

1. **Test Suite**
   - Unit tests for webhook handlers
   - Integration tests with test clocks
   - Usage metering tests

2. **Documentation**
   - API documentation
   - Webhook event handling guide
   - Troubleshooting guide

3. **Monitoring**
   - Webhook delivery monitoring
   - Payment failure alerts
   - Usage anomaly detection

## Pitfalls & Mitigations

### 1. Webhook Signature Verification Failures

**Pitfall:** Body parsing breaks signature verification.

**Mitigation:**

- Use Fastify's `rawBody: true` option
- Never process unsigned webhooks
- Log all verification failures

**Source:** [Resolve webhook signature verification errors - Stripe Documentation](https://docs.stripe.com/webhooks/signature)

### 2. Race Conditions in Webhook Processing

**Pitfall:** Webhooks can arrive out of order or simultaneously.

**Mitigation:**

- Use event timestamps to determine order
- Implement idempotent handlers (check before update)
- Use database transactions
- Process events asynchronously with queues

**Source:** [Best practices for testing Stripe webhook event processing - LaunchDarkly](https://launchdarkly.com/blog/best-practices-for-testing-stripe-webhook-event-processing/)

### 3. Usage Metering Accuracy

**Pitfall:** Missed or duplicated metering events.

**Mitigation:**

- Use unique `identifier` field for idempotency
- Store local audit trail of sent events
- Implement retry logic with same identifier
- Monitor for discrepancies between local and Stripe data

**Source:** [Record usage for billing - Stripe Documentation](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage)

### 4. Hard-Coding Plan Limits

**Pitfall:** Plan limits in code become stale as pricing changes.

**Mitigation:**

- Store limits in Stripe price metadata
- Fetch limits from subscription object
- Cache locally in subscriptions table
- Update via webhooks when subscription changes

### 5. Testing with Production Data

**Pitfall:** Accidentally charging real customers during testing.

**Mitigation:**

- Strict key separation (test vs live)
- Environment-based configuration
- Never commit API keys to git
- Use Stripe test mode for all development

**Source:** [Testing Stripe Billing - Stripe Documentation](https://docs.stripe.com/billing/testing)

### 6. Payment Failure Handling

**Pitfall:** Immediately revoking access on first payment failure.

**Mitigation:**

- Enable Smart Retries (8 retries over 2 weeks)
- Maintain access during retry period
- Send payment update reminders
- Gracefully degrade service (read-only mode) before hard cutoff

**Sources:**

- [Best practices for SaaS billing - Stripe](https://stripe.com/resources/more/best-practices-for-saas-billing)
- [Usage metering: A guide for businesses - Stripe](https://stripe.com/resources/more/usage-metering)

### 7. Forgetting to Handle Trial End

**Pitfall:** Users surprised by charges after trial.

**Mitigation:**

- Send reminder 3 days before trial ends (webhook: `customer.subscription.trial_will_end`)
- Verify payment method exists before trial ends
- Offer option to cancel before charge
- Clear trial end date in UI

**Source:** [Webhook Events for Subscription Lifecycle Management](https://docs.stripe.com/billing/subscriptions/webhooks)

## Summary

Implementing SaaS billing with Stripe for FreshTrack Pro requires:

1. **stripe-node v19.1.0** for TypeScript integration
2. **V2 Billing Meters API** for IoT usage metering
3. **Fastify raw body support** for webhook verification
4. **Local database schema** for billing state caching
5. **Stripe Customer Portal** for self-service (faster than custom UI)
6. **Test clocks** for comprehensive subscription lifecycle testing
7. **Webhook-driven architecture** with async processing
8. **Multi-tenant mapping** (1 org = 1 Stripe customer)

**Timeline:** 6 weeks for full implementation
**Complexity:** Medium-High (Stripe handles heavy lifting, integration requires care)
**Risk:** Low (well-documented, proven patterns, strong testing tools)

## Additional Resources

### Official Stripe Documentation

- [SaaS Integrations Guide](https://docs.stripe.com/saas)
- [Build a subscriptions integration](https://stripe.com/docs/billing/subscriptions/build-subscriptions)
- [Usage-based billing implementation guide](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide)
- [Webhooks documentation](https://docs.stripe.com/webhooks)
- [Customer Portal documentation](https://docs.stripe.com/customer-management)

### Community Resources

- [Stripe Node GitHub](https://github.com/stripe/stripe-node)
- [Migration guide for v18](https://github.com/stripe/stripe-node/wiki/Migration-guide-for-v18)

### Architecture Patterns

- [A database model for SaaS subscriptions in Postgres](https://axellarsson.com/blog/modeling-saas-subscriptions-in-postgres/)
- [Designing your SaaS Database for Scale with Postgres](https://www.citusdata.com/blog/2016/10/03/designing-your-saas-database-for-high-scalability/)

---

**Research completed:** 2026-01-24
**Context7 queries:** 4 HIGH confidence
**WebSearch queries:** 6 MEDIUM confidence (verified with official sources)
**Ready for implementation:** Yes
