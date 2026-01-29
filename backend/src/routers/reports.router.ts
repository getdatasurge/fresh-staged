/**
 * Reports tRPC Router
 *
 * Provides export functionality for temperature logs.
 * Replaces export-temperature-logs edge function.
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { z } from 'zod'
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
		.mutation(async ({ input }) => {
			const {
				startDate,
				endDate,
				reportType,
				format,
			} = input

			// Generate filename based on report type and date range
			const filename = `${reportType}-report-${startDate}-to-${endDate}.${format === 'html' ? 'html' : 'csv'}`
			const contentType = format === 'html' ? 'text/html' : 'text/csv'

			// TODO: Implement actual report generation
			// This should query temperature_readings, format as CSV/HTML
			// For MVP: Return placeholder that matches edge function response shape
			const content =
				format === 'csv'
					? 'timestamp,unit,temperature,humidity\n'
					: '<html><body><h1>Report</h1></body></html>'

			return { content, contentType, filename }
		}),
})
