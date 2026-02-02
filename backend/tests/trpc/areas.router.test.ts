/**
 * Tests for Areas tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List areas in a site
 * - get: Area retrieval by ID
 * - create: Area creation (admin/owner only)
 * - update: Area modification (admin/owner only)
 * - delete: Area soft deletion (admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { areasRouter } from '../../src/routers/areas.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the area service
vi.mock('../../src/services/area.service.js', () => ({
  listAreas: vi.fn(),
  getArea: vi.fn(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
  deleteArea: vi.fn(),
}));

describe('Areas tRPC Router', () => {
  const createCaller = createCallerFactory(areasRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListAreas: ReturnType<typeof vi.fn>;
  let mockGetArea: ReturnType<typeof vi.fn>;
  let mockCreateArea: ReturnType<typeof vi.fn>;
  let mockUpdateArea: ReturnType<typeof vi.fn>;
  let mockDeleteArea: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const siteId = '223e4567-e89b-12d3-a456-426614174001';
  const areaId = '323e4567-e89b-12d3-a456-426614174002';

  // Sample area data
  const mockArea = {
    id: areaId,
    siteId: siteId,
    name: 'Walk-in Freezer',
    description: 'Main storage freezer for frozen goods',
    sortOrder: 1,
    isActive: true,
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
    const areaService = await import('../../src/services/area.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListAreas = areaService.listAreas as any;
    mockGetArea = areaService.getArea as any;
    mockCreateArea = areaService.createArea as any;
    mockUpdateArea = areaService.updateArea as any;
    mockDeleteArea = areaService.deleteArea as any;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('list', () => {
    it('should list areas for site', async () => {
      const mockAreas = [
        mockArea,
        {
          ...mockArea,
          id: '423e4567-e89b-12d3-a456-426614174003',
          name: 'Walk-in Cooler',
          sortOrder: 2,
        },
      ];
      mockListAreas.mockResolvedValue(mockAreas);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId, siteId });

      expect(result).toEqual(mockAreas);
      expect(mockListAreas).toHaveBeenCalledWith(siteId, orgId);
    });

    it('should return empty array when no areas', async () => {
      mockListAreas.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId, siteId });

      expect(result).toEqual([]);
    });

    it('should return empty array when site not found', async () => {
      // Area service returns empty array when site access verification fails
      mockListAreas.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId, siteId });

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('should get area by ID', async () => {
      mockGetArea.mockResolvedValue(mockArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId, siteId, areaId });

      expect(result).toEqual(mockArea);
      expect(mockGetArea).toHaveBeenCalledWith(areaId, siteId, orgId);
    });

    it('should throw NOT_FOUND when area does not exist', async () => {
      mockGetArea.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.get({ organizationId: orgId, siteId, areaId })).rejects.toThrow(
        TRPCError,
      );

      await expect(caller.get({ organizationId: orgId, siteId, areaId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Area not found',
      });
    });
  });

  describe('create', () => {
    it('should create area when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockCreateArea.mockResolvedValue(mockArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        siteId,
        data: {
          name: 'Walk-in Freezer',
          description: 'Main storage freezer for frozen goods',
          sortOrder: 1,
        },
      });

      expect(result).toEqual(mockArea);
      expect(mockCreateArea).toHaveBeenCalledWith(siteId, orgId, {
        name: 'Walk-in Freezer',
        description: 'Main storage freezer for frozen goods',
        sortOrder: 1,
      });
    });

    it('should create area when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockCreateArea.mockResolvedValue(mockArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        siteId,
        data: { name: 'Walk-in Freezer' },
      });

      expect(result).toEqual(mockArea);
    });

    it('should throw FORBIDDEN when user is viewer', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          data: { name: 'Walk-in Freezer' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          data: { name: 'Walk-in Freezer' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can create areas',
      });
    });

    it('should throw FORBIDDEN when user is member', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('member');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          data: { name: 'Walk-in Freezer' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when site does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      // createArea returns null when site not found
      mockCreateArea.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          siteId,
          data: { name: 'Walk-in Freezer' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Site not found',
      });
    });
  });

  describe('update', () => {
    it('should update area when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      const updatedArea = { ...mockArea, name: 'Updated Freezer' };
      mockUpdateArea.mockResolvedValue(updatedArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        siteId,
        areaId,
        data: { name: 'Updated Freezer' },
      });

      expect(result).toEqual(updatedArea);
      expect(mockUpdateArea).toHaveBeenCalledWith(
        areaId,
        siteId,
        orgId,
        expect.objectContaining({ name: 'Updated Freezer' }),
      );
    });

    it('should update area when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      const updatedArea = { ...mockArea, name: 'Updated Freezer' };
      mockUpdateArea.mockResolvedValue(updatedArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        siteId,
        areaId,
        data: { name: 'Updated Freezer' },
      });

      expect(result).toEqual(updatedArea);
    });

    it('should throw FORBIDDEN when non-admin tries to update', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          areaId,
          data: { name: 'Updated Freezer' },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          areaId,
          data: { name: 'Updated Freezer' },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can update areas',
      });
    });

    it('should throw NOT_FOUND when area does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpdateArea.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          areaId,
          data: { name: 'Updated Freezer' },
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Area not found',
      });
    });
  });

  describe('delete', () => {
    it('should delete area when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeleteArea.mockResolvedValue(mockArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId, areaId });

      expect(mockDeleteArea).toHaveBeenCalledWith(areaId, siteId, orgId);
    });

    it('should delete area when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockDeleteArea.mockResolvedValue(mockArea);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId, areaId });

      expect(mockDeleteArea).toHaveBeenCalledWith(areaId, siteId, orgId);
    });

    it('should throw FORBIDDEN when non-admin tries to delete', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.delete({ organizationId: orgId, siteId, areaId })).rejects.toThrow(
        TRPCError,
      );

      await expect(caller.delete({ organizationId: orgId, siteId, areaId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can delete areas',
      });
    });

    it('should throw NOT_FOUND when area does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeleteArea.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.delete({ organizationId: orgId, siteId, areaId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Area not found',
      });
    });
  });
});
