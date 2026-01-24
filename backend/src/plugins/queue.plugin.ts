/**
 * Queue plugin for Fastify
 *
 * Integrates BullMQ job queue infrastructure with Fastify for background
 * job processing (SMS notifications, email digests, exports).
 *
 * Features:
 * - Initializes QueueService with Redis connection
 * - Decorates Fastify instance with queueService
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

/**
 * Queue plugin options
 * Currently no options required, but interface allows future configuration
 */
export interface QueuePluginOptions {
  // Future: Allow custom Redis configuration
  // redis?: { host: string; port: number; };
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

export default fastifyPlugin(queuePlugin, {
  name: 'queue',
  fastify: '5.x',
});
