/**
 * QueueService for managing BullMQ job queues
 *
 * Provides centralized queue management and job processing infrastructure
 * using BullMQ with Redis backend for horizontal scaling.
 *
 * Features:
 * - Redis connection handling with optional configuration
 * - Queue registration and lifecycle management
 * - Type-safe job addition methods
 * - Graceful shutdown with connection cleanup
 *
 * Usage:
 * ```typescript
 * const queueService = new QueueService();
 * await queueService.initialize();
 *
 * // Add a job to a queue
 * await queueService.addJob<SendSMSJobData>(
 *   QueueNames.SMS_NOTIFICATIONS,
 *   JobNames.SMS_SEND,
 *   { organizationId: 'org-123', phoneNumber: '+1234567890', message: 'Alert!' }
 * );
 * ```
 */

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { JobsOptions } from 'bullmq';
import {
  QueueNames,
  JobNames,
  defaultJobOptions,
  smsJobOptions,
  type BaseJobData,
  type SmsNotificationJobData,
} from '../jobs/index.js';

/**
 * QueueService class for managing BullMQ queues
 *
 * Handles:
 * - Redis connection configuration
 * - Queue registration and lifecycle
 * - Type-safe job addition
 * - Graceful shutdown
 */
export class QueueService {
  private connection?: Redis;
  private queues: Map<string, Queue> = new Map();
  private redisEnabled = false;

  /**
   * Initialize QueueService with Redis connection
   *
   * Attempts to connect to Redis using environment variables:
   * - REDIS_URL: Full connection string (takes precedence)
   * - REDIS_HOST: Redis host (default: localhost)
   * - REDIS_PORT: Redis port (default: 6379)
   *
   * If Redis is not configured, logs warning and continues without queues.
   * This allows development without Redis infrastructure.
   *
   * @throws Error if Redis connection fails after configuration is provided
   */
  async initialize(): Promise<void> {
    // Check for Redis configuration
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    // Skip Redis setup if no configuration provided
    if (!redisUrl && !process.env.REDIS_HOST) {
      console.log(
        '[QueueService] Redis not configured - queues disabled. ' +
        'Set REDIS_URL or REDIS_HOST for background job support.'
      );
      return;
    }

    try {
      // Create Redis connection for queues
      const clientConfig = redisUrl
        ? { url: redisUrl }
        : { host: redisHost, port: redisPort };

      this.connection = new Redis(redisUrl || '', {
        ...clientConfig,
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
      });

      // Setup error handler
      this.connection.on('error', (err: Error) => {
        console.error('[QueueService] Redis connection error:', err);
      });

      this.connection.on('connect', () => {
        console.log('[QueueService] Connected to Redis');
      });

      // Wait for connection
      await this.connection.ping();

      // Register queues
      this.registerQueue(QueueNames.SMS_NOTIFICATIONS);
      this.registerQueue(QueueNames.EMAIL_DIGESTS);

      this.redisEnabled = true;
      console.log('[QueueService] Queues initialized and ready');
    } catch (error) {
      console.error('[QueueService] Failed to connect to Redis:', error);
      console.warn('[QueueService] Queues disabled - background jobs will not be processed');

      // Clean up connection on failure
      try {
        await this.connection?.quit();
      } catch {
        // Ignore cleanup errors
      }
      this.connection = undefined;
    }
  }

  /**
   * Register a queue for job processing
   *
   * Creates a BullMQ Queue instance with shared Redis connection.
   * Queues are stored in a Map for retrieval by name.
   *
   * @param queueName - Queue name constant from QueueNames
   */
  private registerQueue(queueName: string): void {
    if (!this.connection) {
      console.warn(`[QueueService] Cannot register queue ${queueName} - no Redis connection`);
      return;
    }

    const queue = new Queue(queueName, {
      connection: this.connection,
      defaultJobOptions,
    });

    this.queues.set(queueName, queue);
    console.log(`[QueueService] Registered queue: ${queueName}`);
  }

