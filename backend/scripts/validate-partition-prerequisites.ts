#!/usr/bin/env tsx
/**
 * Task T1: Validate Environment Prerequisites for PostgreSQL Partitioning
 * Feature: REC-002 - PostgreSQL Time-Based Partitioning for Sensor Readings
 *
 * This script validates:
 * 1. PostgreSQL version ≥10 (required for declarative partitioning)
 * 2. Current sensor_readings table statistics (row count, date range)
 * 3. pg_partman extension availability
 * 4. Drizzle ORM compatibility with partitioned tables
 *
 * Usage: tsx scripts/validate-partition-prerequisites.ts
 */

import 'dotenv/config'
import { db } from '../src/db/client.js'
import { sql } from 'drizzle-orm'
import { sensorReadings } from '../src/db/schema/telemetry.js'
import { units } from '../src/db/schema/hierarchy.js'

interface ValidationResult {
	check: string
	status: 'PASS' | 'FAIL' | 'WARN' | 'INFO'
	message: string
	details?: any
}

const results: ValidationResult[] = []

function log(result: ValidationResult) {
	results.push(result)
	const emoji = {
		PASS: '✅',
		FAIL: '❌',
		WARN: '⚠️',
		INFO: 'ℹ️',
	}[result.status]
	console.log(`${emoji} ${result.check}: ${result.message}`)
	if (result.details) {
		console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`)
	}
}

async function checkPostgreSQLVersion() {
	try {
		const result = await db.execute(sql`SELECT version()`)
		const versionString = (result.rows[0] as any).version as string

		// Extract version number (e.g., "PostgreSQL 15.3" → 15)
		const match = versionString.match(/PostgreSQL (\d+)\./)
		const majorVersion = match ? parseInt(match[1]) : 0

		if (majorVersion >= 10) {
			log({
				check: 'PostgreSQL Version',
				status: 'PASS',
				message: `PostgreSQL ${majorVersion}.x detected (≥10 required for declarative partitioning)`,
				details: { versionString, majorVersion },
			})
		} else {
			log({
				check: 'PostgreSQL Version',
				status: 'FAIL',
				message: `PostgreSQL ${majorVersion}.x is too old. Version ≥10 required for declarative partitioning.`,
				details: { versionString, majorVersion },
			})
		}
	} catch (error) {
		log({
			check: 'PostgreSQL Version',
			status: 'FAIL',
			message: `Failed to query PostgreSQL version: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

async function analyzeSensorReadingsTable() {
	try {
		// Get row count, min/max recorded_at
		const stats = await db.execute(sql`
      SELECT
        COUNT(*) as row_count,
        MIN(recorded_at) as min_recorded_at,
        MAX(recorded_at) as max_recorded_at,
        pg_size_pretty(pg_total_relation_size('sensor_readings')) as table_size
      FROM sensor_readings
    `)

		const statsRow = stats.rows[0] as any
		const rowCount = parseInt(statsRow.row_count)
		const minDate = statsRow.min_recorded_at
		const maxDate = statsRow.max_recorded_at
		const tableSize = statsRow.table_size

		// Calculate months covered
		let monthsSpan = 0
		if (minDate && maxDate) {
			const minTime = new Date(minDate).getTime()
			const maxTime = new Date(maxDate).getTime()
			monthsSpan = Math.ceil((maxTime - minTime) / (1000 * 60 * 60 * 24 * 30))
		}

		log({
			check: 'sensor_readings Table Statistics',
			status: 'INFO',
			message: `Table has ${rowCount.toLocaleString()} rows spanning ${monthsSpan} months`,
			details: {
				rowCount,
				minRecordedAt: minDate,
				maxRecordedAt: maxDate,
				tableSize,
				monthsSpan,
			},
		})

		// Estimate partition count for migration
		if (minDate && maxDate) {
			const minMonth = new Date(minDate)
			minMonth.setDate(1)
			minMonth.setHours(0, 0, 0, 0)

			const maxMonth = new Date(maxDate)
			maxMonth.setMonth(maxMonth.getMonth() + 1) // Include max month
			maxMonth.setDate(1)
			maxMonth.setHours(0, 0, 0, 0)

			const partitionCount =
				(maxMonth.getFullYear() - minMonth.getFullYear()) * 12 +
				(maxMonth.getMonth() - minMonth.getMonth())

			log({
				check: 'Estimated Partition Count',
				status: 'INFO',
				message: `Migration will require ${partitionCount} monthly partitions for existing data`,
				details: {
					firstPartitionMonth: minMonth.toISOString().substring(0, 7),
					lastPartitionMonth: new Date(
						maxMonth.getTime() - 24 * 60 * 60 * 1000,
					)
						.toISOString()
						.substring(0, 7),
					partitionCount,
				},
			})
		}

		// Check for NULL recorded_at (should not exist, but validate)
		const nullCheck = await db.execute(sql`
      SELECT COUNT(*) as null_count
      FROM sensor_readings
      WHERE recorded_at IS NULL
    `)
		const nullCount = parseInt((nullCheck.rows[0] as any).null_count)

		if (nullCount > 0) {
			log({
				check: 'Data Validation: NULL recorded_at',
				status: 'FAIL',
				message: `Found ${nullCount} rows with NULL recorded_at. These will fail partition routing.`,
				details: { nullCount },
			})
		} else {
			log({
				check: 'Data Validation: NULL recorded_at',
				status: 'PASS',
				message: 'No NULL recorded_at values found (partition routing will work)',
			})
		}
	} catch (error) {
		log({
			check: 'sensor_readings Table Statistics',
			status: 'FAIL',
			message: `Failed to analyze table: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

async function checkPgPartmanExtension() {
	try {
		// Check if pg_partman extension is available
		const availableResult = await db.execute(sql`
      SELECT name, default_version, installed_version
      FROM pg_available_extensions
      WHERE name = 'pg_partman'
    `)

		if (availableResult.rows.length > 0) {
			const ext = availableResult.rows[0] as any
			const isInstalled = ext.installed_version !== null

			if (isInstalled) {
				log({
					check: 'pg_partman Extension',
					status: 'PASS',
					message: `pg_partman extension is installed (version ${ext.installed_version})`,
					details: {
						defaultVersion: ext.default_version,
						installedVersion: ext.installed_version,
					},
				})
			} else {
				log({
					check: 'pg_partman Extension',
					status: 'WARN',
					message:
						'pg_partman extension is available but not installed. Install with: CREATE EXTENSION pg_partman;',
					details: { defaultVersion: ext.default_version },
				})
			}
		} else {
			log({
				check: 'pg_partman Extension',
				status: 'INFO',
				message:
					'pg_partman extension not available. Will use BullMQ custom automation (Option B).',
			})
		}
	} catch (error) {
		log({
			check: 'pg_partman Extension',
			status: 'WARN',
			message: `Could not check pg_partman availability: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

async function testDrizzleORMWithPartitions() {
	try {
		// Create a test partitioned table to verify Drizzle ORM compatibility
		const testTableName = 'test_partitioned_readings'

		// Drop test table if exists (from previous runs)
		await db.execute(
			sql.raw(`DROP TABLE IF EXISTS ${testTableName} CASCADE`),
		)

		// Create partitioned table
		// Note: PRIMARY KEY must include partition key for partitioned tables
		await db.execute(sql.raw(`
      CREATE TABLE ${testTableName} (
        id UUID DEFAULT gen_random_uuid(),
        temperature NUMERIC(7, 2) NOT NULL,
        recorded_at TIMESTAMPTZ(3) NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, recorded_at)
      ) PARTITION BY RANGE (recorded_at)
    `))

		// Create two partitions for testing
		await db.execute(sql.raw(`
      CREATE TABLE ${testTableName}_y2026m01 PARTITION OF ${testTableName}
      FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00')
    `))

		await db.execute(sql.raw(`
      CREATE TABLE ${testTableName}_y2026m02 PARTITION OF ${testTableName}
      FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00')
    `))

		// Test INSERT via raw SQL
		const insertResult = await db.execute(sql.raw(`
      INSERT INTO ${testTableName} (temperature, recorded_at)
      VALUES (25.5, '2026-02-15 12:00:00+00')
      RETURNING id
    `))

		const insertedId = (insertResult.rows[0] as any).id

		// Test SELECT with partition pruning
		const selectResult = await db.execute(sql.raw(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT * FROM ${testTableName}
      WHERE recorded_at >= '2026-02-01' AND recorded_at < '2026-03-01'
    `))

		// Check if partition pruning is working (should scan only y2026m02)
		const explainOutput = selectResult.rows
			.map((row: any) => (row as any)['QUERY PLAN'])
			.join('\n')
		const partitionPruningWorks =
			explainOutput.includes('y2026m02') && !explainOutput.includes('y2026m01')

		if (partitionPruningWorks) {
			log({
				check: 'Drizzle ORM Partition Compatibility',
				status: 'PASS',
				message:
					'Partition routing and pruning work correctly with Drizzle ORM raw SQL',
				details: {
					testTable: testTableName,
					insertedId,
					partitionPruning: 'working',
				},
			})
		} else {
			log({
				check: 'Drizzle ORM Partition Compatibility',
				status: 'WARN',
				message:
					'Partition pruning may not be optimal. Review EXPLAIN ANALYZE output.',
				details: { explainOutput },
			})
		}

		// Clean up test table
		await db.execute(
			sql.raw(`DROP TABLE IF EXISTS ${testTableName} CASCADE`),
		)

		// Note about schema-based approach
		log({
			check: 'Drizzle Schema Support for Partitions',
			status: 'INFO',
			message:
				'Drizzle ORM does not support PARTITION BY in schema definitions. Will use custom migration DDL.',
			details: {
				approach:
					'Migration script will contain hand-written CREATE TABLE ... PARTITION BY DDL',
				schemaUpdate: 'Only documentation comments will be added to telemetry.ts',
			},
		})
	} catch (error) {
		log({
			check: 'Drizzle ORM Partition Compatibility',
			status: 'FAIL',
			message: `Failed to test partitioned table: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

async function analyzeTrafficPatterns() {
	try {
		// Analyze hourly distribution of sensor readings (last 7 days)
		const trafficResult = await db.execute(sql`
      SELECT
        EXTRACT(hour FROM received_at) as hour,
        COUNT(*) as reading_count
      FROM sensor_readings
      WHERE received_at >= NOW() - INTERVAL '7 days'
      GROUP BY hour
      ORDER BY hour
    `)

		if (trafficResult.rows.length === 0) {
			log({
				check: 'Traffic Pattern Analysis',
				status: 'INFO',
				message:
					'No sensor readings in last 7 days. Cannot analyze traffic patterns.',
			})
			return
		}

		const hourlyStats = trafficResult.rows.map((row: any) => ({
			hour: parseInt(row.hour),
			count: parseInt(row.reading_count),
		}))

		// Find lowest traffic hour (good for migration window)
		const minTrafficHour = hourlyStats.reduce((min, curr) =>
			curr.count < min.count ? curr : min,
		)
		const maxTrafficHour = hourlyStats.reduce((max, curr) =>
			curr.count > max.count ? curr : max,
		)

		const avgCount =
			hourlyStats.reduce((sum, stat) => sum + stat.count, 0) /
			hourlyStats.length

		log({
			check: 'Traffic Pattern Analysis',
			status: 'INFO',
			message: `Recommended migration window: ${minTrafficHour.hour}:00-${minTrafficHour.hour + 4}:00 UTC (lowest traffic)`,
			details: {
				lowestTrafficHour: `${minTrafficHour.hour}:00 UTC`,
				lowestTrafficCount: minTrafficHour.count,
				highestTrafficHour: `${maxTrafficHour.hour}:00 UTC`,
				highestTrafficCount: maxTrafficHour.count,
				averageHourlyCount: Math.round(avgCount),
			},
		})

		// Check if there's a significant low-traffic window (>50% below average)
		if (minTrafficHour.count < avgCount * 0.5) {
			log({
				check: 'Low-Traffic Migration Window',
				status: 'PASS',
				message:
					'Identified low-traffic window suitable for migration (low-traffic window strategy recommended)',
			})
		} else {
			log({
				check: 'Low-Traffic Migration Window',
				status: 'WARN',
				message:
					'No significant low-traffic window found. Consider online migration strategy or scheduled downtime.',
			})
		}
	} catch (error) {
		log({
			check: 'Traffic Pattern Analysis',
			status: 'WARN',
			message: `Could not analyze traffic patterns: ${error instanceof Error ? error.message : String(error)}`,
		})
	}
}

async function generateValidationReport() {
	console.log('\n' + '='.repeat(80))
	console.log('VALIDATION SUMMARY')
	console.log('='.repeat(80))

	const statusCounts = {
		PASS: results.filter(r => r.status === 'PASS').length,
		FAIL: results.filter(r => r.status === 'FAIL').length,
		WARN: results.filter(r => r.status === 'WARN').length,
		INFO: results.filter(r => r.status === 'INFO').length,
	}

	console.log(`✅ PASS: ${statusCounts.PASS}`)
	console.log(`❌ FAIL: ${statusCounts.FAIL}`)
	console.log(`⚠️  WARN: ${statusCounts.WARN}`)
	console.log(`ℹ️  INFO: ${statusCounts.INFO}`)

	console.log('\n' + '='.repeat(80))
	console.log('RECOMMENDATIONS')
	console.log('='.repeat(80))

	if (statusCounts.FAIL > 0) {
		console.log('❌ BLOCKERS DETECTED:')
		results
			.filter(r => r.status === 'FAIL')
			.forEach(r => {
				console.log(`   - ${r.check}: ${r.message}`)
			})
		console.log('\n⚠️  Migration CANNOT proceed until blockers resolved.\n')
	} else {
		console.log(
			'✅ All critical checks passed. Migration prerequisites validated.\n',
		)
	}

	if (statusCounts.WARN > 0) {
		console.log('⚠️  WARNINGS:')
		results
			.filter(r => r.status === 'WARN')
			.forEach(r => {
				console.log(`   - ${r.check}: ${r.message}`)
			})
		console.log()
	}

	// Save results to file
	const reportPath =
		'/home/swoop/swoop-claude-projects/projects/fresh-staged/.rp1/work/features/REC-002/validation-report.json'
	const fs = await import('fs')
	fs.writeFileSync(reportPath, JSON.stringify(results, null, 2))
	console.log(`📄 Full validation report saved to: ${reportPath}\n`)

	process.exit(statusCounts.FAIL > 0 ? 1 : 0)
}

async function main() {
	console.log('='.repeat(80))
	console.log('PostgreSQL Partitioning Prerequisites Validation (Task T1)')
	console.log('Feature: REC-002 - PostgreSQL Time-Based Partitioning')
	console.log('='.repeat(80))
	console.log()

	await checkPostgreSQLVersion()
	await analyzeSensorReadingsTable()
	await checkPgPartmanExtension()
	await testDrizzleORMWithPartitions()
	await analyzeTrafficPatterns()

	await generateValidationReport()
}

main().catch(error => {
	console.error('❌ Fatal error during validation:', error)
	process.exit(1)
})
