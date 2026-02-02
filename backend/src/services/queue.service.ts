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
import type { JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import {
  QueueNames,
  JobNames,
  defaultJobOptions,
  smsJobOptions,
  meterReportJobOptions,
  type BaseJobData,
  type SmsNotificationJobData,
  type MeterReportJobData,
} from '../jobs/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ service: 'queue-service' });

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
      log.info(
        'Redis not configured - queues disabled. Set REDIS_URL or REDIS_HOST for background job support.',
      );
      return;
    }

    try {
      // Create Redis connection for queues with fast timeout for dev
      this.connection = new Redis(redisUrl ?? `redis://${redisHost}:${redisPort}`, {
        host: redisUrl ? undefined : redisHost,
        port: redisUrl ? undefined : redisPort,
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
        connectTimeout: 3000, // 3s timeout - fail fast in dev
        retryStrategy: (times) => {
          // Only retry 2 times, then give up
          if (times > 2) {
            return null; // Stop retrying
          }
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true, // Don't connect until we call .connect()
      });

      // Setup error handler (suppress during initial connect attempt)
      let suppressErrors = true;
      this.connection.on('error', (err: Error) => {
        if (!suppressErrors) {
          log.error({ err }, 'Redis connection error');
        }
      });

      this.connection.on('connect', () => {
        log.info('Connected to Redis');
      });

      // Attempt connection with timeout
      await this.connection.connect();
      suppressErrors = false;

      // Verify connection works
      await this.connection.ping();

      // Register queues
      this.registerQueue(QueueNames.SMS_NOTIFICATIONS);
      this.registerQueue(QueueNames.EMAIL_DIGESTS);
      this.registerQueue(QueueNames.METER_REPORTING);

      this.redisEnabled = true;
      log.info('Queues initialized and ready');
    } catch (error) {
      log.error({ err: error }, 'Failed to connect to Redis');
      log.warn('Queues disabled - background jobs will not be processed');

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
      log.warn({ queueName }, 'Cannot register queue - no Redis connection');
      return;
    }

    const queue = new Queue(queueName, {
      connection: this.connection,
      defaultJobOptions,
    });

    this.queues.set(queueName, queue);
    log.info({ queueName }, 'Registered queue');
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
    options?: JobsOptions,
  ): Promise<string | null> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      log.warn(
        { queueName, jobName },
        'Queue not available - job not queued. Ensure Redis is configured.',
      );
      return null;
    }

    try {
      const job = await queue.add(jobName, data, options);
      log.info(
        { jobName, queueName, jobId: job.id, organizationId: data.organizationId },
        'Job queued',
      );
      return job.id || null;
    } catch (error) {
      log.error({ err: error, jobName, queueName }, 'Failed to queue job');
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
      smsJobOptions,
    );
  }

  /**
   * Add a meter reporting job with meter-specific options
   *
   * Convenience method that applies meterReportJobOptions (5 attempts, 5s backoff)
   * automatically. Use this for queueing Stripe meter events.
   *
   * @param data - Meter job data (organizationId, eventName, value, optional timestamp)
   * @returns Job ID if queued, null if queues disabled
   *
   * @example
   * await queueService.addMeterJob({
   *   organizationId: 'org-123',
   *   eventName: 'temperature_readings',
   *   value: 150,
   * });
   */
  async addMeterJob(data: MeterReportJobData): Promise<string | null> {
    return this.addJob<MeterReportJobData>(
      QueueNames.METER_REPORTING,
      JobNames.METER_REPORT,
      data,
      meterReportJobOptions,
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
      log.info('Closing queues...');

      // Close all queues
      await Promise.all(
        Array.from(this.queues.values()).map((queue) =>
          queue.close().catch((err) => {
            log.error({ err, queueName: queue.name }, 'Error closing queue');
          }),
        ),
      );

      this.queues.clear();
      log.info('All queues closed');
    }

    if (this.connection) {
      log.info('Disconnecting Redis...');
      try {
        await this.connection.quit();
        log.info('Redis disconnected');
      } catch (err) {
        log.error({ err }, 'Error disconnecting Redis');
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
