/**
 * TTN Settings Zod Schemas
 *
 * Validation schemas for TTN settings management:
 * - TTNSettingsSchema: Database row shape for ttn_settings table
 * - UpdateTTNSettingsSchema: Update operation payload
 * - TestConnectionInputSchema: Connection test input
 * - TestConnectionResultSchema: Connection test result
 *
 * Used by ttnSettingsRouter for type-safe validation.
 */

import { z } from 'zod'

/**
 * Provisioning status enum
 * Maps legacy values: not_started -> idle, completed -> ready
 */
export const ProvisioningStatusSchema = z.enum([
	'idle',
	'provisioning',
	'ready',
	'failed',
])

/**
 * TTN Settings schema matching the ttn_settings database table
 */
export const TTNSettingsSchema = z.object({
	organization_id: z.string().uuid(),
	ttn_region: z.string().nullable(),
	ttn_application_id: z.string().nullable(),
	is_enabled: z.boolean(),
	provisioning_status: ProvisioningStatusSchema,
	provisioning_step: z.string().nullable(),
	provisioning_started_at: z.string().nullable(),
	provisioning_last_heartbeat_at: z.string().nullable(),
	provisioning_attempt_count: z.number(),
	provisioning_error: z.string().nullable(),
	last_http_status: z.number().nullable(),
	last_http_body: z.string().nullable(),
	provisioning_last_step: z.string().nullable(),
	provisioning_can_retry: z.boolean(),
	provisioned_at: z.string().nullable(),
	has_api_key: z.boolean(),
	api_key_last4: z.string().nullable(),
	api_key_updated_at: z.string().nullable(),
	has_webhook_secret: z.boolean(),
	webhook_secret_last4: z.string().nullable(),
	webhook_url: z.string().nullable(),
	webhook_id: z.string().nullable(),
	webhook_events: z.array(z.string()).nullable(),
	last_connection_test_at: z.string().nullable(),
	last_connection_test_result: z.any().nullable(),
	last_updated_source: z.string().nullable(),
	last_test_source: z.string().nullable(),
})

/**
 * Schema for updating TTN settings
 * All fields optional - only provided fields are updated
 */
export const UpdateTTNSettingsSchema = z.object({
	is_enabled: z.boolean().optional(),
	ttn_region: z.string().optional(),
	webhook_url: z.string().url().optional(),
	webhook_events: z.array(z.string()).optional(),
})

/**
 * Input schema for connection test procedure
 */
export const TestConnectionInputSchema = z.object({
	organizationId: z.string().uuid(),
	deviceId: z.string().optional(),
})

/**
 * Result schema for TTN connection test
 * Matches the TTNTestResult interface from frontend hooks
 */
export const TestConnectionResultSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
	hint: z.string().optional(),
	applicationName: z.string().optional(),
	statusCode: z.number().optional(),
	testedAt: z.string().optional(),
	clusterTested: z.string().optional(),
	effectiveApplicationId: z.string().optional(),
	apiKeyLast4: z.string().optional(),
	request_id: z.string().optional(),
	message: z.string().optional(),
})

// Type exports for use in router and services
export type TTNSettings = z.infer<typeof TTNSettingsSchema>
export type UpdateTTNSettings = z.infer<typeof UpdateTTNSettingsSchema>
export type TestConnectionInput = z.infer<typeof TestConnectionInputSchema>
export type TestConnectionResult = z.infer<typeof TestConnectionResultSchema>
export type ProvisioningStatus = z.infer<typeof ProvisioningStatusSchema>
// New Schemas for Phase 27 Integration
export const ValidateApiKeySchema = z.object({
	organizationId: z.string().uuid(),
	apiKey: z.string(),
	applicationId: z.string(),
	cluster: z.string(),
})

export const BootstrapTtnSchema = ValidateApiKeySchema

export const UpdateWebhookSchema = z.object({
	organizationId: z.string().uuid(),
	url: z.string().url(),
	events: z.array(z.string()),
})

/**
 * Secret decryption status for tracking decryption outcomes
 */
export const SecretStatusSchema = z.enum(['empty', 'decrypted', 'failed'])
export type SecretStatus = z.infer<typeof SecretStatusSchema>

/**
 * TTN Credentials response schema - full credentials for developer panel
 * Ported from manage-ttn-settings get_credentials action
 */
export const TTNCredentialsResponseSchema = z.object({
	organization_name: z.string(),
	organization_id: z.string().uuid(),
	ttn_application_id: z.string().nullable(),
	ttn_region: z.string().nullable(),
	// Org API secret
	org_api_secret: z.string().nullable(),
	org_api_secret_last4: z.string().nullable(),
	org_api_secret_status: SecretStatusSchema,
	// App API secret
	app_api_secret: z.string().nullable(),
	app_api_secret_last4: z.string().nullable(),
	app_api_secret_status: SecretStatusSchema,
	// Webhook secret
	webhook_secret: z.string().nullable(),
	webhook_secret_last4: z.string().nullable(),
	webhook_secret_status: SecretStatusSchema,
	webhook_url: z.string().nullable(),
	// Provisioning state
	provisioning_status: z.string(),
	provisioning_step: z.string().nullable(),
	provisioning_step_details: z.record(z.string(), z.unknown()).nullable(),
	provisioning_error: z.string().nullable(),
	provisioning_attempt_count: z.number(),
	// Diagnostics
	last_http_status: z.number().nullable(),
	last_http_body: z.string().nullable(),
	app_rights_check_status: z.string().nullable(),
	last_ttn_correlation_id: z.string().nullable(),
	last_ttn_error_name: z.string().nullable(),
	credentials_last_rotated_at: z.string().nullable(),
})
export type TTNCredentialsResponse = z.infer<typeof TTNCredentialsResponseSchema>

/**
 * TTN provisioning status response schema
 * Ported from ttn-provision-org status action
 */
export const TTNStatusResponseSchema = z.object({
	provisioning_status: z.string(),
	provisioning_step: z.string().nullable(),
	provisioning_step_details: z.record(z.string(), z.unknown()).nullable(),
	provisioning_error: z.string().nullable(),
	provisioning_attempt_count: z.number(),
})
export type TTNStatusResponse = z.infer<typeof TTNStatusResponseSchema>

/**
 * Provision action response schema
 */
export const ProvisionResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	use_start_fresh: z.boolean().optional(),
	error: z.string().optional(),
})
export type ProvisionResponse = z.infer<typeof ProvisionResponseSchema>

/**
 * Start fresh response schema
 */
export const StartFreshResponseSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	error: z.string().optional(),
})
export type StartFreshResponse = z.infer<typeof StartFreshResponseSchema>

/**
 * Deep clean response schema
 */
export const DeepCleanResponseSchema = z.object({
	success: z.boolean(),
	deleted_devices: z.number().optional(),
	deleted_app: z.boolean().optional(),
	deleted_org: z.boolean().optional(),
	message: z.string().optional(),
	error: z.string().optional(),
})
export type DeepCleanResponse = z.infer<typeof DeepCleanResponseSchema>
