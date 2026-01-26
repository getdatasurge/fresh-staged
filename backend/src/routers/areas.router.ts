/**
 * Areas tRPC Router
 *
 * Provides type-safe procedures for area management within sites:
 * - list: List all areas in a site
 * - get: Retrieve area details
 * - create: Create a new area (admin/owner only)
 * - update: Modify area settings (admin/owner only)
 * - delete: Soft delete an area (admin/owner only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 * Areas are scoped to sites, which are scoped to organizations.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
	AreaSchema,
	AreasListSchema,
	CreateAreaSchema,
	UpdateAreaSchema,
} from '../schemas/areas.js'
import * as areaService from '../services/area.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

/**
 * Input schema for site-scoped operations
 * Areas always belong to a site
 */
const SiteInput = z.object({
	organizationId: z.string().uuid(),
	siteId: z.string().uuid(),
})

/**
 * Input schema for area-specific operations
 */
const AreaInput = z.object({
	organizationId: z.string().uuid(),
	siteId: z.string().uuid(),
	areaId: z.string().uuid(),
})

/**
 * Input schema for create with data payload
 */
const CreateAreaInput = z.object({
	organizationId: z.string().uuid(),
	siteId: z.string().uuid(),
	data: CreateAreaSchema,
})

/**
 * Input schema for update with data payload
 */
const UpdateAreaInput = z.object({
	organizationId: z.string().uuid(),
	siteId: z.string().uuid(),
	areaId: z.string().uuid(),
	data: UpdateAreaSchema,
})

export const areasRouter = router({
	/**
	 * List all areas in a site
	 * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId/areas
	 *
	 * Returns all active areas for the site.
	 */
	list: orgProcedure
		.input(SiteInput)
		.output(AreasListSchema)
		.query(async ({ ctx, input }) => {
			const areas = await areaService.listAreas(
				input.siteId,
				ctx.user.organizationId,
			)
			return areas
		}),

	/**
	 * List all active areas in a site with unit counts
	 */
	listWithUnitCount: orgProcedure
		.input(SiteInput)
		.query(async ({ ctx, input }) => {
			return areaService.listAreasWithUnitCount(
				input.siteId,
				ctx.user.organizationId,
			)
		}),

	/**
	 * Get area by ID
	 * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId
	 *
	 * Returns full area record for authenticated members.
	 */
	get: orgProcedure
		.input(AreaInput)
		.output(AreaSchema)
		.query(async ({ ctx, input }) => {
			const area = await areaService.getArea(
				input.areaId,
				input.siteId,
				ctx.user.organizationId,
			)

			if (!area) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Area not found',
				})
			}

			return area
		}),

	/**
	 * Create a new area in a site
	 * Equivalent to: POST /api/orgs/:organizationId/sites/:siteId/areas
	 *
	 * Requires admin or owner role.
	 */
	create: orgProcedure
		.input(CreateAreaInput)
		.output(AreaSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only admins and owners can create areas
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can create areas',
				})
			}

			const area = await areaService.createArea(
				input.siteId,
				ctx.user.organizationId,
				input.data,
			)

			// createArea returns null if site not found
			if (!area) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Site not found',
				})
			}

			return area
		}),

	/**
	 * Update an existing area
	 * Equivalent to: PUT /api/orgs/:organizationId/sites/:siteId/areas/:areaId
	 *
	 * Requires admin or owner role.
	 */
	update: orgProcedure
		.input(UpdateAreaInput)
		.output(AreaSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only admins and owners can update areas
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can update areas',
				})
			}

			const area = await areaService.updateArea(
				input.areaId,
				input.siteId,
				ctx.user.organizationId,
				input.data,
			)

			if (!area) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Area not found',
				})
			}

			return area
		}),

	/**
	 * Delete an area (soft delete)
	 * Equivalent to: DELETE /api/orgs/:organizationId/sites/:siteId/areas/:areaId
	 *
	 * Requires admin or owner role. Sets isActive = false.
	 */
	delete: orgProcedure
		.input(AreaInput)
		.output(z.void())
		.mutation(async ({ ctx, input }) => {
			// Role check - only admins and owners can delete areas
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can delete areas',
				})
			}

			const area = await areaService.deleteArea(
				input.areaId,
				input.siteId,
				ctx.user.organizationId,
			)

			if (!area) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Area not found',
				})
			}
		}),

	/**
	 * Restore a soft-deleted area
	 * Equivalent to: POST /api/orgs/:organizationId/sites/:siteId/areas/:areaId/restore
	 *
	 * Requires admin or owner role. Sets isActive = true.
	 */
	restore: orgProcedure
		.input(AreaInput)
		.output(AreaSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only admins and owners can restore areas
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can restore areas',
				})
			}

			const area = await areaService.restoreArea(
				input.areaId,
				input.siteId,
				ctx.user.organizationId,
			)

			if (!area) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Area not found',
				})
			}

			return area
		}),

	/**
	 * Permanently delete an area
	 * Equivalent to: DELETE /api/orgs/:organizationId/sites/:siteId/areas/:areaId/permanent
	 *
	 * Requires admin or owner role. Permanently removes from database.
	 */
	permanentlyDelete: orgProcedure
		.input(AreaInput)
		.output(z.void())
		.mutation(async ({ ctx, input }) => {
			// Role check - only admins and owners can permanently delete areas
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can permanently delete areas',
				})
			}

			const area = await areaService.permanentlyDeleteArea(
				input.areaId,
				input.siteId,
				ctx.user.organizationId,
			)

			if (!area) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Area not found',
				})
			}
		}),
})
