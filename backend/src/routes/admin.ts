/**
 * Admin routes for monitoring and management
 *
 * Provides administrative endpoints for:
 * - Bull Board queue monitoring dashboard
 * - Queue health and status checks
 * - System metrics and diagnostics
 *
 * All routes require authentication via JWT token.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/index.js';

/**
 * Admin routes plugin
 *
 * Registers admin-only routes with authentication guards.
 * Bull Board dashboard is mounted by queue.plugin.ts at /admin/queues.
 * All routes under /api/admin require authentication.
 */
const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Add authentication requirement to ALL routes under /api/admin
  fastify.addHook('onRequest', requireAuth);
  /**
   * GET /admin/queues/health
   *
   * Returns health status of all registered queues including:
   * - Queue names
   * - Job counts by status (waiting, active, completed, failed)
   * - Redis connection status
   *
   * @requires Authentication (JWT via onRequest hook)
   */
  fastify.get('/queues/health', async (request, reply) => {
      const queueService = fastify.queueService;

      if (!queueService || !queueService.isRedisEnabled()) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'Queue service not available - Redis not configured',
          redisEnabled: false,
        });
      }

      // Get all queues and their stats
      const queues = queueService.getAllQueues();
      const queueStats = [];

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

      return reply.send({
        redisEnabled: true,
        queues: queueStats,
        timestamp: new Date().toISOString(),
      });
    });

  /**
   * GET /admin/status
   *
   * Returns overall system status including:
   * - Queue service availability
   * - Redis connection status
   * - Registered queue count
   *
   * @requires Authentication (JWT via onRequest hook)
   */
  fastify.get('/status', async (request, reply) => {
      const queueService = fastify.queueService;

      return reply.send({
        queues: {
          enabled: queueService?.isRedisEnabled() ?? false,
          count: queueService?.getAllQueues().size ?? 0,
        },
        timestamp: new Date().toISOString(),
      });
    });
};

export { adminRoutes };
