/**
 * Organizations tRPC Router
 *
 * Provides type-safe procedures for organization management:
 * - get: Retrieve organization details
 * - update: Modify organization settings (owner only)
 * - listMembers: Get organization member list
 * - stats: Get dashboard statistics
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { userRoles } from '../db/schema/users.js'
import {
	MembersListSchema,
	OrganizationSchema,
	OrganizationStatsSchema,
	UpdateOrganizationSchema,
} from '../schemas/organizations.js'
import { getOrganizationStatsService } from '../services/organization-stats.service.js'
import * as orgService from '../services/organization.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

/**
 * Input schema for org-scoped procedures
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
	organizationId: z.string().uuid(),
})

/**
 * Input schema for update with data payload
 */
const UpdateOrgInput = z.object({
	organizationId: z.string().uuid(),
	data: UpdateOrganizationSchema,
})

export const organizationsRouter = router({
	/**
	 * Get organization details
	 * Equivalent to: GET /api/orgs/:organizationId
	 *
	 * Returns full organization record for authenticated members.
	 */
	get: orgProcedure
		.input(OrgInput)
		.output(OrganizationSchema)
		.query(async ({ ctx }) => {
			// ctx.user.organizationId is set by orgProcedure middleware
			const org = await orgService.getOrganization(ctx.user.organizationId)

			if (!org) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Organization not found',
				})
			}

			return org
		}),

	/**
	 * Update organization settings
	 * Equivalent to: PUT /api/orgs/:organizationId
	 *
	 * Requires owner role. Updates name, timezone, complianceMode, or logoUrl.
	 */
	update: orgProcedure
		.input(UpdateOrgInput)
		.output(OrganizationSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only owners can update organization settings
			if (ctx.user.role !== 'owner') {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only organization owners can update settings',
				})
			}

			const org = await orgService.updateOrganization(
				ctx.user.organizationId,
				input.data,
			)

			if (!org) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Organization not found',
				})
			}

			return org
		}),

	/**
	 * List organization members
	 * Equivalent to: GET /api/orgs/:organizationId/members
	 *
	 * Returns list of users with their roles and join dates.
	 */
	listMembers: orgProcedure
		.input(OrgInput)
		.output(MembersListSchema)
		.query(async ({ ctx }) => {
			const members = await orgService.listMembers(ctx.user.organizationId)
			return members
		}),

	/**
	 * Update user role
	 * Equivalent to: UPDATE user_roles table
	 *
	 * Requires admin or owner role. Updates a user's role in the organization.
	 */
	updateMemberRole: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string(),
				role: z.enum(['owner', 'admin', 'manager', 'staff', 'viewer']),
			}),
		)
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			// Role check - only admin or owner can update roles
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can update user roles',
				})
			}

			await db
				.update(userRoles)
				.set({ role: input.role } as any)
				.where(
					and(
						eq(userRoles.userId, input.userId),
						eq(userRoles.organizationId, input.organizationId),
					),
				)

			return { success: true }
		}),

	/**
	 * Remove user from organization
	 * Equivalent to: DELETE from user_roles table
	 *
	 * Requires admin or owner role. Removes a user from the organization.
	 */
	removeMember: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				userId: z.string(),
			}),
		)
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			// Role check - only admin or owner can remove users
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can remove users',
				})
			}

			await db
				.delete(userRoles)
				.where(
					and(
						eq(userRoles.userId, input.userId),
						eq(userRoles.organizationId, input.organizationId),
					),
				)

			return { success: true }
		}),

	/**
	 * Get organization stats for dashboard
	 * Equivalent to: GET /api/orgs/:organizationId/stats
	 *
	 * Returns aggregated stats including:
	 * - Unit counts by state (normal, warning, critical, offline)
	 * - Alert counts by status (pending, acknowledged, resolved)
	 * - Compliance percentage
	 * - Worst overall state
	 */
	stats: orgProcedure
		.input(OrgInput)
		.output(OrganizationStatsSchema)
		.query(async ({ ctx }) => {
			const statsService = getOrganizationStatsService()

			if (!statsService) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Organization stats service not initialized',
				})
			}

			const stats = await statsService.getOrganizationStats(
				ctx.user.organizationId,
			)
			return stats
		}),
})
