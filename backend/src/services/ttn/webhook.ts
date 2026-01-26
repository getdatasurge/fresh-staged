/**
 * TTN Webhook Service
 * Ports update-ttn-webhook logic
 */
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { ttnConnections } from '../../db/schema.js'
import { AppError } from '../../lib/error.js'
import { TtnClient } from './client.js'
import { TtnCrypto } from './crypto.js'

export class TtnWebhookService {
	/**
	 * Ensure Webhook exists in TTN
	 */
	static async ensureWebhook(
		organizationId: string,
		apiKey: string,
		applicationId: string,
	): Promise<{ action: 'created' | 'updated' | 'unchanged'; url: string }> {
		// Generate or retrieve webhook secret
		let secret = crypto.randomUUID().replace(/-/g, '') // Simple secret generation

		// Check DB for existing secret to preserve it if possible
		const record = await db.query.ttnConnections.findFirst({
			where: eq(ttnConnections.organizationId, organizationId),
		})

		// Salt for encryption
		const salt = process.env.TTN_ENCRYPTION_SALT || 'default-salt'

		if (record?.ttnWebhookSecretEncrypted) {
			secret = TtnCrypto.deobfuscateKey(record.ttnWebhookSecretEncrypted, salt)
		} else {
			// Save new secret
			await db
				.update(ttnConnections)
				.set({
					ttnWebhookSecretEncrypted: TtnCrypto.obfuscateKey(secret, salt),
					ttnWebhookSecretLast4: secret.slice(-4),
				})
				.where(eq(ttnConnections.organizationId, organizationId))
		}

		const webhookId = 'freshtrack-webhook'
		const webhookUrl = `${process.env.API_BASE_URL}/api/webhooks/ttn/${organizationId}`

		// TTN API Payload
		const body = {
			ids: {
				webhook_id: webhookId,
			},
			base_url: webhookUrl,
			format: 'json',
			headers: {
				Authorization: secret, // Bearer token approach for webhook auth
			},
			uplink_message: {
				path: '/uplink',
			},
			join_accept: {
				path: '/join',
			},
		}

		// Try to create or update
		const endpoint = `/api/v3/as/applications/${applicationId}/webhooks/${webhookId}`

		// We use PUT (Set) to ensure idempotent configuration
		const response = await TtnClient.fetch(endpoint, apiKey, {
			method: 'PUT',
			body: JSON.stringify({
				webhook: body,
				field_mask: {
					paths: [
						'base_url',
						'format',
						'headers',
						'uplink_message',
						'join_accept',
					],
				},
			}),
		})

		if (!response.ok) {
			const text = await response.text()
			throw new AppError(
				'TTN_WEBHOOK_FAILED',
				`Failed to configure webhook: ${text}`,
				500,
			)
		}

		// Update DB with URL
		await db
			.update(ttnConnections)
			.set({ ttnWebhookUrl: webhookUrl })
			.where(eq(ttnConnections.organizationId, organizationId))

		return { action: 'updated', url: webhookUrl }
	}

	/**
	 * Update Webhook Settings
	 */
	static async updateWebhook(
		organizationId: string,
		url: string,
		events: string[],
	) {
		const record = await db.query.ttnConnections.findFirst({
			where: eq(ttnConnections.organizationId, organizationId),
		})

		if (!record || !record.ttnApiKeyEncrypted || !record.ttnApplicationId) {
			throw new AppError(
				'TTN_NOT_CONFIGURED',
				'Organization not configured',
				400,
			)
		}

		const salt = process.env.TTN_ENCRYPTION_SALT || 'default-salt'
		const apiKey = TtnCrypto.deobfuscateKey(record.ttnApiKeyEncrypted, salt)
		const appId = record.ttnApplicationId
		const webhookId = 'freshtrack-webhook'

		// Construct body based on events
		// Simplification: We map array of strings to object structure
		const body: any = {
			ids: { webhook_id: webhookId },
			base_url: url,
			format: 'json',
		}

		if (events.includes('uplink_message'))
			body.uplink_message = { path: '/uplink' }
		if (events.includes('join_accept')) body.join_accept = { path: '/join' }
		// Add other event mappings as needed

		const endpoint = `/api/v3/as/applications/${appId}/webhooks/${webhookId}`

		const response = await TtnClient.fetch(endpoint, apiKey, {
			method: 'PUT',
			body: JSON.stringify({
				webhook: body,
				field_mask: { paths: ['base_url', 'format', ...events] },
			}),
		})

		if (!response.ok) {
			throw new AppError('TTN_UPDATE_FAILED', 'Failed to update webhook', 500)
		}

		return { ok: true }
	}

	/**
	 * Regenerate webhook secret
	 */
	static async regenerateWebhookSecret(
		organizationId: string,
	): Promise<{ ok: boolean; secretLast4: string }> {
		const record = await db.query.ttnConnections.findFirst({
			where: eq(ttnConnections.organizationId, organizationId),
		})

		if (!record || !record.ttnApiKeyEncrypted || !record.ttnApplicationId) {
			throw new AppError(
				'TTN_NOT_CONFIGURED',
				'Organization not configured',
				400,
			)
		}

		const salt = process.env.TTN_ENCRYPTION_SALT || 'default-salt'
		const apiKey = TtnCrypto.deobfuscateKey(record.ttnApiKeyEncrypted, salt)
		const appId = record.ttnApplicationId
		const webhookId = 'freshtrack-webhook'

		// Generate new secret
		const newSecret = crypto.randomUUID().replace(/-/g, '')

		// Update in TTN
		const webhookUrl =
			record.ttnWebhookUrl ||
			`${process.env.API_BASE_URL}/api/webhooks/ttn/${organizationId}`
		const body: any = {
			ids: { webhook_id: webhookId },
			base_url: webhookUrl,
			format: 'json',
			headers: {
				Authorization: newSecret,
			},
			uplink_message: { path: '/uplink' },
			join_accept: { path: '/join' },
		}

		const endpoint = `/api/v3/as/applications/${appId}/webhooks/${webhookId}`

		const response = await TtnClient.fetch(endpoint, apiKey, {
			method: 'PUT',
			body: JSON.stringify({
				webhook: body,
				field_mask: { paths: ['headers'] },
			}),
		})

		if (!response.ok) {
			throw new AppError(
				'TTN_UPDATE_FAILED',
				'Failed to update webhook secret',
				500,
			)
		}

		// Update in DB
		await db
			.update(ttnConnections)
			.set({
				ttnWebhookSecretEncrypted: TtnCrypto.obfuscateKey(newSecret, salt),
				ttnWebhookSecretLast4: newSecret.slice(-4),
			})
			.where(eq(ttnConnections.organizationId, organizationId))

		return { ok: true, secretLast4: newSecret.slice(-4) }
	}
}
