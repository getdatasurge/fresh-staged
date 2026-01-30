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
import { QueueService, setQueueService } from '../services/queue.service.js';
import { TelnyxService, setTelnyxService } from '../services/telnyx.service.js';
import { initializeSensorCountScheduler } from '../services/sensor-count-scheduler.service.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { requireAuth } from '../middleware/index.js';

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
  opts: QueuePluginOptions,
) => {
  // Create QueueService instance
  const queueService = new QueueService();

  // Decorate Fastify instance with queueService
  fastify.decorate('queueService', queueService);

  // Initialize TelnyxService for SMS notifications
  // Note: TelnyxService handles missing env vars gracefully (logs warning, doesn't crash)
  const telnyxService = new TelnyxService();
  setTelnyxService(telnyxService);
  if (telnyxService.isEnabled()) {
    fastify.log.info('[Queue Plugin] TelnyxService initialized and enabled');
  } else {
    fastify.log.info('[Queue Plugin] TelnyxService initialized (disabled - no API key)');
  }

  // Initialize QueueService with Redis connection
  await queueService.initialize();

  // Set singleton for services that need queue access
  setQueueService(queueService);

  // Setup Bull Board dashboard and sensor scheduler if Redis is enabled
  // Note: Must be done during plugin registration, not after ready()
  if (queueService.isRedisEnabled()) {
    setupBullBoard(fastify, queueService, opts.dashboardPath);

    // Initialize sensor count scheduler (hourly Stripe meter reporting)
    await initializeSensorCountScheduler();
    fastify.log.info('[Queue Plugin] Sensor count scheduler initialized');
  }

  // Graceful shutdown: close all queues and Redis connection
  fastify.addHook('onClose', async () => {
    fastify.log.info('Shutting down QueueService...');

    if (fastify.queueService) {
      await fastify.queueService.shutdown();
    }

    fastify.log.info('QueueService shutdown complete');

    // TelnyxService doesn't need explicit cleanup (stateless HTTP client)
    fastify.log.info('[Queue Plugin] TelnyxService shutdown');
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
 * Authentication: All routes under /admin/queues require JWT validation
 * via requireAuth middleware applied using onRequest hook.
 *
 * @param fastify - Fastify instance to mount dashboard on
 * @param queueService - QueueService with registered queues
 * @param basePath - Dashboard mount path (default: /admin/queues)
 */
function setupBullBoard(
  fastify: FastifyInstance,
  queueService: QueueService,
  basePath = '/admin/queues',
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

  // Register Bull Board routes with authentication
  // Create a new plugin context to add authentication hook
  fastify.register(async (fastifyInstance) => {
    // Add authentication requirement to all routes in this context
    fastifyInstance.addHook('onRequest', requireAuth);

    // Register Bull Board routes within authenticated context
    fastifyInstance.register(serverAdapter.registerPlugin(), {
      prefix: basePath,
    });
  });

  fastify.log.info(`[BullBoard] Dashboard available at ${basePath} (authenticated)`);
}

export default fastifyPlugin(queuePlugin, {
  name: 'queue',
  fastify: '5.x',
});
