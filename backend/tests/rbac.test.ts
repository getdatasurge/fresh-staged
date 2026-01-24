import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock JWT verification
vi.mock('../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service for org context (must include getOrCreateProfile for org-context middleware)
vi.mock('../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

import { verifyAccessToken } from '../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../src/services/user.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = 'user_123';

describe('RBAC Middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();

    // Default: valid token
    mockVerify.mockResolvedValue({
      payload: {
        sub: TEST_USER_ID,
        email: 'test@example.com',
        iss: 'stack-auth',
        aud: 'project_id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      userId: TEST_USER_ID,
    });
    // Mock getOrCreateProfile for org-context middleware
    mockGetOrCreateProfile.mockResolvedValue({
      id: 'profile_test123',
      isNew: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('requireOrgContext', () => {
    it('returns 403 when user has no access to organization', async () => {
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/test`,
        headers: {
          authorization: 'Bearer valid.token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('No access'),
      });
    });

    it('returns 200 and sets org context when user has access', async () => {
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/test`,
        headers: {
          authorization: 'Bearer valid.token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        userId: TEST_USER_ID,
        organizationId: TEST_ORG_ID,
        role: 'manager',
      });
    });
  });

  describe('requireRole', () => {
    it('returns 403 when user role is below required', async () => {
      mockGetRole.mockResolvedValue('viewer'); // viewer < admin

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/users/user_456`,
        headers: {
          authorization: 'Bearer valid.token',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('admin'),
      });
    });

    it('allows user with exact required role', async () => {
      mockGetRole.mockResolvedValue('admin');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/users/user_456`,
        headers: {
          authorization: 'Bearer valid.token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows user with higher role than required', async () => {
      mockGetRole.mockResolvedValue('owner'); // owner > admin

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/users/user_456`,
        headers: {
          authorization: 'Bearer valid.token',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('enforces role hierarchy correctly', async () => {
      // Test that manager (3) cannot access admin (4) routes
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/users/user_456`,
        headers: {
          authorization: 'Bearer valid.token',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
