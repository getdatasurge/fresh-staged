/**
 * Tests for Users tRPC Router - checkSuperAdminStatus
 *
 * Tests the checkSuperAdminStatus procedure with mocked dependencies:
 * - Returns { isSuperAdmin: true } when user has SUPER_ADMIN role
 * - Returns { isSuperAdmin: false } when user does not have SUPER_ADMIN role
 * - Rejects unauthenticated requests with UNAUTHORIZED
 */

import { TRPCError } from '@trpc/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usersRouter } from '../../src/routers/users.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock user service for isSuperAdmin
vi.mock('../../src/services/user.service.js', () => ({
  isSuperAdmin: vi.fn(),
  getOrCreateProfile: vi.fn(),
  getUserPrimaryOrganization: vi.fn(),
  getUserRoleInOrg: vi.fn(),
  getProfileByUserId: vi.fn(),
}));

// Mock the database client (used by other procedures in users router)
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    query: {
      userSyncLog: {
        findFirst: vi.fn(),
      },
    },
  },
}));

describe('Users tRPC Router', () => {
  const createCaller = createCallerFactory(usersRouter);

  // Get the mocked function
  let mockIsSuperAdmin: ReturnType<typeof vi.fn>;

  // Create context that simulates authenticated super admin user
  const createSuperAdminContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'super-admin-123',
      email: 'superadmin@example.com',
      name: 'Super Admin',
    },
  });

  // Create context that simulates authenticated regular user
  const createRegularUserContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'regular-user-456',
      email: 'user@example.com',
      name: 'Regular User',
    },
  });

  // Create context without authentication
  const createNoAuthContext = () => ({
    req: {} as any,
    res: {} as any,
    user: null,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked module to get reference to mocked function
    const userService = await import('../../src/services/user.service.js');
    mockIsSuperAdmin = userService.isSuperAdmin as any;
  });

  // =========================================================================
  // checkSuperAdminStatus tests
  // =========================================================================

  describe('checkSuperAdminStatus', () => {
    it('should return { isSuperAdmin: true } when user is a super admin', async () => {
      mockIsSuperAdmin.mockResolvedValue(true);

      const ctx = createSuperAdminContext();
      const caller = createCaller(ctx);

      const result = await caller.checkSuperAdminStatus();

      expect(result).toEqual({ isSuperAdmin: true });
      expect(mockIsSuperAdmin).toHaveBeenCalledWith('super-admin-123');
      expect(mockIsSuperAdmin).toHaveBeenCalledTimes(1);
    });

    it('should return { isSuperAdmin: false } when user is not a super admin', async () => {
      mockIsSuperAdmin.mockResolvedValue(false);

      const ctx = createRegularUserContext();
      const caller = createCaller(ctx);

      const result = await caller.checkSuperAdminStatus();

      expect(result).toEqual({ isSuperAdmin: false });
      expect(mockIsSuperAdmin).toHaveBeenCalledWith('regular-user-456');
      expect(mockIsSuperAdmin).toHaveBeenCalledTimes(1);
    });

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      const ctx = createNoAuthContext();
      const caller = createCaller(ctx);

      await expect(caller.checkSuperAdminStatus()).rejects.toThrow(TRPCError);
      await expect(caller.checkSuperAdminStatus()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });

      // isSuperAdmin should not be called for unauthenticated requests
      expect(mockIsSuperAdmin).not.toHaveBeenCalled();
    });

    it('should pass the correct user ID from context to isSuperAdmin', async () => {
      mockIsSuperAdmin.mockResolvedValue(false);

      const ctx = {
        req: {} as any,
        res: {} as any,
        user: {
          id: 'specific-user-789',
          email: 'specific@example.com',
          name: 'Specific User',
        },
      };
      const caller = createCaller(ctx);

      await caller.checkSuperAdminStatus();

      expect(mockIsSuperAdmin).toHaveBeenCalledWith('specific-user-789');
    });
  });
});
