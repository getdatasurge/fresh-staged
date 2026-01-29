import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockQueue, MockWorker, MockQueueEvents } from '../mocks/bullmq.mock.js';

// Mock bullmq before importing QueueService
vi.mock('bullmq', () => ({
  Queue: MockQueue,
  Worker: MockWorker,
  QueueEvents: MockQueueEvents,
}));

// Mock ioredis to avoid actual Redis connection
vi.mock('ioredis', () => ({
  Redis: class MockRedis {
    private connected = false;

    on(_event: string, _callback: () => void) {
      return this;
    }

    async connect() {
      this.connected = true;
    }

    async ping() {
      return 'PONG';
    }

    async quit() {
      this.connected = false;
    }
  },
  default: class MockRedis {
    private connected = false;

    on(_event: string, _callback: () => void) {
      return this;
    }

    async connect() {
      this.connected = true;
    }

    async ping() {
      return 'PONG';
    }

    async quit() {
      this.connected = false;
    }
  },
}));

// Import after mocks are set up
import { QueueService } from '../../src/services/queue.service.js';
import { QueueNames, JobNames, type SmsNotificationJobData } from '../../src/jobs/index.js';

/**
 * Queue Service Unit Tests
 *
 * These tests use mocked BullMQ and ioredis to avoid requiring real Redis.
 * Mock implementations are in: tests/mocks/bullmq.mock.ts
 *
 * Tests verify:
 * - QueueService initialization with mocked dependencies
 * - Job addition with organization isolation
 * - Queue retrieval
 * - Graceful shutdown
 *
 * For integration tests with real Redis, use:
 *   docker compose up redis -d
 *   npm test -- queue.service.test.ts
 */

describe('QueueService', () => {
  let queueService: QueueService;

  beforeAll(async () => {
    // Set Redis env for test - mocked Redis will be used
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    queueService = new QueueService();
    await queueService.initialize();
  });

  afterAll(async () => {
    await queueService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize and report Redis as enabled', () => {
      expect(queueService.isRedisEnabled()).toBe(true);
    });

    it('should register all expected queues', () => {
      const smsQueue = queueService.getQueue(QueueNames.SMS_NOTIFICATIONS);
      const emailQueue = queueService.getQueue(QueueNames.EMAIL_DIGESTS);

      expect(smsQueue).toBeDefined();
      expect(emailQueue).toBeDefined();
    });
  });

  describe('addJob', () => {
    it('should add a job to the SMS queue', async () => {
      const jobData: SmsNotificationJobData = {
        organizationId: 'test-org-123',
        phoneNumber: '+1234567890',
        message: 'Test SMS notification',
        alertId: 'alert-456',
      };

      const jobId = await queueService.addJob(
        QueueNames.SMS_NOTIFICATIONS,
        JobNames.SMS_SEND,
        jobData
      );

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      // Mock returns deterministic job IDs: job-1, job-2, etc.
      expect(jobId).toMatch(/^job-\d+$/);
    });

    it('should add a delayed job', async () => {
      const jobData: SmsNotificationJobData = {
        organizationId: 'test-org-123',
        phoneNumber: '+1234567890',
        message: 'Delayed notification',
      };

      const jobId = await queueService.addJob(
        QueueNames.SMS_NOTIFICATIONS,
        JobNames.SMS_SEND,
        jobData,
        { delay: 5000 } // 5 second delay
      );

      expect(jobId).toBeDefined();
      expect(jobId).toMatch(/^job-\d+$/);
    });
  });

  describe('getQueue', () => {
    it('should return queue by name', () => {
      const queue = queueService.getQueue(QueueNames.SMS_NOTIFICATIONS);

      expect(queue).toBeDefined();
      expect(queue?.name).toBe(QueueNames.SMS_NOTIFICATIONS);
    });

    it('should return undefined for unknown queue', () => {
      const queue = queueService.getQueue('nonexistent-queue' as any);

      expect(queue).toBeUndefined();
    });
  });

  describe('getAllQueues', () => {
    it('should return all registered queues', () => {
      const queues = queueService.getAllQueues();

      expect(queues.size).toBe(3);
      expect(queues.has(QueueNames.SMS_NOTIFICATIONS)).toBe(true);
      expect(queues.has(QueueNames.EMAIL_DIGESTS)).toBe(true);
      expect(queues.has(QueueNames.METER_REPORTING)).toBe(true);
    });
  });

  describe('queue operations', () => {
    it('should get job counts from queue', async () => {
      const queue = queueService.getQueue(QueueNames.SMS_NOTIFICATIONS);
      const counts = await queue?.getJobCounts();

      expect(counts).toBeDefined();
      expect(typeof counts?.waiting).toBe('number');
      expect(typeof counts?.active).toBe('number');
      expect(typeof counts?.completed).toBe('number');
      expect(typeof counts?.failed).toBe('number');
    });

    it('should drain queue for cleanup', async () => {
      const queue = queueService.getQueue(QueueNames.SMS_NOTIFICATIONS);

      // Add a test job
      await queue?.add('test-cleanup', { organizationId: 'test', message: 'cleanup test' });

      // Drain waiting jobs
      await queue?.drain();

      const counts = await queue?.getJobCounts();
      expect(counts?.waiting).toBe(0);
    });
  });
});

describe('QueueService without Redis', () => {
  it('should handle missing Redis configuration gracefully', async () => {
    // Save original env
    const originalHost = process.env.REDIS_HOST;
    const originalUrl = process.env.REDIS_URL;

    // Clear Redis config
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_URL;

    const service = new QueueService();
    await service.initialize();

    expect(service.isRedisEnabled()).toBe(false);

    // Restore env
    process.env.REDIS_HOST = originalHost;
    if (originalUrl) process.env.REDIS_URL = originalUrl;
  });
});
