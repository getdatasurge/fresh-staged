/**
 * Tests for Admin tRPC Router
 *
 * Comprehensive tests covering:
 * - Authorization boundary tests (UNAUTHORIZED + FORBIDDEN) for every procedure
 * - Happy path smoke tests for each procedure
 * - Input validation tests where applicable
 * - Error handling for NOT_FOUND cases
 *
 * All 15 procedures use superAdminProcedure which chains:
 *   publicProcedure -> performanceMonitor -> isAuthed -> isSuperAdminUser
 *
 * The isSuperAdminUser middleware imports { userService } from services/index.js
 * and calls userService.isSuperAdmin(user.id).
 */

import { TRPCError } from '@trpc/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminRouter } from '../../src/routers/admin.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// ---------------------------------------------------------------------------
// vi.hoisted -- variables declared here are available inside vi.mock factories
// because vi.mock calls are hoisted above all other code at compile time.
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockInsert,
  _mockInsertValues,
  mockUpdate,
  _mockUpdateSet,
  mockDelete,
  _mockDeleteWhere,
  mockExecute,
  mockFrom,
  mockLeftJoin,
  mockInnerJoin,
  mockWhere,
  mockOrderBy,
  mockLimit,
} = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
  const mockLimit = vi.fn().mockResolvedValue([]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit, execute: mockExecute });
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit, where: mockWhere });
  const mockLeftJoin = vi.fn().mockReturnValue({
    leftJoin: vi.fn().mockReturnValue({
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
    }),
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({
    leftJoin: mockLeftJoin,
    innerJoin: mockInnerJoin,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockUpdateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  return {
    mockSelect,
    mockInsert,
    _mockInsertValues: mockInsertValues,
    mockUpdate,
    _mockUpdateSet: mockUpdateSet,
    mockDelete,
    _mockDeleteWhere: mockDeleteWhere,
    mockExecute,
    mockFrom,
    mockLeftJoin,
    mockInnerJoin,
    mockWhere,
    mockOrderBy,
    mockLimit,
  };
});

// ---------------------------------------------------------------------------
// Mocks -- vi.mock calls are hoisted; factories can reference hoisted vars
// ---------------------------------------------------------------------------

// Mock the services barrel export (used by procedures.ts for isSuperAdminUser middleware)
vi.mock('../../src/services/index.js', () => ({
  userService: {
    isSuperAdmin: vi.fn(),
    getOrCreateProfile: vi.fn(),
    getUserPrimaryOrganization: vi.fn(),
    getUserRoleInOrg: vi.fn(),
    getProfileByUserId: vi.fn(),
  },
  orgService: {},
  siteService: {},
  areaService: {},
  unitService: {},
  readingsService: {},
  alertEvaluator: {},
  alertService: {},
}));

// Mock the individual user.service.js (used directly by admin.router.ts)
vi.mock('../../src/services/user.service.js', () => ({
  isSuperAdmin: vi.fn(),
  getOrCreateProfile: vi.fn(),
  getUserPrimaryOrganization: vi.fn(),
  getUserRoleInOrg: vi.fn(),
  getProfileByUserId: vi.fn(),
}));

// Mock the queue service (used by queueHealth and systemStatus)
vi.mock('../../src/services/queue.service.js', () => ({
  getQueueService: vi.fn().mockReturnValue(null),
}));

// Mock the database client using hoisted mock variables
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    execute: mockExecute,
    query: {},
  },
}));

