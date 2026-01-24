/**
 * Worker container entry point
 *
 * This file bootstraps BullMQ workers for processing background jobs.
 * It runs as a separate process/container from the API server.
 *
 * Features:
 * - Connects to Redis with maxRetriesPerRequest: null (CRITICAL for workers)
 * - Registers workers for SMS and email queues
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Event logging for monitoring
 */

import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { QueueNames } from '../jobs/index.js';
import { processSmsNotification } from './processors/sms-notification.processor.js';
import { processEmailDigest } from './processors/email-digest.processor.js';

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
  console.log('[Worker] Connected to Redis');
});

connection.on('error', (err: Error) => {
  console.error('[Worker] Redis connection error:', err.message);
});

// SMS notification worker
const smsWorker = new Worker(
  QueueNames.SMS_NOTIFICATIONS,
  async (job) => {
    console.log(`[Worker] Processing SMS job ${job.id}`);
    return processSmsNotification(job);
  },
  {
    connection,
    concurrency: 5, // Process up to 5 SMS jobs concurrently
  }
);

// Email digest worker
const emailWorker = new Worker(
  QueueNames.EMAIL_DIGESTS,
  async (job) => {
    console.log(`[Worker] Processing email job ${job.id}`);
    return processEmailDigest(job);
  },
  {
    connection,
    concurrency: 2, // Email processing is slower, limit concurrency
  }
);

// Event handlers for both workers
const workers = [smsWorker, emailWorker];

workers.forEach((worker) => {
  worker.on('completed', (job) => {
    console.log(`✓ [Worker] Job ${job.id} completed in queue ${worker.name}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`✗ [Worker] Job ${job?.id} failed in queue ${worker.name}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[Worker] Worker error in ${worker.name}:`, err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled in queue ${worker.name}`);
  });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[Worker] ${signal} received, shutting down gracefully...`);

  // Close workers (waits for active jobs to complete)
  await Promise.all(
    workers.map((worker) =>
      worker.close().catch((err) => {
        console.error(`[Worker] Error closing worker ${worker.name}:`, err);
      })
    )
  );

  // Close Redis connection
  await connection.quit().catch(() => {
    console.error('[Worker] Error closing Redis connection');
  });

  console.log('[Worker] Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[Worker] Started and ready to process jobs');
console.log(`[Worker] Registered queues: ${QueueNames.SMS_NOTIFICATIONS}, ${QueueNames.EMAIL_DIGESTS}`);
