import Stripe from 'stripe';
import { db } from '../db/client.js';
import { organizations, subscriptions, type Subscription } from '../db/schema/tenancy.js';
import { stripeEvents, type InsertStripeEvent } from '../db/schema/billing.js';
import { eq } from 'drizzle-orm';
import type { PlanKey } from '../schemas/payments.js';

// Initialize Stripe client
const getStripeClient = (): Stripe => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new WebhookError('STRIPE_SECRET_KEY environment variable is not set');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
};

// Get webhook signing secret
const getWebhookSecret = (): string => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new WebhookError('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }
  return secret;
};

// Custom error class for webhook errors
export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookError';
  }
}

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripeClient();
  const webhookSecret = getWebhookSecret();

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    if (err instanceof Error) {
      throw new SignatureVerificationError(`Webhook signature verification failed: ${err.message}`);
    }
    throw new SignatureVerificationError('Webhook signature verification failed');
  }
}

/**
 * Handle checkout.session.completed event
 * Activates the subscription after successful payment
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const organizationId = session.client_reference_id || session.metadata?.organizationId;
  const plan = session.metadata?.plan as PlanKey | undefined;

  if (!organizationId) {
    throw new WebhookError('Missing organizationId in checkout session');
  }

  // Get customer and subscription IDs from the session
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;

  if (!customerId) {
    throw new WebhookError('Missing customer ID in checkout session');
  }

  // Get subscription details from Stripe for period info
  let currentPeriodStart: Date | undefined;
  let currentPeriodEnd: Date | undefined;

  if (subscriptionId) {
    const stripe = getStripeClient();
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    // Period info is on subscription items in newer Stripe API versions
    const firstItem = stripeSubscription.items?.data?.[0];
    if (firstItem) {
      currentPeriodStart = new Date(firstItem.current_period_start * 1000);
      currentPeriodEnd = new Date(firstItem.current_period_end * 1000);
    }
  }

  // Check if subscription already exists for this org
  const [existingSubscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  if (existingSubscription) {
    // Update existing subscription
    await db
      .update(subscriptions)
      .set({
        status: 'active',
        plan: plan || existingSubscription.plan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId ?? null,
        currentPeriodStart,
        currentPeriodEnd,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existingSubscription.id));
  } else {
    // Create new subscription
    await db.insert(subscriptions).values({
      organizationId,
      status: 'active',
      plan: plan || 'starter',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId ?? null,
      currentPeriodStart,
      currentPeriodEnd,
    });
  }

  // Update organization's sensor limit based on plan
  if (plan) {
    const sensorLimits: Record<PlanKey, number> = {
      starter: 5,
      pro: 25,
      haccp: 100,
    };
    await db
      .update(organizations)
      .set({ sensorLimit: sensorLimits[plan] })
      .where(eq(organizations.id, organizationId));
  }
}

/**
 * Handle customer.subscription.updated event
 * Syncs subscription status changes from Stripe
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  const stripeSubscriptionId = subscription.id;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  // Find subscription by Stripe subscription ID or customer ID
  let dbSubscription: Subscription | undefined;

  if (organizationId) {
    const [found] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    dbSubscription = found;
  }

  if (!dbSubscription && stripeSubscriptionId) {
    const [found] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    dbSubscription = found;
  }

  if (!dbSubscription && customerId) {
    const [found] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, customerId))
      .limit(1);
    dbSubscription = found;
  }

  if (!dbSubscription) {
    // No subscription found - this might be a new customer without our metadata
    // Log and skip silently as the checkout.session.completed event should handle creation
    return;
  }

  // Map Stripe status to our status enum
  type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'paused';
  const statusMap: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trial',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'past_due',
    incomplete: 'trial',
    incomplete_expired: 'canceled',
    paused: 'paused',
  };

  const status = statusMap[subscription.status] || 'active';

  // Extract plan from subscription items if available
  let plan: PlanKey | undefined;
  if (subscription.metadata?.plan) {
    plan = subscription.metadata.plan as PlanKey;
  }

  // Get period info from subscription items
  const firstItem = subscription.items?.data?.[0];
  const currentPeriodStart = firstItem
    ? new Date(firstItem.current_period_start * 1000)
    : undefined;
  const currentPeriodEnd = firstItem
    ? new Date(firstItem.current_period_end * 1000)
    : undefined;

  await db
    .update(subscriptions)
    .set({
      status,
      plan: plan || dbSubscription.plan,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, dbSubscription.id));
}

/**
 * Handle customer.subscription.deleted event
 * Deactivates the subscription when canceled
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  const stripeSubscriptionId = subscription.id;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  // Find subscription by Stripe subscription ID or customer ID
  let dbSubscription: Subscription | undefined;

  if (organizationId) {
    const [found] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);
    dbSubscription = found;
  }

  if (!dbSubscription && stripeSubscriptionId) {
    const [found] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    dbSubscription = found;
  }

  if (!dbSubscription && customerId) {
    const [found] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, customerId))
      .limit(1);
    dbSubscription = found;
  }

  if (!dbSubscription) {
    // Subscription not found - nothing to deactivate
    return;
  }

  await db
    .update(subscriptions)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, dbSubscription.id));
}

// Admin notification interface
export interface AdminNotification {
  type: 'payment_failed';
  customerId: string;
  organizationId?: string;
  invoiceId: string;
  amountDue: number;
  currency: string;
  attemptCount: number;
  nextPaymentAttempt: Date | null;
}

// In-memory store for admin notifications (in production, use a proper notification service)
const adminNotifications: AdminNotification[] = [];

/**
 * Handle invoice.payment_failed event
 * Notifies admin about failed payment
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) {
    throw new WebhookError('Missing customer ID in invoice');
  }

  // Find organization by customer ID
  let organizationId: string | undefined;
  const [dbSubscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (dbSubscription) {
    organizationId = dbSubscription.organizationId;

    // Update subscription status to past_due
    await db
      .update(subscriptions)
      .set({
        status: 'past_due',
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, dbSubscription.id));
  }

  // Create admin notification
  const notification: AdminNotification = {
    type: 'payment_failed',
    customerId,
    organizationId,
    invoiceId: invoice.id,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count ?? 1,
    nextPaymentAttempt: invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000)
      : null,
  };

  // Store notification (in production, send email/slack/etc)
  adminNotifications.push(notification);

  // Log for monitoring
  console.log('[Stripe Webhook] Payment failed notification:', notification);
}

/**
 * Get admin notifications (for testing/monitoring)
 */
export function getAdminNotifications(): AdminNotification[] {
  return [...adminNotifications];
}

/**
 * Clear admin notifications (for testing)
 */
export function clearAdminNotifications(): void {
  adminNotifications.length = 0;
}

/**
 * Check if a webhook event has already been processed
 * Returns true if event exists (already processed), false otherwise
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: stripeEvents.id })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, eventId))
    .limit(1);

  return !!existing;
}

/**
 * Record that a webhook event has been processed
 */
async function recordProcessedEvent(eventId: string, eventType: string): Promise<void> {
  const insert: InsertStripeEvent = {
    eventId,
    eventType,
  };

  await db.insert(stripeEvents).values(insert).onConflictDoNothing();
}

/**
 * Main webhook event handler
 * Routes events to appropriate handlers with idempotency protection
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  // Idempotency check - Stripe retries failed webhooks for up to 3 days
  if (await isEventProcessed(event.id)) {
    console.log(`[Stripe Webhook] Event ${event.id} already processed, skipping`);
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      break;
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(subscription);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePaymentFailed(invoice);
      break;
    }
    default:
      // Unhandled event type - log for monitoring
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  // Record successful processing for idempotency
  await recordProcessedEvent(event.id, event.type);
}
