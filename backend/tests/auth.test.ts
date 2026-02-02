import type { FastifyInstance } from 'fastify';
import * as jose from 'jose';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { verifyAccessToken } from '../src/utils/jwt.js';

// Mock the JWT verification module
vi.mock('../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAccessToken);

// Helper to create a valid token response
function validTokenResponse(overrides?: Record<string, unknown>) {
  return {
    payload: {
      sub: 'user_123',
      email: 'test@example.com',
      name: 'Test',
      iss: 'stack-auth',
      aud: 'project_id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      ...overrides,
    },
    userId: 'user_123',
  };
}

describe('Authentication Middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('requireAuth', () => {
    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: expect.stringContaining('Authorization'),
      });
    });

    it('returns 401 when Authorization header is not Bearer', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Basic dXNlcjpwYXNz',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 when Bearer token is empty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer ',
        },
      });

      // Empty string after "Bearer " → still extracts empty token,
      // verifyAccessToken should reject it
      expect(response.statusCode).toBe(401);
    });

    it('returns 401 for invalid token', async () => {
      mockVerify.mockRejectedValue(new Error('Invalid token'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: expect.stringContaining('Invalid'),
      });
    });

    it('returns 401 with "Token expired" for expired JWT', async () => {
      mockVerify.mockRejectedValue(new jose.errors.JWTExpired('token expired'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer expired.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Token expired',
      });
    });

    it('returns 401 with "Invalid token claims" for claim validation failure', async () => {
      mockVerify.mockRejectedValue(new jose.errors.JWTClaimValidationFailed('audience mismatch'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer bad-claims.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid token claims',
      });
    });

    it('returns 401 with "Invalid token signature" for signature verification failure', async () => {
      mockVerify.mockRejectedValue(new jose.errors.JWSSignatureVerificationFailed());

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer tampered.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid token signature',
      });
    });

    it('returns 200 for valid token', async () => {
      mockVerify.mockResolvedValue(validTokenResponse());

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer valid.token.here',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        userId: 'user_123',
        email: 'test@example.com',
      });
    });

    it('accepts x-stack-access-token header as alternative to Authorization', async () => {
      mockVerify.mockResolvedValue(validTokenResponse());

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          'x-stack-access-token': 'stack.auth.token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockVerify).toHaveBeenCalledWith('stack.auth.token');
    });

    it('prefers Authorization Bearer over x-stack-access-token', async () => {
      mockVerify.mockResolvedValue(validTokenResponse());

      const response = await app.inject({
        method: 'GET',
        url: '/api/protected',
        headers: {
          authorization: 'Bearer bearer.token',
          'x-stack-access-token': 'stack.token',
        },
      });

      expect(response.statusCode).toBe(200);
      // Should use the Bearer token, not the stack token
      expect(mockVerify).toHaveBeenCalledWith('bearer.token');
    });
  });
});
