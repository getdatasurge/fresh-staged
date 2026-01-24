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
}));

// Mock site service
vi.mock('../../src/services/site.service.js', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg } from '../../src/services/user.service.js';
import * as siteService from '../../src/services/site.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockListSites = vi.mocked(siteService.listSites);
const mockGetSite = vi.mocked(siteService.getSite);
const mockCreateSite = vi.mocked(siteService.createSite);
const mockUpdateSite = vi.mocked(siteService.updateSite);
const mockDeleteSite = vi.mocked(siteService.deleteSite);

// Valid UUIDs (RFC 4122 v4 compliant - Zod 4 requires proper version/variant bits)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_SITE_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_SITE_2_ID = '95e50b0a-9718-42bb-ba1c-7e56365e2c51';
const TEST_USER_ID = 'user_test123';

describe('Sites API', () => {
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
  }

  // Mock site data
  const mockSiteData = {
    id: TEST_SITE_ID,
    organizationId: TEST_ORG_ID,
    name: 'Test Site',
    address: '123 Main St',
    city: 'Boston',
    state: 'MA',
    postalCode: '02101',
    country: 'USA',
    timezone: 'America/New_York',
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/orgs/:organizationId/sites', () => {
    it('should list sites for organization member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListSites.mockResolvedValue([
        mockSiteData,
        { ...mockSiteData, id: TEST_SITE_2_ID, name: 'Site 2' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('should return empty array when no sites exist', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListSites.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
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
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/orgs/:organizationId/sites', () => {
    it('should create site for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockCreateSite.mockResolvedValue(mockSiteData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Site',
          city: 'Boston',
          timezone: 'America/New_York',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: 'Test Site',
        organizationId: TEST_ORG_ID,
      });
    });

    it('should create site for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockCreateSite.mockResolvedValue(mockSiteData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'Owner Site',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 403 for manager (below admin)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New Site' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New Site' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New Site' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for missing required fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},  // Missing name
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for name exceeding max length', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'a'.repeat(300), // Exceeds 256 char limit
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/orgs/:organizationId/sites/:siteId', () => {
    it('should return site by ID', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetSite.mockResolvedValue(mockSiteData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_SITE_ID,
        name: 'Test Site',
        organizationId: TEST_ORG_ID,
      });
    });

    it('should return 404 for non-existent site', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetSite.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-member (cross-org protection)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/orgs/:organizationId/sites/:siteId', () => {
    it('should update site for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpdateSite.mockResolvedValue({
        ...mockSiteData,
        name: 'Updated Site Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Site Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_SITE_ID,
        name: 'Updated Site Name',
      });
    });

    it('should update site for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockUpdateSite.mockResolvedValue(mockSiteData);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Site Name' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 403 for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Site Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Site Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent site', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpdateSite.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Site Name' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/orgs/:organizationId/sites/:siteId', () => {
    it('should soft delete site for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeleteSite.mockResolvedValue({ ...mockSiteData, isActive: false });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should delete site for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockDeleteSite.mockResolvedValue({ ...mockSiteData, isActive: false });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent site', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeleteSite.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
