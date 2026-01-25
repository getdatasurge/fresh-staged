/**
 * Tests for TTN Gateways tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List gateways for organization
 * - get: Gateway retrieval by ID
 * - register: Gateway registration (manager/admin/owner only)
 * - update: Gateway modification (manager/admin/owner only)
 * - deregister: Gateway removal (manager/admin/owner only)
 * - refreshStatus: Gateway status update from TTN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ttnGatewaysRouter } from '../../src/routers/ttn-gateways.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the TTN gateway service
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

describe('TTN Gateways tRPC Router', () => {
  const createCaller = createCallerFactory(ttnGatewaysRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListTTNGateways: ReturnType<typeof vi.fn>;
  let mockGetTTNGateway: ReturnType<typeof vi.fn>;
  let mockRegisterTTNGateway: ReturnType<typeof vi.fn>;
  let mockUpdateTTNGateway: ReturnType<typeof vi.fn>;
  let mockDeregisterTTNGateway: ReturnType<typeof vi.fn>;
  let mockUpdateGatewayStatus: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const gatewayId = '223e4567-e89b-12d3-a456-426614174001';
  const siteId = '323e4567-e89b-12d3-a456-426614174002';

  // Sample gateway data
  const mockGateway = {
    id: gatewayId,
    gatewayId: 'test-gateway-001',
    gatewayEui: 'A1B2C3D4E5F6A7B8', // 16 hex chars
    name: 'Test Gateway',
    description: 'A test gateway',
    frequencyPlanId: 'US_902_928_FSB_2',
    status: 'online',
    latitude: 40.7128,
    longitude: -74.006,
    altitude: 10,
    siteId: siteId,
    lastSeenAt: new Date('2024-01-01T12:00:00Z'),
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
    const gatewayService = await import('../../src/services/ttn-gateway.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListTTNGateways = gatewayService.listTTNGateways as any;
    mockGetTTNGateway = gatewayService.getTTNGateway as any;
    mockRegisterTTNGateway = gatewayService.registerTTNGateway as any;
    mockUpdateTTNGateway = gatewayService.updateTTNGateway as any;
    mockDeregisterTTNGateway = gatewayService.deregisterTTNGateway as any;
    mockUpdateGatewayStatus = gatewayService.updateGatewayStatus as any;

    // Default to manager role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('manager');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('list', () => {
    it('should list gateways for organization', async () => {
      const mockGateways = [mockGateway, { ...mockGateway, id: '423e4567-e89b-12d3-a456-426614174003', name: 'Gateway 2' }];
      mockListTTNGateways.mockResolvedValue(mockGateways);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual(mockGateways);
      expect(mockListTTNGateways).toHaveBeenCalledWith(orgId);
    });

    it('should return empty array when no gateways', async () => {
      mockListTTNGateways.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('should get gateway by ID', async () => {
      mockGetTTNGateway.mockResolvedValue(mockGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId, gatewayId });

      expect(result).toEqual(mockGateway);
      expect(mockGetTTNGateway).toHaveBeenCalledWith(gatewayId, orgId);
    });

    it('should throw NOT_FOUND when gateway does not exist', async () => {
      mockGetTTNGateway.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.get({ organizationId: orgId, gatewayId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.get({ organizationId: orgId, gatewayId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Gateway not found',
      });
    });
  });

  describe('register', () => {
    const registerData = {
      gatewayId: 'test-gateway-001',
      gatewayEui: 'A1B2C3D4E5F6A7B8', // 16 hex chars
      name: 'Test Gateway',
      frequencyPlanId: 'US_902_928_FSB_2' as const,
    };

    it('should register gateway when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockRegisterTTNGateway.mockResolvedValue(mockGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.register({
        organizationId: orgId,
        data: registerData,
      });

      expect(result).toEqual(mockGateway);
      expect(mockRegisterTTNGateway).toHaveBeenCalledWith(orgId, registerData);
    });

    it('should register gateway when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockRegisterTTNGateway.mockResolvedValue(mockGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.register({
        organizationId: orgId,
        data: registerData,
      });

      expect(result).toEqual(mockGateway);
    });

    it('should register gateway when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockRegisterTTNGateway.mockResolvedValue(mockGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.register({
        organizationId: orgId,
        data: registerData,
      });

      expect(result).toEqual(mockGateway);
    });

    it('should throw FORBIDDEN when staff tries to register', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.register({
          organizationId: orgId,
          data: registerData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when viewer tries to register', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.register({
          organizationId: orgId,
          data: registerData,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw BAD_REQUEST on TTNConfigError', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const { TTNConfigError } = await import('../../src/services/ttn-gateway.service.js');
      mockRegisterTTNGateway.mockRejectedValue(
        new TTNConfigError('TTN connection not configured')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.register({
          organizationId: orgId,
          data: registerData,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'TTN connection not configured',
      });
    });

    it('should throw BAD_REQUEST on TTNRegistrationError', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const { TTNRegistrationError } = await import('../../src/services/ttn-gateway.service.js');
      mockRegisterTTNGateway.mockRejectedValue(
        new TTNRegistrationError('Failed to register in TTN')
      );

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.register({
          organizationId: orgId,
          data: registerData,
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Failed to register in TTN',
      });
    });
  });

  describe('update', () => {
    it('should update gateway when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      const updatedGateway = { ...mockGateway, name: 'Updated Gateway' };
      mockUpdateTTNGateway.mockResolvedValue(updatedGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        gatewayId,
        data: { name: 'Updated Gateway' },
      });

      expect(result).toEqual(updatedGateway);
      expect(mockUpdateTTNGateway).toHaveBeenCalledWith(
        gatewayId,
        orgId,
        { name: 'Updated Gateway' }
      );
    });

    it('should update gateway when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      const updatedGateway = { ...mockGateway, name: 'Updated Gateway' };
      mockUpdateTTNGateway.mockResolvedValue(updatedGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        gatewayId,
        data: { name: 'Updated Gateway' },
      });

      expect(result).toEqual(updatedGateway);
    });

    it('should throw FORBIDDEN when staff tries to update', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          gatewayId,
          data: { name: 'Updated Gateway' },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when gateway does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockUpdateTTNGateway.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          gatewayId,
          data: { name: 'Updated Gateway' },
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Gateway not found',
      });
    });
  });

  describe('deregister', () => {
    it('should deregister gateway when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDeregisterTTNGateway.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.deregister({ organizationId: orgId, gatewayId });

      expect(mockDeregisterTTNGateway).toHaveBeenCalledWith(gatewayId, orgId);
    });

    it('should deregister gateway when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeregisterTTNGateway.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.deregister({ organizationId: orgId, gatewayId });

      expect(mockDeregisterTTNGateway).toHaveBeenCalledWith(gatewayId, orgId);
    });

    it('should deregister gateway when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockDeregisterTTNGateway.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.deregister({ organizationId: orgId, gatewayId });

      expect(mockDeregisterTTNGateway).toHaveBeenCalledWith(gatewayId, orgId);
    });

    it('should throw FORBIDDEN when staff tries to deregister', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.deregister({ organizationId: orgId, gatewayId })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when viewer tries to deregister', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.deregister({ organizationId: orgId, gatewayId })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when gateway does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDeregisterTTNGateway.mockResolvedValue(false);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.deregister({ organizationId: orgId, gatewayId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Gateway not found',
      });
    });
  });

  describe('refreshStatus', () => {
    it('should refresh gateway status', async () => {
      const updatedGateway = { ...mockGateway, status: 'offline', lastSeenAt: new Date() };
      mockUpdateGatewayStatus.mockResolvedValue(updatedGateway);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.refreshStatus({ organizationId: orgId, gatewayId });

      expect(result).toEqual(updatedGateway);
      expect(mockUpdateGatewayStatus).toHaveBeenCalledWith(gatewayId, orgId);
    });

    it('should throw NOT_FOUND when gateway does not exist', async () => {
      mockUpdateGatewayStatus.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.refreshStatus({ organizationId: orgId, gatewayId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Gateway not found',
      });
    });
  });
});
