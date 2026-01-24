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

// Mock unit service
vi.mock('../../src/services/unit.service.js', () => ({
  listUnits: vi.fn(),
  getUnit: vi.fn(),
  createUnit: vi.fn(),
  updateUnit: vi.fn(),
  deleteUnit: vi.fn(),
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as unitService from '../../src/services/unit.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockListUnits = vi.mocked(unitService.listUnits);
const mockGetUnit = vi.mocked(unitService.getUnit);
const mockCreateUnit = vi.mocked(unitService.createUnit);
const mockUpdateUnit = vi.mocked(unitService.updateUnit);
const mockDeleteUnit = vi.mocked(unitService.deleteUnit);

// Valid UUIDs (RFC 4122 v4 compliant)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_SITE_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_AREA_ID = '95e50b0a-9718-42bb-ba1c-7e56365e2c51';
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_UNIT_2_ID = '761b1db4-846b-4664-ac3c-8ee488d945a2';
const TEST_USER_ID = 'user_test123';

describe('Units API', () => {
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

  // Mock unit data
  const mockUnitData = {
    id: TEST_UNIT_ID,
    areaId: TEST_AREA_ID,
    name: 'Test Fridge',
    unitType: 'fridge' as const,
    status: 'ok' as const,
    tempMin: 320,  // 32.0 F
    tempMax: 400,  // 40.0 F
    tempUnit: 'F' as const,
    manualMonitoringRequired: false,
    manualMonitoringInterval: null,
    lastReadingAt: null,
    lastTemperature: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units', () => {
    it('should list units for area', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListUnits.mockResolvedValue([
        mockUnitData,
        { ...mockUnitData, id: TEST_UNIT_2_ID, name: 'Freezer 1', unitType: 'freezer' as const },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('should return empty array when no units exist', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListUnits.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('should return 404 when area is not found (hierarchy validation)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListUnits.mockResolvedValue(null);  // Service returns null when area not in site/org

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/orgs/:orgId/sites/:siteId/areas/:areaId/units', () => {
    it('should create unit for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockCreateUnit.mockResolvedValue(mockUnitData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          unitType: 'fridge',
          tempMin: 320,
          tempMax: 400,
          tempUnit: 'F',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: 'Test Fridge',
        unitType: 'fridge',
        areaId: TEST_AREA_ID,
      });
    });

    it('should create unit for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockCreateUnit.mockResolvedValue(mockUnitData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          unitType: 'fridge',
          tempMin: 320,
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should create unit for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockCreateUnit.mockResolvedValue(mockUnitData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          unitType: 'fridge',
          tempMin: 320,
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 403 for staff (below manager)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          unitType: 'fridge',
          tempMin: 320,
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          unitType: 'fridge',
          tempMin: 320,
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for missing required fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          // Missing unitType, tempMin, tempMax
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when tempMin >= tempMax', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'Invalid Fridge',
          unitType: 'fridge',
          tempMin: 500,  // Higher than max
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid unitType', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Unit',
          unitType: 'invalid_type',
          tempMin: 320,
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 when area is not found', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockCreateUnit.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          name: 'New Fridge',
          unitType: 'fridge',
          tempMin: 320,
          tempMax: 400,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId', () => {
    it('should return unit by ID', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetUnit.mockResolvedValue(mockUnitData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_UNIT_ID,
        name: 'Test Fridge',
        unitType: 'fridge',
        areaId: TEST_AREA_ID,
      });
    });

    it('should return 404 for non-existent unit', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetUnit.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId', () => {
    it('should update unit for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateUnit.mockResolvedValue({
        ...mockUnitData,
        name: 'Updated Fridge Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Fridge Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_UNIT_ID,
        name: 'Updated Fridge Name',
      });
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Fridge Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Fridge Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent unit', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateUnit.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Fridge Name' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId', () => {
    it('should soft delete unit for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockDeleteUnit.mockResolvedValue({ ...mockUnitData, isActive: false });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should delete unit for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeleteUnit.mockResolvedValue({ ...mockUnitData, isActive: false });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent unit', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockDeleteUnit.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Hierarchy validation', () => {
    it('should return 404 when area is not in site', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      // Service returns null when hierarchy validation fails
      mockListUnits.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 when site is not in org', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      // Service returns null when hierarchy validation fails
      mockListUnits.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
