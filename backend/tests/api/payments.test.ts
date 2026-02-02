import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service for org context
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock checkout service
vi.mock('../../src/services/checkout.service.js', () => ({
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

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as checkoutService from '../../src/services/checkout.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockCreateCheckoutSession = vi.mocked(checkoutService.createCheckoutSession);
const mockCreatePortalSession = vi.mocked(checkoutService.createPortalSession);

// Valid UUIDs (RFC 4122 v4 compliant)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_USER_ID = 'user_test123';

describe('Payments API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // Helper to mock a valid authenticated user
  function mockValidAuth(userId: string = TEST_USER_ID) {
    mockVerify.mockResolvedValue({
      payload: {
        sub: userId,
        email: 'test@example.com',
        iss: 'stack-auth',
        aud: 'project_id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      userId,
    });
    mockGetOrCreateProfile.mockResolvedValue({
      id: 'profile_test123',
      isNew: false,
    });
  }

  // Mock checkout session response
  const mockCheckoutResponse = {
    sessionId: 'cs_test_abc123',
    url: 'https://checkout.stripe.com/c/pay/cs_test_abc123',
  };

  describe('POST /api/orgs/:organizationId/payments/checkout', () => {
    const validCheckoutRequest = {
      plan: 'pro',
    };

    it('should create checkout session for authenticated user', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        sessionId: 'cs_test_abc123',
        url: expect.stringContaining('checkout.stripe.com'),
      });
    });

    it('should accept starter plan', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: { plan: 'starter' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        TEST_ORG_ID,
        TEST_USER_ID,
        expect.objectContaining({ plan: 'starter' }),
      );
    });

    it('should accept pro plan', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: { plan: 'pro' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        TEST_ORG_ID,
        TEST_USER_ID,
        expect.objectContaining({ plan: 'pro' }),
      );
    });

    it('should accept haccp plan', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: { plan: 'haccp' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        TEST_ORG_ID,
        TEST_USER_ID,
        expect.objectContaining({ plan: 'haccp' }),
      );
    });

    it('should accept custom success and cancel URLs', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          plan: 'pro',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        TEST_ORG_ID,
        TEST_USER_ID,
        expect.objectContaining({
          plan: 'pro',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }),
      );
    });

    it('should reject invalid plan', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: { plan: 'invalid_plan' },
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject enterprise plan (not available for self-checkout)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: { plan: 'enterprise' },
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject missing plan', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject invalid successUrl format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          plan: 'pro',
          successUrl: 'not-a-valid-url',
        },
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject invalid cancelUrl format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          plan: 'pro',
          cancelUrl: 'not-a-valid-url',
        },
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        payload: validCheckoutRequest,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 when Stripe is not configured', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockRejectedValue(
        new checkoutService.StripeConfigError('STRIPE_SECRET_KEY environment variable is not set'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('STRIPE_SECRET_KEY');
    });

    it('should return 400 when organization not found', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockRejectedValue(
        new checkoutService.CheckoutError('Organization not found'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Organization not found');
    });

    it('should return 400 when checkout session creation fails', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockRejectedValue(
        new checkoutService.CheckoutError('Failed to create checkout session URL'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Failed to create checkout session');
    });

    it('should allow any org member to create checkout session', async () => {
      // Viewer can create checkout
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      let response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });
      expect(response.statusCode).toBe(200);

      // Staff can create checkout
      mockGetRole.mockResolvedValue('staff');
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });
      expect(response.statusCode).toBe(200);

      // Manager can create checkout
      mockGetRole.mockResolvedValue('manager');
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });
      expect(response.statusCode).toBe(200);

      // Admin can create checkout
      mockGetRole.mockResolvedValue('admin');
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });
      expect(response.statusCode).toBe(200);

      // Owner can create checkout
      mockGetRole.mockResolvedValue('owner');
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });
      expect(response.statusCode).toBe(200);
    });

    it('should pass userId to service for metadata', async () => {
      mockValidAuth('user_specific_123');
      mockGetRole.mockResolvedValue('viewer');
      mockCreateCheckoutSession.mockResolvedValue(mockCheckoutResponse);

      await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        TEST_ORG_ID,
        'user_specific_123',
        expect.any(Object),
      );
    });

    it('should reject invalid organizationId format', async () => {
      mockValidAuth();

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/not-a-uuid/payments/checkout`,
        headers: { authorization: 'Bearer test-token' },
        payload: validCheckoutRequest,
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/orgs/:organizationId/payments/portal', () => {
    const mockPortalResponse = {
      url: 'https://billing.stripe.com/session/test_abc123',
    };

    it('should create portal session for authenticated user', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreatePortalSession.mockResolvedValue(mockPortalResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        url: expect.stringContaining('billing.stripe.com'),
      });
    });

    it('should accept custom return URL', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreatePortalSession.mockResolvedValue(mockPortalResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          returnUrl: 'https://example.com/billing',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockCreatePortalSession).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          returnUrl: 'https://example.com/billing',
        }),
      );
    });

    it('should reject invalid returnUrl format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          returnUrl: 'not-a-valid-url',
        },
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 when no subscription exists', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreatePortalSession.mockRejectedValue(
        new checkoutService.PortalError('No subscription found for organization'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('No subscription found');
    });

    it('should return 400 when no Stripe customer exists', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreatePortalSession.mockRejectedValue(
        new checkoutService.PortalError(
          'No Stripe customer found for organization. Please complete a checkout first.',
        ),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('No Stripe customer found');
    });

    it('should return 400 when Stripe is not configured', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockCreatePortalSession.mockRejectedValue(
        new checkoutService.StripeConfigError('STRIPE_SECRET_KEY environment variable is not set'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('STRIPE_SECRET_KEY');
    });

    it('should allow any org member to access portal', async () => {
      mockValidAuth();
      mockCreatePortalSession.mockResolvedValue(mockPortalResponse);

      // Viewer can access portal
      mockGetRole.mockResolvedValue('viewer');
      let response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });
      expect(response.statusCode).toBe(200);

      // Owner can access portal
      mockGetRole.mockResolvedValue('owner');
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });
      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid organizationId format', async () => {
      mockValidAuth();

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/not-a-uuid/payments/portal`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      // Schema validation errors return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
