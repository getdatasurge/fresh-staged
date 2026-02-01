import type { Job } from 'bullmq'
import type { PartitionRetentionJobData } from '../jobs/index.js'
import { enforceRetentionPolicy, listPartitions } from '../services/partition.service.js'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

/**
 * Partition retention processor for sensor_readings table
 *
 * Enforces 24-month data retention policy by dropping old partitions
 * Runs monthly via BullMQ scheduler (1st of month at 3 AM UTC)
 *
 * Strategy:
 * - Verifies backups exist before dropping partitions (SAFETY CHECK)
 * - Drops partitions older than 24 months
 * - Logs all deletion events with row counts for audit trail
 * - Preserves partitions within retention window
 *
 * CRITICAL: This is a destructive operation
 * - REQUIRES backup verification to pass before dropping
 * - Monitor job execution for unexpected deletions
 * - Manual override mechanism exists for extended retention
 *
 * See also:
 * - Service: backend/src/services/partition.service.ts
 * - Scheduler: backend/src/jobs/schedulers/partition-schedulers.ts
 * - Runbook: backend/docs/runbooks/partition-management.md
 */

/**
 * Verify that database backups exist and are current
 *
 * Checks:
 * - Last successful backup timestamp (must be within 24 hours)
 * - Backup status from pg_stat_archiver or custom backup system
 *
 * Environment variables:
 * - BACKUP_VERIFICATION_ENABLED: Set to 'false' to skip verification (NOT RECOMMENDED)
 * - BACKUP_MAX_AGE_HOURS: Maximum age of last backup in hours (default: 24)
 *
 * @throws Error if backups are not current or verification fails
 */
async function verifyBackupsExist(job: Job): Promise<void> {
	const skipVerification = process.env.BACKUP_VERIFICATION_ENABLED === 'false'
	const maxBackupAgeHours = parseInt(process.env.BACKUP_MAX_AGE_HOURS || '24', 10)

	if (skipVerification) {
		await job.log(
			'⚠️  BACKUP VERIFICATION DISABLED - Proceeding without backup check (HIGH RISK)',
		)
		return
	}

	await job.log('Verifying database backups before dropping partitions...')

	// Check PostgreSQL WAL archiving status (pg_stat_archiver)
	try {
		const [archiveStatus] = await db.execute(sql`
			SELECT
				last_archived_time,
				EXTRACT(EPOCH FROM (now() - last_archived_time)) / 3600 AS hours_since_last_archive,
				last_archived_wal,
				last_failed_wal,
				last_failed_time
			FROM pg_stat_archiver
		`)

		if (!archiveStatus) {
			throw new Error('Unable to query pg_stat_archiver - backup verification failed')
		}

		const hoursSinceArchive = archiveStatus.hours_since_last_archive as number | null

		if (hoursSinceArchive === null) {
			throw new Error(
				'No WAL archive history found - ensure continuous archiving is configured',
			)
		}

		if (hoursSinceArchive > maxBackupAgeHours) {
			throw new Error(
				`Last WAL archive is ${hoursSinceArchive.toFixed(1)} hours old (max: ${maxBackupAgeHours}h) - backups may be stale`,
			)
		}

		if (archiveStatus.last_failed_wal) {
			await job.log(
				`⚠️  Warning: WAL archive failure detected at ${archiveStatus.last_failed_time}`,
			)
		}

		await job.log(
			`✓ Backup verification passed - Last WAL archive: ${hoursSinceArchive.toFixed(1)} hours ago`,
		)
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown backup verification error'
		await job.log(`❌ Backup verification FAILED: ${errorMessage}`)
		throw new Error(
			`Partition retention aborted due to backup verification failure: ${errorMessage}`,
		)
	}
}

/**
 * Log partitions that will be dropped for audit purposes
 */
async function logPartitionsToBeDropped(
	job: Job,
	retentionMonths: number,
): Promise<string[]> {
	const allPartitions = await listPartitions()
	const cutoffDate = new Date()
	cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)

	const partitionsToBeDropped = allPartitions.filter((partition) => {
		if (!partition.fromValue) return false
		return partition.fromValue < cutoffDate
	})

	if (partitionsToBeDropped.length > 0) {
		await job.log(`Partitions eligible for deletion (${partitionsToBeDropped.length}):`)
		for (const partition of partitionsToBeDropped) {
			await job.log(
				`  - ${partition.name} (${partition.fromValue?.toISOString().split('T')[0]} to ${partition.toValue?.toISOString().split('T')[0]}, ${partition.rowCount} rows)`,
			)
		}

		// Calculate total data loss
		const totalRows = partitionsToBeDropped.reduce(
			(sum, p) => sum + (p.rowCount || 0),
			0,
		)
		await job.log(
			`⚠️  TOTAL DATA TO BE DELETED: ${totalRows.toLocaleString()} sensor readings`,
		)
	}

	return partitionsToBeDropped.map((p) => p.name)
}

export async function processPartitionRetention(
	job: Job<PartitionRetentionJobData>,
) {
	const { retentionMonths = 24 } = job.data

	await job.log(`Enforcing retention policy (${retentionMonths} months)`)

	// SAFETY CHECK 1: Verify backups exist
	await verifyBackupsExist(job)

	// SAFETY CHECK 2: Log what will be dropped
	const partitionsToBeDropped = await logPartitionsToBeDropped(job, retentionMonths)

	if (partitionsToBeDropped.length === 0) {
		await job.log('No partitions eligible for deletion')
		return { droppedPartitions: [] }
	}

	// Execute retention policy
	const droppedPartitions = await enforceRetentionPolicy(retentionMonths)

	await job.log(
		`✓ Successfully dropped ${droppedPartitions.length} partitions: ${droppedPartitions.join(', ')}`,
	)

	return { droppedPartitions }
}
