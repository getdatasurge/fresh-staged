import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock the JWT verification module
vi.mock('../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

import { verifyAccessToken } from '../src/utils/jwt.js';
const mockVerify = vi.mocked(verifyAccessToken);

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

    it('returns 200 for valid token', async () => {
      mockVerify.mockResolvedValue({
        payload: {
          sub: 'user_123',
          email: 'test@example.com',
          name: 'Test',
          iss: 'stack-auth',
          aud: 'project_id',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        },
        userId: 'user_123',
      });

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
  });
});
