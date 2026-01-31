/**
 * Tests for Admin tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - queueHealth: Queue health status retrieval
 * - systemStatus: System status retrieval
 *
 * All procedures require authentication (protectedProcedure).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { adminRouter } from '../../src/routers/admin.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the queue service
vi.mock('../../src/services/queue.service.js', () => ({
  getQueueService: vi.fn(),
}));

// Mock the database client (used by platformAdminProcedure)
vi.mock('../../src/db/client.js', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'role-1', userId: 'user-123', role: 'SUPER_ADMIN' }]),
  };
  return { db: mockDb };
});

describe('Admin tRPC Router', () => {
  const createCaller = createCallerFactory(adminRouter);

  // Get the mocked functions
  let mockGetQueueService: ReturnType<typeof vi.fn>;

  // Create context that simulates authenticated user
  const createAuthContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'admin@example.com',
      name: 'Admin User',
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
    const queueService = await import('../../src/services/queue.service.js');
    mockGetQueueService = queueService.getQueueService as any;
  });

  describe('queueHealth', () => {
    it('should return queue stats when Redis is enabled', async () => {
      const mockQueue = {
        getWaitingCount: vi.fn().mockResolvedValue(5),
        getActiveCount: vi.fn().mockResolvedValue(2),
        getCompletedCount: vi.fn().mockResolvedValue(100),
        getFailedCount: vi.fn().mockResolvedValue(3),
        getDelayedCount: vi.fn().mockResolvedValue(1),
      };

      const mockQueueService = {
        isRedisEnabled: vi.fn().mockReturnValue(true),
        getAllQueues: vi.fn().mockReturnValue(
          new Map([
            ['sms-notifications', mockQueue],
            ['email-digests', mockQueue],
          ]),
        ),
      };
      mockGetQueueService.mockReturnValue(mockQueueService);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.queueHealth();

      expect(result.redisEnabled).toBe(true);
      expect(result.queues).toHaveLength(2);
      expect(result.queues[0]).toEqual({
        name: 'sms-notifications',
        counts: {
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 3,
          delayed: 1,
        },
      });
      expect(result.timestamp).toBeDefined();
    });

    it('should return unavailable status when Redis is disabled', async () => {
      const mockQueueService = {
        isRedisEnabled: vi.fn().mockReturnValue(false),
        getAllQueues: vi.fn().mockReturnValue(new Map()),
      };
      mockGetQueueService.mockReturnValue(mockQueueService);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.queueHealth();

      expect(result.redisEnabled).toBe(false);
      expect(result.queues).toEqual([]);
      expect(result.timestamp).toBeDefined();
    });

    it('should return unavailable status when queue service is null', async () => {
      mockGetQueueService.mockReturnValue(null);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.queueHealth();

      expect(result.redisEnabled).toBe(false);
      expect(result.queues).toEqual([]);
    });

    it('should handle queue stats errors gracefully', async () => {
      const mockQueue = {
        getWaitingCount: vi.fn().mockRejectedValue(new Error('Redis error')),
        getActiveCount: vi.fn().mockRejectedValue(new Error('Redis error')),
        getCompletedCount: vi.fn().mockRejectedValue(new Error('Redis error')),
        getFailedCount: vi.fn().mockRejectedValue(new Error('Redis error')),
        getDelayedCount: vi.fn().mockRejectedValue(new Error('Redis error')),
      };

      const mockQueueService = {
        isRedisEnabled: vi.fn().mockReturnValue(true),
        getAllQueues: vi.fn().mockReturnValue(new Map([['failing-queue', mockQueue]])),
      };
      mockGetQueueService.mockReturnValue(mockQueueService);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.queueHealth();

      expect(result.redisEnabled).toBe(true);
      expect(result.queues[0]).toEqual({
        name: 'failing-queue',
        error: 'Failed to get queue stats',
      });
    });

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      const ctx = createNoAuthContext();
      const caller = createCaller(ctx);

      await expect(caller.queueHealth()).rejects.toThrow(TRPCError);
      await expect(caller.queueHealth()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('systemStatus', () => {
    it('should return system info when queue service is available', async () => {
      const mockQueueService = {
        isRedisEnabled: vi.fn().mockReturnValue(true),
        getAllQueues: vi.fn().mockReturnValue(
          new Map([
            ['queue1', {}],
            ['queue2', {}],
            ['queue3', {}],
          ]),
        ),
      };
      mockGetQueueService.mockReturnValue(mockQueueService);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.systemStatus();

      expect(result.queues.enabled).toBe(true);
      expect(result.queues.count).toBe(3);
      expect(result.timestamp).toBeDefined();
    });

    it('should return disabled status when queue service is null', async () => {
      mockGetQueueService.mockReturnValue(null);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.systemStatus();

      expect(result.queues.enabled).toBe(false);
      expect(result.queues.count).toBe(0);
    });

    it('should return disabled status when Redis is not enabled', async () => {
      const mockQueueService = {
        isRedisEnabled: vi.fn().mockReturnValue(false),
        getAllQueues: vi.fn().mockReturnValue(new Map()),
      };
      mockGetQueueService.mockReturnValue(mockQueueService);

      const ctx = createAuthContext();
      const caller = createCaller(ctx);

      const result = await caller.systemStatus();

      expect(result.queues.enabled).toBe(false);
      expect(result.queues.count).toBe(0);
    });

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      const ctx = createNoAuthContext();
      const caller = createCaller(ctx);

      await expect(caller.systemStatus()).rejects.toThrow(TRPCError);
      await expect(caller.systemStatus()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });
});
