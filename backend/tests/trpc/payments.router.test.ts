/**
 * Tests for Payments tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - getSubscription: Get subscription details
 * - createCheckoutSession: Create Stripe checkout session
 * - createPortalSession: Create billing portal session
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { paymentsRouter } from '../../src/routers/payments.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the checkout service
vi.mock('../../src/services/checkout.service.js', () => ({
  getSubscription: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  StripeConfigError: class StripeConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StripeConfigError';
    }
  },
  CheckoutError: class CheckoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'CheckoutError';
    }
  },
  PortalError: class PortalError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PortalError';
    }
  },
}));

describe('Payments tRPC Router', () => {
  const createCaller = createCallerFactory(paymentsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockGetSubscription: ReturnType<typeof vi.fn>;
  let mockCreateCheckoutSession: ReturnType<typeof vi.fn>;
  let mockCreatePortalSession: ReturnType<typeof vi.fn>;
  let StripeConfigError: any;
  let CheckoutError: any;
  let PortalError: any;

  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const userId = 'user-123';

  // Sample subscription data
  const mockSubscription = {
    id: '223e4567-e89b-12d3-a456-426614174001',
    organizationId: orgId,
    plan: 'pro',
    status: 'active',
    sensorLimit: 25,
    currentSensorCount: 10,
    stripeCustomerId: 'cus_test123',
    stripeSubscriptionId: 'sub_test123',
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    trialEndsAt: null,
    canceledAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // Create context that simulates authenticated user
  const createOrgContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules
    const userService = await import('../../src/services/user.service.js');
    const checkoutService = await import('../../src/services/checkout.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockGetSubscription = checkoutService.getSubscription as any;
    mockCreateCheckoutSession = checkoutService.createCheckoutSession as any;
    mockCreatePortalSession = checkoutService.createPortalSession as any;
    StripeConfigError = (checkoutService as any).StripeConfigError;
    CheckoutError = (checkoutService as any).CheckoutError;
    PortalError = (checkoutService as any).PortalError;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('getSubscription', () => {
    it('should return subscription when it exists', async () => {
      mockGetSubscription.mockResolvedValue(mockSubscription);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getSubscription({ organizationId: orgId });

      expect(result).toEqual(mockSubscription);
      expect(mockGetSubscription).toHaveBeenCalledWith(orgId);
    });

    it('should return null when no subscription exists', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getSubscription({ organizationId: orgId });

      expect(result).toBeNull();
    });

    it('should work for any org member', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');
      mockGetSubscription.mockResolvedValue(mockSubscription);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getSubscription({ organizationId: orgId });

      expect(result).toEqual(mockSubscription);
    });

    it('should return subscription with trial status', async () => {
      const trialSubscription = {
        ...mockSubscription,
        status: 'trial',
        trialEndsAt: new Date('2024-01-15'),
      };
      mockGetSubscription.mockResolvedValue(trialSubscription);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getSubscription({ organizationId: orgId });

      expect(result?.status).toBe('trial');
      expect(result?.trialEndsAt).toEqual(new Date('2024-01-15'));
    });
  });

  describe('createCheckoutSession', () => {
    const validInput = {
      organizationId: orgId,
      data: {
        plan: 'pro' as const,
      },
    };

    const mockSession = {
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    };

    it('should create checkout session successfully', async () => {
      mockCreateCheckoutSession.mockResolvedValue(mockSession);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.createCheckoutSession(validInput);

      expect(result).toEqual(mockSession);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        orgId,
        userId,
        validInput.data
      );
    });

    it('should create checkout session with custom URLs', async () => {
      mockCreateCheckoutSession.mockResolvedValue(mockSession);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.createCheckoutSession({
        organizationId: orgId,
        data: {
          plan: 'haccp',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        },
      });

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        orgId,
        userId,
        {
          plan: 'haccp',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }
      );
    });

    it('should throw BAD_REQUEST for StripeConfigError', async () => {
      mockCreateCheckoutSession.mockRejectedValue(
        new StripeConfigError('STRIPE_SECRET_KEY not configured')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createCheckoutSession(validInput)).rejects.toThrow(TRPCError);

      await expect(caller.createCheckoutSession(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'STRIPE_SECRET_KEY not configured',
      });
    });

    it('should throw BAD_REQUEST for CheckoutError', async () => {
      mockCreateCheckoutSession.mockRejectedValue(
        new CheckoutError('Invalid plan: invalid')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createCheckoutSession(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid plan: invalid',
      });
    });

    it('should rethrow non-Stripe errors', async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error('Network error'));

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createCheckoutSession(validInput)).rejects.toThrow('Network error');
    });
  });

  describe('createPortalSession', () => {
    const validInput = {
      organizationId: orgId,
      data: {},
    };

    const mockSession = {
      url: 'https://billing.stripe.com/p/session_test_123',
    };

    it('should create portal session successfully', async () => {
      mockCreatePortalSession.mockResolvedValue(mockSession);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.createPortalSession(validInput);

      expect(result).toEqual(mockSession);
      expect(mockCreatePortalSession).toHaveBeenCalledWith(orgId, validInput.data);
    });

    it('should create portal session with custom return URL', async () => {
      mockCreatePortalSession.mockResolvedValue(mockSession);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.createPortalSession({
        organizationId: orgId,
        data: {
          returnUrl: 'https://example.com/settings/billing',
        },
      });

      expect(mockCreatePortalSession).toHaveBeenCalledWith(
        orgId,
        { returnUrl: 'https://example.com/settings/billing' }
      );
    });

    it('should throw BAD_REQUEST for StripeConfigError', async () => {
      mockCreatePortalSession.mockRejectedValue(
        new StripeConfigError('STRIPE_SECRET_KEY not set')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createPortalSession(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'STRIPE_SECRET_KEY not set',
      });
    });

    it('should throw BAD_REQUEST for PortalError', async () => {
      mockCreatePortalSession.mockRejectedValue(
        new PortalError('No subscription found for organization')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createPortalSession(validInput)).rejects.toThrow(TRPCError);

      await expect(caller.createPortalSession(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'No subscription found for organization',
      });
    });

    it('should throw BAD_REQUEST when no Stripe customer exists', async () => {
      mockCreatePortalSession.mockRejectedValue(
        new PortalError('No Stripe customer found for organization')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createPortalSession(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'No Stripe customer found for organization',
      });
    });

    it('should rethrow non-Stripe errors', async () => {
      mockCreatePortalSession.mockRejectedValue(new Error('Database error'));

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.createPortalSession(validInput)).rejects.toThrow('Database error');
    });
  });
});
