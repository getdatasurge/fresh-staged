/**
 * TTN Settings tRPC Router
 *
 * Provides type-safe procedures for TTN settings management:
 * - get: Retrieve TTN settings for organization
 * - update: Modify TTN settings (admin/owner only)
 * - test: Test TTN connection
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 *
 * NOTE: Integrated with backend services (TtnSettingsService, TtnProvisioningService, TtnWebhookService)
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
	TestConnectionInputSchema,
	TestConnectionResultSchema,
	TTNSettingsSchema,
	UpdateTTNSettingsSchema,
} from '../schemas/ttn-settings.js'
import * as ttnSettingsService from '../services/ttn-settings.service.js'
import { TtnProvisioningService } from '../services/ttn/provisioning.js'
import { TtnSettingsService } from '../services/ttn/settings.js'
import { TtnWebhookService } from '../services/ttn/webhook.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

/**
 * Base input schema for organization-scoped operations
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
	organizationId: z.string().uuid(),
})

/**
 * Input schema for update with data payload
 */
const UpdateInput = z.object({
	organizationId: z.string().uuid(),
	data: UpdateTTNSettingsSchema,
})

export const ttnSettingsRouter = router({
	/**
	 * Get TTN settings for organization
	 * Equivalent to: GET action in manage-ttn-settings edge function
	 *
	 * Returns TTN settings or null if not configured.
	 * Maps legacy provisioning status values (not_started -> idle, completed -> ready).
	 */
	get: orgProcedure
		.input(OrgInput)
		.output(TTNSettingsSchema.nullable())
		.query(async ({ input }) => {
			const settings = await ttnSettingsService.getTTNSettings(
				input.organizationId,
			)
			return settings
		}),

	/**
	 * Update TTN settings
	 * Equivalent to: POST action in manage-ttn-settings edge function
	 *
	 * Requires admin or owner role.
	 * Updates provided fields and sets last_updated_source to 'api'.
	 */
	update: orgProcedure
		.input(UpdateInput)
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ input, ctx }) => {
			const { user } = ctx

			// Admin/owner check - only administrators can update TTN settings
			if (!['admin', 'owner'].includes(user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can update TTN settings',
				})
			}

			await ttnSettingsService.updateTTNSettings(
				input.organizationId,
				input.data,
			)

			return { success: true }
		}),

	/**
	 * Validate API Key without saving
	 */
	validateApiKey: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				apiKey: z.string(),
				applicationId: z.string(),
				cluster: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			const result = await TtnProvisioningService.validateConfiguration(
				input.apiKey,
				input.applicationId,
				input.cluster,
			)

			return {
				ok: result.valid,
				valid: result.valid,
				error: result.error
					? { message: result.error, code: 'VALIDATION_FAILED' }
					: undefined,
				permissions: result.permissions,
				// Mock request_id for compatibility with frontend expectations
				request_id: crypto.randomUUID(),
			}
		}),

	/**
	 * Bootstrap configuration (save key & configure webhook)
	 */
	saveAndConfigure: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				apiKey: z.string(),
				applicationId: z.string(),
				cluster: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Admin/owner check
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can configure TTN',
				})
			}

			const result = await TtnProvisioningService.provisionOrganization(
				input.organizationId,
				input.apiKey,
				input.applicationId,
				input.cluster,
			)
			return { ok: result.success, ...result }
		}),

	/**
	 * Update Webhook definition
	 */
	updateWebhook: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				url: z.string().url(),
				events: z.array(z.string()),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can configure webhooks',
				})
			}
			const result = await TtnWebhookService.updateWebhook(
				input.organizationId,
				input.url,
				input.events,
			)
			return { ok: result.ok }
		}),

	/**
	 * Regenerate webhook secret
	 */
	regenerateWebhookSecret: orgProcedure
		.input(OrgInput)
		.output(z.object({ ok: z.boolean(), secretLast4: z.string() }))
		.mutation(async ({ input, ctx }) => {
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can regenerate webhook secrets',
				})
			}
			const result = await TtnWebhookService.regenerateWebhookSecret(
				input.organizationId,
			)
			return result
		}),

	/**
	 * Test TTN connection
	 * Equivalent to: test action in manage-ttn-settings edge function
	 *
	 * Verifies TTN settings are configured and tests connectivity.
	 * Updates last_connection_test_at and last_connection_test_result.
	 *
	 * NOTE: Currently returns a mock success result.
	 * Actual TTN API integration will be implemented in future plans.
	 */
	test: orgProcedure
		.input(TestConnectionInputSchema)
		.output(TestConnectionResultSchema)
		.mutation(async ({ input }) => {
			// Verify TTN is configured
			const isConfigured = await ttnSettingsService.isTTNConfigured(
				input.organizationId,
			)

			if (!isConfigured) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'TTN not configured for this organization',
				})
			}

			// Get settings for test result details
			const settings = await ttnSettingsService.getTTNSettings(
				input.organizationId,
			)

			// Execute real connection test
			const testResult = await TtnSettingsService.testConnection(
				input.organizationId,
				input.deviceId,
			)

			// Update last test result in database
			await ttnSettingsService.updateTestResult(
				input.organizationId,
				testResult,
			)

			return testResult
		}),
})
