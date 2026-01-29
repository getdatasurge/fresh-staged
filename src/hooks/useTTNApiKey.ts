/**
 * TTN API Key Hooks
 *
 * Status: BLOCKED - Requires backend implementation
 *
 * Current implementation:
 * - Uses ttn-bootstrap edge function for API key validation and webhook setup
 * - Edge function performs: TTN API key validation, permissions check, webhook configuration
 *
 * Migration blockers:
 * - Backend needs TTN SDK integration (@ttn-lw/grpc-web-api-client)
 * - Backend needs TTN API key validation procedures
 * - Backend needs webhook configuration procedures (create/update webhook in TTN)
 * - Backend needs bootstrap service/job for provisioning workflow
 *
 * Edge functions used:
 * - ttn-bootstrap (validate_only, save_and_configure actions)
 *
 * Migration path:
 * 1. Add TTN SDK to backend dependencies
 * 2. Create ttn-bootstrap.service.ts with validation and webhook config logic
 * 3. Create procedures in ttnSettings router (validateApiKey, configureWebhook)
 * 4. Migrate this hook to use tRPC procedures
 *
 * Estimated effort: Medium (requires external API integration)
 * Priority: Medium (affects TTN setup wizard UX)
 */
import type { TTNValidationResult as ValidationPanelResult } from '@/components/ttn/TTNValidationResultPanel'
import { useTTNConfig } from '@/contexts/TTNConfigContext'
import { useTRPC } from '@/lib/trpc'
import { hashConfigValues } from '@/types/ttnState'
import { useUser } from '@stackframe/react'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { TTNSettings } from './useTTNSettings'

/**
 * Bootstrap result from the ttn-bootstrap edge function
 */
export interface BootstrapResult {
	ok: boolean
	request_id: string
	action: string
	permissions?: {
		valid: boolean
		rights: string[]
		missing_core: string[]
		missing_webhook: string[]
		can_configure_webhook: boolean
		can_manage_devices: boolean
	}
	webhook?: {
		webhook_id: string
		base_url: string
		format: string
		events_enabled: string[]
		secret_configured: boolean
	}
	webhook_action?: 'created' | 'updated' | 'unchanged'
	error?: {
		code: string
		message: string
		hint: string
		missing_permissions?: string[]
	}
	config?: {
		api_key_last4: string
		webhook_secret_last4: string
		webhook_url: string
		application_id: string
		cluster: string
		updated_at: string
	}
}

interface UseTTNApiKeyOptions {
	organizationId: string | null
	region: string
	settings: TTNSettings | null
	onSettingsRefresh: () => Promise<void>
}

interface UseTTNApiKeyReturn {
	newApiKey: string
	setNewApiKey: (key: string) => void
	newApplicationId: string
	setNewApplicationId: (id: string) => void
	apiKeyValidation: { valid: boolean; warning?: string }
	isSavingApiKey: boolean
	isValidating: boolean
	validationResult: ValidationPanelResult | null
	bootstrapResult: BootstrapResult | null
	handleSaveApiKey: () => Promise<void>
	runPreflightValidation: () => Promise<void>
}

/**
 * Validate API key format (client-side)
 */
function validateApiKeyFormat(key: string): {
	valid: boolean
	warning?: string
} {
	const trimmed = key.trim()

	if (trimmed.length === 0) {
		return { valid: false }
	}

	// TTN keys typically start with NNSXS.
	if (!trimmed.startsWith('NNSXS.')) {
		return {
			valid: true,
			warning:
				"TTN API keys typically start with 'NNSXS.' — make sure you copied the full key",
		}
	}

	// TTN keys are typically 80+ characters
	if (trimmed.length < 80) {
		return {
			valid: true,
			warning:
				'This key seems shorter than expected — make sure you copied the full key',
		}
	}

	return { valid: true }
}

/**
 * Hook to manage TTN API key validation and saving
 */
