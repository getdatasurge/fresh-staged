/**
 * Protected tRPC procedures with authentication middleware
 *
 * These procedures enforce authentication and authorization:
 * - protectedProcedure: Requires valid JWT token
 * - orgProcedure: Requires JWT + organization membership
 */

import { TRPCError } from '@trpc/server'
import { userService } from '../services/index.js'
import type { AuthUser } from '../types/auth.js'
import { middleware, publicProcedure } from './index.js'

/**
 * Performance monitoring middleware
 * Measures request/response times and adds response header with duration
 */
const performanceMonitor = middleware(async ({ ctx, next }) => {
	const startTime = Date.now()

	// Continue to next middleware or procedure
	const result = await next()

	const duration = Date.now() - startTime

	// Log performance metrics (only in dev or when debug mode is enabled)
	if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
		const color =
			duration > 500
				? '\x1b[31m' // Red
				: duration > 200
					? '\x1b[33m' // Orange
					: duration > 100
						? '\x1b[33m' // Yellow
						: '\x1b[32m' // Green

		console.log(`${color}[PERF] Request: ${duration}ms\x1b[0m`)
	}

	// Add response header with duration - we need to access the res object directly from context
	ctx.res.headers['x-response-time'] = String(duration)

	return result
})

/**
 * Authentication middleware
 * Checks that user exists in context (JWT was valid)
 */
const isAuthed = middleware(async ({ ctx, next }) => {
	if (!ctx.user) {
		throw new TRPCError({
			code: 'UNAUTHORIZED',
			message: 'Authentication required',
		})
	}

	// Narrow user type to non-null
	return next({
		ctx: {
			...ctx,
			user: ctx.user as AuthUser,
		},
	})
})

/**
 * Protected procedure - requires authentication
 *
 * Use for endpoints that need a logged-in user but don't need
 * organization context (e.g., user preferences, profile)
 */
export const protectedProcedure = publicProcedure
	.use(performanceMonitor)
	.use(isAuthed)

/**
 * Organization membership middleware
 * Checks that user has access to the organization in input.organizationId
 *
 * IMPORTANT: Procedures using this MUST include organizationId in their input schema
 * This middleware assumes user is authenticated (used after protectedProcedure)
 */
const hasOrgAccess = middleware(async ({ ctx, getRawInput, next }) => {
	// User is guaranteed to be non-null when used with protectedProcedure
	const user = ctx.user as AuthUser

	// Get raw input (before validation) - procedures must have organizationId
	const rawInput = (await getRawInput()) as { organizationId?: string }
	const organizationId = rawInput?.organizationId

	if (!organizationId) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: 'organizationId is required',
		})
	}

	// Check user has role in this organization
	const role = await userService.getUserRoleInOrg(user.id, organizationId)

	if (!role) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'Not a member of this organization',
		})
	}

	// Get or create profile
	const { id: profileId } = await userService.getOrCreateProfile(
		user.id,
		organizationId,
		user.email,
		user.name,
	)

	// Attach organization context to ctx.user
	return next({
		ctx: {
			...ctx,
			user: {
				...user,
				organizationId,
				role,
				profileId,
			},
		},
	})
})

/**
 * Organization-scoped procedure - requires authentication + org membership
 *
 * Use for all organization-scoped endpoints. Automatically verifies membership
 * and attaches organizationId, role, and profileId to context.
 *
 * Your input schema MUST include organizationId field.
 */
export const orgProcedure = protectedProcedure.use(hasOrgAccess)

/**
 * Check if organization has sensor capacity available
 * Replicates logic from requireSensorCapacity REST middleware
 */
async function checkSensorCapacity(organizationId: string): Promise<boolean> {
	// Import dynamically to avoid circular dependencies
	const { getActiveSensorCount } = await import('../middleware/subscription.js')
	const { organizations } = await import('../db/schema/tenancy.js')
	const { db } = await import('../db/client.js')
	const { eq } = await import('drizzle-orm')

	// Get organization's sensor limit
	const [org] = await db
		.select({ sensorLimit: organizations.sensorLimit })
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1)

	if (!org) {
		return false
	}

	const currentCount = await getActiveSensorCount(organizationId)
	return currentCount < org.sensorLimit
}

/**
 * Sensor capacity middleware
 * Checks subscription sensor capacity before device provisioning operations
 */
const hasSensorCapacity = middleware(async ({ ctx, next }) => {
	// User is guaranteed to have organizationId when used with orgProcedure
	const user = ctx.user as AuthUser & { organizationId: string }

	const hasCapacity = await checkSensorCapacity(user.organizationId)
	if (!hasCapacity) {
		throw new TRPCError({
			code: 'FORBIDDEN',
			message:
				'Sensor capacity exceeded. Upgrade your plan to add more sensors.',
		})
	}

	return next()
})

/**
 * Sensor capacity procedure - requires auth + org membership + sensor capacity
 *
 * Use for device provisioning operations that add new sensors.
 * Extends orgProcedure to check subscription sensor limits.
 *
 * Your input schema MUST include organizationId field.
 */
export const sensorCapacityProcedure = orgProcedure.use(hasSensorCapacity)
