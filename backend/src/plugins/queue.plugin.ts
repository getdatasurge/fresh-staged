/**
 * Queue plugin for Fastify
 *
 * Integrates BullMQ job queue infrastructure with Fastify for background
 * job processing (SMS notifications, email digests, exports).
 *
 * Features:
 * - Initializes QueueService with Redis connection
 * - Decorates Fastify instance with queueService
 * - Bull Board dashboard for queue monitoring
 * - Graceful shutdown on application close
 * - Multi-tenant job isolation via organizationId
 *
 * Usage:
 *   app.register(queuePlugin);
 *   app.ready().then(() => {
 *     app.queueService.addJob(...);
 *   });
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { QueueService } from '../services/queue.service.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';

/**
 * Queue plugin options
 * Currently no options required, but interface allows future configuration
 */
export interface QueuePluginOptions {
  // Future: Allow custom Redis configuration
  // redis?: { host: string; port: number; };
  // Bull Board dashboard path (default: /admin/queues)
  dashboardPath?: string;
}

const queuePlugin: FastifyPluginAsync<QueuePluginOptions> = async (
  fastify: FastifyInstance,
  opts: QueuePluginOptions
) => {
  // Create QueueService instance
  const queueService = new QueueService();

  // Decorate Fastify instance with queueService
  fastify.decorate('queueService', queueService);

  // Initialize QueueService with Redis connection after server is ready
  fastify.ready(async () => {
    await queueService.initialize();

    // Setup Bull Board dashboard if Redis is enabled
    if (queueService.isRedisEnabled()) {
      setupBullBoard(fastify, queueService, opts.dashboardPath);
    }
  });

  // Graceful shutdown: close all queues and Redis connection
  fastify.addHook('onClose', async () => {
    fastify.log.info('Shutting down QueueService...');

    if (fastify.queueService) {
      await fastify.queueService.shutdown();
    }

    fastify.log.info('QueueService shutdown complete');
  });

  fastify.log.info('Queue plugin registered');
};

/**
 * Setup Bull Board dashboard for queue monitoring
 *
 * Creates a web UI at the specified path for viewing queue status,
 * job details, and managing failed jobs. Dashboard shows all registered
 * queues with real-time updates.
 *
 * @param fastify - Fastify instance to mount dashboard on
 * @param queueService - QueueService with registered queues
 * @param basePath - Dashboard mount path (default: /admin/queues)
 */
function setupBullBoard(
  fastify: FastifyInstance,
  queueService: QueueService,
  basePath = '/admin/queues'
): void {
  // Get all registered queues from QueueService
  const queues = Array.from(queueService.getAllQueues().values());

  if (queues.length === 0) {
    fastify.log.warn('[BullBoard] No queues registered - dashboard not created');
    return;
  }

  // Wrap queues in BullMQAdapter for Bull Board
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(basePath);

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  // Register Bull Board routes with Fastify
  fastify.register(serverAdapter.registerPlugin(), {
    prefix: basePath,
  });

  fastify.log.info(`[BullBoard] Dashboard available at ${basePath}`);
}

export default fastifyPlugin(queuePlugin, {
  name: 'queue',
  fastify: '5.x',
});
