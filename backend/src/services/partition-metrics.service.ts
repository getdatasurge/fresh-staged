import {
	checkPartitionHealth,
	getPartitionMetrics,
} from './partition.service.js'

/**
 * Partition metrics service for Prometheus export
 *
 * Exposes partition health metrics for monitoring and alerting:
 * - partition_count: Total number of monthly partitions
 * - total_rows: Sum of rows across all partitions
 * - total_size_bytes: Sum of partition sizes
 * - future_partition_count: Number of partitions ahead of current date
 * - default_partition_rows: Rows in catchall partition (should be 0)
 *
 * Used by Grafana dashboards for partition health visualization
 *
 * See also:
 * - Base service: backend/src/services/partition.service.ts
 * - Dashboard: backend/docs/grafana/partition-health-dashboard.json
 * - Alerts: backend/docs/prometheus/partition-alerts.yml
 */

export interface PartitionMetricsSnapshot {
	timestamp: Date
	partition_count: number
	total_rows: number
	total_size_bytes: number
	future_partition_count: number
	default_partition_rows: number
	healthy: boolean
	warnings: string[]
	partitions: Array<{
		name: string
		rows: number
		size_bytes: number
		from_date: string
		to_date: string
	}>
}

/**
 * Get current partition metrics snapshot for Prometheus
 */
export async function getPartitionMetricsSnapshot(): Promise<PartitionMetricsSnapshot> {
	const [metrics, health] = await Promise.all([
		getPartitionMetrics(),
		checkPartitionHealth(),
	])

	return {
		timestamp: new Date(),
		partition_count: metrics.partition_count,
		total_rows: metrics.total_rows,
		total_size_bytes: metrics.total_size_bytes,
		future_partition_count: health.futurePartitionCount,
		default_partition_rows: health.defaultPartitionRows,
		healthy: health.healthy,
		warnings: health.warnings,
		partitions: metrics.partitions,
	}
}

/**
 * Format metrics for Prometheus text exposition format
 */
export function formatPrometheusMetrics(
	snapshot: PartitionMetricsSnapshot,
): string {
	const lines: string[] = []

	lines.push('# HELP sensor_readings_partition_count Total number of partitions')
	lines.push('# TYPE sensor_readings_partition_count gauge')
	lines.push(`sensor_readings_partition_count ${snapshot.partition_count}`)
	lines.push('')

	lines.push(
		'# HELP sensor_readings_total_rows Total rows across all partitions',
	)
	lines.push('# TYPE sensor_readings_total_rows gauge')
	lines.push(`sensor_readings_total_rows ${snapshot.total_rows}`)
	lines.push('')

	lines.push(
		'# HELP sensor_readings_total_size_bytes Total size in bytes across all partitions',
	)
	lines.push('# TYPE sensor_readings_total_size_bytes gauge')
	lines.push(`sensor_readings_total_size_bytes ${snapshot.total_size_bytes}`)
	lines.push('')

	lines.push(
		'# HELP sensor_readings_future_partition_count Number of future partitions',
	)
	lines.push('# TYPE sensor_readings_future_partition_count gauge')
	lines.push(
		`sensor_readings_future_partition_count ${snapshot.future_partition_count}`,
	)
	lines.push('')

	lines.push(
		'# HELP sensor_readings_default_partition_rows Rows in default catchall partition (should be 0)',
	)
	lines.push('# TYPE sensor_readings_default_partition_rows gauge')
	lines.push(
		`sensor_readings_default_partition_rows ${snapshot.default_partition_rows}`,
	)
	lines.push('')

	lines.push(
		'# HELP sensor_readings_partition_healthy Overall partition health status',
	)
	lines.push('# TYPE sensor_readings_partition_healthy gauge')
	lines.push(`sensor_readings_partition_healthy ${snapshot.healthy ? 1 : 0}`)
	lines.push('')

	for (const partition of snapshot.partitions) {
		lines.push(
			`sensor_readings_partition_rows{partition="${partition.name}"} ${partition.rows}`,
		)
		lines.push(
			`sensor_readings_partition_size_bytes{partition="${partition.name}"} ${partition.size_bytes}`,
		)
	}

	return lines.join('\n')
}
