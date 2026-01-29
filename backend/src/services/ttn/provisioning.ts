/**
 * TTN Provisioning Service
 * Ports ttn-bootstrap logic and ttn-provision-org actions
 */
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { ttnConnections } from '../../db/schema/tenancy.js'
import { TtnClient, TTN_BASE_URL } from './client.js'
import { TtnCrypto } from './crypto.js'
import { TtnPermissionService } from './permissions.js'
import { PermissionReport } from './types.js'
import { TtnWebhookService } from './webhook.js'

// Request timeout for TTN API calls
const REQUEST_TIMEOUT_MS = 15000

export class TtnProvisioningService {
	/**
	 * Validate API Key configuration without saving
	 */
	static async validateConfiguration(
		apiKey: string,
		applicationId: string,
		region: string,
	): Promise<{
		valid: boolean
		permissions?: PermissionReport
		error?: string
	}> {
		const requestId = crypto.randomUUID()

		// Validate key format locally
		if (!apiKey.startsWith('NNSXS.')) {
			return {
				valid: false,
				error: 'Invalid API key format. Must start with NNSXS.',
			}
		}

		// Call TTN
		const result = await TtnPermissionService.validateAndAnalyzePermissions(
			applicationId,
			apiKey,
			requestId,
		)

		if (!result.success) {
			return {
				valid: false,
				error: result.error || 'Validation failed',
				permissions: result.report,
			}
		}

		if (!result.report?.valid) {
			return {
				valid: false,
				error: 'Missing required permissions',
				permissions: result.report,
			}
		}

		return { valid: true, permissions: result.report }
	}

	/**
	 * Save configuration and set up webhook
	 */
	static async provisionOrganization(
		organizationId: string,
		apiKey: string,
		applicationId: string,
		region: string,
	): Promise<{
		success: boolean
		webhookAction: 'created' | 'updated' | 'unchanged'
		config: any
	}> {
		const requestId = crypto.randomUUID()
		const encryptionSalt = process.env.TTN_ENCRYPTION_SALT || 'default-salt' // Env var

		// 1. Validate first
		const validation = await this.validateConfiguration(
			apiKey,
			applicationId,
			region,
		)
		if (!validation.valid) {
			throw new TRPCError({
				code: 'BAD_REQUEST',
				message: validation.error || 'Configuration invalid',
			})
		}

		// 2. Encrypt Key
		const encryptedKey = TtnCrypto.obfuscateKey(apiKey, encryptionSalt)

		// 3. Upsert Connection
		// Check if exists
		const existing = await db
			.select()
			.from(ttnConnections)
			.where(eq(ttnConnections.organizationId, organizationId))
			.limit(1)

		if (existing.length === 0) {
			// Generate a random webhook secret for new connections
			const webhookSecret = crypto.randomUUID()
			await db.insert(ttnConnections).values({
				organizationId,
				ttnRegion: region,
				applicationId: applicationId,
				ttnApiKeyEncrypted: encryptedKey,
				ttnApiKeyLast4: apiKey.slice(-4),
				isEnabled: true,
				provisioningStatus: 'complete',
				webhookSecret: webhookSecret,
			})
		} else {
			await db
				.update(ttnConnections)
				.set({
					ttnRegion: region,
					applicationId: applicationId,
					ttnApiKeyEncrypted: encryptedKey,
					ttnApiKeyLast4: apiKey.slice(-4),
					isEnabled: true,
					provisioningStatus: 'complete',
				})
				.where(eq(ttnConnections.organizationId, organizationId))
		}

		// 4. Configure Webhook (via WebhookService)
		const webhookResult = await TtnWebhookService.ensureWebhook(
			organizationId,
			apiKey,
			applicationId,
		)

		return {
			success: true,
			webhookAction: webhookResult.action,
			config: {
				application_id: applicationId,
				api_key_last4: apiKey.slice(-4),
				webhook_url: webhookResult.url,
			},
		}
	}

