import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { publicProcedure, router } from '../trpc/index.js'

export const healthRouter = router({
	quick: publicProcedure
		.input(z.object({ organizationId: z.string().uuid().optional() }))
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
							category: 'database',
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
							category: 'database',
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
		.query(async () => {
			let dbStatus = 'healthy'

			try {
				await db.execute(sql`SELECT 1`)
			} catch (error) {
				dbStatus = 'unhealthy'
			}

			const checks = [
				{
					id: 'db_connectivity',
					name: 'Database Connectivity',
					category: 'database',
					status: dbStatus,
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
					category: 'cache',
					status: 'unknown',
					checkedAt: new Date().toISOString(),
					skipped: true,
					skipReason: 'Redis health check implementation pending',
				},
				{
					id: 'edge_functions',
					name: 'Edge Functions',
					category: 'edge_function',
					status: 'unknown',
					checkedAt: new Date().toISOString(),
					skipped: true,
					skipReason: 'Edge functions health check pending implementation',
				},
			]

			return {
				overall: dbStatus,
				lastCheckedAt: new Date().toISOString(),
				checks,
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
