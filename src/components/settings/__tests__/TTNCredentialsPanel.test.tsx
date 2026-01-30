/**
 * TTNCredentialsPanel Integration Tests
 *
 * Tests the tRPC-migrated TTNCredentialsPanel component.
 * Validates the queryOptions/mutationOptions mock pattern works correctly.
 *
 * Coverage: Basic rendering, async data loading, credential display states,
 * mutation actions (retry/start fresh/deep clean), error handling
 *
 * Uses the established mockUseTRPC + createQueryOptionsMock pattern.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryOptionsMock } from '@/test/trpc-test-utils'

// Toast mock
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

// Mock modules
vi.mock('@stackframe/react', () => ({
	useUser: vi.fn(() => ({
		getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
	})),
}))

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/components/ttn/TTNDiagnosticsPanel', () => ({
	TTNDiagnosticsPanel: () => <div data-testid="diagnostics-panel" />,
}))

vi.mock('../SecretField', () => ({
	SecretField: ({
		label,
		last4,
		status,
	}: {
		label: string
		last4: string | null
		status: string
	}) => (
		<div data-testid={`secret-field-${label.toLowerCase().replace(/\s+/g, '-')}`}>
			<span>{label}</span>
			{last4 && <span data-testid="last4">...{last4}</span>}
			<span data-testid="status">{status}</span>
		</div>
	),
}))

const mockProvisionFn = vi.fn()
const mockStartFreshFn = vi.fn()
const mockDeepCleanFn = vi.fn()

const mockUseTRPC = vi.fn()

vi.mock('@/lib/trpc', () => ({
	useTRPC: () => mockUseTRPC(),
}))

const MOCK_CREDENTIALS = {
	organization_name: 'Test Org',
	organization_id: 'org-123',
	ttn_application_id: 'app-test',
	ttn_region: 'nam1',
	org_api_secret: null,
	org_api_secret_last4: 'ab12',
	org_api_secret_status: 'decrypted' as const,
	app_api_secret: null,
	app_api_secret_last4: 'cd34',
	app_api_secret_status: 'decrypted' as const,
	webhook_secret: null,
	webhook_secret_last4: 'ef56',
	webhook_secret_status: 'decrypted' as const,
	webhook_url: 'https://example.com/webhook',
	provisioning_status: 'ready',
	provisioning_step: null,
	provisioning_step_details: null,
	provisioning_error: null,
	provisioning_attempt_count: 1,
	last_http_status: null,
	last_http_body: null,
	credentials_last_rotated_at: null,
	app_rights_check_status: null,
	last_ttn_correlation_id: null,
	last_ttn_error_name: null,
}

/**
 * Helper: build mock tRPC return value with optional overrides for credentials data.
 */
function buildMockTRPC(credentialsData: typeof MOCK_CREDENTIALS | null = MOCK_CREDENTIALS) {
	return {
		ttnSettings: {
			getCredentials: {
				queryOptions: createQueryOptionsMock(credentialsData, {
					queryKey: ['ttnSettings', 'getCredentials', { organizationId: 'test-org' }],
					enabled: false,
				}),
			},
			getStatus: {
				queryOptions: createQueryOptionsMock(null, {
					queryKey: ['ttnSettings', 'getStatus', { organizationId: 'test-org' }],
					enabled: false,
				}),
			},
			provision: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'provision'],
					mutationFn: mockProvisionFn,
				}),
			},
			startFresh: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'startFresh'],
					mutationFn: mockStartFreshFn,
				}),
			},
			deepClean: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'deepClean'],
					mutationFn: mockDeepCleanFn,
				}),
			},
		},
	}
}

/**
 * Helper: build mock tRPC with a failing getCredentials queryFn.
 */
