import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Stripe from 'stripe';

// Mock the database client
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock Stripe with proper implementation
const mockRetrieveSubscription = vi.fn().mockResolvedValue({
  items: {
    data: [
      {
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      },
    ],
  },
});

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      webhooks = {
        constructEvent: vi.fn(),
      };
      subscriptions = {
        retrieve: mockRetrieveSubscription,
      };
    },
  };
});

// Set up environment variables before importing the service
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

import { db } from '../../src/db/client.js';
import * as stripeWebhookService from '../../src/services/stripe-webhook.service.js';

const mockDb = vi.mocked(db);

// Test constants
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_CUSTOMER_ID = 'cus_test123';
const TEST_SUBSCRIPTION_ID = 'sub_test123';

describe('Stripe Webhook Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stripeWebhookService.clearAdminNotifications();
  });

  describe('handleCheckoutCompleted', () => {
    it('should create new subscription when none exists', async () => {
      const session = {
        id: 'cs_test123',
        client_reference_id: TEST_ORG_ID,
        customer: TEST_CUSTOMER_ID,
        subscription: TEST_SUBSCRIPTION_ID,
        metadata: {
          organizationId: TEST_ORG_ID,
          plan: 'pro',
          userId: 'user_test123',
        },
      } as unknown as Stripe.Checkout.Session;

      // Mock db.select to return no existing subscription
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      // Mock db.insert
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      // Mock db.update
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleCheckoutCompleted(session);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing subscription when one exists', async () => {
      const session = {
        id: 'cs_test123',
        client_reference_id: TEST_ORG_ID,
        customer: TEST_CUSTOMER_ID,
        subscription: TEST_SUBSCRIPTION_ID,
        metadata: {
          organizationId: TEST_ORG_ID,
          plan: 'haccp',
        },
      } as unknown as Stripe.Checkout.Session;

      // Mock db.select to return existing subscription
      const existingSubscription = {
        id: 'sub_db_123',
        organizationId: TEST_ORG_ID,
        plan: 'starter',
        status: 'trial',
      };
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existingSubscription]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      // Mock db.update
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleCheckoutCompleted(session);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw WebhookError when organizationId is missing', async () => {
      const session = {
        id: 'cs_test123',
        customer: TEST_CUSTOMER_ID,
        // No client_reference_id or metadata.organizationId
        metadata: {},
      } as unknown as Stripe.Checkout.Session;

      await expect(stripeWebhookService.handleCheckoutCompleted(session))
        .rejects.toThrow(stripeWebhookService.WebhookError);
    });

    it('should throw WebhookError when customer ID is missing', async () => {
      const session = {
        id: 'cs_test123',
        client_reference_id: TEST_ORG_ID,
        // No customer
        metadata: { organizationId: TEST_ORG_ID },
      } as unknown as Stripe.Checkout.Session;

      await expect(stripeWebhookService.handleCheckoutCompleted(session))
        .rejects.toThrow(stripeWebhookService.WebhookError);
    });
  });

  describe('handleSubscriptionUpdated', () => {
    it('should update subscription status to active', async () => {
      const subscription = {
        id: TEST_SUBSCRIPTION_ID,
        customer: TEST_CUSTOMER_ID,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        canceled_at: null,
        metadata: {
          organizationId: TEST_ORG_ID,
          plan: 'pro',
        },
      } as unknown as Stripe.Subscription;

      const existingSubscription = {
        id: 'sub_db_123',
        organizationId: TEST_ORG_ID,
        plan: 'starter',
      };

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existingSubscription]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleSubscriptionUpdated(subscription);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should map past_due status correctly', async () => {
      const subscription = {
        id: TEST_SUBSCRIPTION_ID,
        customer: TEST_CUSTOMER_ID,
        status: 'past_due',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        canceled_at: null,
        metadata: { organizationId: TEST_ORG_ID },
      } as unknown as Stripe.Subscription;

      const existingSubscription = {
        id: 'sub_db_123',
        organizationId: TEST_ORG_ID,
        plan: 'pro',
      };

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existingSubscription]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleSubscriptionUpdated(subscription);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'past_due' })
      );
    });

    it('should silently skip when subscription not found', async () => {
      const subscription = {
        id: 'sub_unknown',
        customer: 'cus_unknown',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        canceled_at: null,
        metadata: {},
      } as unknown as Stripe.Subscription;

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      // Should not throw
      await stripeWebhookService.handleSubscriptionUpdated(subscription);

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('should set subscription status to canceled', async () => {
      const subscription = {
        id: TEST_SUBSCRIPTION_ID,
        customer: TEST_CUSTOMER_ID,
        status: 'canceled',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        canceled_at: Math.floor(Date.now() / 1000),
        metadata: { organizationId: TEST_ORG_ID },
      } as unknown as Stripe.Subscription;

      const existingSubscription = {
        id: 'sub_db_123',
        organizationId: TEST_ORG_ID,
        plan: 'pro',
        status: 'active',
      };

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existingSubscription]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleSubscriptionDeleted(subscription);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
          canceledAt: expect.any(Date),
        })
      );
    });

    it('should silently skip when subscription not found', async () => {
      const subscription = {
        id: 'sub_unknown',
        customer: 'cus_unknown',
        status: 'canceled',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000),
        canceled_at: Math.floor(Date.now() / 1000),
        metadata: {},
      } as unknown as Stripe.Subscription;

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      await stripeWebhookService.handleSubscriptionDeleted(subscription);

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    it('should update subscription to past_due and create notification', async () => {
      const invoice = {
        id: 'in_test123',
        customer: TEST_CUSTOMER_ID,
        subscription: TEST_SUBSCRIPTION_ID,
        amount_due: 7900,
        currency: 'usd',
        attempt_count: 1,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
        status: 'open',
      } as unknown as Stripe.Invoice;

      const existingSubscription = {
        id: 'sub_db_123',
        organizationId: TEST_ORG_ID,
        stripeCustomerId: TEST_CUSTOMER_ID,
        plan: 'pro',
        status: 'active',
      };

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existingSubscription]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleInvoicePaymentFailed(invoice);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'past_due' })
      );

      // Check notification was created
      const notifications = stripeWebhookService.getAdminNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: 'payment_failed',
        customerId: TEST_CUSTOMER_ID,
        organizationId: TEST_ORG_ID,
        invoiceId: 'in_test123',
        amountDue: 7900,
        currency: 'usd',
        attemptCount: 1,
      });
    });

    it('should create notification even when subscription not found', async () => {
      const invoice = {
        id: 'in_test456',
        customer: 'cus_unknown',
        subscription: 'sub_unknown',
        amount_due: 2900,
        currency: 'usd',
        attempt_count: 2,
        next_payment_attempt: null,
        status: 'open',
      } as unknown as Stripe.Invoice;

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      await stripeWebhookService.handleInvoicePaymentFailed(invoice);

      const notifications = stripeWebhookService.getAdminNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: 'payment_failed',
        customerId: 'cus_unknown',
        organizationId: undefined,
      });
    });

    it('should throw WebhookError when customer ID is missing', async () => {
      const invoice = {
        id: 'in_test789',
        // No customer
        subscription: TEST_SUBSCRIPTION_ID,
        amount_due: 7900,
        currency: 'usd',
      } as unknown as Stripe.Invoice;

      await expect(stripeWebhookService.handleInvoicePaymentFailed(invoice))
        .rejects.toThrow(stripeWebhookService.WebhookError);
    });
  });

  describe('handleWebhookEvent', () => {
    it('should route checkout.session.completed to handler', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            client_reference_id: TEST_ORG_ID,
            customer: TEST_CUSTOMER_ID,
            metadata: { organizationId: TEST_ORG_ID },
          },
        },
      } as unknown as Stripe.Event;

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValue(mockUpdateChain as any);

      await stripeWebhookService.handleWebhookEvent(event);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle unrecognized event types without error', async () => {
      const event = {
        type: 'customer.created',
        data: {
          object: { id: 'cus_test' },
        },
      } as unknown as Stripe.Event;

      // Should not throw
      await stripeWebhookService.handleWebhookEvent(event);
    });
  });

  describe('admin notifications', () => {
    it('should store and retrieve admin notifications', async () => {
      const invoice = {
        id: 'in_test',
        customer: TEST_CUSTOMER_ID,
        amount_due: 5000,
        currency: 'usd',
        attempt_count: 1,
        next_payment_attempt: null,
      } as unknown as Stripe.Invoice;

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      await stripeWebhookService.handleInvoicePaymentFailed(invoice);

      const notifications = stripeWebhookService.getAdminNotifications();
      expect(notifications).toHaveLength(1);
    });

    it('should clear admin notifications', async () => {
      const invoice = {
        id: 'in_test',
        customer: TEST_CUSTOMER_ID,
        amount_due: 5000,
        currency: 'usd',
        attempt_count: 1,
        next_payment_attempt: null,
      } as unknown as Stripe.Invoice;

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain as any);

      await stripeWebhookService.handleInvoicePaymentFailed(invoice);

      stripeWebhookService.clearAdminNotifications();

      const notifications = stripeWebhookService.getAdminNotifications();
      expect(notifications).toHaveLength(0);
    });
  });
});
