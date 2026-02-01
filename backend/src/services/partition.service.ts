import { db } from '../db/client.js'
import { sql } from 'drizzle-orm'
import { partitionRetentionOverrides } from '../db/schema/partition-overrides.js'

/**
 * Partition lifecycle management service for sensor_readings table
 *
 * Handles automated creation and deletion of time-based partitions
 * using PostgreSQL native RANGE partitioning on recorded_at column.
 *
 * Strategy:
 * - Monthly partitions: sensor_readings_y<YYYY>m<MM>
 * - Future buffer: 3 months ahead (maintained by weekly creation job)
 * - Retention: 24 months (enforced by monthly deletion job)
 *
 * See also:
 * - Migration: backend/drizzle/0006_partition_sensor_readings.sql
 * - Workers: backend/src/workers/partition-create.processor.ts
 * - Workers: backend/src/workers/partition-retention.processor.ts
 * - Runbooks: backend/docs/runbooks/partition-management.md
 */

export interface PartitionInfo {
	schemaName: string
	tableName: string
	partitionName: string
	fromValue: Date
	toValue: Date
	rowCount: number
	sizeBytes: number
}

export interface PartitionBound {
	partitionName: string
	boundExpression: string
	fromValue: Date | null
	toValue: Date | null
}

/**
 * Parse PostgreSQL partition bound expression to extract date ranges
 * Example: "FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00')"
 */
function parsePartitionBound(
	partitionName: string,
	boundExpression: string,
): PartitionBound {
	const fromMatch = boundExpression.match(/FROM \('([^']+)'\)/)
	const toMatch = boundExpression.match(/TO \('([^']+)'\)/)

	return {
		partitionName,
		boundExpression,
		fromValue: fromMatch ? new Date(fromMatch[1]) : null,
		toValue: toMatch ? new Date(toMatch[1]) : null,
	}
}

/**
 * List all partitions for sensor_readings table with metadata
 */
export async function listPartitions(): Promise<PartitionInfo[]> {
	const result = await db.execute(sql`
    SELECT
      t.schemaname AS schema_name,
      t.tablename AS table_name,
      pg_get_expr(c.relpartbound, c.oid) AS partition_bound,
      pg_total_relation_size(c.oid) AS size_bytes
    FROM pg_tables t
    JOIN pg_class c ON t.tablename = c.relname
    WHERE t.schemaname = 'public'
      AND t.tablename LIKE 'sensor_readings_y%'
    ORDER BY t.tablename;
  `)

	const partitions: PartitionInfo[] = []

	for (const row of result.rows as any[]) {
		const bound = parsePartitionBound(row.table_name, row.partition_bound)

		if (!bound.fromValue || !bound.toValue) {
			continue
		}

		const countResult = await db.execute(
			sql.raw(`SELECT COUNT(*) as count FROM ${row.table_name}`),
		)
		const rowCount = parseInt((countResult.rows[0] as any)?.count || '0', 10)

		partitions.push({
			schemaName: row.schema_name,
			tableName: 'sensor_readings',
			partitionName: row.table_name,
			fromValue: bound.fromValue,
			toValue: bound.toValue,
			rowCount,
			sizeBytes: parseInt(row.size_bytes, 10),
		})
	}

	return partitions
}

/**
 * Generate partition name from date
 * Format: sensor_readings_y<YYYY>m<MM>
 */
function getPartitionName(date: Date): string {
	const year = date.getUTCFullYear()
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	return `sensor_readings_y${year}m${month}`
}

/**
 * Create future partitions to maintain buffer
 * Called by partition:create BullMQ job (weekly)
 *
 * @param bufferMonths Number of months to create ahead (default: 3)
 * @returns Array of created partition names
 */
export async function createFuturePartitions(
	bufferMonths: number = 3,
): Promise<string[]> {
	const createdPartitions: string[] = []
	const now = new Date()

	for (let i = 0; i <= bufferMonths; i++) {
		const targetMonth = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1),
		)
		const nextMonth = new Date(
			Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 1),
		)

		const partitionName = getPartitionName(targetMonth)

		const existsResult = await db.execute(sql`
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ${partitionName}
    `)

		if (existsResult.rowCount && existsResult.rowCount > 0) {
			continue
		}

		const fromValue = targetMonth.toISOString()
		const toValue = nextMonth.toISOString()

		await db.execute(sql.raw(`
      CREATE TABLE ${partitionName} PARTITION OF sensor_readings
      FOR VALUES FROM ('${fromValue}') TO ('${toValue}');
    `))

		createdPartitions.push(partitionName)
	}

	return createdPartitions
}

