/**
 * Tests for Preferences tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - getDigest: Get digest preferences
 * - updateDigest: Update digest preferences and sync schedulers
 * - disableAllDigests: Disable all digests and remove schedulers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { preferencesRouter } from '../../src/routers/preferences.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the database client
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock the digest schedulers
vi.mock('../../src/jobs/schedulers/digest-schedulers.js', () => ({
  syncUserDigestSchedulers: vi.fn(),
  removeUserDigestSchedulers: vi.fn(),
}));

describe('Preferences tRPC Router', () => {
  const createCaller = createCallerFactory(preferencesRouter);

  // Get the mocked functions
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockSyncUserDigestSchedulers: ReturnType<typeof vi.fn>;
  let mockRemoveUserDigestSchedulers: ReturnType<typeof vi.fn>;

  const userId = 'user-123';
  const orgId = '123e4567-e89b-12d3-a456-426614174000';

  // Sample profile data
  const mockProfile = {
    userId,
    organizationId: orgId,
    digestDaily: true,
    digestWeekly: false,
    digestDailyTime: '08:00',
    digestSiteIds: '["site-1","site-2"]',
    timezone: 'America/New_York',
    emailEnabled: true,
  };

  // Create context that simulates authenticated user
  const createAuthContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules
    const dbModule = await import('../../src/db/client.js');
    const schedulersModule = await import('../../src/jobs/schedulers/digest-schedulers.js');

    mockDb = dbModule.db as any;
    mockSyncUserDigestSchedulers = schedulersModule.syncUserDigestSchedulers as any;
    mockRemoveUserDigestSchedulers = schedulersModule.removeUserDigestSchedulers as any;

    // Setup default mock chain for select
    const mockSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockProfile]),
    };
    mockDb.select.mockReturnValue(mockSelectChain);

    // Setup default mock chain for update
    const mockUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([mockProfile]),
    };
    mockDb.update.mockReturnValue(mockUpdateChain);

    // Setup scheduler mocks
    mockSyncUserDigestSchedulers.mockResolvedValue(undefined);
    mockRemoveUserDigestSchedulers.mockResolvedValue(undefined);
  });

  describe('getDigest', () => {
    it('should return digest preferences', async () => {
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.getDigest();

      expect(result).toEqual({
        digestDaily: true,
        digestWeekly: false,
        digestDailyTime: '08:00',
        digestSiteIds: ['site-1', 'site-2'],
        timezone: 'America/New_York',
        emailEnabled: true,
      });
    });

    it('should return null digestSiteIds when not set', async () => {
      const profileNoSites = { ...mockProfile, digestSiteIds: null };
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([profileNoSites]),
      };
      mockDb.select.mockReturnValue(mockSelectChain);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.getDigest();

      expect(result.digestSiteIds).toBeNull();
    });

    it('should throw NOT_FOUND when profile does not exist', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      await expect(caller.getDigest()).rejects.toThrow(TRPCError);

      await expect(caller.getDigest()).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Profile not found',
      });
    });
  });

  describe('updateDigest', () => {
    it('should update digest preferences', async () => {
      const updatedProfile = {
        ...mockProfile,
        digestDaily: false,
        digestWeekly: true,
      };
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updatedProfile]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.updateDigest({
        digestDaily: false,
        digestWeekly: true,
      });

      expect(result).toEqual({
        digestDaily: false,
        digestWeekly: true,
        digestDailyTime: '08:00',
        digestSiteIds: ['site-1', 'site-2'],
        timezone: 'America/New_York',
        emailEnabled: true,
      });
    });

    it('should call syncUserDigestSchedulers after update', async () => {
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      await caller.updateDigest({ digestDaily: true });

      // Fire-and-forget, so we just check it was called
      expect(mockSyncUserDigestSchedulers).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          dailyEnabled: true,
          weeklyEnabled: false,
        })
      );
    });

    it('should update digestSiteIds with JSON stringification', async () => {
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      // Use valid UUIDs as digestSiteIds expects z.array(z.string().uuid())
      const siteIds = [
        '323e4567-e89b-12d3-a456-426614174003',
        '423e4567-e89b-12d3-a456-426614174004',
      ];
      await caller.updateDigest({ digestSiteIds: siteIds });

      const updateChain = mockDb.update.mock.results[0].value;
      expect(updateChain.set).toHaveBeenCalled();
    });

    it('should update timezone', async () => {
      const updatedProfile = { ...mockProfile, timezone: 'America/Los_Angeles' };
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updatedProfile]),
      };
      mockDb.update.mockReturnValue(mockUpdateChain);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.updateDigest({ timezone: 'America/Los_Angeles' });

      expect(result.timezone).toBe('America/Los_Angeles');
    });

    it('should throw NOT_FOUND when profile does not exist', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      await expect(caller.updateDigest({ digestDaily: false })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Profile not found',
      });
    });
  });

  describe('disableAllDigests', () => {
    it('should disable all digests and return success', async () => {
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.disableAllDigests();

      expect(result).toEqual({
        success: true,
        message: 'All digest emails disabled',
      });
    });

    it('should call removeUserDigestSchedulers', async () => {
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      await caller.disableAllDigests();

      expect(mockRemoveUserDigestSchedulers).toHaveBeenCalledWith(userId);
    });

    it('should update database to disable both digests', async () => {
      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      await caller.disableAllDigests();

      const updateChain = mockDb.update.mock.results[0].value;
      expect(updateChain.set).toHaveBeenCalledWith({
        digestDaily: false,
        digestWeekly: false,
      });
    });

    it('should throw NOT_FOUND when profile does not exist', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(mockSelectChain);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      await expect(caller.disableAllDigests()).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Profile not found',
      });
    });
  });
});
