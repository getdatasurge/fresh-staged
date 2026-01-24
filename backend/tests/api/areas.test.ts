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

// Mock area service
vi.mock('../../src/services/area.service.js', () => ({
  listAreas: vi.fn(),
  getArea: vi.fn(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
  deleteArea: vi.fn(),
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as areaService from '../../src/services/area.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockListAreas = vi.mocked(areaService.listAreas);
const mockGetArea = vi.mocked(areaService.getArea);
const mockCreateArea = vi.mocked(areaService.createArea);
const mockUpdateArea = vi.mocked(areaService.updateArea);
const mockDeleteArea = vi.mocked(areaService.deleteArea);

// Valid UUIDs (RFC 4122 v4 compliant)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_SITE_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_AREA_ID = '95e50b0a-9718-42bb-ba1c-7e56365e2c51';
const TEST_AREA_2_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_USER_ID = 'user_test123';

describe('Areas API', () => {
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

  // Mock area data
  const mockAreaData = {
    id: TEST_AREA_ID,
    siteId: TEST_SITE_ID,
    name: 'Test Area',
    description: 'Kitchen storage area',
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/orgs/:orgId/sites/:siteId/areas', () => {
    it('should list areas for site', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListAreas.mockResolvedValue([
        mockAreaData,
        { ...mockAreaData, id: TEST_AREA_2_ID, name: 'Area 2' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('should return empty array when no areas exist', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListAreas.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
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
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/orgs/:orgId/sites/:siteId/areas', () => {
    it('should create area for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockCreateArea.mockResolvedValue(mockAreaData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Area',
          description: 'Test area',
          sortOrder: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: 'Test Area',
        siteId: TEST_SITE_ID,
      });
    });

    it('should create area for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockCreateArea.mockResolvedValue(mockAreaData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Area',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 403 for manager (below admin)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New Area' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New Area' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for missing required fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},  // Missing name
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 when site is not found (hierarchy validation)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockCreateArea.mockResolvedValue(null);  // Service returns null when site not in org

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'New Area' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/orgs/:orgId/sites/:siteId/areas/:areaId', () => {
    it('should return area by ID', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetArea.mockResolvedValue(mockAreaData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_AREA_ID,
        name: 'Test Area',
        siteId: TEST_SITE_ID,
      });
    });

    it('should return 404 for non-existent area', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetArea.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/orgs/:orgId/sites/:siteId/areas/:areaId', () => {
    it('should update area for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpdateArea.mockResolvedValue({
        ...mockAreaData,
        name: 'Updated Area Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Area Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_AREA_ID,
        name: 'Updated Area Name',
      });
    });

    it('should return 403 for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Area Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent area', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpdateArea.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Area Name' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/orgs/:orgId/sites/:siteId/areas/:areaId', () => {
    it('should soft delete area for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeleteArea.mockResolvedValue({ ...mockAreaData, isActive: false });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent area', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeleteArea.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
