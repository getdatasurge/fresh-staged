import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Stripe before importing the service
vi.mock('stripe', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn(() => ({
      checkout: {
        sessions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock database
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(),
        })),
      })),
    })),
  },
}));

// Mock drizzle-orm eq function
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import Stripe from 'stripe';
import { db } from '../../src/db/client.js';
import {
  createCheckoutSession,
  StripeConfigError,
  CheckoutError,
} from '../../src/services/checkout.service.js';

const mockStripeSessionCreate = vi.mocked(Stripe).mock.results[0]?.value?.checkout.sessions.create;

describe('Checkout Service', () => {
  const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
  const TEST_USER_ID = 'user_test123';

  const mockOrg = {
    id: TEST_ORG_ID,
    name: 'Test Organization',
    slug: 'test-org',
    timezone: 'UTC',
    complianceMode: 'standard',
    sensorLimit: 10,
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.FRONTEND_URL = 'http://localhost:5173';

    // Mock Stripe class and session create
    const mockCreate = vi.fn();
    vi.mocked(Stripe).mockImplementation(() => ({
      checkout: {
        sessions: {
          create: mockCreate,
        },
      },
    }) as unknown as Stripe);
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.FRONTEND_URL;
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session for starter plan', async () => {
      // Mock org lookup
      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      // Mock Stripe session creation
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      };

      const mockCreate = vi.fn().mockResolvedValue(mockSession);
      vi.mocked(Stripe).mockImplementation(() => ({
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      }) as unknown as Stripe);

      const result = await createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, {
        plan: 'starter',
      });

      expect(result).toEqual({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [
            expect.objectContaining({
              price: 'price_1SiUf142uQRDu0jrOM50mqeK',
              quantity: 1,
            }),
          ],
          client_reference_id: TEST_ORG_ID,
          metadata: expect.objectContaining({
            organizationId: TEST_ORG_ID,
            organizationName: 'Test Organization',
            userId: TEST_USER_ID,
            plan: 'starter',
          }),
        })
      );
    });

    it('should create checkout session for pro plan', async () => {
      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      const mockSession = {
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
      };

      const mockCreate = vi.fn().mockResolvedValue(mockSession);
      vi.mocked(Stripe).mockImplementation(() => ({
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      }) as unknown as Stripe);

      const result = await createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, {
        plan: 'pro',
      });

      expect(result.sessionId).toBe('cs_test_456');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price: 'price_1SiUfF42uQRDu0jrJ8kCIn9u',
            }),
          ],
          metadata: expect.objectContaining({
            plan: 'pro',
          }),
        })
      );
    });

    it('should create checkout session for haccp plan', async () => {
      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      const mockSession = {
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/pay/cs_test_789',
      };

      const mockCreate = vi.fn().mockResolvedValue(mockSession);
      vi.mocked(Stripe).mockImplementation(() => ({
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      }) as unknown as Stripe);

      const result = await createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, {
        plan: 'haccp',
      });

      expect(result.sessionId).toBe('cs_test_789');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price: 'price_1SiUfP42uQRDu0jrAlHvwYID',
            }),
          ],
          metadata: expect.objectContaining({
            plan: 'haccp',
          }),
        })
      );
    });

    it('should use custom success and cancel URLs when provided', async () => {
      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      const mockSession = {
        id: 'cs_test_custom',
        url: 'https://checkout.stripe.com/pay/cs_test_custom',
      };

      const mockCreate = vi.fn().mockResolvedValue(mockSession);
      vi.mocked(Stripe).mockImplementation(() => ({
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      }) as unknown as Stripe);

      const customSuccessUrl = 'https://example.com/success';
      const customCancelUrl = 'https://example.com/cancel';

      await createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, {
        plan: 'starter',
        successUrl: customSuccessUrl,
        cancelUrl: customCancelUrl,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: customSuccessUrl,
          cancel_url: customCancelUrl,
        })
      );
    });

    it('should throw CheckoutError when organization not found', async () => {
      const mockLimit = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      await expect(
        createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'starter' })
      ).rejects.toThrow(CheckoutError);

      await expect(
        createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'starter' })
      ).rejects.toThrow('Organization not found');
    });

    it('should throw CheckoutError when Stripe returns no URL', async () => {
      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      // Return session without URL
      const mockSession = {
        id: 'cs_test_no_url',
        url: null,
      };

      const mockCreate = vi.fn().mockResolvedValue(mockSession);
      vi.mocked(Stripe).mockImplementation(() => ({
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      }) as unknown as Stripe);

      await expect(
        createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'starter' })
      ).rejects.toThrow(CheckoutError);

      await expect(
        createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'starter' })
      ).rejects.toThrow('Failed to create checkout session URL');
    });

    it('should throw StripeConfigError when STRIPE_SECRET_KEY is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      await expect(
        createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'starter' })
      ).rejects.toThrow(StripeConfigError);

      await expect(
        createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'starter' })
      ).rejects.toThrow('STRIPE_SECRET_KEY environment variable is not set');
    });

    it('should include subscription metadata with organization and plan', async () => {
      const mockLimit = vi.fn().mockResolvedValue([mockOrg]);
      const mockWhere = vi.fn(() => ({ limit: mockLimit }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as ReturnType<typeof db.select>);

      const mockSession = {
        id: 'cs_test_meta',
        url: 'https://checkout.stripe.com/pay/cs_test_meta',
      };

      const mockCreate = vi.fn().mockResolvedValue(mockSession);
      vi.mocked(Stripe).mockImplementation(() => ({
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      }) as unknown as Stripe);

      await createCheckoutSession(TEST_ORG_ID, TEST_USER_ID, { plan: 'pro' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: {
            metadata: {
              organizationId: TEST_ORG_ID,
              plan: 'pro',
            },
          },
        })
      );
    });
  });
});
