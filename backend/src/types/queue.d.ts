/**
 * Queue type definitions and Fastify instance augmentation
 *
 * Extends Fastify's FastifyInstance interface to include QueueService
 * for background job processing with BullMQ.
 */

import type { QueueService } from '../services/queue.service.js';

/**
 * Extend Fastify instance to include QueueService
 */
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Queue service for background job processing
     * Populated by queue.plugin.ts during initialization
     */
    queueService: QueueService;
  }
}
