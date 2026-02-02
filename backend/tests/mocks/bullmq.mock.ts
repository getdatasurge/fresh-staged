/**
 * BullMQ Mock Module for Unit Testing
 *
 * Provides mock implementations of BullMQ classes (Queue, Worker, QueueEvents)
 * that simulate queue behavior without requiring a Redis connection.
 *
 * Usage:
 * ```typescript
 * import { MockQueue, MockWorker, MockQueueEvents } from '../mocks/bullmq.mock.js';
 *
 * vi.mock('bullmq', () => ({
 *   Queue: MockQueue,
 *   Worker: MockWorker,
 *   QueueEvents: MockQueueEvents,
 * }));
 * ```
 *
 * Features:
 * - In-memory job storage for verification
 * - Deterministic job IDs (job-1, job-2, etc.)
 * - No actual job processing
 * - Compatible with QueueService API
 */

import { vi } from 'vitest';

/**
 * Mock job returned by MockQueue.add()
 */
export interface MockJob {
  id: string;
  name: string;
  data: unknown;
  opts?: { delay?: number };
}

/**
 * MockQueue - simulates BullMQ Queue without Redis
 *
 * Stores jobs in memory for test verification.
 * Job IDs are deterministic: job-1, job-2, etc.
 */
export class MockQueue {
  name: string;
  private jobs: Map<string, MockJob> = new Map();
  private jobCounter = 0;
  private opts: unknown;

  constructor(name: string, opts?: unknown) {
    this.name = name;
    this.opts = opts;
  }

  /**
   * Add a job to the mock queue
   * @returns Mock job with deterministic ID
   */
  async add(jobName: string, data: unknown, opts?: { delay?: number }) {
    const id = `job-${++this.jobCounter}`;
    const job: MockJob = { id, name: jobName, data, opts };
    this.jobs.set(id, job);
    return { id };
  }

  /**
   * Get job counts - returns waiting count based on stored jobs
   */
  async getJobCounts() {
    return {
      waiting: this.jobs.size,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }

  /**
   * Drain the queue - clears all stored jobs
   */
  async drain() {
    this.jobs.clear();
  }

  /**
   * Close the queue - no-op for tests
   */
  async close() {
    // No-op for tests
  }

  /**
   * Get all jobs stored in this mock queue (for test verification)
   */
  getStoredJobs(): Map<string, MockJob> {
    return this.jobs;
  }

  /**
   * Reset the job counter and clear jobs (for test isolation)
   */
  reset() {
    this.jobs.clear();
    this.jobCounter = 0;
  }
}

/**
 * MockWorker - simulates BullMQ Worker without Redis
 *
 * Stores the processor function but does not actually process jobs.
 * Useful for verifying worker registration.
 */
export class MockWorker {
  name: string;
  processor: (job: MockJob) => Promise<unknown>;
  private opts: unknown;

  constructor(name: string, processor: (job: MockJob) => Promise<unknown>, opts?: unknown) {
    this.name = name;
    this.processor = processor;
    this.opts = opts;
  }

  /**
   * Close the worker - no-op for tests
   */
  async close() {
    // No-op for tests
  }

  /**
   * Manually process a job (for testing processor functions)
   */
  async processJob(job: MockJob): Promise<unknown> {
    return this.processor(job);
  }
}

/**
 * MockQueueEvents - simulates BullMQ QueueEvents without Redis
 *
 * Provides event handling stubs without actual Redis pub/sub.
 */
export class MockQueueEvents {
  name: string;
  private opts: unknown;
  private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  constructor(name: string, opts?: unknown) {
    this.name = name;
    this.opts = opts;
  }

  /**
   * Register an event listener
   */
  on(event: string, callback: (...args: unknown[]) => void) {
    const existing = this.listeners.get(event) || [];
    existing.push(callback);
    this.listeners.set(event, existing);
    return this;
  }

  /**
   * Remove an event listener
   */
  off(event: string, callback: (...args: unknown[]) => void) {
    const existing = this.listeners.get(event) || [];
    this.listeners.set(
      event,
      existing.filter((cb) => cb !== callback),
    );
    return this;
  }

  /**
   * Emit an event (for testing event handlers)
   */
  emit(event: string, ...args: unknown[]) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach((cb) => cb(...args));
    return this;
  }

  /**
   * Close the queue events - no-op for tests
   */
  async close() {
    this.listeners.clear();
  }
}

/**
 * Create mock functions for additional BullMQ exports if needed
 */
export const mockBullMQ = {
  Queue: MockQueue,
  Worker: MockWorker,
  QueueEvents: MockQueueEvents,
};
