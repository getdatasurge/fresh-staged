/**
 * Admin tRPC Router
 *
 * Provides administrative endpoints for:
 * - Queue health and status monitoring
 * - System status and diagnostics
 *
 * All procedures require authentication.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { protectedProcedure } from '../trpc/procedures.js';
import { getQueueService } from '../services/queue.service.js';

/**
 * Queue stats schema for response typing
 */
const QueueStatsSchema = z.object({
  name: z.string(),
  counts: z.object({
    waiting: z.number(),
    active: z.number(),
    completed: z.number(),
    failed: z.number(),
    delayed: z.number(),
  }).optional(),
  error: z.string().optional(),
});

/**
 * Admin router
 *
 * Procedures:
 * - queueHealth: Get health status of all registered queues
 * - systemStatus: Get overall system status
 */
export const adminRouter = router({
  /**
   * Get queue health status
   *
   * Returns health status of all registered queues including:
   * - Queue names
   * - Job counts by status (waiting, active, completed, failed, delayed)
   * - Redis connection status
   *
   * @requires Authentication (protectedProcedure)
   */
  queueHealth: protectedProcedure
    .output(z.object({
      redisEnabled: z.boolean(),
      queues: z.array(QueueStatsSchema),
      timestamp: z.string(),
    }))
    .query(async () => {
      const queueService = getQueueService();

      if (!queueService || !queueService.isRedisEnabled()) {
        return {
          redisEnabled: false,
          queues: [],
          timestamp: new Date().toISOString(),
        };
      }

      // Get all queues and their stats
      const queues = queueService.getAllQueues();
      const queueStats: z.infer<typeof QueueStatsSchema>[] = [];

      for (const [name, queue] of queues.entries()) {
        try {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ]);

          queueStats.push({
            name,
            counts: {
              waiting,
              active,
              completed,
              failed,
              delayed,
            },
          });
        } catch (error) {
          queueStats.push({
            name,
            error: 'Failed to get queue stats',
          });
        }
      }

      return {
        redisEnabled: true,
        queues: queueStats,
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Get system status
   *
   * Returns overall system status including:
   * - Queue service availability
   * - Redis connection status
   * - Registered queue count
   *
   * @requires Authentication (protectedProcedure)
   */
  systemStatus: protectedProcedure
    .output(z.object({
      queues: z.object({
        enabled: z.boolean(),
        count: z.number(),
      }),
      timestamp: z.string(),
    }))
    .query(async () => {
      const queueService = getQueueService();

      return {
        queues: {
          enabled: queueService?.isRedisEnabled() ?? false,
          count: queueService?.getAllQueues().size ?? 0,
        },
        timestamp: new Date().toISOString(),
      };
    }),
});
