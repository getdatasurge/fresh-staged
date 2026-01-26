/**
 * TTN Devices tRPC Router
 *
 * Provides type-safe procedures for TTN device management:
 * - list: List all devices for organization
 * - get: Retrieve device details
 * - provision: Provision a new device (manager/admin/owner only, requires sensor capacity)
 * - bootstrap: Bootstrap device with auto-generated credentials (manager/admin/owner only, requires sensor capacity)
 * - update: Modify device settings (manager/admin/owner only)
 * - deprovision: Remove a device (manager/admin/owner only)
 *
 * Device provisioning operations use sensorCapacityProcedure which enforces
 * subscription sensor limits in addition to authentication and org membership.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
	BootstrapTTNDeviceResponseSchema,
	BootstrapTTNDeviceSchema,
	ProvisionTTNDeviceSchema,
	TTNDeviceResponseSchema,
	TTNDevicesListSchema,
	UpdateTTNDeviceSchema,
} from '../schemas/ttn-devices.js'
import * as ttnDeviceService from '../services/ttn-device.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure, sensorCapacityProcedure } from '../trpc/procedures.js'

/**
 * Base input schema for organization-scoped device operations
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
	organizationId: z.string().uuid(),
})

/**
 * Input schema for device-specific operations
 */
const DeviceInput = z.object({
	organizationId: z.string().uuid(),
	deviceId: z.string().min(1),
})

/**
 * Input schema for provision with data payload
 */
const ProvisionDeviceInput = z.object({
	organizationId: z.string().uuid(),
	data: ProvisionTTNDeviceSchema,
})

/**
 * Input schema for bootstrap with data payload
 */
const BootstrapDeviceInput = z.object({
	organizationId: z.string().uuid(),
	data: BootstrapTTNDeviceSchema,
})

/**
 * Input schema for update with data payload
 */
const UpdateDeviceInput = z.object({
	organizationId: z.string().uuid(),
	deviceId: z.string().min(1),
	data: UpdateTTNDeviceSchema,
})

