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

// Mock TTN device service
vi.mock('../../src/services/ttn-device.service.js', () => ({
  listTTNDevices: vi.fn(),
  getTTNDevice: vi.fn(),
  provisionTTNDevice: vi.fn(),
  updateTTNDevice: vi.fn(),
  deprovisionTTNDevice: vi.fn(),
  bootstrapTTNDevice: vi.fn(),
  TTNConfigError: class TTNConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TTNConfigError';
    }
  },
  TTNProvisioningError: class TTNProvisioningError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TTNProvisioningError';
    }
  },
}));

// Mock subscription middleware (no-op for unit tests)
vi.mock('../../src/middleware/subscription.js', () => ({
  requireSensorCapacity: vi.fn((_req, _reply, done) => {
    if (typeof done === 'function') done();
  }),
  requireActiveSubscription: vi.fn((_req, _reply, done) => {
    if (typeof done === 'function') done();
  }),
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as ttnDeviceService from '../../src/services/ttn-device.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockListDevices = vi.mocked(ttnDeviceService.listTTNDevices);
const mockGetDevice = vi.mocked(ttnDeviceService.getTTNDevice);
const mockProvisionDevice = vi.mocked(ttnDeviceService.provisionTTNDevice);
const mockUpdateDevice = vi.mocked(ttnDeviceService.updateTTNDevice);
const mockDeprovisionDevice = vi.mocked(ttnDeviceService.deprovisionTTNDevice);
const mockBootstrapDevice = vi.mocked(ttnDeviceService.bootstrapTTNDevice);

// Valid UUIDs (RFC 4122 v4 compliant)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_DEVICE_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_DEVICE_2_ID = '761b1db4-846b-4664-ac3c-8ee488d945a2';
const TEST_UNIT_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_USER_ID = 'user_test123';

describe('TTN Devices API', () => {
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

  // Mock device data
  const mockDeviceData = {
    id: TEST_DEVICE_ID,
    deviceId: 'my-sensor-001',
    devEui: '0011223344556677',
    joinEui: '70B3D57ED0000000',
    name: 'Temperature Sensor 1',
    description: 'Walk-in cooler sensor',
    unitId: TEST_UNIT_ID,
    status: 'active' as const,
    lastSeenAt: new Date(),
    ttnSynced: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('GET /api/orgs/:organizationId/ttn/devices', () => {
    it('should list devices for organization', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListDevices.mockResolvedValue([
        mockDeviceData,
        { ...mockDeviceData, id: TEST_DEVICE_2_ID, deviceId: 'my-sensor-002', devEui: '0011223344556688' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('should return empty array when no devices exist', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockListDevices.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
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
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/orgs/:organizationId/ttn/devices', () => {
    const validProvisionRequest = {
      deviceId: 'my-sensor-001',
      devEui: '0011223344556677',
      joinEui: '70B3D57ED0000000',
      appKey: '00112233445566778899AABBCCDDEEFF', // 32 hex chars
      name: 'Temperature Sensor 1',
      description: 'Walk-in cooler sensor',
    };

    it('should provision device for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockProvisionDevice.mockResolvedValue(mockDeviceData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        deviceId: 'my-sensor-001',
        devEui: '0011223344556677',
      });
    });

    it('should provision device for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockProvisionDevice.mockResolvedValue(mockDeviceData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should provision device for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockProvisionDevice.mockResolvedValue(mockDeviceData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 403 for staff (below manager)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for missing required fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          deviceId: 'my-sensor-001',
          // Missing devEui, joinEui, appKey
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid devEui format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validProvisionRequest,
          devEui: 'invalid-eui', // Not 16 hex characters
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid appKey format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validProvisionRequest,
          appKey: 'short', // Not 32 hex characters
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when TTN is not configured', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockProvisionDevice.mockRejectedValue(
        new ttnDeviceService.TTNConfigError('TTN connection not configured for organization')
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('TTN connection not configured');
    });

    it('should return 400 when TTN provisioning fails', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockProvisionDevice.mockRejectedValue(
        new ttnDeviceService.TTNProvisioningError('Failed to provision device in TTN')
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices`,
        headers: { authorization: 'Bearer test-token' },
        payload: validProvisionRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Failed to provision');
    });
  });

  describe('GET /api/orgs/:organizationId/ttn/devices/:deviceId', () => {
    it('should return device by ID', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetDevice.mockResolvedValue(mockDeviceData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_DEVICE_ID,
        deviceId: 'my-sensor-001',
        devEui: '0011223344556677',
      });
    });

    it('should return 404 for non-existent device', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetDevice.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /api/orgs/:organizationId/ttn/devices/:deviceId', () => {
    it('should update device for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateDevice.mockResolvedValue({
        ...mockDeviceData,
        name: 'Updated Sensor Name',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Sensor Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_DEVICE_ID,
        name: 'Updated Sensor Name',
      });
    });

    it('should update device unitId', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateDevice.mockResolvedValue({
        ...mockDeviceData,
        unitId: TEST_UNIT_ID,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { unitId: TEST_UNIT_ID },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should update device status', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateDevice.mockResolvedValue({
        ...mockDeviceData,
        status: 'inactive',
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { status: 'inactive' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Sensor Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Sensor Name' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent device', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockUpdateDevice.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { name: 'Updated Sensor Name' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid status value', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
        payload: { status: 'invalid_status' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/orgs/:organizationId/ttn/devices/:deviceId', () => {
    it('should deprovision device for manager', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockDeprovisionDevice.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should deprovision device for admin', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockDeprovisionDevice.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should deprovision device for owner', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockDeprovisionDevice.mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 403 for staff', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent device', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockDeprovisionDevice.mockResolvedValue(false);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/${TEST_DEVICE_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/orgs/:organizationId/ttn/devices/bootstrap', () => {
    const TEST_SITE_ID = 'c419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';

    const validBootstrapRequest = {
      name: 'New Temperature Sensor',
      description: 'Walk-in cooler sensor',
    };

    const mockBootstrapResponse = {
      id: TEST_DEVICE_ID,
      deviceId: 'new-temperature-sensor-abc123',
      devEui: 'AABBCCDDEEFF0011',
      joinEui: '0011223344556677',
      appKey: 'AABBCCDDEEFF00112233445566778899',
      name: 'New Temperature Sensor',
      description: 'Walk-in cooler sensor',
      unitId: null,
      siteId: null,
      status: 'inactive' as const,
      ttnSynced: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should bootstrap device with auto-generated credentials', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockResolvedValue(mockBootstrapResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        name: 'New Temperature Sensor',
        devEui: expect.any(String),
        joinEui: expect.any(String),
        appKey: expect.any(String),
      });
      // Verify credentials are 16/16/32 hex chars
      expect(body.devEui).toHaveLength(16);
      expect(body.joinEui).toHaveLength(16);
      expect(body.appKey).toHaveLength(32);
    });

    it('should bootstrap device with custom deviceId', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockResolvedValue({
        ...mockBootstrapResponse,
        deviceId: 'custom-device-id',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validBootstrapRequest,
          deviceId: 'custom-device-id',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().deviceId).toBe('custom-device-id');
    });

    it('should bootstrap device with site association', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockResolvedValue({
        ...mockBootstrapResponse,
        siteId: TEST_SITE_ID,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validBootstrapRequest,
          siteId: TEST_SITE_ID,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().siteId).toBe(TEST_SITE_ID);
    });

    it('should bootstrap device with unit association', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockResolvedValue({
        ...mockBootstrapResponse,
        unitId: TEST_UNIT_ID,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validBootstrapRequest,
          unitId: TEST_UNIT_ID,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().unitId).toBe(TEST_UNIT_ID);
    });

    it('should bootstrap device with custom frequency plan', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockResolvedValue(mockBootstrapResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validBootstrapRequest,
          frequencyPlanId: 'EU_863_870',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockBootstrapDevice).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          frequencyPlanId: 'EU_863_870',
        })
      );
    });

    it('should return 403 for staff (below manager)', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 403 for viewer', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 400 for missing name', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          description: 'Missing name',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid deviceId format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validBootstrapRequest,
          deviceId: 'INVALID_ID!', // Invalid: uppercase and special chars
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when TTN is not configured', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockRejectedValue(
        new ttnDeviceService.TTNConfigError('TTN connection not configured for organization')
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('TTN connection not configured');
    });

    it('should return 400 when TTN provisioning fails', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockRejectedValue(
        new ttnDeviceService.TTNProvisioningError('Failed to provision device in TTN')
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Failed to provision');
    });

    it('should return 400 when site does not belong to organization', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');
      mockBootstrapDevice.mockRejectedValue(
        new ttnDeviceService.TTNProvisioningError('Site not found or does not belong to organization')
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validBootstrapRequest,
          siteId: 'd419185a-ccd5-4a1c-b1ac-8b4dfc6a01df',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('Site not found');
    });

    it('should allow admin to bootstrap device', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockBootstrapDevice.mockResolvedValue(mockBootstrapResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should allow owner to bootstrap device', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockBootstrapDevice.mockResolvedValue(mockBootstrapResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        headers: { authorization: 'Bearer test-token' },
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(201);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/ttn/devices/bootstrap`,
        payload: validBootstrapRequest,
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
