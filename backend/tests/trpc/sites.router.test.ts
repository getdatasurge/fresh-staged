/**
 * Tests for Sites tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List sites in organization
 * - get: Site retrieval by ID
 * - create: Site creation (admin/owner only)
 * - update: Site modification (admin/owner only)
 * - delete: Site soft deletion (admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { sitesRouter } from '../../src/routers/sites.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the site service
vi.mock('../../src/services/site.service.js', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}));

describe('Sites tRPC Router', () => {
  const createCaller = createCallerFactory(sitesRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListSites: ReturnType<typeof vi.fn>;
  let mockGetSite: ReturnType<typeof vi.fn>;
  let mockCreateSite: ReturnType<typeof vi.fn>;
  let mockUpdateSite: ReturnType<typeof vi.fn>;
  let mockDeleteSite: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const siteId = '223e4567-e89b-12d3-a456-426614174001';

  // Sample site data
  const mockSite = {
    id: siteId,
    organizationId: orgId,
    name: 'Main Warehouse',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'USA',
    timezone: 'America/Chicago',
    latitude: null,
    longitude: null,
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
    const siteService = await import('../../src/services/site.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListSites = siteService.listSites as any;
    mockGetSite = siteService.getSite as any;
    mockCreateSite = siteService.createSite as any;
    mockUpdateSite = siteService.updateSite as any;
    mockDeleteSite = siteService.deleteSite as any;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('list', () => {
    it('should list sites for organization', async () => {
      const mockSites = [mockSite, { ...mockSite, id: '323e4567-e89b-12d3-a456-426614174002', name: 'Second Site' }];
      mockListSites.mockResolvedValue(mockSites);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual(mockSites);
      expect(mockListSites).toHaveBeenCalledWith(orgId);
    });

    it('should return empty array when no sites', async () => {
      mockListSites.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('should get site by ID', async () => {
      mockGetSite.mockResolvedValue(mockSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId, siteId });

      expect(result).toEqual(mockSite);
      expect(mockGetSite).toHaveBeenCalledWith(siteId, orgId);
    });

    it('should throw NOT_FOUND when site does not exist', async () => {
      mockGetSite.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.get({ organizationId: orgId, siteId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.get({ organizationId: orgId, siteId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Site not found',
      });
    });
  });

  describe('create', () => {
    it('should create site when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockCreateSite.mockResolvedValue(mockSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        data: {
          name: 'Main Warehouse',
          address: '123 Main St',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'USA',
          timezone: 'America/Chicago',
        },
      });

      expect(result).toEqual(mockSite);
      expect(mockCreateSite).toHaveBeenCalledWith(orgId, {
        name: 'Main Warehouse',
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
        timezone: 'America/Chicago',
      });
    });

    it('should create site when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockCreateSite.mockResolvedValue(mockSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.create({
        organizationId: orgId,
        data: { name: 'Main Warehouse' },
      });

      expect(result).toEqual(mockSite);
    });

    it('should throw FORBIDDEN when user is viewer', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          data: { name: 'Main Warehouse' },
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.create({
          organizationId: orgId,
          data: { name: 'Main Warehouse' },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can create sites',
      });
    });

    it('should throw FORBIDDEN when user is member', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('member');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.create({
          organizationId: orgId,
          data: { name: 'Main Warehouse' },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('update', () => {
    it('should update site when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      const updatedSite = { ...mockSite, name: 'Updated Warehouse' };
      mockUpdateSite.mockResolvedValue(updatedSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        siteId,
        data: { name: 'Updated Warehouse' },
      });

      expect(result).toEqual(updatedSite);
      expect(mockUpdateSite).toHaveBeenCalledWith(
        siteId,
        orgId,
        expect.objectContaining({ name: 'Updated Warehouse' })
      );
    });

    it('should update site when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      const updatedSite = { ...mockSite, name: 'Updated Warehouse' };
      mockUpdateSite.mockResolvedValue(updatedSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update({
        organizationId: orgId,
        siteId,
        data: { name: 'Updated Warehouse' },
      });

      expect(result).toEqual(updatedSite);
    });

    it('should throw FORBIDDEN when non-admin tries to update', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          data: { name: 'Updated Warehouse' },
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          data: { name: 'Updated Warehouse' },
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can update sites',
      });
    });

    it('should throw NOT_FOUND when site does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpdateSite.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.update({
          organizationId: orgId,
          siteId,
          data: { name: 'Updated Warehouse' },
        })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Site not found',
      });
    });
  });

  describe('delete', () => {
    it('should delete site when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeleteSite.mockResolvedValue(mockSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId });

      expect(mockDeleteSite).toHaveBeenCalledWith(siteId, orgId);
    });

    it('should delete site when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockDeleteSite.mockResolvedValue(mockSite);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.delete({ organizationId: orgId, siteId });

      expect(mockDeleteSite).toHaveBeenCalledWith(siteId, orgId);
    });

    it('should throw FORBIDDEN when non-admin tries to delete', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({ organizationId: orgId, siteId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.delete({ organizationId: orgId, siteId })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can delete sites',
      });
    });

    it('should throw NOT_FOUND when site does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeleteSite.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({ organizationId: orgId, siteId })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Site not found',
      });
    });
  });
});
