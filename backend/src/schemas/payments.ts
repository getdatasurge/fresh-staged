import { z } from 'zod';

// --- Plan Configuration ---

// Subscription plans matching frontend STRIPE_PLANS
export const PlanKeySchema = z.enum(['starter', 'pro', 'haccp']);

export const STRIPE_PLANS = {
  starter: {
    name: 'Starter',
    priceId: 'price_1SiUf142uQRDu0jrOM50mqeK',
    productId: 'prod_TfqLIQxzwzsG3K',
    price: 29,
    sensorLimit: 5,
  },
  pro: {
    name: 'Pro',
    priceId: 'price_1SiUfF42uQRDu0jrJ8kCIn9u',
    productId: 'prod_TfqLvYhECPZrZ1',
    price: 79,
    sensorLimit: 25,
  },
  haccp: {
    name: 'HACCP',
    priceId: 'price_1SiUfP42uQRDu0jrAlHvwYID',
    productId: 'prod_TfqMkPMNgTsesr',
    price: 199,
    sensorLimit: 100,
  },
} as const;

export type PlanKey = z.infer<typeof PlanKeySchema>;

// --- Request Schemas ---

// POST /api/payments/checkout - Create checkout session
export const CreateCheckoutSessionSchema = z.object({
  plan: PlanKeySchema,
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// --- Response Schemas ---

// Checkout session response
export const CheckoutSessionResponseSchema = z.object({
  sessionId: z.string(),
  url: z.string().url(),
});

// POST /api/payments/portal - Create portal session
export const CreatePortalSessionSchema = z.object({
  returnUrl: z.string().url().optional(),
});

// Portal session response
export const PortalSessionResponseSchema = z.object({
  url: z.string().url(),
});

// --- Webhook Schemas ---

// Webhook response
export const WebhookResponseSchema = z.object({
  received: z.boolean(),
});

// --- Subscription Schemas ---

// Subscription status enum
export const SubscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'canceled',
  'paused',
]);

// Subscription plan enum (includes enterprise for display, but not for checkout)
export const SubscriptionPlanSchema = z.enum(['starter', 'pro', 'haccp', 'enterprise']);

// Subscription response (GET endpoint)
export const SubscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  plan: SubscriptionPlanSchema,
  status: SubscriptionStatusSchema,
  sensorLimit: z.number(),
  currentSensorCount: z.number(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  currentPeriodStart: z.coerce.date().nullable(),
  currentPeriodEnd: z.coerce.date().nullable(),
  trialEndsAt: z.coerce.date().nullable(),
  canceledAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// --- Type Exports ---

export type CreateCheckoutSession = z.infer<typeof CreateCheckoutSessionSchema>;
export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponseSchema>;
export type CreatePortalSession = z.infer<typeof CreatePortalSessionSchema>;
export type PortalSessionResponse = z.infer<typeof PortalSessionResponseSchema>;
export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;
export type SubscriptionResponse = z.infer<typeof SubscriptionResponseSchema>;
