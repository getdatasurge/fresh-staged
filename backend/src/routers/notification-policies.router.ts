/**
 * Notification Policies tRPC Router
 *
 * Provides type-safe procedures for notification policy management:
 * - listByOrg: List org-level notification policies
 * - listBySite: List site-level notification policies
 * - listByUnit: List unit-level notification policies
 * - getEffective: Get effective policy for unit+alert type
 * - upsert: Create or update a notification policy (admin/owner only)
 * - delete: Delete a notification policy (admin/owner only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { notificationSettings } from '../db/schema/tenancy.js'
import * as notificationPolicyService from '../services/notification-policy.service.js'
import { getTelnyxService } from '../services/telnyx.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure, protectedProcedure } from '../trpc/procedures.js'

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Notification channel types
 */
const NotificationChannelSchema = z.enum([
	'WEB_TOAST',
	'IN_APP_CENTER',
	'EMAIL',
	'SMS',
])

/**
 * Severity threshold levels
 */
const SeverityThresholdSchema = z.enum(['INFO', 'WARNING', 'CRITICAL'])

/**
 * App role types
 */
const AppRoleSchema = z.enum(['owner', 'admin', 'manager', 'staff', 'viewer'])

/**
 * Escalation step definition
 */
const EscalationStepSchema = z.object({
	delay_minutes: z.number().int().min(0),
	channels: z.array(z.enum(['EMAIL', 'SMS'])),
	contact_priority: z.number().int().min(0).optional(),
	repeat: z.boolean(),
})

/**
 * Full notification policy schema
 */
const NotificationPolicySchema = z.object({
	id: z.string().uuid(),
	organization_id: z.string().uuid().nullable(),
	site_id: z.string().uuid().nullable(),
	unit_id: z.string().uuid().nullable(),
	alert_type: z.string(),
	initial_channels: z.array(NotificationChannelSchema),
	requires_ack: z.boolean(),
	ack_deadline_minutes: z.number().int().min(0).nullable(),
	escalation_steps: z.array(EscalationStepSchema),
	send_resolved_notifications: z.boolean(),
	reminders_enabled: z.boolean(),
	reminder_interval_minutes: z.number().int().min(0).nullable(),
	quiet_hours_enabled: z.boolean(),
	quiet_hours_start_local: z.string().nullable(),
	quiet_hours_end_local: z.string().nullable(),
	severity_threshold: SeverityThresholdSchema,
	allow_warning_notifications: z.boolean(),
	notify_roles: z.array(AppRoleSchema),
	notify_site_managers: z.boolean(),
	notify_assigned_users: z.boolean(),
	created_at: z.date(),
	updated_at: z.date(),
})

/**
 * Effective notification policy with source flags
 */
const EffectiveNotificationPolicySchema = z.object({
	alert_type: z.string(),
	initial_channels: z.array(NotificationChannelSchema),
	requires_ack: z.boolean(),
	ack_deadline_minutes: z.number().int().min(0).nullable(),
	escalation_steps: z.array(EscalationStepSchema),
	send_resolved_notifications: z.boolean(),
	reminders_enabled: z.boolean(),
	reminder_interval_minutes: z.number().int().min(0).nullable(),
	quiet_hours_enabled: z.boolean(),
	quiet_hours_start_local: z.string().nullable(),
	quiet_hours_end_local: z.string().nullable(),
	severity_threshold: SeverityThresholdSchema,
	allow_warning_notifications: z.boolean(),
	notify_roles: z.array(AppRoleSchema),
	notify_site_managers: z.boolean(),
	notify_assigned_users: z.boolean(),
	source_unit: z.boolean(),
	source_site: z.boolean(),
	source_org: z.boolean(),
})

/**
 * Policy input for upsert operations
 */
const PolicyInputSchema = z.object({
	initial_channels: z.array(NotificationChannelSchema).optional(),
	requires_ack: z.boolean().optional(),
	ack_deadline_minutes: z.number().int().min(0).nullable().optional(),
	escalation_steps: z.array(EscalationStepSchema).optional(),
	send_resolved_notifications: z.boolean().optional(),
	reminders_enabled: z.boolean().optional(),
	reminder_interval_minutes: z.number().int().min(0).nullable().optional(),
	quiet_hours_enabled: z.boolean().optional(),
	quiet_hours_start_local: z.string().nullable().optional(),
	quiet_hours_end_local: z.string().nullable().optional(),
	severity_threshold: SeverityThresholdSchema.optional(),
	allow_warning_notifications: z.boolean().optional(),
	notify_roles: z.array(AppRoleSchema).optional(),
	notify_site_managers: z.boolean().optional(),
	notify_assigned_users: z.boolean().optional(),
})

