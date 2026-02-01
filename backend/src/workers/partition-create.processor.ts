import type { Job } from 'bullmq'
import type { PartitionCreateJobData } from '../jobs/index.js'
import { createFuturePartitions } from '../services/partition.service.js'

/**
 * Partition creation processor for sensor_readings table
 *
 * Maintains future partition buffer to prevent data ingestion failures
 * Runs weekly via BullMQ scheduler (every Sunday at 2 AM UTC)
 *
 * Strategy:
 * - Creates partitions for next 3 months (configurable)
 * - Skips partitions that already exist
 * - Logs all partition creation events for audit trail
 *
 * See also:
 * - Service: backend/src/services/partition.service.ts
 * - Scheduler: backend/src/jobs/schedulers/partition-schedulers.ts
 * - Migration: backend/drizzle/0006_partition_sensor_readings.sql
 */
export async function processPartitionCreate(
	job: Job<PartitionCreateJobData>,
) {
	const { bufferMonths = 3 } = job.data

	await job.log(`Creating future partitions (${bufferMonths} months buffer)`)

	const createdPartitions = await createFuturePartitions(bufferMonths)

	if (createdPartitions.length > 0) {
		await job.log(
			`Created ${createdPartitions.length} partitions: ${createdPartitions.join(', ')}`,
		)
	} else {
		await job.log('All future partitions already exist')
	}

	return { createdPartitions }
}
