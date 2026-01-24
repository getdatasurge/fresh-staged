import Stripe from 'stripe';
import { db } from '../db/client.js';
import { organizations, subscriptions } from '../db/schema/tenancy.js';
import { eq } from 'drizzle-orm';
import {
  STRIPE_PLANS,
  type PlanKey,
  type CheckoutSessionResponse,
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
  params: CreateCheckoutSessionParams
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