/**
 * Policy scope schema for upsert and delete operations
 */
const PolicyScopeSchema = z
	.object({
		organization_id: z.string().uuid().optional(),
		site_id: z.string().uuid().optional(),
		unit_id: z.string().uuid().optional(),
	})
	.refine(data => data.organization_id || data.site_id || data.unit_id, {
		message: 'Must provide organization_id, site_id, or unit_id',
	})

// ============================================================================
// Input Schemas
// ============================================================================

const OrgInput = z.object({
	organizationId: z.string().uuid(),
})

const SiteInput = z.object({
	organizationId: z.string().uuid(),
	siteId: z.string().uuid(),
})

const UnitInput = z.object({
	organizationId: z.string().uuid(),
	unitId: z.string().uuid(),
})

const EffectiveInput = z.object({
	organizationId: z.string().uuid(),
	unitId: z.string().uuid(),
	alertType: z.string().min(1),
})

const UpsertInput = z.object({
	organizationId: z.string().uuid(),
	scope: PolicyScopeSchema,
	alertType: z.string().min(1),
	policy: PolicyInputSchema,
})

const DeleteInput = z.object({
	organizationId: z.string().uuid(),
	scope: PolicyScopeSchema,
	alertType: z.string().min(1),
})

// ============================================================================
// Router Definition
// ============================================================================

