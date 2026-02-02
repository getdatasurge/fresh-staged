/**
 * Sensor Count Scheduler Service
 *
 * Reports active sensor counts to Stripe Billing Meters on an hourly schedule.
 * Uses 'last' aggregation - Stripe bills based on the final count in the period.
 *
 * Scheduling approach:
 * - Uses BullMQ repeatable job with cron '0 * * * *' (hourly at minute 0)
 * - Single scheduler job that processes all billable organizations
 * - Only reports for organizations with stripeCustomerId and active/trial status
 */

import { and, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { subscriptions } from '../db/schema/tenancy.js';
import { QueueNames, JobNames, type MeterReportJobData } from '../jobs/index.js';
import { getActiveSensorCount } from '../middleware/subscription.js';
import { logger } from '../utils/logger.js';
import { getQueueService } from './queue.service.js';

const log = logger.child({ service: 'sensor-count-scheduler' });

// Valid statuses for metering (only bill active/trial subscriptions)
const BILLABLE_STATUSES = ['active', 'trial'] as const;

// Cron expression for hourly at minute 0
const HOURLY_CRON = '0 * * * *';

export class SensorCountScheduler {
  private static instance: SensorCountScheduler | null = null;
  private isInitialized = false;

  static getInstance(): SensorCountScheduler {
    if (!SensorCountScheduler.instance) {
      SensorCountScheduler.instance = new SensorCountScheduler();
    }
    return SensorCountScheduler.instance;
  }

  /**
   * Initialize the scheduler by creating a repeatable job for hourly sensor count reporting
   *
   * Call this once on API startup (after queue service is ready)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const queueService = getQueueService();
    if (!queueService?.isEnabled()) {
      log.info('Queue service not available, skipping initialization');
      return;
    }

    const queue = queueService.getQueue(QueueNames.METER_REPORTING);
    if (!queue) {
      log.info('METER_REPORTING queue not available, skipping initialization');
      return;
    }

    try {
      // Remove any existing repeatable job with the same name to avoid duplicates
      const repeatableJobs = await queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === JobNames.SENSOR_COUNT_SCHEDULER) {
          await queue.removeRepeatableByKey(job.key);
          log.info('Removed existing repeatable job');
        }
      }

      // Create the hourly repeatable job
      // This job triggers reportAllSensorCounts() via the processor
      // Note: Job data is placeholder - scheduler job is identified by job.name, not data
      await queue.add(
        JobNames.SENSOR_COUNT_SCHEDULER,
        { organizationId: 'system', eventName: 'active_sensors', value: 0 },
        {
          repeat: {
            pattern: HOURLY_CRON, // '0 * * * *' = every hour at minute 0
          },
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      );

      this.isInitialized = true;
      log.info({ cron: HOURLY_CRON }, 'Hourly repeatable job created');

      // Run initial report on startup
      await this.reportAllSensorCounts();
      log.info('Initial sensor count report completed');
    } catch (err) {
      log.error({ err }, 'Failed to initialize');
    }
  }

  /**
   * Queue a sensor count report for a specific organization
   * Called when sensor count changes (add/remove/update sensor)
   */
  async queueSensorCountReport(organizationId: string): Promise<void> {
    const queueService = getQueueService();
    if (!queueService?.isEnabled()) {
      return;
    }

    // Get current sensor count
    const sensorCount = await getActiveSensorCount(organizationId);

    const jobData: MeterReportJobData = {
      organizationId,
      eventName: 'active_sensors',
      value: sensorCount,
    };

    try {
      await queueService.addJob(QueueNames.METER_REPORTING, JobNames.METER_REPORT, jobData);
      log.info({ sensorCount, organizationId }, 'Queued sensor count');
    } catch (err) {
      log.error({ err }, 'Failed to queue sensor count');
    }
  }

  /**
   * Report sensor counts for all billable organizations
   * Called by the hourly repeatable job processor
   */
  async reportAllSensorCounts(): Promise<{ reported: number; errors: number }> {
    const billableOrgs = await db
      .select({
        organizationId: subscriptions.organizationId,
      })
      .from(subscriptions)
      .where(
        and(
          isNotNull(subscriptions.stripeCustomerId),
          inArray(subscriptions.status, [...BILLABLE_STATUSES]),
        ),
      );

    log.info({ count: billableOrgs.length }, 'Processing billable organizations');

    let reported = 0;
    let errors = 0;

    for (const org of billableOrgs) {
      try {
        await this.queueSensorCountReport(org.organizationId);
        reported++;
      } catch {
        errors++;
      }
    }

    log.info({ reported, errors }, 'Queued reports');
    return { reported, errors };
  }
}

// Singleton accessor
export function getSensorCountScheduler(): SensorCountScheduler {
  return SensorCountScheduler.getInstance();
}

/**
 * Initialize sensor count scheduling
 * Call from queue.plugin.ts after queue service is ready
 */
export async function initializeSensorCountScheduler(): Promise<void> {
  const scheduler = getSensorCountScheduler();
  await scheduler.initialize();
}
