/**
 * Tests for Units tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List units in area
 * - get: Unit retrieval by ID
 * - create: Unit creation (manager/admin/owner only)
 * - update: Unit modification (manager/admin/owner only)
 * - delete: Unit soft deletion (manager/admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { unitsRouter } from '../../src/routers/units.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the unit service
vi.mock('../../src/services/unit.service.js', () => ({
  listUnits: vi.fn(),
  getUnit: vi.fn(),
  createUnit: vi.fn(),
  updateUnit: vi.fn(),
  deleteUnit: vi.fn(),
}));

describe('Units tRPC Router', () => {
  const createCaller = createCallerFactory(unitsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListUnits: ReturnType<typeof vi.fn>;
  let mockGetUnit: ReturnType<typeof vi.fn>;
  let mockCreateUnit: ReturnType<typeof vi.fn>;
  let mockUpdateUnit: ReturnType<typeof vi.fn>;
  let mockDeleteUnit: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const siteId = '223e4567-e89b-12d3-a456-426614174001';
  const areaId = '323e4567-e89b-12d3-a456-426614174002';
  const unitId = '423e4567-e89b-12d3-a456-426614174003';

  // Sample unit data
  const mockUnit = {
    id: unitId,
    areaId: areaId,
    name: 'Walk-in Cooler 1',
    unitType: 'walk_in_cooler',
    status: 'ok',
    tempMin: 32,
    tempMax: 40,
    tempUnit: 'F',
    manualMonitoringRequired: false,
    manualMonitoringInterval: null,
    lastReadingAt: new Date('2024-01-01T12:00:00Z'),
    lastTemperature: 3500,
    isActive: true,
    sortOrder: 0,
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
    const unitService = await import('../../src/services/unit.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListUnits = unitService.listUnits as any;
    mockGetUnit = unitService.getUnit as any;
    mockCreateUnit = unitService.createUnit as any;
    mockUpdateUnit = unitService.updateUnit as any;
    mockDeleteUnit = unitService.deleteUnit as any;

    // Default to manager role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('manager');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('list', () => {
    it('should list units for area', async () => {
      const mockUnits = [mockUnit, { ...mockUnit, id: '523e4567-e89b-12d3-a456-426614174004', name: 'Freezer 1' }];
      mockListUnits.mockResolvedValue(mockUnits);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId, siteId, areaId });

      expect(result).toEqual(mockUnits);
      expect(mockListUnits).toHaveBeenCalledWith(areaId, siteId, orgId);
    });

    it('should throw NOT_FOUND when area not found', async () => {
      mockListUnits.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.list({ organizationId: orgId, siteId, areaId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.list({ organizationId: orgId, siteId, areaId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Area not found',
      });
    });

    it('should return empty array when no units', async () => {
      mockListUnits.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId, siteId, areaId });

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('should get unit by ID', async () => {
      mockGetUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId, siteId, areaId, unitId });

      expect(result).toEqual(mockUnit);
      expect(mockGetUnit).toHaveBeenCalledWith(unitId, areaId, siteId, orgId);
    });

    it('should throw NOT_FOUND when unit does not exist', async () => {
      mockGetUnit.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.get({ organizationId: orgId, siteId, areaId, unitId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.get({ organizationId: orgId, siteId, areaId, unitId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unit not found',
      });
    });
  });

  describe('create', () => {
    it('should create unit when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockCreateUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        siteId,
        areaId,
        data: {
          name: 'Walk-in Cooler 1',
          unitType: 'walk_in_cooler',
          tempMin: 32,
          tempMax: 40,
          tempUnit: 'F',
        },
      });

      expect(result).toEqual(mockUnit);
      expect(mockCreateUnit).toHaveBeenCalledWith(
        areaId,
        siteId,
        orgId,
        expect.objectContaining({
          name: 'Walk-in Cooler 1',
          unitType: 'walk_in_cooler',
          tempMin: 32,
          tempMax: 40,
          tempUnit: 'F',
        })
      );
    });

    it('should create unit when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockCreateUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        siteId,
        areaId,
        data: {
          name: 'Walk-in Cooler 1',
          unitType: 'walk_in_cooler',
          tempMin: 32,
          tempMax: 40,
        },
      });

      expect(result).toEqual(mockUnit);
    });

    it('should create unit when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockCreateUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        siteId,
        areaId,
        data: {
          name: 'Walk-in Cooler 1',
          unitType: 'walk_in_cooler',
          tempMin: 32,
          tempMax: 40,
        },
      });

      expect(result).toEqual(mockUnit);
    });

    it('should throw FORBIDDEN when staff tries to create', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          areaId,
          data: {
            name: 'Walk-in Cooler 1',
            unitType: 'walk_in_cooler',
            tempMin: 32,
            tempMax: 40,
          },
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          areaId,
          data: {
            name: 'Walk-in Cooler 1',
            unitType: 'walk_in_cooler',
            tempMin: 32,
            tempMax: 40,
          },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when viewer tries to create', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          areaId,
          data: {
            name: 'Walk-in Cooler 1',
            unitType: 'walk_in_cooler',
            tempMin: 32,
            tempMax: 40,
          },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when area does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockCreateUnit.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          areaId,
          data: {
            name: 'Walk-in Cooler 1',
            unitType: 'walk_in_cooler',
            tempMin: 32,
            tempMax: 40,
          },
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Area not found',
      });
    });
  });

  describe('update', () => {
    it('should update unit when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      const updatedUnit = { ...mockUnit, name: 'Updated Cooler' };
      mockUpdateUnit.mockResolvedValue(updatedUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        siteId,
        areaId,
        unitId,
        data: { name: 'Updated Cooler' },
      });

      expect(result).toEqual(updatedUnit);
      expect(mockUpdateUnit).toHaveBeenCalledWith(
        unitId,
        areaId,
        siteId,
        orgId,
        { name: 'Updated Cooler' }
      );
    });

    it('should throw FORBIDDEN when staff tries to update', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          areaId,
          unitId,
          data: { name: 'Updated Cooler' },
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          areaId,
          unitId,
          data: { name: 'Updated Cooler' },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when unit does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockUpdateUnit.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          areaId,
          unitId,
          data: { name: 'Updated Cooler' },
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unit not found',
      });
    });
  });

  describe('delete', () => {
    it('should delete unit when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDeleteUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId, areaId, unitId });

      expect(mockDeleteUnit).toHaveBeenCalledWith(unitId, areaId, siteId, orgId);
    });

    it('should delete unit when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeleteUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId, areaId, unitId });

      expect(mockDeleteUnit).toHaveBeenCalledWith(unitId, areaId, siteId, orgId);
    });

    it('should delete unit when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockDeleteUnit.mockResolvedValue(mockUnit);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId, areaId, unitId });

      expect(mockDeleteUnit).toHaveBeenCalledWith(unitId, areaId, siteId, orgId);
    });

    it('should throw FORBIDDEN when staff tries to delete', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({ organizationId: orgId, siteId, areaId, unitId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.delete({ organizationId: orgId, siteId, areaId, unitId })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when unit does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDeleteUnit.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({ organizationId: orgId, siteId, areaId, unitId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Unit not found',
      });
    });
  });
});