	/**
	 * Retry failed provisioning
	 * Ported from ttn-provision-org retry action
	 *
	 * @returns Result with success status, message, and optional use_start_fresh flag
	 */
	static async retryProvisioning(organizationId: string): Promise<{
		success: boolean
		message?: string
		use_start_fresh?: boolean
		error?: string
	}> {
		const requestId = crypto.randomUUID().slice(0, 8)
		console.log(`[retryProvisioning] [${requestId}] Starting retry for org: ${organizationId}`)

		// Get current provisioning state
		const conn = await db.query.ttnConnections.findFirst({
			where: eq(ttnConnections.organizationId, organizationId),
		})

		if (!conn) {
			return {
				success: false,
				error: 'TTN not configured for this organization',
			}
		}

		// Check if retry is allowed
		if (conn.provisioningStatus !== 'failed') {
			return {
				success: false,
				error: `Retry only available for failed provisioning. Current status: ${conn.provisioningStatus}`,
			}
		}

		// Check if app is unowned (no_application_rights)
		if (conn.appRightsCheckStatus === 'forbidden') {
			return {
				success: false,
				error: 'Application exists but current key has no rights to it',
				message: 'Use Start Fresh to recreate with a new application ID',
				use_start_fresh: true,
			}
		}

		// Reset state to pending
		await db
			.update(ttnConnections)
			.set({
				provisioningStatus: 'pending',
				provisioningError: null,
				provisioningStep: 'retry_requested',
			})
			.where(eq(ttnConnections.organizationId, organizationId))

		// Get decrypted API key for reprovisioning
		const salt = process.env.TTN_ENCRYPTION_SALT || 'default-salt'
		const apiKey = conn.ttnApiKeyEncrypted
			? TtnCrypto.deobfuscateKey(conn.ttnApiKeyEncrypted, salt)
			: null

		if (!apiKey || !conn.applicationId) {
			await db
				.update(ttnConnections)
				.set({
					provisioningStatus: 'failed',
					provisioningError: 'Missing API key or application ID',
				})
				.where(eq(ttnConnections.organizationId, organizationId))

			return {
				success: false,
				error: 'Missing API key or application ID - use Start Fresh',
				use_start_fresh: true,
			}
		}

		// Re-execute provisioning (validate and setup webhook)
		try {
			// Validate configuration
			const validation = await this.validateConfiguration(
				apiKey,
				conn.applicationId,
				conn.ttnRegion || 'nam1',
			)

			if (!validation.valid) {
				await db
					.update(ttnConnections)
					.set({
						provisioningStatus: 'failed',
						provisioningError: validation.error || 'Validation failed',
					})
					.where(eq(ttnConnections.organizationId, organizationId))

				return {
					success: false,
					error: validation.error || 'Validation failed',
				}
			}

			// Ensure webhook is configured
			const webhookResult = await TtnWebhookService.ensureWebhook(
				organizationId,
				apiKey,
				conn.applicationId,
			)

			// Mark as complete
			await db
				.update(ttnConnections)
				.set({
					provisioningStatus: 'ready',
					provisioningError: null,
					provisioningStep: null,
				})
				.where(eq(ttnConnections.organizationId, organizationId))

			console.log(`[retryProvisioning] [${requestId}] Retry successful, webhook: ${webhookResult.action}`)

			return {
				success: true,
				message: `Provisioning retry successful. Webhook ${webhookResult.action}.`,
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			console.error(`[retryProvisioning] [${requestId}] Error:`, errorMessage)

			await db
				.update(ttnConnections)
				.set({
					provisioningStatus: 'failed',
					provisioningError: errorMessage,
				})
				.where(eq(ttnConnections.organizationId, organizationId))

			return {
				success: false,
				error: errorMessage,
			}
		}
	}

	/**
	 * Start fresh - deprovision and re-provision TTN resources
	 * Ported from ttn-provision-org start_fresh action
	 *
	 * Clears existing credentials and attempts to recreate TTN resources.
	 */
	static async startFresh(organizationId: string, region: string = 'nam1'): Promise<{
		success: boolean
		message?: string
		error?: string
	}> {
		const requestId = crypto.randomUUID().slice(0, 8)
		const ttnAdminKey = process.env.TTN_ADMIN_API_KEY
		console.log(`[startFresh] [${requestId}] Starting fresh provisioning for org: ${organizationId}`)

		if (!ttnAdminKey) {
			return {
				success: false,
				error: 'TTN_ADMIN_API_KEY not configured',
			}
		}

		// Get current connection
		const conn = await db.query.ttnConnections.findFirst({
			where: eq(ttnConnections.organizationId, organizationId),
		})

		if (!conn) {
			return {
				success: false,
				error: 'TTN not configured for this organization',
			}
		}

		const currentAppId = conn.ttnApplicationId ?? conn.applicationId

		// 1. Try to delete existing TTN application
		if (currentAppId) {
			try {
				const deleteUrl = `${TTN_BASE_URL}/api/v3/applications/${currentAppId}`
				console.log(`[startFresh] [${requestId}] Deleting application: ${currentAppId}`)

				const response = await fetch(deleteUrl, {
					method: 'DELETE',
					headers: {
						'Authorization': `Bearer ${ttnAdminKey}`,
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				})

				if (response.ok || response.status === 404) {
					console.log(`[startFresh] [${requestId}] Application deleted or not found`)
				} else {
					const errorText = await response.text()
					console.log(`[startFresh] [${requestId}] Delete failed (${response.status}): ${errorText}`)
					// Continue anyway - we'll create a new app
				}
			} catch (err) {
				console.log(`[startFresh] [${requestId}] Delete error (continuing):`, err)
			}
		}

		// 2. Clear credentials in database
		await db
			.update(ttnConnections)
			.set({
				ttnApplicationId: null,
				applicationId: null,
				ttnApiKeyEncrypted: null,
				ttnApiKeyLast4: null,
				ttnOrgApiKeyEncrypted: null,
				ttnOrgApiKeyLast4: null,
				ttnWebhookUrl: null,
				ttnWebhookSecretEncrypted: null,
				ttnWebhookSecretLast4: null,
				provisioningStatus: 'idle',
				provisioningStep: null,
				provisioningStepDetails: null,
				provisioningError: null,
				provisioningAttemptCount: 0,
				appRightsCheckStatus: null,
				lastHttpStatus: null,
				lastHttpBody: null,
				lastTtnCorrelationId: null,
				lastTtnErrorName: null,
			})
			.where(eq(ttnConnections.organizationId, organizationId))

		console.log(`[startFresh] [${requestId}] Credentials cleared. Ready for fresh provisioning.`)

		return {
			success: true,
			message: 'Existing TTN resources cleared. Use the provisioning wizard to set up new TTN application.',
		}
	}

	/**
	 * Deep clean - delete ALL TTN resources and reset sensors
	 * Ported from ttn-provision-org deep_clean action
	 *
	 * This is the nuclear option - deletes devices, application, and organization from TTN.
	 */
	static async deepClean(organizationId: string): Promise<{
		success: boolean
		deleted_devices?: number
		deleted_app?: boolean
		deleted_org?: boolean
		message?: string
		error?: string
	}> {
		const requestId = crypto.randomUUID().slice(0, 8)
		const ttnAdminKey = process.env.TTN_ADMIN_API_KEY
		console.log(`[deepClean] [${requestId}] Starting deep clean for org: ${organizationId}`)

		if (!ttnAdminKey) {
			return {
				success: false,
				error: 'TTN_ADMIN_API_KEY not configured',
			}
		}

		// Get current connection
		const conn = await db.query.ttnConnections.findFirst({
			where: eq(ttnConnections.organizationId, organizationId),
		})

		if (!conn) {
			return {
				success: false,
				error: 'TTN not configured for this organization',
			}
		}

		const currentAppId = conn.ttnApplicationId ?? conn.applicationId
		let deletedDevices = 0
		let deletedApp = false
		const deletedOrg = false

		// 1. Delete all devices from TTN application
		if (currentAppId) {
			try {
				// List devices
				const listUrl = `${TTN_BASE_URL}/api/v3/applications/${currentAppId}/devices`
				console.log(`[deepClean] [${requestId}] Listing devices from: ${listUrl}`)

				const listResponse = await fetch(listUrl, {
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${ttnAdminKey}`,
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				})

				if (listResponse.ok) {
					const data = await listResponse.json() as { end_devices?: Array<{ ids?: { device_id?: string } }> }
					const devices = data.end_devices || []
					console.log(`[deepClean] [${requestId}] Found ${devices.length} devices to delete`)

					// Delete each device
					for (const device of devices) {
						const deviceId = device.ids?.device_id
						if (deviceId) {
							try {
								const deleteDeviceUrl = `${TTN_BASE_URL}/api/v3/applications/${currentAppId}/devices/${deviceId}`
								const deleteResponse = await fetch(deleteDeviceUrl, {
									method: 'DELETE',
									headers: {
										'Authorization': `Bearer ${ttnAdminKey}`,
									},
									signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
								})

								if (deleteResponse.ok || deleteResponse.status === 404) {
									deletedDevices++
									console.log(`[deepClean] [${requestId}] Deleted device: ${deviceId}`)
								}
							} catch (err) {
								console.log(`[deepClean] [${requestId}] Failed to delete device ${deviceId}:`, err)
							}
						}
					}
				} else {
					console.log(`[deepClean] [${requestId}] Could not list devices (${listResponse.status})`)
				}
			} catch (err) {
				console.log(`[deepClean] [${requestId}] Device listing error:`, err)
			}
		}

		// 2. Delete TTN Application
		if (currentAppId) {
			try {
				const deleteAppUrl = `${TTN_BASE_URL}/api/v3/applications/${currentAppId}`
				console.log(`[deepClean] [${requestId}] Deleting application: ${currentAppId}`)

				const response = await fetch(deleteAppUrl, {
					method: 'DELETE',
					headers: {
						'Authorization': `Bearer ${ttnAdminKey}`,
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				})

				if (response.ok || response.status === 404) {
					deletedApp = true
					console.log(`[deepClean] [${requestId}] Application deleted`)
				} else {
					const errorText = await response.text()
					console.log(`[deepClean] [${requestId}] App delete failed (${response.status}): ${errorText}`)
				}
			} catch (err) {
				console.log(`[deepClean] [${requestId}] App delete error:`, err)
			}
		}

		// 3. Clear ALL database credentials
		await db
			.update(ttnConnections)
			.set({
				ttnApplicationId: null,
				applicationId: null,
				ttnApiKeyEncrypted: null,
				ttnApiKeyLast4: null,
				ttnOrgApiKeyEncrypted: null,
				ttnOrgApiKeyLast4: null,
				ttnWebhookUrl: null,
				ttnWebhookSecretEncrypted: null,
				ttnWebhookSecretLast4: null,
				provisioningStatus: 'idle',
				provisioningStep: null,
				provisioningStepDetails: null,
				provisioningError: null,
				provisioningAttemptCount: 0,
				appRightsCheckStatus: null,
				lastHttpStatus: null,
				lastHttpBody: null,
				lastTtnCorrelationId: null,
				lastTtnErrorName: null,
				credentialsLastRotatedAt: null,
			})
			.where(eq(ttnConnections.organizationId, organizationId))

		console.log(`[deepClean] [${requestId}] Deep clean completed: ${deletedDevices} devices, app=${deletedApp}`)

		return {
			success: true,
			deleted_devices: deletedDevices,
			deleted_app: deletedApp,
			deleted_org: deletedOrg,
			message: `Deep clean completed. Deleted ${deletedDevices} devices and application. Ready for fresh provisioning.`,
		}
	}
}