function buildErrorMockTRPC(errorMessage: string) {
	return {
		ttnSettings: {
			getCredentials: {
				queryOptions: vi.fn().mockReturnValue({
					queryKey: ['ttnSettings', 'getCredentials'],
					queryFn: () => Promise.reject(new Error(errorMessage)),
					enabled: false,
				}),
			},
			getStatus: {
				queryOptions: createQueryOptionsMock(null, {
					queryKey: ['ttnSettings', 'getStatus', { organizationId: 'test-org' }],
					enabled: false,
				}),
			},
			provision: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'provision'],
					mutationFn: mockProvisionFn,
				}),
			},
			startFresh: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'startFresh'],
					mutationFn: mockStartFreshFn,
				}),
			},
			deepClean: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'deepClean'],
					mutationFn: mockDeepCleanFn,
				}),
			},
		},
	}
}

function setupDefaultMocks() {
	mockProvisionFn.mockResolvedValue({ success: true })
	mockStartFreshFn.mockResolvedValue({ success: true })
	mockDeepCleanFn.mockResolvedValue({ success: true })

	mockUseTRPC.mockReturnValue(buildMockTRPC())
}

import { TTNCredentialsPanel } from '../TTNCredentialsPanel'

describe('TTNCredentialsPanel', () => {
	let queryClient: QueryClient

	beforeEach(() => {
		vi.clearAllMocks()
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		setupDefaultMocks()
		toastMock.success.mockClear()
		toastMock.error.mockClear()
	})

	afterEach(() => {
		cleanup()
	})

	const renderPanel = (organizationId: string | null = 'test-org') =>
		render(
			<QueryClientProvider client={queryClient}>
				<TTNCredentialsPanel organizationId={organizationId} />
			</QueryClientProvider>
		)

	describe('Initial Rendering', () => {
		it('shows "No organization selected" when organizationId is null', () => {
			renderPanel(null)
			expect(screen.getByText('No organization selected')).toBeInTheDocument()
		})

		it('renders loading skeleton when organizationId is provided', () => {
			const { container } = renderPanel()
			expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0)
		})

		it('renders the component without crashing', () => {
			const { container } = renderPanel()
			expect(container).toBeDefined()
		})

		it('renders card header with TTN Credentials title', () => {
			renderPanel()
			expect(screen.getByText('TTN Credentials')).toBeInTheDocument()
		})

		it('renders card description text', () => {
			renderPanel()
			// Card has a description paragraph
			expect(screen.getByRole('paragraph')).toBeInTheDocument()
		})
	})

	describe('Data Loading States', () => {
		it('displays organization name after successful fetch', async () => {
			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Test Org')).toBeInTheDocument()
			})
		})

		it('displays organization ID after successful fetch', async () => {
			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('org-123')).toBeInTheDocument()
			})
		})

		it('shows loading skeleton initially before data loads', () => {
			// On initial render, isLoading=true so skeletons appear
			const { container } = renderPanel()
			const skeletons = container.querySelectorAll('[class*="animate-pulse"]')
			expect(skeletons.length).toBeGreaterThan(0)
		})

		it('shows fetch error banner when refetch fails', async () => {
			mockUseTRPC.mockReturnValue(buildErrorMockTRPC('Network error'))

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Network error')).toBeInTheDocument()
			})
		})

		it('shows retry button in error banner', async () => {
			mockUseTRPC.mockReturnValue(buildErrorMockTRPC('Network error'))

			renderPanel()

			await waitFor(() => {
				expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
			})
		})

		it('calls toast.error on first fetch failure', async () => {
			mockUseTRPC.mockReturnValue(buildErrorMockTRPC('API unavailable'))

			renderPanel()

			await waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledWith('API unavailable')
			})
		})
	})

	describe('Credential Display', () => {
		it('shows Fully Provisioned badge when provisioning_status is ready', async () => {
			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Fully Provisioned')).toBeInTheDocument()
			})
		})

		it('shows Partially Configured badge when some credentials are missing', async () => {
			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: null as unknown as string,
					webhook_url: null,
					webhook_secret_last4: null,
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Partially Configured')).toBeInTheDocument()
			})
		})

		it('shows Not Configured badge when no credentials are present', async () => {
			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: null as unknown as string,
					org_api_secret: null,
					org_api_secret_last4: null,
					app_api_secret: null,
					app_api_secret_last4: null,
					webhook_secret: null,
					webhook_secret_last4: null,
					webhook_url: null,
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Not Configured')).toBeInTheDocument()
			})
		})

		it('displays secret field mock components with last4 values', async () => {
			renderPanel()

			await waitFor(() => {
				expect(
					screen.getByTestId('secret-field-organization-api-secret')
				).toBeInTheDocument()
			})

			expect(screen.getByTestId('secret-field-application-api-secret')).toBeInTheDocument()
			expect(screen.getByTestId('secret-field-webhook-secret')).toBeInTheDocument()
			expect(screen.getByTestId('secret-field-webhook-url')).toBeInTheDocument()
		})

		it('shows application ID when credentials are loaded', async () => {
			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('app-test')).toBeInTheDocument()
			})
		})
	})

	describe('Mutation Actions', () => {
		it('shows provisioning button when status is failed', async () => {
			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'Step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})
		})

		it('calls provision mutation on retry click and shows success toast', async () => {
			mockProvisionFn.mockResolvedValue({ success: true })

			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'Step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByText('Retry Provisioning'))

			await waitFor(() => {
				expect(toastMock.success).toHaveBeenCalledWith('Provisioning retry initiated')
			})

			expect(mockProvisionFn).toHaveBeenCalled()
			expect(mockProvisionFn.mock.calls[0][0]).toEqual({
				organizationId: 'test-org',
				action: 'retry',
			})
		})

		it('shows error toast when provision mutation fails', async () => {
			mockProvisionFn.mockRejectedValue(new Error('Provision failed'))

			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'Step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByText('Retry Provisioning'))

			await waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledWith('Provision failed')
			})
		})

		it('shows Start Fresh button when provisioning has failed', async () => {
			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'Step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Start Fresh')).toBeInTheDocument()
			})
		})

		it('shows Deep Clean button when ttn_application_id exists', async () => {
			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Deep Clean')).toBeInTheDocument()
			})
		})

		it('shows Check Status button for refreshing credentials', async () => {
			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Check Status')).toBeInTheDocument()
			})
		})
	})

	describe('Error Handling', () => {
		it('shows fetch error message in the error banner', async () => {
			mockUseTRPC.mockReturnValue(buildErrorMockTRPC('Connection refused'))

			renderPanel()

			await waitFor(() => {
				// The error banner shows the error message text
				expect(screen.getByText('Connection refused')).toBeInTheDocument()
			})
			// Error toast should also fire on first failure
			expect(toastMock.error).toHaveBeenCalledWith('Connection refused')
		})

		it('handles structured error response from provision mutation', async () => {
			mockProvisionFn.mockResolvedValue({
				success: false,
				error: 'Unowned app',
				use_start_fresh: true,
				message: 'Application is owned by different account',
			})

			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'Step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByText('Retry Provisioning'))

			await waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledWith('Cannot retry - use Start Fresh', {
					description: 'Application is owned by different account',
				})
			})
		})

		it('shows provisioning error details when status is failed', async () => {
			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'create_application step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Provisioning Failed')).toBeInTheDocument()
			})
			expect(screen.getByText('create_application step failed')).toBeInTheDocument()
		})

		it('shows Failed badge when provisioning_status is failed', async () => {
			mockUseTRPC.mockReturnValue(
				buildMockTRPC({
					...MOCK_CREDENTIALS,
					provisioning_status: 'failed',
					provisioning_error: 'Step failed',
				})
			)

			renderPanel()

			await waitFor(() => {
				expect(screen.getByText('Failed')).toBeInTheDocument()
			})
		})
	})
})
