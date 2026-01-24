import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';

// Mock JWT verification (required by app initialization)
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service (required by app initialization)
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock stripe-webhook service
vi.mock('../../src/services/stripe-webhook.service.js', () => ({
  verifyWebhookSignature: vi.fn(),
  handleWebhookEvent: vi.fn(),
  handleCheckoutCompleted: vi.fn(),
  handleSubscriptionUpdated: vi.fn(),
  handleSubscriptionDeleted: vi.fn(),
  handleInvoicePaymentFailed: vi.fn(),
  WebhookError: class WebhookError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'WebhookError';
    }
  },
  SignatureVerificationError: class SignatureVerificationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SignatureVerificationError';
    }
  },
}));

import { buildApp } from '../../src/app.js';
import * as stripeWebhookService from '../../src/services/stripe-webhook.service.js';

const mockVerifySignature = vi.mocked(stripeWebhookService.verifyWebhookSignature);
const mockHandleEvent = vi.mocked(stripeWebhookService.handleWebhookEvent);

// Test constants
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_CUSTOMER_ID = 'cus_test123';
const TEST_SUBSCRIPTION_ID = 'sub_test123';
const TEST_SESSION_ID = 'cs_test123';
const TEST_INVOICE_ID = 'in_test123';

// Helper to create mock Stripe events
function createMockEvent(type: string, data: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2025-12-15.clover',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: data,
    },
  } as Stripe.Event;
}

// Mock checkout.session.completed event
function createCheckoutCompletedEvent(): Stripe.Event {
  return createMockEvent('checkout.session.completed', {
    id: TEST_SESSION_ID,
    object: 'checkout.session',
    client_reference_id: TEST_ORG_ID,
    customer: TEST_CUSTOMER_ID,
    subscription: TEST_SUBSCRIPTION_ID,
    mode: 'subscription',
    payment_status: 'paid',
    status: 'complete',
    metadata: {
      organizationId: TEST_ORG_ID,
      plan: 'pro',
      userId: 'user_test123',
    },
  });
}

// Mock customer.subscription.updated event
function createSubscriptionUpdatedEvent(status: string = 'active'): Stripe.Event {
  return createMockEvent('customer.subscription.updated', {
    id: TEST_SUBSCRIPTION_ID,
    object: 'subscription',
    customer: TEST_CUSTOMER_ID,
    status,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    canceled_at: null,
    metadata: {
      organizationId: TEST_ORG_ID,
      plan: 'pro',
    },
  });
}

// Mock customer.subscription.deleted event
function createSubscriptionDeletedEvent(): Stripe.Event {
  return createMockEvent('customer.subscription.deleted', {
    id: TEST_SUBSCRIPTION_ID,
    object: 'subscription',
    customer: TEST_CUSTOMER_ID,
    status: 'canceled',
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    canceled_at: Math.floor(Date.now() / 1000),
    metadata: {
      organizationId: TEST_ORG_ID,
    },
  });
}

// Mock invoice.payment_failed event
function createInvoicePaymentFailedEvent(): Stripe.Event {
  return createMockEvent('invoice.payment_failed', {
    id: TEST_INVOICE_ID,
    object: 'invoice',
    customer: TEST_CUSTOMER_ID,
    subscription: TEST_SUBSCRIPTION_ID,
    amount_due: 7900,
    currency: 'usd',
    attempt_count: 1,
    next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
    status: 'open',
  });
}

describe('Stripe Webhooks API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/webhooks/stripe', () => {
    const validPayload = JSON.stringify({ type: 'test' });
    const validSignature = 't=1234567890,v1=abcdef123456';

    it('should accept valid webhook with correct signature', async () => {
      const event = createCheckoutCompletedEvent();
      mockVerifySignature.mockReturnValue(event);
      mockHandleEvent.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/stripe',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': validSignature,
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
      expect(mockVerifySignature).toHaveBeenCalled();
      expect(mockHandleEvent).toHaveBeenCalledWith(event);
    });

    it('should return 400 when stripe-signature header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/stripe',
        headers: { 'content-type': 'application/json' },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('stripe-signature');
    });

    it('should return 400 when signature verification fails', async () => {
      mockVerifySignature.mockImplementation(() => {
        throw new stripeWebhookService.SignatureVerificationError('Invalid signature');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/stripe',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'invalid_signature',
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Invalid signature');
    });

    it('should return 400 when webhook handler throws WebhookError', async () => {
      const event = createCheckoutCompletedEvent();
      mockVerifySignature.mockReturnValue(event);
      mockHandleEvent.mockRejectedValue(
        new stripeWebhookService.WebhookError('Missing organizationId')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/stripe',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': validSignature,
        },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Missing organizationId');
    });

    describe('checkout.session.completed event', () => {
      it('should process checkout completed event successfully', async () => {
        const event = createCheckoutCompletedEvent();
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('customer.subscription.updated event', () => {
      it('should process subscription updated event with active status', async () => {
        const event = createSubscriptionUpdatedEvent('active');
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });

      it('should process subscription updated event with past_due status', async () => {
        const event = createSubscriptionUpdatedEvent('past_due');
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });

      it('should process subscription updated event with trialing status', async () => {
        const event = createSubscriptionUpdatedEvent('trialing');
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('customer.subscription.deleted event', () => {
      it('should process subscription deleted event successfully', async () => {
        const event = createSubscriptionDeletedEvent();
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('invoice.payment_failed event', () => {
      it('should process payment failed event successfully', async () => {
        const event = createInvoicePaymentFailedEvent();
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(mockHandleEvent).toHaveBeenCalledWith(event);
      });
    });

    describe('unhandled event types', () => {
      it('should accept and acknowledge unhandled event types', async () => {
        const event = createMockEvent('customer.created', { id: 'cus_test' });
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: JSON.stringify(event),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ received: true });
      });
    });

    describe('error handling', () => {
      it('should handle unexpected errors gracefully', async () => {
        const event = createCheckoutCompletedEvent();
        mockVerifySignature.mockReturnValue(event);
        mockHandleEvent.mockRejectedValue(new Error('Database connection failed'));

        const response = await app.inject({
          method: 'POST',
          url: '/api/webhooks/stripe',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': validSignature,
          },
          payload: validPayload,
        });

        // Unexpected errors should result in 500
        expect(response.statusCode).toBe(500);
      });
    });
  });
});
