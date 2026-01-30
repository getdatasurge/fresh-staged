/**
 * Digest Scheduler Management Utilities
 *
 * Provides functions to create, update, and remove BullMQ job schedulers
 * for daily and weekly email digests based on user preferences.
 *
 * Features:
 * - Per-user scheduler identification prevents duplicates
 * - Timezone-aware cron scheduling at user's preferred time
 * - User-configurable daily time (HH:MM format, default 09:00)
 * - Graceful fallback when queue service unavailable
 * - Clean removal when preferences disabled
 */

import { getQueueService } from '../../services/queue.service.js';
import { QueueNames, JobNames, type EmailDigestJobData } from '../index.js';

/**
 * Sync digest schedulers for a user based on their preferences
 *
 * Creates or updates job schedulers using upsertJobScheduler.
 * Schedulers are identified by userId to prevent duplicates.
 *
 * @param userId - User ID for scheduler identification
 * @param organizationId - Organization ID for job data
 * @param preferences - User's digest preferences
 */
export async function syncUserDigestSchedulers(
  userId: string,
  organizationId: string,
  preferences: {
    dailyEnabled: boolean;
    weeklyEnabled: boolean;
    timezone: string;
    dailyTime?: string; // "HH:MM" format, defaults to "09:00"
  },
): Promise<void> {
  const queueService = getQueueService();
  if (!queueService || !queueService.isRedisEnabled()) {
    console.log('[DigestSchedulers] Queue service not available - skipping scheduler sync');
    return;
  }

  const queue = queueService.getQueue(QueueNames.EMAIL_DIGESTS);
  if (!queue) {
    console.warn('[DigestSchedulers] EMAIL_DIGESTS queue not found');
    return;
  }

  const { dailyEnabled, weeklyEnabled, timezone, dailyTime = '09:00' } = preferences;

  // Parse user's preferred time
  const [hour, minute] = dailyTime.split(':').map(Number);

  // Daily digest at user's preferred time
  if (dailyEnabled) {
    await queue.upsertJobScheduler(
      `digest-daily-${userId}`,
      {
        pattern: `${minute} ${hour} * * *`, // User's chosen time daily
        tz: timezone,
      },
      {
        name: JobNames.EMAIL_DIGEST,
        data: {
          organizationId,
          userId,
          period: 'daily',
        } as EmailDigestJobData,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    );
    console.log(
      `[DigestSchedulers] Upserted daily scheduler for user ${userId} at ${dailyTime} ${timezone}`,
    );
  } else {
    // Remove scheduler if disabled
    await queue.removeJobScheduler(`digest-daily-${userId}`);
    console.log(`[DigestSchedulers] Removed daily scheduler for user ${userId}`);
  }

  // Weekly digest: Monday at user's preferred time
  if (weeklyEnabled) {
    await queue.upsertJobScheduler(
      `digest-weekly-${userId}`,
      {
        pattern: `${minute} ${hour} * * 1`, // Monday at user's time
        tz: timezone,
      },
      {
        name: JobNames.EMAIL_DIGEST,
        data: {
          organizationId,
          userId,
          period: 'weekly',
        } as EmailDigestJobData,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    );
    console.log(
      `[DigestSchedulers] Upserted weekly scheduler for user ${userId} at Monday ${dailyTime} ${timezone}`,
    );
  } else {
    await queue.removeJobScheduler(`digest-weekly-${userId}`);
    console.log(`[DigestSchedulers] Removed weekly scheduler for user ${userId}`);
  }
}

/**
 * Remove all digest schedulers for a user
 *
 * Called when user is deleted or leaves organization,
 * or when user disables all digest notifications.
 *
 * @param userId - User ID whose schedulers to remove
 */
export async function removeUserDigestSchedulers(userId: string): Promise<void> {
  const queueService = getQueueService();
  if (!queueService || !queueService.isRedisEnabled()) {
    return;
  }

  const queue = queueService.getQueue(QueueNames.EMAIL_DIGESTS);
  if (!queue) return;

  await queue.removeJobScheduler(`digest-daily-${userId}`);
  await queue.removeJobScheduler(`digest-weekly-${userId}`);
  console.log(`[DigestSchedulers] Removed all schedulers for user ${userId}`);
}
