import { Queue } from 'bullmq';
import { JobNames, partitionCreateJobOptions, partitionRetentionJobOptions } from '../index.js';

/**
 * Register partition lifecycle management schedulers
 *
 * Weekly partition creation job:
 * - Creates partitions for next 3 months
 * - Runs every Sunday at 2 AM UTC
 * - Maintains buffer to prevent data ingestion failures
 *
 * Monthly partition retention job:
 * - Drops partitions older than 24 months
 * - Runs 1st of each month at 3 AM UTC
 * - Enforces compliance retention policy
 *
 * See also:
 * - Processors: backend/src/workers/partition-create.processor.ts
 * - Processors: backend/src/workers/partition-retention.processor.ts
 * - Service: backend/src/services/partition.service.ts
 */
export async function registerPartitionSchedulers(queue: Queue) {
  await queue.add(
    JobNames.PARTITION_CREATE,
    { organizationId: 'system', bufferMonths: 3 },
    {
      ...partitionCreateJobOptions,
      repeat: {
        pattern: '0 2 * * 0',
      },
      jobId: 'partition-create-weekly',
    },
  );

  await queue.add(
    JobNames.PARTITION_RETENTION,
    { organizationId: 'system', retentionMonths: 24 },
    {
      ...partitionRetentionJobOptions,
      repeat: {
        pattern: '0 3 1 * *',
      },
      jobId: 'partition-retention-monthly',
    },
  );
}