  /**
   * Add a job to a queue
   *
   * Type-safe method for adding jobs with organizationId enforcement.
   * All job data must extend BaseJobData to ensure multi-tenant isolation.
   *
   * @param queueName - Queue name constant from QueueNames
   * @param jobName - Job name constant from JobNames
   * @param data - Job data (must include organizationId)
   * @param options - Optional BullMQ job options (overrides defaults)
   * @returns Job ID if queued, null if queues disabled
   *
   * @example
   * await queueService.addJob<SendSMSJobData>(
   *   QueueNames.SMS_NOTIFICATIONS,
   *   JobNames.SMS_SEND,
   *   {
   *     organizationId: 'org-123',
   *     phoneNumber: '+15551234567',
   *     message: 'Temperature alert!'
   *   }
   * );
   */
  async addJob<T extends BaseJobData>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobsOptions
  ): Promise<string | null> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      console.warn(
        `[QueueService] Queue ${queueName} not available - job ${jobName} not queued. ` +
        'Ensure Redis is configured.'
      );
      return null;
    }

    try {
      const job = await queue.add(jobName, data, options);
      console.log(
        `[QueueService] Job ${jobName} queued in ${queueName} with ID ${job.id} ` +
        `for organization ${data.organizationId}`
      );
      return job.id || null;
    } catch (error) {
      console.error(
        `[QueueService] Failed to queue job ${jobName} in ${queueName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Add an SMS notification job with SMS-specific options
   *
   * Convenience method that applies smsJobOptions (5 attempts, exponential backoff)
   * automatically. Use this instead of addJob for SMS notifications.
   *
   * @param data - SMS job data (must include organizationId, phoneNumber, message)
   * @returns Job ID if queued, null if queues disabled
   *
   * @example
   * await queueService.addSmsJob({
   *   organizationId: 'org-123',
   *   phoneNumber: '+15551234567',
   *   message: 'Temperature alert!',
   *   alertId: 'alert-456',
   * });
   */
  async addSmsJob(data: SmsNotificationJobData): Promise<string | null> {
    return this.addJob<SmsNotificationJobData>(
      QueueNames.SMS_NOTIFICATIONS,
      JobNames.SMS_SEND,
      data,
      smsJobOptions
    );
  }

  /**
   * Get a queue by name
   *
   * @param queueName - Queue name constant from QueueNames
   * @returns Queue instance or undefined if not registered
   */
  getQueue(queueName: string): Queue | undefined {
    return this.queues.get(queueName);
  }

  /**
   * Get all registered queues
   *
   * @returns Map of queue name to Queue instance
   */
  getAllQueues(): Map<string, Queue> {
    return this.queues;
  }

  /**
   * Get Redis connection status
   *
   * @returns True if Redis connection is established and queues are enabled
   */
  isRedisEnabled(): boolean {
    return this.redisEnabled;
  }

  /**
   * Alias for isRedisEnabled - used by health checks
   *
   * @returns True if queue service is enabled (Redis connected)
   */
  isEnabled(): boolean {
    return this.redisEnabled;
  }

  /**
   * Health check for Redis connectivity
   *
   * Performs a ping to Redis and measures latency.
   * Used by health check endpoints for monitoring.
   *
   * @returns Health check result with ok status and latency in milliseconds
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.connection || !this.redisEnabled) {
      return { ok: false, latencyMs: 0 };
    }

    const start = Date.now();
    try {
      await this.connection.ping();
      return {
        ok: true,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        ok: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Gracefully shutdown queues and Redis connection
   *
   * Called during application shutdown to:
   * - Close all queue instances
   * - Disconnect Redis connection
   * - Ensure no jobs are lost
   */
  async shutdown(): Promise<void> {
    if (this.queues.size > 0) {
      console.log('[QueueService] Closing queues...');

      // Close all queues
      await Promise.all(
        Array.from(this.queues.values()).map((queue) =>
          queue.close().catch((err) => {
            console.error(`[QueueService] Error closing queue ${queue.name}:`, err);
          })
        )
      );

      this.queues.clear();
      console.log('[QueueService] All queues closed');
    }

    if (this.connection) {
      console.log('[QueueService] Disconnecting Redis...');
      try {
        await this.connection.quit();
        console.log('[QueueService] Redis disconnected');
      } catch (err) {
        console.error('[QueueService] Error disconnecting Redis:', err);
      }
    }
  }
}

/**
 * Singleton QueueService instance
 * Set by queue.plugin.ts during initialization
 */
let instance: QueueService | null = null;

/**
 * Set the singleton QueueService instance
 *
 * @param service - QueueService instance to set as singleton
 */
export function setQueueService(service: QueueService): void {
  instance = service;
}

/**
 * Get the singleton QueueService instance
 *
 * @returns QueueService instance or null if not initialized
 */
export function getQueueService(): QueueService | null {
  return instance;
}
