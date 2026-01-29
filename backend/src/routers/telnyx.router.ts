/**
 * Telnyx tRPC Router
 *
 * Provides procedures for Telnyx SMS configuration:
 * - verificationStatus: Get toll-free verification status
 * - configureWebhook: Configure Telnyx webhook endpoint
 * - verifyPublicAsset: Verify a public URL is accessible (for opt-in images)
 */

import { z } from 'zod'
import { router, publicProcedure } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

export const telnyxRouter = router({
	/**
	 * Get toll-free verification status
	 * Equivalent to: telnyx-verification-status edge function
	 *
	 * Returns current toll-free number verification status from Telnyx API.
	 */
	verificationStatus: publicProcedure
		.output(
			z.object({
				status: z.enum(['approved', 'pending', 'rejected', 'unknown']),
				verificationId: z.string().nullable(),
				phoneNumber: z.string().nullable(),
				details: z.string().nullable(),
				lastChecked: z.string().nullable(),
			}),
		)
		.query(async () => {
			// Port logic from telnyx-verification-status edge function
			// Query Telnyx API for verification status

			// Placeholder - implement based on edge function source
			return {
				status: 'pending' as const,
				verificationId: null,
				phoneNumber: '+18889890560',
				details: null,
				lastChecked: new Date().toISOString(),
			}
		}),

	/**
	 * Configure Telnyx webhook endpoint
	 * Equivalent to: telnyx-configure-webhook edge function
	 *
	 * Sets up or updates the webhook URL in Telnyx for SMS delivery notifications.
	 */
	configureWebhook: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
				webhookUrl: z.string().optional(),
				error: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx }) => {
			// Admin/owner check
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				return {
					success: false,
					error: 'Only administrators can configure webhooks',
				}
			}

			// Port logic from telnyx-configure-webhook edge function
			// Configure webhook in Telnyx API

			// Placeholder - implement based on edge function source
			return {
				success: true,
				webhookUrl: `${process.env.API_URL || 'http://localhost:3000'}/webhooks/telnyx`,
			}
		}),

	/**
	 * Verify a public URL is accessible
	 * Equivalent to: verify-public-asset edge function
	 *
	 * Checks if a URL is publicly accessible (for opt-in images).
	 * Used to verify Telnyx toll-free verification images are reachable.
	 */
	verifyPublicAsset: publicProcedure
		.input(
			z.object({
				url: z.string().url(),
			}),
		)
		.output(
			z.object({
				accessible: z.boolean(),
				status: z.number().nullable(),
				statusText: z.string().nullable(),
				contentType: z.string().nullable(),
				contentLength: z.number().nullable(),
				isImage: z.boolean(),
				checkedAt: z.string(),
				error: z.string().nullable(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const response = await fetch(input.url, { method: 'HEAD' })
				const contentType = response.headers.get('content-type') || ''
				const contentLength = parseInt(
					response.headers.get('content-length') || '0',
					10,
				)

				return {
					accessible: response.ok,
					status: response.status,
					statusText: response.statusText,
					contentType,
					contentLength,
					isImage: contentType.startsWith('image/'),
					checkedAt: new Date().toISOString(),
					error: null,
				}
			} catch (err) {
				return {
					accessible: false,
					status: null,
					statusText: null,
					contentType: null,
					contentLength: null,
					isImage: false,
					checkedAt: new Date().toISOString(),
					error: err instanceof Error ? err.message : 'Failed to verify URL',
				}
			}
		}),
})