export interface DroppedPartitionInfo {
	partitionName: string
	rowCount: number
	fromValue: Date
	toValue: Date
}

/**
 * Get active retention overrides (not expired)
 * Returns partition names that should be excluded from retention enforcement
 */
async function getActiveOverrides(): Promise<Set<string>> {
	const now = new Date()
	const overrides = await db
		.select({ partitionName: partitionRetentionOverrides.partitionName })
		.from(partitionRetentionOverrides)
		.where(
			sql`${partitionRetentionOverrides.expiresAt} IS NULL OR ${partitionRetentionOverrides.expiresAt} > ${now}`,
		)

	return new Set(overrides.map((o) => o.partitionName))
}

/**
 * Enforce retention policy by dropping old partitions
 * Called by partition:retention BullMQ job (monthly)
 *
 * Skips partitions with active retention overrides (legal holds, compliance).
 *
 * @param retentionMonths Number of months to retain (default: 24)
 * @returns Array of dropped partition info with row counts for audit
 */
export async function enforceRetentionPolicy(
	retentionMonths: number = 24,
): Promise<DroppedPartitionInfo[]> {
	const droppedPartitions: DroppedPartitionInfo[] = []
	const cutoffDate = new Date(
		Date.UTC(
			new Date().getUTCFullYear(),
			new Date().getUTCMonth() - retentionMonths,
			1,
		),
	)

	const partitions = await listPartitions()
	const activeOverrides = await getActiveOverrides()

	for (const partition of partitions) {
		if (partition.toValue < cutoffDate) {
			if (activeOverrides.has(partition.partitionName)) {
				continue
			}

			await db.execute(
				sql.raw(`DROP TABLE IF EXISTS ${partition.partitionName}`),
			)
			droppedPartitions.push({
				partitionName: partition.partitionName,
				rowCount: partition.rowCount,
				fromValue: partition.fromValue,
				toValue: partition.toValue,
			})
		}
	}

	return droppedPartitions
}

/**
 * Get partition metrics for Prometheus export
 */
export async function getPartitionMetrics() {
	const partitions = await listPartitions()

	return {
		partition_count: partitions.length,
		total_rows: partitions.reduce((sum, p) => sum + p.rowCount, 0),
		total_size_bytes: partitions.reduce((sum, p) => sum + p.sizeBytes, 0),
		partitions: partitions.map((p) => ({
			name: p.partitionName,
			rows: p.rowCount,
			size_bytes: p.sizeBytes,
			from_date: p.fromValue.toISOString(),
			to_date: p.toValue.toISOString(),
		})),
	}
}

/**
 * Check partition health and return warnings
 * Used by monitoring alerts
 */
export async function checkPartitionHealth(): Promise<{
	healthy: boolean
	warnings: string[]
	futurePartitionCount: number
	oldestPartitionDate: Date | null
	defaultPartitionRows: number
}> {
	const warnings: string[] = []
	const now = new Date()
	const partitions = await listPartitions()

	const futurePartitions = partitions.filter((p) => p.fromValue > now)
	const futurePartitionCount = futurePartitions.length

	if (futurePartitionCount < 2) {
		warnings.push(
			`Only ${futurePartitionCount} future partitions (expected ≥2). Run partition:create job.`,
		)
	}

	const sortedPartitions = [...partitions].sort(
		(a, b) => a.fromValue.getTime() - b.fromValue.getTime(),
	)
	const oldestPartitionDate = sortedPartitions[0]?.fromValue || null

	const defaultPartitionResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM sensor_readings_default
  `)
	const defaultPartitionRows = parseInt(
		(defaultPartitionResult.rows[0] as any)?.count || '0',
		10,
	)

	if (defaultPartitionRows > 0) {
		warnings.push(
			`Default partition contains ${defaultPartitionRows} rows (expected 0). Check for NULL or out-of-range dates.`,
		)
	}

	return {
		healthy: warnings.length === 0,
		warnings,
		futurePartitionCount,
		oldestPartitionDate,
		defaultPartitionRows,
	}
}
