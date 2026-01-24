import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service for org context (must include getOrCreateProfile for org-context middleware)
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock organization service
vi.mock('../../src/services/organization.service.js', () => ({
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  listMembers: vi.fn(),
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as orgService from '../../src/services/organization.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockGetOrg = vi.mocked(orgService.getOrganization);
const mockUpdateOrg = vi.mocked(orgService.updateOrganization);
const mockListMembers = vi.mocked(orgService.listMembers);

// Valid UUIDs (RFC 4122 v4 compliant - Zod 4 requires proper version/variant bits)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_USER_1_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_USER_2_ID = '761b1db4-846b-4664-ac3c-8ee488d945a2';
const TEST_USER_ID = 'user_test123';

describe('Organizations API', () => {
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
    // Mock getOrCreateProfile for org-context middleware
    mockGetOrCreateProfile.mockResolvedValue({
      id: 'profile_test123',
      isNew: false,
    });
  }

  // Mock org data
  const mockOrgData = {
    id: TEST_ORG_ID,
    name: 'Test Organization',
    slug: 'test-org',
    timezone: 'UTC',
    complianceMode: 'standard' as const,
    sensorLimit: 10,
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/orgs/:organizationId', () => {
    it('should return organization for member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetOrg.mockResolvedValue(mockOrgData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_ORG_ID,
        name: 'Test Organization',
        slug: 'test-org',
      });
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      // User has no role in the target org
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}`,
        // No authorization header
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 404 when organization does not exist', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetOrg.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/orgs/:organizationId', () => {
    it('should update organization for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockUpdateOrg.mockResolvedValue({
        ...mockOrgData,
        name: 'Updated Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_ORG_ID,
        name: 'Updated Name',
      });
    });

    it('should return 403 for admin (only owner can update org)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Name' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/orgs/:organizationId/members', () => {
    it('should list organization members', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListMembers.mockResolvedValue([
        {
          userId: TEST_USER_1_ID,
          email: 'owner@example.com',
          fullName: 'Owner User',
          role: 'owner',
          joinedAt: new Date(),
        },
        {
          userId: TEST_USER_2_ID,
          email: 'viewer@example.com',
          fullName: 'Viewer User',
          role: 'viewer',
          joinedAt: new Date(),
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/members`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('should return empty array for org with no members', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockListMembers.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/members`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/members`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
