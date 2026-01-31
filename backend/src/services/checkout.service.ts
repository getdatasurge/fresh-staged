import Stripe from 'stripe';
import { db } from '../db/client.js';
import { organizations, subscriptions } from '../db/schema/tenancy.js';
import { devices } from '../db/schema/devices.js';
import { units } from '../db/schema/hierarchy.js';
import { areas } from '../db/schema/hierarchy.js';
import { sites } from '../db/schema/hierarchy.js';
import { eq, sql, and } from 'drizzle-orm';
import {
  STRIPE_PLANS,
  type PlanKey,
  type CheckoutSessionResponse,
  type PortalSessionResponse,
  type SubscriptionResponse,
} from '../schemas/payments.js';

// Initialize Stripe client
const getStripeClient = (): Stripe => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeConfigError('STRIPE_SECRET_KEY environment variable is not set');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-12-15.clover',
  });
};

// Custom error classes
export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigError';
  }
}

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export class PortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalError';
  }
}

interface CreateCheckoutSessionParams {
  plan: PlanKey;
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession(
  organizationId: string,
  userId: string,
  params: CreateCheckoutSessionParams,
): Promise<CheckoutSessionResponse> {
  const { plan, successUrl, cancelUrl } = params;

  // Validate plan exists and has a price
  const planConfig = STRIPE_PLANS[plan];
  if (!planConfig || !planConfig.priceId) {
    throw new CheckoutError(`Invalid plan: ${plan}`);
  }

  // Get organization details
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    throw new CheckoutError('Organization not found');
  }

  // Check for existing subscription
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  const stripe = getStripeClient();

  // Base URL for success/cancel - default to frontend
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const defaultSuccessUrl = `${baseUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}`;
  const defaultCancelUrl = `${baseUrl}/settings/billing?canceled=true`;

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: planConfig.priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl || defaultSuccessUrl,
    cancel_url: cancelUrl || defaultCancelUrl,
    client_reference_id: organizationId,
    customer: existingSub?.stripeCustomerId ?? undefined,
    customer_email: existingSub?.stripeCustomerId ? undefined : undefined, // Don't set if customer exists
    metadata: {
      organizationId,
      organizationName: org.name,
      userId,
      plan,
    },
    subscription_data: {
      metadata: {
        organizationId,
        plan,
      },
    },
  });

  if (!session.url) {
    throw new CheckoutError('Failed to create checkout session URL');
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

interface CreatePortalSessionParams {
  returnUrl?: string;
}

/**
 * Create a Stripe billing portal session for subscription management
 */
export async function createPortalSession(
  organizationId: string,
  params: CreatePortalSessionParams,
): Promise<PortalSessionResponse> {
  const { returnUrl } = params;

  // Get organization's subscription with Stripe customer ID
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  if (!subscription) {
    throw new PortalError('No subscription found for organization');
  }

  if (!subscription.stripeCustomerId) {
    throw new PortalError(
      'No Stripe customer found for organization. Please complete a checkout first.',
    );
  }

  const stripe = getStripeClient();

  // Base URL for return - default to frontend billing page
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const defaultReturnUrl = `${baseUrl}/settings/billing`;

  // Create Stripe billing portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl || defaultReturnUrl,
  });

  return {
    url: session.url,
  };
}

/**
 * Get subscription details for an organization
 */
export async function getSubscription(
  organizationId: string,
): Promise<SubscriptionResponse | null> {
  // Get subscription with organization sensor limit
  const result = await db
    .select({
      id: subscriptions.id,
      organizationId: subscriptions.organizationId,
      plan: subscriptions.plan,
      status: subscriptions.status,
      stripeCustomerId: subscriptions.stripeCustomerId,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      trialEndsAt: subscriptions.trialEndsAt,
      canceledAt: subscriptions.canceledAt,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
      sensorLimit: organizations.sensorLimit,
    })
    .from(subscriptions)
    .innerJoin(organizations, eq(subscriptions.organizationId, organizations.id))
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const sub = result[0];

  // Count active devices (sensors) for this organization through hierarchy:
  // devices → units → areas → sites → organizations
  const deviceCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(devices)
    .innerJoin(units, eq(devices.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(and(eq(sites.organizationId, organizationId), eq(devices.isActive, true)));

  const currentSensorCount = Number(deviceCountResult[0]?.count ?? 0);

  return {
    id: sub.id,
    organizationId: sub.organizationId,
    plan: sub.plan,
    status: sub.status,
    sensorLimit: sub.sensorLimit,
    currentSensorCount,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEndsAt: sub.trialEndsAt,
    canceledAt: sub.canceledAt,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  };
}
