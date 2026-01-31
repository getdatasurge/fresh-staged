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

// Mock TTN gateway service
vi.mock('../../src/services/ttn-gateway.service.js', () => ({
  listTTNGateways: vi.fn(),
  getTTNGateway: vi.fn(),
  registerTTNGateway: vi.fn(),
  updateTTNGateway: vi.fn(),
  deregisterTTNGateway: vi.fn(),
  updateGatewayStatus: vi.fn(),
  TTNConfigError: class TTNConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TTNConfigError';
    }
  },
  TTNRegistrationError: class TTNRegistrationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TTNRegistrationError';
    }
  },
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as ttnGatewayService from '../../src/services/ttn-gateway.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockListGateways = vi.mocked(ttnGatewayService.listTTNGateways);
const mockGetGateway = vi.mocked(ttnGatewayService.getTTNGateway);
const mockRegisterGateway = vi.mocked(ttnGatewayService.registerTTNGateway);
const mockUpdateGateway = vi.mocked(ttnGatewayService.updateTTNGateway);
const mockDeregisterGateway = vi.mocked(ttnGatewayService.deregisterTTNGateway);
const mockUpdateStatus = vi.mocked(ttnGatewayService.updateGatewayStatus);

// Valid UUIDs (RFC 4122 v4 compliant)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_GATEWAY_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_GATEWAY_2_ID = '761b1db4-846b-4664-ac3c-8ee488d945a2';
const TEST_SITE_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_USER_ID = 'user_test123';

describe('TTN Gateways API', () => {
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

  // Mock gateway data
  const mockGatewayData = {
    id: TEST_GATEWAY_ID,
    gatewayId: 'my-gateway-001',
    gatewayEui: '0011223344556677',
    name: 'Main Building Gateway',
    description: 'Gateway on the rooftop',
    frequencyPlanId: 'US_902_928_FSB_2',
    status: 'online' as const,
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 50,
    siteId: TEST_SITE_ID,
    lastSeenAt: new Date(),
    ttnSynced: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/orgs/:organizationId/ttn/gateways', () => {
    it('should list gateways for organization', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListGateways.mockResolvedValue([
        mockGatewayData,
        {
          ...mockGatewayData,
          id: TEST_GATEWAY_2_ID,
          gatewayId: 'my-gateway-002',
          gatewayEui: '0011223344556688',
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('should return empty array when no gateways exist', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListGateways.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
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
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/orgs/:organizationId/ttn/gateways', () => {
    const validRegisterRequest = {
      gatewayId: 'my-gateway-001',
      gatewayEui: '0011223344556677',
      name: 'Main Building Gateway',
      description: 'Gateway on the rooftop',
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 50,
    };

    it('should register gateway for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockRegisterGateway.mockResolvedValue(mockGatewayData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        gatewayId: 'my-gateway-001',
        gatewayEui: '0011223344556677',
      });
    });

    it('should register gateway for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockRegisterGateway.mockResolvedValue(mockGatewayData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should register gateway for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockRegisterGateway.mockResolvedValue(mockGatewayData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 403 for staff (below manager)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for missing required fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          gatewayId: 'my-gateway-001',
          // Missing gatewayEui
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid gatewayEui format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validRegisterRequest,
          gatewayEui: 'invalid-eui', // Not 16 hex characters
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid gatewayId format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validRegisterRequest,
          gatewayId: 'INVALID_ID', // Uppercase and underscores not allowed
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid latitude', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validRegisterRequest,
          latitude: 95, // Invalid: > 90
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid longitude', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validRegisterRequest,
          longitude: -200, // Invalid: < -180
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when TTN is not configured', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockRegisterGateway.mockRejectedValue(
        new ttnGatewayService.TTNConfigError('TTN connection not configured for organization'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('TTN connection not configured');
    });

    it('should return 400 when TTN registration fails', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockRegisterGateway.mockRejectedValue(
        new ttnGatewayService.TTNRegistrationError('Failed to register gateway in TTN'),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways`,
        headers: { authorization: 'Bearer test-token' },
        payload: validRegisterRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Failed to register');
    });
  });

  describe('GET /api/orgs/:organizationId/ttn/gateways/:gatewayId', () => {
    it('should return gateway by ID', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetGateway.mockResolvedValue(mockGatewayData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_GATEWAY_ID,
        gatewayId: 'my-gateway-001',
        gatewayEui: '0011223344556677',
      });
    });

    it('should return 404 for non-existent gateway', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetGateway.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/orgs/:organizationId/ttn/gateways/:gatewayId', () => {
    it('should update gateway for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateGateway.mockResolvedValue({
        ...mockGatewayData,
        name: 'Updated Gateway Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Gateway Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_GATEWAY_ID,
        name: 'Updated Gateway Name',
      });
    });

    it('should update gateway siteId', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateGateway.mockResolvedValue({
        ...mockGatewayData,
        siteId: TEST_SITE_ID,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { siteId: TEST_SITE_ID },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should update gateway location', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateGateway.mockResolvedValue({
        ...mockGatewayData,
        latitude: 40.7128,
        longitude: -74.006,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { latitude: 40.7128, longitude: -74.006 },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Gateway Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Gateway Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent gateway', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateGateway.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Gateway Name' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid latitude', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { latitude: -95 }, // Invalid: < -90
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/orgs/:organizationId/ttn/gateways/:gatewayId', () => {
    it('should deregister gateway for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockDeregisterGateway.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should deregister gateway for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeregisterGateway.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should deregister gateway for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockDeregisterGateway.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent gateway', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockDeregisterGateway.mockResolvedValue(false);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/orgs/:organizationId/ttn/gateways/:gatewayId/status', () => {
    it('should refresh gateway status for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockUpdateStatus.mockResolvedValue({
        ...mockGatewayData,
        status: 'online',
        lastSeenAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}/status`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_GATEWAY_ID,
        status: 'online',
      });
    });

    it('should return 404 for non-existent gateway', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockUpdateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}/status`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/gateways/${TEST_GATEWAY_ID}/status`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