export const ttnDevicesRouter = router({
	/**
	 * List all TTN devices for organization
	 * Equivalent to: GET /api/orgs/:organizationId/ttn/devices
	 *
	 * Returns all active devices for the organization's TTN connection.
	 */
	list: orgProcedure
		.input(OrgInput)
		.output(TTNDevicesListSchema)
		.query(async ({ ctx }) => {
			const devices = await ttnDeviceService.listTTNDevices(
				ctx.user.organizationId,
			)
			return devices
		}),

	/**
	 * Get device by ID
	 * Equivalent to: GET /api/orgs/:organizationId/ttn/devices/:deviceId
	 *
	 * Returns full device record for authenticated members.
	 */
	get: orgProcedure
		.input(DeviceInput)
		.output(TTNDeviceResponseSchema)
		.query(async ({ ctx, input }) => {
			const device = await ttnDeviceService.getTTNDevice(
				input.deviceId,
				ctx.user.organizationId,
			)

			if (!device) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Device not found',
				})
			}

			return device
		}),

	/**
	 * Get device by Unit ID
	 */
	getByUnit: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				unitId: z.string().uuid(),
			}),
		)
		.output(TTNDeviceResponseSchema.nullable())
		.query(async ({ ctx, input }) => {
			const device = await ttnDeviceService.getByUnit(
				input.unitId,
				ctx.user.organizationId,
			)

			return device || null
		}),

	/**
	 * Provision a new TTN device
	 * Equivalent to: POST /api/orgs/:organizationId/ttn/devices
	 *
	 * Requires manager, admin, or owner role.
	 * Requires available sensor capacity in subscription.
	 * Provisions device in TTN and creates local database record.
	 */
	provision: sensorCapacityProcedure
		.input(ProvisionDeviceInput)
		.output(TTNDeviceResponseSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only managers, admins, and owners can provision devices
			if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only managers, admins, and owners can provision devices',
				})
			}

			try {
				const device = await ttnDeviceService.provisionTTNDevice(
					ctx.user.organizationId,
					input.data,
				)
				return device
			} catch (error) {
				// Handle TTN-specific errors as BAD_REQUEST
				if (
					error instanceof Error &&
					(error.name === 'TTNConfigError' ||
						error.name === 'TTNProvisioningError')
				) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: error.message,
					})
				}
				throw error
			}
		}),

	/**
	 * Bootstrap a new TTN device with auto-generated credentials
	 * Equivalent to: POST /api/orgs/:organizationId/ttn/devices/bootstrap
	 *
	 * Requires manager, admin, or owner role.
	 * Requires available sensor capacity in subscription.
	 * Generates DevEUI, JoinEUI, and AppKey automatically.
	 */
	bootstrap: sensorCapacityProcedure
		.input(BootstrapDeviceInput)
		.output(BootstrapTTNDeviceResponseSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only managers, admins, and owners can bootstrap devices
			if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only managers, admins, and owners can bootstrap devices',
				})
			}

			try {
				const device = await ttnDeviceService.bootstrapTTNDevice(
					ctx.user.organizationId,
					input.data,
				)
				return device
			} catch (error) {
				// Handle TTN-specific errors as BAD_REQUEST
				if (
					error instanceof Error &&
					(error.name === 'TTNConfigError' ||
						error.name === 'TTNProvisioningError')
				) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: error.message,
					})
				}
				throw error
			}
		}),

	/**
	 * Update an existing device
	 * Equivalent to: PUT /api/orgs/:organizationId/ttn/devices/:deviceId
	 *
	 * Requires manager, admin, or owner role.
	 */
	update: orgProcedure
		.input(UpdateDeviceInput)
		.output(TTNDeviceResponseSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only managers, admins, and owners can update devices
			if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only managers, admins, and owners can update devices',
				})
			}

			const device = await ttnDeviceService.updateTTNDevice(
				input.deviceId,
				ctx.user.organizationId,
				input.data,
			)

			if (!device) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Device not found',
				})
			}

			return device
		}),

	/**
	 * Deprovision (delete) a device
	 * Equivalent to: DELETE /api/orgs/:organizationId/ttn/devices/:deviceId
	 *
	 * Requires manager, admin, or owner role.
	 * Removes device from TTN and soft deletes local record.
	 */
	deprovision: orgProcedure
		.input(DeviceInput)
		.output(z.void())
		.mutation(async ({ ctx, input }) => {
			// Role check - only managers, admins, and owners can deprovision devices
			if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only managers, admins, and owners can deprovision devices',
				})
			}

			const deleted = await ttnDeviceService.deprovisionTTNDevice(
				input.deviceId,
				ctx.user.organizationId,
			)

			if (!deleted) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Device not found',
				})
			}
		}),

	/**
	 * Restore a soft-deleted device
	 * Equivalent to: POST /api/orgs/:organizationId/ttn/devices/:deviceId/restore
	 *
	 * Requires manager, admin, or owner role.
	 * Sets isActive = true.
	 */
	restore: orgProcedure
		.input(DeviceInput)
		.output(TTNDeviceResponseSchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - only managers, admins, and owners can restore devices
			if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only managers, admins, and owners can restore devices',
				})
			}

			const device = await ttnDeviceService.restoreTTNDevice(
				input.deviceId,
				ctx.user.organizationId,
			)

			if (!device) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Device not found',
				})
			}

			return device
		}),

	/**
	 * Permanently delete a device
	 * Equivalent to: DELETE /api/orgs/:organizationId/ttn/devices/:deviceId/permanent
	 *
	 * Requires manager, admin, or owner role.
	 * Removes device from TTN and permanently deletes local record.
	 */
	permanentlyDelete: orgProcedure
		.input(DeviceInput)
		.output(z.void())
		.mutation(async ({ ctx, input }) => {
			// Role check - only managers, admins, and owners can permanently delete devices
			if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message:
						'Only managers, admins, and owners can permanently delete devices',
				})
			}

			const deleted = await ttnDeviceService.permanentlyDeleteTTNDevice(
				input.deviceId,
				ctx.user.organizationId,
			)

			if (!deleted) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Device not found',
				})
			}
		}),
})
