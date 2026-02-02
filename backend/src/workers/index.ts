/**
 * Worker container entry point
 *
 * This file bootstraps BullMQ workers for processing background jobs.
 * It runs as a separate process/container from the API server.
 *
 * Features:
 * - Connects to Redis with maxRetriesPerRequest: null (CRITICAL for workers)
 * - Registers workers for SMS, email, and meter reporting queues
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Event logging for monitoring
 */

import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueNames } from '../jobs/index.js';
import { logger } from '../utils/logger.js';
import { processEmailDigest } from './processors/email-digest.processor.js';
import { createMeterReportingProcessor } from './processors/meter-reporting.processor.js';
import { processSmsNotification } from './processors/sms-notification.processor.js';

const log = logger.child({ service: 'worker' });

// CRITICAL: Workers MUST use maxRetriesPerRequest: null
// This is required for BullMQ workers to handle blocking Redis operations correctly
const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const connection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for workers!
      enableReadyCheck: false,
    })
  : new Redis({
      host: redisHost,
      port: redisPort,
      maxRetriesPerRequest: null, // Required for workers!
      enableReadyCheck: false,
    });

connection.on('connect', () => {
  log.info('Connected to Redis');
});

connection.on('error', (err: Error) => {
  log.error({ err }, 'Redis connection error');
});

// SMS notification worker
const smsWorker = new Worker(
  QueueNames.SMS_NOTIFICATIONS,
  async (job) => {
    log.info({ jobId: job.id }, 'Processing SMS job');
    return processSmsNotification(job);
  },
  {
    connection,
    concurrency: 5, // Process up to 5 SMS jobs concurrently
  },
);

// Email digest worker
const emailWorker = new Worker(
  QueueNames.EMAIL_DIGESTS,
  async (job) => {
    log.info({ jobId: job.id }, 'Processing email job');
    return processEmailDigest(job);
  },
  {
    connection,
    concurrency: 2, // Email processing is slower, limit concurrency
  },
);

// Meter reporting worker (Stripe billing meters)
const meterWorker = new Worker(QueueNames.METER_REPORTING, createMeterReportingProcessor(), {
  connection,
  concurrency: 5, // Handle multiple orgs in parallel
});

// Event handlers for all workers
const workers = [smsWorker, emailWorker, meterWorker];

workers.forEach((worker) => {
  worker.on('completed', (job) => {
    log.info({ jobId: job.id, queue: worker.name }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, queue: worker.name, err }, 'Job failed');
  });

  worker.on('error', (err) => {
    log.error({ queue: worker.name, err }, 'Worker error');
  });

  worker.on('stalled', (jobId) => {
    log.warn({ jobId, queue: worker.name }, 'Job stalled');
  });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  log.info({ signal }, 'Received signal, shutting down gracefully');

  // Close workers (waits for active jobs to complete)
  await Promise.all(
    workers.map((worker) =>
      worker.close().catch((err) => {
        log.error({ err, queue: worker.name }, 'Error closing worker');
      }),
    ),
  );

  // Close Redis connection
  await connection.quit().catch(() => {
    log.error('Error closing Redis connection');
  });

  log.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log.info('Started and ready to process jobs');
log.info(
  { queues: [QueueNames.SMS_NOTIFICATIONS, QueueNames.EMAIL_DIGESTS, QueueNames.METER_REPORTING] },
  'Registered queues',
);
