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

// --- Type Exports ---

export type CreateCheckoutSession = z.infer<typeof CreateCheckoutSessionSchema>;
export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponseSchema>;