export function useTTNApiKey({
	organizationId,
	region,
	settings,
	onSettingsRefresh,
}: UseTTNApiKeyOptions): UseTTNApiKeyReturn {
	const [newApiKey, setNewApiKey] = useState('')
	const [newApplicationId, setNewApplicationId] = useState(
		settings?.ttn_application_id || '',
	)
	const [isSavingApiKey, setIsSavingApiKey] = useState(false)
	const [isValidating, setIsValidating] = useState(false)
	const [validationResult, setValidationResult] =
		useState<ValidationPanelResult | null>(null)
	const [bootstrapResult, setBootstrapResult] =
		useState<BootstrapResult | null>(null)

	const user = useUser()
	const { setValidated, setCanonical, setInvalid } = useTTNConfig()
	const trpc = useTRPC()

	// TRPC Mutations
	const validateMutation = useMutation(trpc.ttnSettings.validateApiKey.mutationOptions())
	const saveMutation = useMutation(trpc.ttnSettings.saveAndConfigure.mutationOptions())

	const apiKeyValidation = validateApiKeyFormat(newApiKey)

	// Preflight validation (validate_only) before save
	const runPreflightValidation = useCallback(async () => {
		if (!organizationId || !user) return

		const effectiveAppId =
			newApplicationId.trim() || settings?.ttn_application_id
		if (!effectiveAppId || !region) {
			setValidationResult(null)
			return
		}

		setIsValidating(true)
		try {
			const result = await validateMutation.mutateAsync({
				organizationId,
				cluster: region,
				applicationId: effectiveAppId,
				apiKey: newApiKey.trim() || '',
			})

			const data = result
			const error = result.error

			// Case A: Transport error
			if (error) {
				console.error('[TTN Validation] Transport error:', error)
				toast.error('Connection error', { description: error.message })
				setValidationResult({
					valid: false,
					warnings: ['Unable to reach validation service'],
					error: { code: 'TRANSPORT_ERROR', message: error.message },
				})
				setInvalid(error.message)
				return
			}

			// Case B: Application-level validation
			if (data?.valid || data?.ok) {
				console.info('[TTN Validation] Configuration valid', {
					request_id: data.request_id,
					permissions: data.permissions?.rights?.length || 0,
				})

				setValidationResult({
					valid: true,
					warnings: data.warnings || [],
					permissions: data.permissions,
					request_id: data.request_id,
					applicationId: effectiveAppId,
				})

				setValidated({
					valid: true,
					api_key_type: 'application',
					permissions: data.permissions
						? {
								applications_read:
									data.permissions.rights?.includes('RIGHT_APPLICATION_INFO') ??
									false,
								applications_write:
									data.permissions.rights?.includes(
										'RIGHT_APPLICATION_SETTINGS_BASIC',
									) ?? false,
								devices_read:
									data.permissions.rights?.includes(
										'RIGHT_APPLICATION_DEVICES_READ',
									) ?? false,
								devices_write:
									data.permissions.rights?.includes(
										'RIGHT_APPLICATION_DEVICES_WRITE',
									) ?? false,
								gateways_read: false,
								gateways_write: false,
								webhooks_write: data.permissions.can_configure_webhook ?? false,
								can_configure_webhook:
									data.permissions.can_configure_webhook ?? false,
								can_manage_devices:
									data.permissions.can_manage_devices ?? false,
								can_provision_gateways: false,
								rights: data.permissions.rights || [],
							}
						: {
								applications_read: false,
								applications_write: false,
								devices_read: false,
								devices_write: false,
								gateways_read: false,
								gateways_write: false,
								webhooks_write: false,
								can_configure_webhook: false,
								can_manage_devices: false,
								can_provision_gateways: false,
								rights: [],
							},
					missing_permissions: data.permissions?.missing_core || [],
					invalid_fields: [],
					warnings: data.warnings || [],
					validated_at: new Date().toISOString(),
					request_id: data.request_id || '',
					resolved: {
						cluster: region,
						application_id: effectiveAppId,
						organization_id: organizationId,
					},
				})
			} else {
				console.info('[TTN Validation] Configuration invalid:', {
					code: data?.error?.code,
					message: data?.error?.message,
					request_id: data?.request_id,
				})

				setValidationResult({
					valid: false,
					warnings: [],
					error: data?.error,
					request_id: data?.request_id,
					applicationId: effectiveAppId,
					permissions: data?.permissions,
				})

				setInvalid(data?.error?.message || 'Validation failed')
			}
		} catch (err: unknown) {
			const errMessage = err instanceof Error ? err.message : 'Unknown error'
			console.error('[TTN Validation] Unexpected error:', err)
			setValidationResult({
				valid: false,
				warnings: ['Unexpected validation error'],
				error: { code: 'UNEXPECTED_ERROR', message: errMessage },
			})
			setInvalid(errMessage)
		} finally {
			setIsValidating(false)
		}
	}, [
		organizationId,
		region,
		newApplicationId,
		newApiKey,
		settings?.ttn_application_id,
		user,
		setValidated,
		setInvalid,
	])

	const handleSaveApiKey = useCallback(async () => {
		if (!organizationId || !newApiKey.trim() || !user) return

		const effectiveAppId =
			newApplicationId.trim() || settings?.ttn_application_id
		if (!effectiveAppId) {
			toast.error('Please enter the TTN Application ID')
			return
		}

		setIsSavingApiKey(true)
		setBootstrapResult(null)

		try {
			const result = await saveMutation.mutateAsync({
				organizationId,
				cluster: region,
				applicationId: effectiveAppId,
				apiKey: newApiKey.trim(),
			})

			const bootstrapData = result as BootstrapResult
			setBootstrapResult(bootstrapData)

			if (result?.ok) {
				setNewApiKey('')
				const actionMsg =
					bootstrapData.webhook_action === 'created'
						? 'Webhook created in TTN'
						: bootstrapData.webhook_action === 'updated'
							? 'Webhook updated in TTN'
							: 'Configuration saved'
				toast.success(`API key validated. ${actionMsg}!`)

				const hash = hashConfigValues({
					cluster: region,
					application_id: effectiveAppId,
					api_key_last4: bootstrapData.config?.api_key_last4,
					is_enabled: settings?.is_enabled,
				})
				console.log('[TTN Config] API key saved, setting canonical', {
					hash,
					app_id: effectiveAppId,
				})
				setCanonical(hash)

				await onSettingsRefresh()
			} else {
				const errorCode = result?.error?.code || 'UNKNOWN'
				const errorMessage = result?.error?.message || 'Configuration failed'
				const errorHint = result?.error?.hint
				const requestId = result?.request_id

				console.error('[TTN Bootstrap Error]', {
					code: errorCode,
					message: errorMessage,
					hint: errorHint,
					request_id: requestId,
					permissions: result?.permissions,
				})

				if (errorCode === 'TTN_PERMISSION_MISSING') {
					toast.error(errorMessage, {
						description: errorHint,
						duration: 8000,
					})
				} else if (errorCode === 'WEBHOOK_SETUP_FAILED') {
					const ttnErrorMatch = errorHint?.match(/invalid `([^`]+)`: (.+)/)
					const specificError = ttnErrorMatch
						? `TTN rejected ${ttnErrorMatch[1]}: ${ttnErrorMatch[2]}`
						: errorHint

					toast.error('Webhook setup failed', {
						description: specificError || `Request ID: ${requestId}`,
						duration: 8000,
					})
				} else if (errorCode === 'INVALID_WEBHOOK_URL') {
					toast.error('Server Configuration Error', {
						description: `${errorMessage}. Request ID: ${requestId}`,
						duration: 10000,
					})
				} else {
					toast.error(errorMessage, {
						description: errorHint || `Request ID: ${requestId}`,
						duration: 8000,
					})
				}
			}
		} catch (err: unknown) {
			const errMessage = err instanceof Error ? err.message : 'Unknown error'
			console.error('Save API key error:', err)
			toast.error('Unexpected error', {
				description: errMessage || 'Failed to save and configure TTN',
			})
			setInvalid(errMessage || 'Failed to save and configure TTN')
		} finally {
			setIsSavingApiKey(false)
		}
	}, [
		organizationId,
		newApiKey,
		newApplicationId,
		region,
		settings?.ttn_application_id,
		settings?.is_enabled,
		user,
		setCanonical,
		setInvalid,
		onSettingsRefresh,
	])

	return {
		newApiKey,
		setNewApiKey,
		newApplicationId,
		setNewApplicationId,
		apiKeyValidation,
		isSavingApiKey,
		isValidating,
		validationResult,
		bootstrapResult,
		handleSaveApiKey,
		runPreflightValidation,
	}
}
