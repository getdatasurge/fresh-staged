/**
 * Reports tRPC Router
 *
 * Provides export functionality for temperature logs.
 * Replaces export-temperature-logs edge function.
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { TRPCError } from '@trpc/server'
import { and, eq, gte, inArray, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
	manualTemperatureLogs,
	sensorReadings,
} from '../db/schema/telemetry.js'
import { areas, sites, units } from '../db/schema/hierarchy.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

/**
 * Input schema for export procedure
 */
const ExportInputSchema = z.object({
	organizationId: z.string().uuid(),
	startDate: z.string(), // ISO date string
	endDate: z.string(), // ISO date string
	reportType: z.enum(['daily', 'exceptions', 'manual', 'compliance']),
	format: z.enum(['csv', 'html']).default('csv'),
	siteId: z.string().uuid().optional(),
	unitId: z.string().uuid().optional(),
})

/**
 * Output schema for export procedure
 */
const ExportOutputSchema = z.object({
	content: z.string(),
	contentType: z.string(),
	filename: z.string(),
})

/**
 * Get unit IDs to query based on filters
 */
async function getUnitIdsForQuery(
	organizationId: string,
	siteId?: string,
	unitId?: string,
): Promise<string[]> {
	// If specific unitId provided, just use that
	if (unitId) {
		return [unitId]
	}

	// If siteId provided, get all units in that site
	if (siteId) {
		const result = await db
			.select({ id: units.id })
			.from(units)
			.innerJoin(areas, eq(units.areaId, areas.id))
			.where(and(eq(areas.siteId, siteId), eq(units.isActive, true)))

		return result.map(r => r.id)
	}

	// Otherwise, get all units in the organization
	const result = await db
		.select({ id: units.id })
		.from(units)
		.innerJoin(areas, eq(units.areaId, areas.id))
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(
			and(eq(sites.organizationId, organizationId), eq(units.isActive, true)),
		)

	return result.map(r => r.id)
}

/**
 * Format readings as CSV
 */
function formatCsv(
	readings: Array<{
		timestamp: Date
		unitName: string
		temperature: string
		humidity: string | null
	}>,
): string {
	const csvHeader = 'timestamp,unit,temperature,humidity'
	const csvRows = readings.map(
		r =>
			`${r.timestamp.toISOString()},${r.unitName},${r.temperature},${r.humidity ?? ''}`,
	)
	return [csvHeader, ...csvRows].join('\n')
}

/**
 * Format readings as HTML
 */
function formatHtml(
	reportType: string,
	startDate: string,
	endDate: string,
	readings: Array<{
		timestamp: Date
		unitName: string
		temperature: string
		humidity: string | null
	}>,
): string {
	const title = reportType.charAt(0).toUpperCase() + reportType.slice(1)
	const rows = readings
		.map(
			r =>
				`<tr><td>${r.timestamp.toISOString()}</td><td>${r.unitName}</td><td>${r.temperature}</td><td>${r.humidity ?? '-'}</td></tr>`,
		)
		.join('')

	return `<!DOCTYPE html>
<html>
<head><title>${title} Report</title>
<style>
  body { font-family: sans-serif; margin: 20px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; }
</style>
</head>
<body>
<h1>${title} Report</h1>
<p>${startDate} to ${endDate}</p>
<table>
<tr><th>Timestamp</th><th>Unit</th><th>Temperature</th><th>Humidity</th></tr>
${rows}
</table>
</body>
</html>`
}