// Mock the logger to suppress output during tests
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Admin tRPC Router', () => {
  const createCaller = createCallerFactory(adminRouter);

  let mockIsSuperAdmin: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockGetUserPrimaryOrganization: ReturnType<typeof vi.fn>;

  /** Authenticated super admin context */
  const superAdminCtx = () => ({
    req: {} as any,
    res: { header: vi.fn() } as any,
    user: {
      id: 'super-admin-123',
      email: 'admin@test.com',
      name: 'Admin',
    },
  });

  /** Authenticated regular user context */
  const regularUserCtx = () => ({
    req: {} as any,
    res: { header: vi.fn() } as any,
    user: {
      id: 'regular-user-456',
      email: 'user@test.com',
      name: 'Regular User',
    },
  });

  /** Unauthenticated context */
  const noAuthCtx = () => ({
    req: {} as any,
    res: { header: vi.fn() } as any,
    user: null,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get references to the mocked functions from the services barrel
    const services = await import('../../src/services/index.js');
    mockIsSuperAdmin = (services.userService as any).isSuperAdmin;

    // Also wire up the direct user.service.js mocks (used by admin router body)
    const directUserService = await import('../../src/services/user.service.js');
    mockGetOrCreateProfile = directUserService.getOrCreateProfile as any;
    mockGetUserPrimaryOrganization = directUserService.getUserPrimaryOrganization as any;

    // Default: allow super admin through
    mockIsSuperAdmin.mockResolvedValue(true);

    // Reset chainable DB mocks to safe defaults
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({
      leftJoin: mockLeftJoin,
      innerJoin: mockInnerJoin,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
    });
    mockLeftJoin.mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: mockWhere,
        orderBy: mockOrderBy,
        limit: mockLimit,
      }),
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
    });
    mockWhere.mockReturnValue({ limit: mockLimit, execute: mockExecute });
    mockOrderBy.mockReturnValue({ limit: mockLimit, where: mockWhere });
    mockLimit.mockResolvedValue([]);
    mockExecute.mockResolvedValue({ rows: [] });
  });

  // =========================================================================
  // Authorization boundary tests
  // =========================================================================

  describe('Authorization boundaries', () => {
    // All procedure names that take no input
    const noInputQueries: string[] = [
      'queueHealth',
      'systemStatus',
      'systemStats',
      'ttnConnections',
      'listOrganizations',
      'listUsers',
      'findOrphanOrganizations',
      'listCleanupJobs',
    ];

    describe.each(noInputQueries)('%s', (procedureName) => {
      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect((caller as any)[procedureName]()).rejects.toThrow(TRPCError);
        await expect((caller as any)[procedureName]()).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect((caller as any)[procedureName]()).rejects.toThrow(TRPCError);
        await expect((caller as any)[procedureName]()).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        expect(mockIsSuperAdmin).toHaveBeenCalledWith('regular-user-456');
      });
    });

    describe('searchUsers', () => {
      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(caller.searchUsers({ query: 'test' })).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(caller.searchUsers({ query: 'test' })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    describe('logSuperAdminAction', () => {
      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(caller.logSuperAdminAction({ action: 'test_action' })).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(caller.logSuperAdminAction({ action: 'test_action' })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    describe('listSuperAdminAuditLog', () => {
      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(caller.listSuperAdminAuditLog({})).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(caller.listSuperAdminAuditLog({})).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    describe('getOrganization', () => {
      const validOrgId = '11111111-1111-1111-a111-111111111111';

      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(caller.getOrganization({ organizationId: validOrgId })).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(caller.getOrganization({ organizationId: validOrgId })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    describe('getUser', () => {
      const validUserId = '22222222-2222-2222-a222-222222222222';

      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(caller.getUser({ userId: validUserId })).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(caller.getUser({ userId: validUserId })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      });
    });

    describe('softDeleteOrganization', () => {
      const validOrgId = '33333333-3333-3333-a333-333333333333';

      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(
          caller.softDeleteOrganization({ organizationId: validOrgId }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(
          caller.softDeleteOrganization({ organizationId: validOrgId }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });
    });

    describe('hardDeleteOrganization', () => {
      const validOrgId = '44444444-4444-4444-a444-444444444444';

      it('should throw UNAUTHORIZED when user is null', async () => {
        const caller = createCaller(noAuthCtx());

        await expect(
          caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Test' }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      });

      it('should throw FORBIDDEN when user is not super admin', async () => {
        mockIsSuperAdmin.mockResolvedValue(false);
        const caller = createCaller(regularUserCtx());

        await expect(
          caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Test' }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      });
    });
  });

  // =========================================================================
  // isSuperAdmin receives correct user ID
  // =========================================================================

  describe('isSuperAdmin receives correct user ID', () => {
    it('should pass the authenticated user ID to isSuperAdmin', async () => {
      mockIsSuperAdmin.mockResolvedValue(true);
      const caller = createCaller(superAdminCtx());

      // queueHealth is the simplest procedure (no DB needed due to null queue service)
      await caller.queueHealth();

      expect(mockIsSuperAdmin).toHaveBeenCalledWith('super-admin-123');
      expect(mockIsSuperAdmin).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Happy path tests
  // =========================================================================

  describe('queueHealth', () => {
    it('should return redisEnabled false when queue service is null', async () => {
      const caller = createCaller(superAdminCtx());

      const result = await caller.queueHealth();

      expect(result).toMatchObject({
        redisEnabled: false,
        queues: [],
      });
      expect(result.timestamp).toBeDefined();
      // Validate ISO timestamp format
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should return redisEnabled true with queue stats when Redis is enabled', async () => {
      const { getQueueService } = await import('../../src/services/queue.service.js');
      const mockGetQueueService = getQueueService as ReturnType<typeof vi.fn>;

      const mockQueue = {
        getWaitingCount: vi.fn().mockResolvedValue(5),
        getActiveCount: vi.fn().mockResolvedValue(2),
        getCompletedCount: vi.fn().mockResolvedValue(100),
        getFailedCount: vi.fn().mockResolvedValue(1),
        getDelayedCount: vi.fn().mockResolvedValue(0),
      };
      const queuesMap = new Map([['test-queue', mockQueue]]);

      mockGetQueueService.mockReturnValue({
        isRedisEnabled: () => true,
        getAllQueues: () => queuesMap,
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.queueHealth();

      expect(result.redisEnabled).toBe(true);
      expect(result.queues).toHaveLength(1);
      expect(result.queues[0]).toEqual({
        name: 'test-queue',
        counts: {
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 1,
          delayed: 0,
        },
      });

      // Restore default
      mockGetQueueService.mockReturnValue(null);
    });

    it('should handle queue stats errors gracefully', async () => {
      const { getQueueService } = await import('../../src/services/queue.service.js');
      const mockGetQueueService = getQueueService as ReturnType<typeof vi.fn>;

      const mockQueue = {
        getWaitingCount: vi.fn().mockRejectedValue(new Error('Redis timeout')),
        getActiveCount: vi.fn().mockRejectedValue(new Error('Redis timeout')),
        getCompletedCount: vi.fn().mockRejectedValue(new Error('Redis timeout')),
        getFailedCount: vi.fn().mockRejectedValue(new Error('Redis timeout')),
        getDelayedCount: vi.fn().mockRejectedValue(new Error('Redis timeout')),
      };
      const queuesMap = new Map([['failing-queue', mockQueue]]);

      mockGetQueueService.mockReturnValue({
        isRedisEnabled: () => true,
        getAllQueues: () => queuesMap,
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.queueHealth();

      expect(result.redisEnabled).toBe(true);
      expect(result.queues).toHaveLength(1);
      expect(result.queues[0]).toEqual({
        name: 'failing-queue',
        error: 'Failed to get queue stats',
      });

      mockGetQueueService.mockReturnValue(null);
    });
  });

  describe('systemStatus', () => {
    it('should return queues disabled when queue service is null', async () => {
      const caller = createCaller(superAdminCtx());

      const result = await caller.systemStatus();

      expect(result).toMatchObject({
        queues: {
          enabled: false,
          count: 0,
        },
      });
      expect(result.timestamp).toBeDefined();
    });

    it('should return queues enabled with count when Redis is available', async () => {
      const { getQueueService } = await import('../../src/services/queue.service.js');
      const mockGetQueueService = getQueueService as ReturnType<typeof vi.fn>;

      const queuesMap = new Map([
        ['queue-a', {}],
        ['queue-b', {}],
        ['queue-c', {}],
      ]);
      mockGetQueueService.mockReturnValue({
        isRedisEnabled: () => true,
        getAllQueues: () => queuesMap,
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.systemStatus();

      expect(result.queues.enabled).toBe(true);
      expect(result.queues.count).toBe(3);

      mockGetQueueService.mockReturnValue(null);
    });
  });

  describe('systemStats', () => {
    it('should return record counts from database', async () => {
      // systemStats calls db.select({ count: count() }).from(sql`...`) six times
      // via Promise.all. The from() call returns a thenable that also has .where().
      // For orgs and profiles there is no .where(); for sites/units there is.
      let callIndex = 0;
      mockSelect.mockReturnValue({
        from: vi.fn().mockImplementation(() => {
          callIndex++;
          if (callIndex <= 2) {
            // organizations and profiles -- no .where(), resolves directly
            return Promise.resolve([{ count: callIndex * 10 }]);
          }
          // sites, units (with .where()), sensor_readings, alerts
          return {
            where: vi.fn().mockResolvedValue([{ count: callIndex * 10 }]),
            then: (resolve: any) => resolve([{ count: callIndex * 10 }]),
          };
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.systemStats();

      expect(result).toHaveProperty('organizations');
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('sites');
      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('readings');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.organizations).toBe('number');
      expect(typeof result.users).toBe('number');
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('ttnConnections', () => {
    it('should return mapped TTN connection objects', async () => {
      const now = new Date();
      const mockResults = [
        {
          id: 'conn-1',
          organizationId: 'org-1',
          orgName: 'Test Org',
          applicationId: 'app-1',
          isActive: true,
          createdAt: now,
        },
      ];

      // ttnConnections uses db.select(...).from(sql`...`).leftJoin(...)
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockResolvedValue(mockResults),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.ttnConnections();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'conn-1',
        organizationId: 'org-1',
        orgName: 'Test Org',
        applicationId: 'app-1',
        isActive: true,
      });
      expect(result[0].createdAt).toBe(now.toISOString());
    });

    it('should return empty array when no connections exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockResolvedValue([]),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.ttnConnections();

      expect(result).toEqual([]);
    });
  });

  describe('listCleanupJobs', () => {
    it('should return an empty array (placeholder)', async () => {
      const caller = createCaller(superAdminCtx());

      const result = await caller.listCleanupJobs();

      expect(result).toEqual([]);
    });
  });

  describe('listOrganizations', () => {
    it('should return organizations with user and site counts', async () => {
      const now = new Date();

      // listOrganizations now uses a single db.execute(sql`...`) call
      mockExecute.mockResolvedValue({
        rows: [
          {
            id: 'org-1',
            name: 'Org One',
            slug: 'org-one',
            timezone: 'UTC',
            complianceMode: 'standard',
            createdAt: now.toISOString(),
            userCount: 3,
            siteCount: 1,
          },
        ],
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.listOrganizations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'org-1',
        name: 'Org One',
        slug: 'org-one',
        timezone: 'UTC',
        complianceMode: 'standard',
        userCount: 3,
        siteCount: 1,
      });
      expect(result[0].createdAt).toBe(now.toISOString());
    });

    it('should return empty array when no organizations exist', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const caller = createCaller(superAdminCtx());
      const result = await caller.listOrganizations();

      expect(result).toEqual([]);
    });
  });

  describe('listUsers', () => {
    it('should return users with isSuperAdmin flag', async () => {
      const now = new Date();
      const mockProfileRows = [
        {
          userId: 'user-1',
          email: 'user1@test.com',
          fullName: 'User One',
          phone: null,
          organizationId: 'org-1',
          organizationName: 'Test Org',
          role: 'admin',
          createdAt: now,
        },
      ];
      const mockPlatformRoles = [{ userId: 'user-1' }];

      // First select: profiles query with leftJoins
      // Second select: platform_roles query
      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Profiles query (chained leftJoin -> leftJoin -> orderBy -> limit)
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue(mockProfileRows),
                  }),
                }),
              }),
            }),
          };
        }
        // Platform roles query
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockPlatformRoles),
          }),
        };
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.listUsers();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        userId: 'user-1',
        email: 'user1@test.com',
        fullName: 'User One',
        isSuperAdmin: true,
      });
      expect(result[0].createdAt).toBe(now.toISOString());
    });
  });

  describe('searchUsers', () => {
    it('should return matching users for a valid query', async () => {
      const mockResults = [
        {
          userId: 'user-1',
          email: 'admin@test.com',
          fullName: 'Admin User',
          organizationId: 'org-1',
          organizationName: 'Test Org',
          role: 'admin',
        },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockResults),
              }),
            }),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.searchUsers({ query: 'admin' });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        userId: 'user-1',
        email: 'admin@test.com',
        fullName: 'Admin User',
      });
    });

    it('should return empty array when no users match', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.searchUsers({ query: 'nonexistent' });

      expect(result).toEqual([]);
    });

    it('should reject queries shorter than 2 characters', async () => {
      const caller = createCaller(superAdminCtx());

      await expect(caller.searchUsers({ query: 'a' })).rejects.toThrow();
    });
  });

  describe('logSuperAdminAction', () => {
    it('should log action and return success when org context exists', async () => {
      mockGetUserPrimaryOrganization.mockResolvedValue({
        organizationId: 'org-1',
      });
      mockGetOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        isNew: false,
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.logSuperAdminAction({
        action: 'impersonate_user',
        targetType: 'user',
        targetId: 'user-999',
      });

      expect(result).toEqual({ success: true });
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should use targetOrgId when provided instead of looking up primary org', async () => {
      mockGetOrCreateProfile.mockResolvedValue({
        id: 'profile-1',
        isNew: false,
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.logSuperAdminAction({
        action: 'view_organization',
        targetOrgId: 'explicit-org-id',
      });

      expect(result).toEqual({ success: true });
      // Should NOT have looked up primary org since targetOrgId was provided
      expect(mockGetUserPrimaryOrganization).not.toHaveBeenCalled();
    });

    it('should return failure when no organization context is available', async () => {
      mockGetUserPrimaryOrganization.mockResolvedValue(null);

      const caller = createCaller(superAdminCtx());
      const result = await caller.logSuperAdminAction({
        action: 'some_action',
      });

      expect(result).toEqual({
        success: false,
        reason: 'no_organization_context',
      });
    });
  });

  describe('listSuperAdminAuditLog', () => {
    it('should return formatted audit log entries', async () => {
      const now = new Date();
      const mockEntries = [
        {
          id: 'log-1',
          action: 'impersonate_user',
          createdAt: now,
          actorEmail: 'admin@test.com',
          actorName: 'Admin',
          targetOrgName: 'Test Org',
          eventData: {
            impersonatedUserId: 'user-999',
            targetType: 'user',
            targetId: 'user-999',
            targetOrgId: 'org-1',
            details: { reason: 'support' },
          },
        },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockEntries),
              }),
            }),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.listSuperAdminAuditLog({});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'log-1',
        action: 'impersonate_user',
        actorEmail: 'admin@test.com',
        actorName: 'Admin',
        impersonatedUserId: 'user-999',
        targetType: 'user',
        targetId: 'user-999',
        targetOrgId: 'org-1',
        targetOrgName: 'Test Org',
      });
      expect(result[0].details).toEqual({ reason: 'support' });
      expect(result[0].createdAt).toBe(now.toISOString());
    });

    it('should handle null eventData gracefully', async () => {
      const now = new Date();
      const mockEntries = [
        {
          id: 'log-2',
          action: 'some_action',
          createdAt: now,
          actorEmail: null,
          actorName: null,
          targetOrgName: null,
          eventData: null,
        },
      ];

      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockEntries),
              }),
            }),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.listSuperAdminAuditLog({});

      expect(result).toHaveLength(1);
      expect(result[0].impersonatedUserId).toBeNull();
      expect(result[0].targetType).toBeNull();
      expect(result[0].targetId).toBeNull();
      expect(result[0].targetOrgId).toBeNull();
      expect(result[0].details).toBeNull();
    });
  });

  describe('getOrganization', () => {
    const validOrgId = '11111111-1111-1111-a111-111111111111';

    it('should throw NOT_FOUND when organization does not exist', async () => {
      // Return empty array from the first select (org lookup)
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(caller.getOrganization({ organizationId: validOrgId })).rejects.toThrow(
        TRPCError,
      );
      await expect(caller.getOrganization({ organizationId: validOrgId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    });

    it('should return organization with users and sites', async () => {
      const now = new Date();
      const mockOrg = {
        id: validOrgId,
        name: 'Test Org',
        slug: 'test-org',
        timezone: 'America/New_York',
        complianceMode: 'standard',
        createdAt: now,
      };
      const mockUsers = [
        {
          userId: 'user-1',
          email: 'user1@test.com',
          fullName: 'User One',
          phone: '+1234567890',
          role: 'admin',
        },
      ];
      const mockSites = [
        {
          id: 'site-1',
          name: 'Site A',
          address: '123 Main St',
          isActive: true,
        },
      ];

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Org lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockOrg]),
              }),
            }),
          };
        }
        if (selectCallCount === 2) {
          // Users for this org (leftJoin -> where)
          return {
            from: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(mockUsers),
              }),
            }),
          };
        }
        if (selectCallCount === 3) {
          // Sites for this org
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mockSites),
            }),
          };
        }
        return { from: vi.fn().mockReturnValue({ where: mockWhere }) };
      });
      mockExecute.mockResolvedValue({ rows: [{ count: 42 }] });

      const caller = createCaller(superAdminCtx());
      const result = await caller.getOrganization({ organizationId: validOrgId });

      expect(result).toMatchObject({
        id: validOrgId,
        name: 'Test Org',
        slug: 'test-org',
        timezone: 'America/New_York',
        complianceMode: 'standard',
        unitsCount: 42,
      });
      expect(result.createdAt).toBe(now.toISOString());
      expect(result.users).toHaveLength(1);
      expect(result.users[0]).toMatchObject({
        userId: 'user-1',
        email: 'user1@test.com',
        role: 'admin',
      });
      expect(result.sites).toHaveLength(1);
      expect(result.sites[0]).toMatchObject({
        id: 'site-1',
        name: 'Site A',
        isActive: true,
      });
    });

    it('should reject invalid UUID input', async () => {
      const caller = createCaller(superAdminCtx());

      await expect(caller.getOrganization({ organizationId: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  describe('getUser', () => {
    const validUserId = '22222222-2222-2222-a222-222222222222';

    it('should throw NOT_FOUND when user does not exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(caller.getUser({ userId: validUserId })).rejects.toThrow(TRPCError);
      await expect(caller.getUser({ userId: validUserId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });

    it('should return user with roles and super admin status', async () => {
      const now = new Date();
      const mockProfile = {
        userId: validUserId,
        email: 'user@test.com',
        fullName: 'Test User',
        phone: '+1234567890',
        organizationId: 'org-1',
        createdAt: now,
        updatedAt: now,
      };
      const mockRoles = [
        {
          organizationId: 'org-1',
          organizationName: 'Test Org',
          role: 'admin',
        },
      ];
      const mockSuperAdminRole = { id: 'pr-1' };

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Profile lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockProfile]),
              }),
            }),
          };
        }
        if (selectCallCount === 2) {
          // Roles query (innerJoin -> where)
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(mockRoles),
              }),
            }),
          };
        }
        if (selectCallCount === 3) {
          // Platform roles check for super admin
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockSuperAdminRole]),
              }),
            }),
          };
        }
        return { from: vi.fn().mockReturnValue({ where: mockWhere }) };
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.getUser({ userId: validUserId });

      expect(result).toMatchObject({
        userId: validUserId,
        email: 'user@test.com',
        fullName: 'Test User',
        phone: '+1234567890',
        organizationId: 'org-1',
        isSuperAdmin: true,
      });
      expect(result.createdAt).toBe(now.toISOString());
      expect(result.updatedAt).toBe(now.toISOString());
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0]).toEqual({
        organizationId: 'org-1',
        organizationName: 'Test Org',
        role: 'admin',
      });
    });

    it('should return isSuperAdmin false when user has no platform role', async () => {
      const now = new Date();
      const mockProfile = {
        userId: validUserId,
        email: 'regular@test.com',
        fullName: 'Regular User',
        phone: null,
        organizationId: 'org-1',
        createdAt: now,
        updatedAt: now,
      };

      let selectCallCount = 0;
      mockSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockProfile]),
              }),
            }),
          };
        }
        if (selectCallCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        if (selectCallCount === 3) {
          // No super admin role found
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        return { from: vi.fn().mockReturnValue({ where: mockWhere }) };
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.getUser({ userId: validUserId });

      expect(result.isSuperAdmin).toBe(false);
      expect(result.roles).toEqual([]);
    });

    it('should reject invalid UUID input', async () => {
      const caller = createCaller(superAdminCtx());

      await expect(caller.getUser({ userId: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  describe('findOrphanOrganizations', () => {
    it('should return formatted orphan organizations from raw SQL', async () => {
      const now = new Date();
      mockExecute.mockResolvedValue({
        rows: [
          {
            org_id: 'orphan-1',
            org_name: 'Orphan Org',
            org_slug: 'orphan-org',
            org_created_at: now.toISOString(),
            sites_count: 2,
            areas_count: 3,
            units_count: 5,
            sensors_count: 10,
            gateways_count: 1,
            alerts_count: 0,
            event_logs_count: 15,
            has_subscription: false,
          },
        ],
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.findOrphanOrganizations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        org_id: 'orphan-1',
        org_name: 'Orphan Org',
        org_slug: 'orphan-org',
        sites_count: 2,
        areas_count: 3,
        units_count: 5,
        sensors_count: 10,
        gateways_count: 1,
        alerts_count: 0,
        event_logs_count: 15,
        has_subscription: false,
      });
    });

    it('should return empty array when no orphan organizations exist', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const caller = createCaller(superAdminCtx());
      const result = await caller.findOrphanOrganizations();

      expect(result).toEqual([]);
    });
  });

  describe('softDeleteOrganization', () => {
    const validOrgId = '33333333-3333-3333-a333-333333333333';

    it('should throw NOT_FOUND when organization does not exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(caller.softDeleteOrganization({ organizationId: validOrgId })).rejects.toThrow(
        TRPCError,
      );
      await expect(
        caller.softDeleteOrganization({ organizationId: validOrgId }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    });

    it('should throw BAD_REQUEST when organization is already deleted', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: validOrgId,
                slug: 'my-org_deleted_1234',
                name: 'My Org',
                deletedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(caller.softDeleteOrganization({ organizationId: validOrgId })).rejects.toThrow(
        TRPCError,
      );
      await expect(
        caller.softDeleteOrganization({ organizationId: validOrgId }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Organization is already deleted',
      });
    });

    it('should soft delete organization and free up slug', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([
                { id: validOrgId, slug: 'my-org', name: 'My Org', deletedAt: null },
              ]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.softDeleteOrganization({ organizationId: validOrgId });

      expect(result).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should reject invalid UUID input', async () => {
      const caller = createCaller(superAdminCtx());

      await expect(caller.softDeleteOrganization({ organizationId: 'bad-uuid' })).rejects.toThrow();
    });
  });

  describe('hardDeleteOrganization', () => {
    const validOrgId = '44444444-4444-4444-a444-444444444444';

    it('should throw NOT_FOUND when organization does not exist', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(
        caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Whatever' }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Whatever' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    });

    it('should throw PRECONDITION_FAILED when organization is not soft-deleted', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: validOrgId, name: 'Active Org', deletedAt: null }]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(
        caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Active Org' }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Active Org' }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Organization must be soft-deleted before hard deletion',
      });
    });

    it('should throw BAD_REQUEST when confirmName does not match', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: validOrgId, name: 'Doomed Org', deletedAt: new Date() }]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());

      await expect(
        caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Wrong Name' }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.hardDeleteOrganization({ organizationId: validOrgId, confirmName: 'Wrong Name' }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Confirmation name does not match organization name',
      });
    });

    it('should hard delete organization with audit log and return success', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: validOrgId, name: 'Doomed Org', deletedAt: new Date() }]),
          }),
        }),
      });

      const caller = createCaller(superAdminCtx());
      const result = await caller.hardDeleteOrganization({
        organizationId: validOrgId,
        confirmName: 'Doomed Org',
      });

      expect(result).toEqual({ success: true });
      // Audit log should be created before deletion
      expect(mockInsert).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should reject invalid UUID input', async () => {
      const caller = createCaller(superAdminCtx());

      await expect(
        caller.hardDeleteOrganization({ organizationId: 'bad-uuid', confirmName: 'Test' }),
      ).rejects.toThrow();
    });
  });
});
