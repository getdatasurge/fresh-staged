import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { publicProcedure, router } from '../trpc/index.js'

const HealthStatusSchema = z.enum([
	'healthy',
	'degraded',
	'unhealthy',
	'unknown',
	'checking',
])
const HealthCategorySchema = z.enum([
	'edge_function',
	'database',
	'ttn',
	'external',
	'cache',
])

const HealthCheckResultSchema = z.object({
	id: z.string(),
	name: z.string(),
	category: HealthCategorySchema,
	status: HealthStatusSchema,
	latencyMs: z.number().optional(),
	checkedAt: z.string(),
	error: z.string().optional(),
	details: z.object({}).catchall(z.any()).optional(),
	skipped: z.boolean().optional(),
	skipReason: z.string().optional(),
})

const SystemHealthSchema = z.object({
	overall: HealthStatusSchema,
	lastCheckedAt: z.string(),
	checks: z.array(HealthCheckResultSchema),
	summary: z.object({
		healthy: z.number(),
		degraded: z.number(),
		unhealthy: z.number(),
		unknown: z.number(),
		skipped: z.number(),
	}),
})

export const healthRouter = router({
	quick: publicProcedure
		.input(z.object({ organizationId: z.string().uuid().optional() }))
		.output(SystemHealthSchema)
		.query(async () => {
			try {
				await db.execute(sql`SELECT 1`)
				return {
					overall: 'healthy',
					lastCheckedAt: new Date().toISOString(),
					checks: [
						{
							id: 'db_connectivity',
							name: 'Database Connectivity',
							category: 'database' as const,
							status: 'healthy',
							checkedAt: new Date().toISOString(),
							skipped: false,
							details: { latency_ms: 0 },
						},
					],
					summary: {
						healthy: 1,
						degraded: 0,
						unhealthy: 0,
						unknown: 0,
						skipped: 0,
					},
				}
			} catch (error) {
				return {
					overall: 'unhealthy',
					lastCheckedAt: new Date().toISOString(),
					checks: [
						{
							id: 'db_connectivity',
							name: 'Database Connectivity',
							category: 'database' as const,
							status: 'unhealthy',
							checkedAt: new Date().toISOString(),
							skipped: false,
							details: { message: 'Database unreachable' },
						},
					],
					summary: {
						healthy: 0,
						degraded: 0,
						unhealthy: 1,
						unknown: 0,
						skipped: 0,
					},
				}
			}
		}),

	all: publicProcedure
		.input(z.object({ organizationId: z.string().uuid().optional() }))
		.output(SystemHealthSchema)
		.query(async () => {
			let dbStatus: 'healthy' | 'unhealthy' = 'healthy'

			try {
				await db.execute(sql`SELECT 1`)
			} catch (error) {
				dbStatus = 'unhealthy'
			}

			const checks = [
				{
					id: 'db_connectivity',
					name: 'Database Connectivity',
					category: 'database' as const,
					status: dbStatus as 'healthy' | 'unhealthy',
					checkedAt: new Date().toISOString(),
					skipped: false,
					details:
						dbStatus === 'healthy'
							? { latency_ms: 0 }
							: { message: 'Database unreachable' },
				},
				{
					id: 'redis_connectivity',
					name: 'Redis Connectivity',
					category: 'cache' as const,
					status: 'unknown' as const,
					checkedAt: new Date().toISOString(),
					skipped: true,
					skipReason: 'Redis health check implementation pending',
				},
				{
					id: 'edge_functions',
					name: 'Edge Functions',
					category: 'edge_function' as const,
					status: 'unknown' as const,
					checkedAt: new Date().toISOString(),
					skipped: true,
					skipReason: 'Edge functions health check pending implementation',
				},
			]

			return {
				overall: dbStatus,
				lastCheckedAt: new Date().toISOString(),
				checks: checks as any,
				summary: {
					healthy: dbStatus === 'healthy' ? 1 : 0,
					degraded: 0,
					unhealthy: dbStatus === 'unhealthy' ? 1 : 0,
					unknown: 2,
					skipped: 2,
				},
			}
		}),
})
