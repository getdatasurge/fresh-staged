/**
 * Tests for TTN Devices tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List devices for organization
 * - get: Device retrieval by ID
 * - provision: Device provisioning (manager/admin/owner only, sensor capacity check)
 * - bootstrap: Device bootstrapping (manager/admin/owner only, sensor capacity check)
 * - update: Device modification (manager/admin/owner only)
 * - deprovision: Device removal (manager/admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ttnDevicesRouter } from '../../src/routers/ttn-devices.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the TTN device service
vi.mock('../../src/services/ttn-device.service.js', () => ({
  listTTNDevices: vi.fn(),
  getTTNDevice: vi.fn(),
  provisionTTNDevice: vi.fn(),
  bootstrapTTNDevice: vi.fn(),
  updateTTNDevice: vi.fn(),
  deprovisionTTNDevice: vi.fn(),
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

// Mock the subscription middleware for sensor capacity
vi.mock('../../src/middleware/subscription.js', () => ({
  getActiveSensorCount: vi.fn(),
}));

// Mock the database client for sensor capacity check
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ sensorLimit: 100 }]),
        }),
      }),
    }),
  },
}));

// Mock the tenancy schema
vi.mock('../../src/db/schema/tenancy.js', () => ({
  organizations: {
    sensorLimit: 'sensor_limit',
    id: 'id',
  },
}));

describe('TTN Devices tRPC Router', () => {
  const createCaller = createCallerFactory(ttnDevicesRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListTTNDevices: ReturnType<typeof vi.fn>;
  let mockGetTTNDevice: ReturnType<typeof vi.fn>;
  let mockProvisionTTNDevice: ReturnType<typeof vi.fn>;
  let mockBootstrapTTNDevice: ReturnType<typeof vi.fn>;
  let mockUpdateTTNDevice: ReturnType<typeof vi.fn>;
  let mockDeprovisionTTNDevice: ReturnType<typeof vi.fn>;
  let mockGetActiveSensorCount: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const deviceId = '223e4567-e89b-12d3-a456-426614174001';
  const unitId = '323e4567-e89b-12d3-a456-426614174002';

  // Sample device data - EUIs must be 16 hex chars, appKey 32 hex chars
  const mockDevice = {
    id: deviceId,
    deviceId: 'test-device-001',
    devEui: 'A1B2C3D4E5F6A7B8', // 16 hex chars
    joinEui: 'B1C2D3E4F5A6B7C8', // 16 hex chars
    name: 'Test Device',
    description: 'A test device',
    unitId: unitId,
    status: 'active',
    lastSeenAt: new Date('2024-01-01T12:00:00Z'),
    ttnSynced: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // Sample bootstrap response data
  const mockBootstrapDevice = {
    id: deviceId,
    deviceId: 'test-device-001',
    devEui: 'A1B2C3D4E5F6A7B8', // 16 hex chars
    joinEui: 'B1C2D3E4F5A6B7C8', // 16 hex chars
    appKey: 'C1D2E3F4A5B6C7D8E1F2A3B4C5D6E7F8', // 32 hex chars
    name: 'Test Device',
    description: 'A test device',
    unitId: unitId,
    siteId: null,
    status: 'inactive',
    ttnSynced: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // Create context that simulates authenticated user
  const createOrgContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules to get references to mocked functions
    const userService = await import('../../src/services/user.service.js');
    const deviceService = await import('../../src/services/ttn-device.service.js');
    const subscriptionMiddleware = await import('../../src/middleware/subscription.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListTTNDevices = deviceService.listTTNDevices as any;
    mockGetTTNDevice = deviceService.getTTNDevice as any;
    mockProvisionTTNDevice = deviceService.provisionTTNDevice as any;
    mockBootstrapTTNDevice = deviceService.bootstrapTTNDevice as any;
    mockUpdateTTNDevice = deviceService.updateTTNDevice as any;
    mockDeprovisionTTNDevice = deviceService.deprovisionTTNDevice as any;
    mockGetActiveSensorCount = subscriptionMiddleware.getActiveSensorCount as any;

    // Default to manager role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('manager');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
    // Default to having sensor capacity available
    mockGetActiveSensorCount.mockResolvedValue(5); // 5 sensors used, limit is 100
  });

  describe('list', () => {
    it('should list devices for organization', async () => {
      const mockDevices = [mockDevice, { ...mockDevice, id: '423e4567-e89b-12d3-a456-426614174003', name: 'Device 2' }];
      mockListTTNDevices.mockResolvedValue(mockDevices);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual(mockDevices);
      expect(mockListTTNDevices).toHaveBeenCalledWith(orgId);
    });

    it('should return empty array when no devices', async () => {
      mockListTTNDevices.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('should get device by ID', async () => {
      mockGetTTNDevice.mockResolvedValue(mockDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId, deviceId });

      expect(result).toEqual(mockDevice);
      expect(mockGetTTNDevice).toHaveBeenCalledWith(deviceId, orgId);
    });

    it('should throw NOT_FOUND when device does not exist', async () => {
      mockGetTTNDevice.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.get({ organizationId: orgId, deviceId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.get({ organizationId: orgId, deviceId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
    });
  });

  describe('provision', () => {
    const provisionData = {
      deviceId: 'test-device-001',
      devEui: 'A1B2C3D4E5F6A7B8', // 16 hex chars
      joinEui: 'B1C2D3E4F5A6B7C8', // 16 hex chars
      appKey: 'C1D2E3F4A5B6C7D8E1F2A3B4C5D6E7F8', // 32 hex chars
      name: 'Test Device',
      frequencyPlanId: 'US_902_928_FSB_2' as const,
    };

    it('should provision device when user is manager with capacity', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(5);
      mockProvisionTTNDevice.mockResolvedValue(mockDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.provision({
        organizationId: orgId,
        data: provisionData,
      });

      expect(result).toEqual(mockDevice);
      // Zod adds default values, so use objectContaining for core fields
      expect(mockProvisionTTNDevice).toHaveBeenCalledWith(orgId, expect.objectContaining({
        deviceId: provisionData.deviceId,
        devEui: provisionData.devEui,
        joinEui: provisionData.joinEui,
        appKey: provisionData.appKey,
        name: provisionData.name,
      }));
    });

    it('should provision device when user is admin with capacity', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockGetActiveSensorCount.mockResolvedValue(5);
      mockProvisionTTNDevice.mockResolvedValue(mockDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.provision({
        organizationId: orgId,
        data: provisionData,
      });

      expect(result).toEqual(mockDevice);
    });

    it('should provision device when user is owner with capacity', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockGetActiveSensorCount.mockResolvedValue(5);
      mockProvisionTTNDevice.mockResolvedValue(mockDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.provision({
        organizationId: orgId,
        data: provisionData,
      });

      expect(result).toEqual(mockDevice);
    });

    it('should throw FORBIDDEN when staff tries to provision', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.provision({
          organizationId: orgId,
          data: provisionData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when viewer tries to provision', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.provision({
          organizationId: orgId,
          data: provisionData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when sensor capacity exceeded', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(100); // At limit

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.provision({
          organizationId: orgId,
          data: provisionData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Sensor capacity exceeded. Upgrade your plan to add more sensors.',
      });
    });

    it('should throw BAD_REQUEST on TTNConfigError', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const { TTNConfigError } = await import('../../src/services/ttn-device.service.js');
      mockProvisionTTNDevice.mockRejectedValue(
        new TTNConfigError('TTN connection not configured')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.provision({
          organizationId: orgId,
          data: provisionData,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'TTN connection not configured',
      });
    });

    it('should throw BAD_REQUEST on TTNProvisioningError', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const { TTNProvisioningError } = await import('../../src/services/ttn-device.service.js');
      mockProvisionTTNDevice.mockRejectedValue(
        new TTNProvisioningError('Failed to provision in TTN')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.provision({
          organizationId: orgId,
          data: provisionData,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Failed to provision in TTN',
      });
    });
  });

  describe('bootstrap', () => {
    const bootstrapData = {
      name: 'Test Device',
      frequencyPlanId: 'US_902_928_FSB_2' as const,
    };

    it('should bootstrap device when user is manager with capacity', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(5);
      mockBootstrapTTNDevice.mockResolvedValue(mockBootstrapDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.bootstrap({
        organizationId: orgId,
        data: bootstrapData,
      });

      expect(result).toEqual(mockBootstrapDevice);
      expect(mockBootstrapTTNDevice).toHaveBeenCalledWith(orgId, bootstrapData);
    });

    it('should bootstrap device when user is admin with capacity', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockGetActiveSensorCount.mockResolvedValue(5);
      mockBootstrapTTNDevice.mockResolvedValue(mockBootstrapDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.bootstrap({
        organizationId: orgId,
        data: bootstrapData,
      });

      expect(result).toEqual(mockBootstrapDevice);
    });

    it('should throw FORBIDDEN when staff tries to bootstrap', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.bootstrap({
          organizationId: orgId,
          data: bootstrapData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when sensor capacity exceeded', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(100); // At limit

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.bootstrap({
          organizationId: orgId,
          data: bootstrapData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Sensor capacity exceeded. Upgrade your plan to add more sensors.',
      });
    });

    it('should throw BAD_REQUEST on TTNConfigError', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const { TTNConfigError } = await import('../../src/services/ttn-device.service.js');
      mockBootstrapTTNDevice.mockRejectedValue(
        new TTNConfigError('TTN connection not configured')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.bootstrap({
          organizationId: orgId,
          data: bootstrapData,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'TTN connection not configured',
      });
    });

    it('should throw BAD_REQUEST on TTNProvisioningError', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetActiveSensorCount.mockResolvedValue(5);

      const { TTNProvisioningError } = await import('../../src/services/ttn-device.service.js');
      mockBootstrapTTNDevice.mockRejectedValue(
        new TTNProvisioningError('Failed to bootstrap in TTN')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.bootstrap({
          organizationId: orgId,
          data: bootstrapData,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Failed to bootstrap in TTN',
      });
    });
  });

  describe('update', () => {
    it('should update device when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      const updatedDevice = { ...mockDevice, name: 'Updated Device' };
      mockUpdateTTNDevice.mockResolvedValue(updatedDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        deviceId,
        data: { name: 'Updated Device' },
      });

      expect(result).toEqual(updatedDevice);
      expect(mockUpdateTTNDevice).toHaveBeenCalledWith(
        deviceId,
        orgId,
        { name: 'Updated Device' }
      );
    });

    it('should update device when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      const updatedDevice = { ...mockDevice, name: 'Updated Device' };
      mockUpdateTTNDevice.mockResolvedValue(updatedDevice);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        deviceId,
        data: { name: 'Updated Device' },
      });

      expect(result).toEqual(updatedDevice);
    });

    it('should throw FORBIDDEN when staff tries to update', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          deviceId,
          data: { name: 'Updated Device' },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when device does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockUpdateTTNDevice.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          deviceId,
          data: { name: 'Updated Device' },
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
    });
  });

  describe('deprovision', () => {
    it('should deprovision device when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDeprovisionTTNDevice.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.deprovision({ organizationId: orgId, deviceId });

      expect(mockDeprovisionTTNDevice).toHaveBeenCalledWith(deviceId, orgId);
    });

    it('should deprovision device when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeprovisionTTNDevice.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.deprovision({ organizationId: orgId, deviceId });

      expect(mockDeprovisionTTNDevice).toHaveBeenCalledWith(deviceId, orgId);
    });

    it('should deprovision device when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockDeprovisionTTNDevice.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.deprovision({ organizationId: orgId, deviceId });

      expect(mockDeprovisionTTNDevice).toHaveBeenCalledWith(deviceId, orgId);
    });

    it('should throw FORBIDDEN when staff tries to deprovision', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.deprovision({ organizationId: orgId, deviceId })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when viewer tries to deprovision', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.deprovision({ organizationId: orgId, deviceId })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when device does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDeprovisionTTNDevice.mockResolvedValue(false);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.deprovision({ organizationId: orgId, deviceId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Device not found',
      });
    });
  });
});