export const reportsRouter = router({
	/**
	 * Export temperature logs
	 * Equivalent to: export-temperature-logs edge function
	 *
	 * Returns CSV or HTML content for download.
	 */
	export: orgProcedure
		.input(ExportInputSchema)
		.output(ExportOutputSchema)
		.mutation(async ({ ctx, input }) => {
			const { organizationId, startDate, endDate, reportType, format, siteId, unitId } =
				input

			// Generate filename based on report type and date range
			const filename = `${reportType}-report-${startDate}-to-${endDate}.${format === 'html' ? 'html' : 'csv'}`
			const contentType = format === 'html' ? 'text/html' : 'text/csv'

			try {
				// Get unit IDs to query
				const unitIds = await getUnitIdsForQuery(
					organizationId,
					siteId,
					unitId,
				)

				// If no units found, return empty report
				if (unitIds.length === 0) {
					const content =
						format === 'csv'
							? formatCsv([])
							: formatHtml(reportType, startDate, endDate, [])
					return { content, contentType, filename }
				}

				// Parse date range
				const startDateTime = new Date(startDate)
				const endDateTime = new Date(endDate)
				// Set end date to end of day
				endDateTime.setHours(23, 59, 59, 999)

				let readings: Array<{
					timestamp: Date
					unitName: string
					temperature: string
					humidity: string | null
				}>

				if (reportType === 'manual') {
					// Query manual temperature logs
					const result = await db
						.select({
							timestamp: manualTemperatureLogs.recordedAt,
							unitName: units.name,
							temperature: manualTemperatureLogs.temperature,
							humidity: manualTemperatureLogs.humidity,
						})
						.from(manualTemperatureLogs)
						.innerJoin(units, eq(manualTemperatureLogs.unitId, units.id))
						.where(
							and(
								inArray(manualTemperatureLogs.unitId, unitIds),
								gte(manualTemperatureLogs.recordedAt, startDateTime),
								lte(manualTemperatureLogs.recordedAt, endDateTime),
							),
						)
						.orderBy(manualTemperatureLogs.recordedAt)

					readings = result.map(r => ({
						timestamp: r.timestamp,
						unitName: r.unitName,
						temperature: r.temperature,
						humidity: r.humidity,
					}))
				} else if (reportType === 'exceptions') {
					// Query sensor readings that are out of range
					const result = await db
						.select({
							timestamp: sensorReadings.recordedAt,
							unitName: units.name,
							temperature: sensorReadings.temperature,
							humidity: sensorReadings.humidity,
							tempMin: units.tempMin,
							tempMax: units.tempMax,
						})
						.from(sensorReadings)
						.innerJoin(units, eq(sensorReadings.unitId, units.id))
						.where(
							and(
								inArray(sensorReadings.unitId, unitIds),
								gte(sensorReadings.recordedAt, startDateTime),
								lte(sensorReadings.recordedAt, endDateTime),
							),
						)
						.orderBy(sensorReadings.recordedAt)

					// Filter to only out-of-range readings
					// Note: temperature is stored as numeric string, tempMin/Max as integers
					readings = result
						.filter(r => {
							const temp = parseFloat(r.temperature)
							return temp < r.tempMin || temp > r.tempMax
						})
						.map(r => ({
							timestamp: r.timestamp,
							unitName: r.unitName,
							temperature: r.temperature,
							humidity: r.humidity,
						}))
				} else {
					// 'daily' or 'compliance' - query all sensor readings in range
					const result = await db
						.select({
							timestamp: sensorReadings.recordedAt,
							unitName: units.name,
							temperature: sensorReadings.temperature,
							humidity: sensorReadings.humidity,
						})
						.from(sensorReadings)
						.innerJoin(units, eq(sensorReadings.unitId, units.id))
						.where(
							and(
								inArray(sensorReadings.unitId, unitIds),
								gte(sensorReadings.recordedAt, startDateTime),
								lte(sensorReadings.recordedAt, endDateTime),
							),
						)
						.orderBy(sensorReadings.recordedAt)

					readings = result.map(r => ({
						timestamp: r.timestamp,
						unitName: r.unitName,
						temperature: r.temperature,
						humidity: r.humidity,
					}))
				}

				// Format output
				const content =
					format === 'csv'
						? formatCsv(readings)
						: formatHtml(reportType, startDate, endDate, readings)

				return { content, contentType, filename }
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message:
						error instanceof Error
							? error.message
							: 'Failed to generate report',
					cause: error,
				})
			}
		}),
})