export const notificationPoliciesRouter = router({
	/**
	 * Send test SMS notification
	 * Equivalent to: POST /api/alerts/sms/test
	 *
	 * Requires authenticated user. Sends a test SMS to the user's phone number.
	 */
	sendTestSms: protectedProcedure
		.input(
			z.object({
				to: z
					.string()
					.regex(/^\+[1-9]\d{1,14}$/, 'Must be valid E.164 phone number'),
				message: z.string().min(1).max(1600),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
				messageId: z.string().optional(),
				status: z.string().optional(),
				error: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const telnyxService = getTelnyxService()

			if (!telnyxService?.isEnabled()) {
				return {
					success: false,
					error: 'SMS service not configured',
				}
			}

			try {
				const result = await telnyxService.sendSms({
					to: input.to,
					message: input.message,
				})

				return {
					success: true,
					messageId: result.messageId,
					status: result.status,
				}
			} catch (error) {
				console.error('[NotificationPolicies] Failed to send test SMS:', error)
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Failed to send SMS',
				}
			}
		}),
	/**
	 * List org-level notification policies
	 * Equivalent to: GET /api/orgs/:organizationId/notification-policies?scope=org
	 */
	listByOrg: orgProcedure
		.input(OrgInput)
		.output(z.array(NotificationPolicySchema))
		.query(async ({ ctx }) => {
			const policies = await notificationPolicyService.listNotificationPolicies(
				{
					organizationId: ctx.user.organizationId,
				},
			)
			return policies
		}),

	/**
	 * List site-level notification policies
	 * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId/notification-policies
	 */
	listBySite: orgProcedure
		.input(SiteInput)
		.output(z.array(NotificationPolicySchema))
		.query(async ({ input }) => {
			const policies = await notificationPolicyService.listNotificationPolicies(
				{
					siteId: input.siteId,
				},
			)
			return policies
		}),

	/**
	 * List unit-level notification policies
	 * Equivalent to: GET /api/orgs/:organizationId/units/:unitId/notification-policies
	 */
	listByUnit: orgProcedure
		.input(UnitInput)
		.output(z.array(NotificationPolicySchema))
		.query(async ({ input }) => {
			const policies = await notificationPolicyService.listNotificationPolicies(
				{
					unitId: input.unitId,
				},
			)
			return policies
		}),

	/**
	 * Get effective notification policy for a unit and alert type
	 * Equivalent to: GET /api/orgs/:orgId/units/:unitId/notification-policies/effective?alertType=xxx
	 *
	 * Implements inheritance chain: unit -> site -> org
	 * Returns null if no policy at any level.
	 */
	getEffective: orgProcedure
		.input(EffectiveInput)
		.output(EffectiveNotificationPolicySchema.nullable())
		.query(async ({ input }) => {
			const effectivePolicy =
				await notificationPolicyService.getEffectiveNotificationPolicy(
					input.unitId,
					input.alertType,
				)
			return effectivePolicy
		}),

	/**
	 * Upsert a notification policy
	 * Equivalent to: PUT /api/orgs/:organizationId/notification-policies
	 *
	 * Requires admin or owner role.
	 * Creates new policy or updates existing based on scope+alertType unique constraint.
	 */
	upsert: orgProcedure
		.input(UpsertInput)
		.output(NotificationPolicySchema)
		.mutation(async ({ ctx, input }) => {
			// Role check - admin and owner can manage policies
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can manage notification policies',
				})
			}

			const policy = await notificationPolicyService.upsertNotificationPolicy(
				input.scope,
				input.alertType,
				input.policy,
			)

			return policy
		}),

	/**
	 * Delete a notification policy
	 * Equivalent to: DELETE /api/orgs/:organizationId/notification-policies
	 *
	 * Requires admin or owner role.
	 * Deletes policy matching scope+alertType.
	 */
	delete: orgProcedure
		.input(DeleteInput)
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			// Role check - admin and owner can delete policies
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only admins and owners can delete notification policies',
				})
			}

			const deleted = await notificationPolicyService.deleteNotificationPolicy(
				input.scope,
				input.alertType,
			)

			return { success: deleted }
		}),

	/**
	 * Get organization notification settings
	 * Used by NotificationSettingsCard component
	 */
	getNotificationSettings: orgProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.output(
			z
				.object({
					id: z.string().uuid(),
					emailEnabled: z.boolean(),
					recipients: z.array(z.string()),
					notifyTempExcursion: z.boolean(),
					notifyAlarmActive: z.boolean(),
					notifyManualRequired: z.boolean(),
					notifyOffline: z.boolean(),
					notifyLowBattery: z.boolean(),
					notifyWarnings: z.boolean(),
				})
				.nullable(),
		)
		.query(async ({ ctx }) => {
			const settings = await db.query.notificationSettings.findFirst({
				where: eq(notificationSettings.organizationId, ctx.user.organizationId),
			})

			if (!settings) return null

			// Parse recipients from JSON string
			let recipients: string[] = []
			if (settings.recipients) {
				try {
					recipients = JSON.parse(settings.recipients)
				} catch {
					recipients = []
				}
			}

			return {
				id: settings.id,
				emailEnabled: settings.emailEnabled,
				recipients,
				notifyTempExcursion: settings.notifyTempExcursion,
				notifyAlarmActive: settings.notifyAlarmActive,
				notifyManualRequired: settings.notifyManualRequired,
				notifyOffline: settings.notifyOffline,
				notifyLowBattery: settings.notifyLowBattery,
				notifyWarnings: settings.notifyWarnings,
			}
		}),

	/**
	 * Upsert organization notification settings
	 * Used by NotificationSettingsCard component
	 *
	 * Requires admin or owner role.
	 */
	upsertNotificationSettings: orgProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				data: z.object({
					emailEnabled: z.boolean(),
					recipients: z.array(z.string()),
					notifyTempExcursion: z.boolean(),
					notifyAlarmActive: z.boolean(),
					notifyManualRequired: z.boolean(),
					notifyOffline: z.boolean(),
					notifyLowBattery: z.boolean(),
					notifyWarnings: z.boolean(),
				}),
			}),
		)
		.output(
			z.object({
				id: z.string().uuid(),
				emailEnabled: z.boolean(),
				recipients: z.array(z.string()),
				notifyTempExcursion: z.boolean(),
				notifyAlarmActive: z.boolean(),
				notifyManualRequired: z.boolean(),
				notifyOffline: z.boolean(),
				notifyLowBattery: z.boolean(),
				notifyWarnings: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Role check - admin and owner can update settings
			if (!['admin', 'owner'].includes(ctx.user.role)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only administrators can update notification settings',
				})
			}

			const existing = await db.query.notificationSettings.findFirst({
				where: eq(notificationSettings.organizationId, ctx.user.organizationId),
			})

			const settingsData = {
				emailEnabled: input.data.emailEnabled,
				recipients: JSON.stringify(input.data.recipients),
				notifyTempExcursion: input.data.notifyTempExcursion,
				notifyAlarmActive: input.data.notifyAlarmActive,
				notifyManualRequired: input.data.notifyManualRequired,
				notifyOffline: input.data.notifyOffline,
				notifyLowBattery: input.data.notifyLowBattery,
				notifyWarnings: input.data.notifyWarnings,
			}

			if (existing) {
				// Update
				const [updated] = await db
					.update(notificationSettings)
					.set(settingsData)
					.where(eq(notificationSettings.id, existing.id))
					.returning()
				return { ...input.data, id: updated.id }
			} else {
				// Insert
				const [created] = await db
					.insert(notificationSettings)
					.values({
						...settingsData,
						organizationId: ctx.user.organizationId,
					})
					.returning()
				return { ...input.data, id: created.id }
			}
		}),
})

// Export the type for use in frontend type inference
export type NotificationPoliciesRouter = typeof notificationPoliciesRouter
