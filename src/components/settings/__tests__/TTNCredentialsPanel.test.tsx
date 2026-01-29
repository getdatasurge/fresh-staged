/**
 * TTNCredentialsPanel Integration Tests
 *
 * Tests the tRPC-migrated TTNCredentialsPanel component.
 * Covers rendering states, credential loading, action buttons, error handling, and permissions.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to ensure mock objects are available before vi.mock hoisting
const {
	toastMock,
	credentialsRefetchMock,
	statusRefetchMock,
	provisionMutateMock,
	startFreshMutateMock,
	deepCleanMutateMock,
} = vi.hoisted(() => {
	return {
		toastMock: {
			success: vi.fn(),
			error: vi.fn(),
		},
		credentialsRefetchMock: vi.fn(),
		statusRefetchMock: vi.fn(),
		provisionMutateMock: vi.fn(),
		startFreshMutateMock: vi.fn(),
		deepCleanMutateMock: vi.fn(),
	}
})

// Mock Stack Auth
vi.mock('@stackframe/react', () => ({
	useUser: vi.fn(() => ({
		getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
	})),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
	toast: toastMock,
}))

// Mock TTNDiagnosticsPanel
vi.mock('@/components/ttn/TTNDiagnosticsPanel', () => ({
	TTNDiagnosticsPanel: () => <div data-testid="diagnostics-panel" />,
}))

// Mock useTRPC - returns fresh mock functions each call
vi.mock('@/lib/trpc', () => ({
	useTRPC: () => ({
		ttnSettings: {
			getCredentials: {
				useQuery: () => ({
					refetch: credentialsRefetchMock,
					data: null,
					error: null,
					isLoading: false,
					isPending: false,
				}),
			},
			getStatus: {
				useQuery: () => ({
					refetch: statusRefetchMock,
					data: null,
					error: null,
					isLoading: false,
					isPending: false,
				}),
			},
			provision: {
				useMutation: () => ({
					mutateAsync: provisionMutateMock,
					isPending: false,
				}),
			},
			startFresh: {
				useMutation: () => ({
					mutateAsync: startFreshMutateMock,
					isPending: false,
				}),
			},
			deepClean: {
				useMutation: () => ({
					mutateAsync: deepCleanMutateMock,
					isPending: false,
				}),
			},
		},
	}),
}))

import { TTNCredentialsPanel } from '../TTNCredentialsPanel'

// Test data fixtures
const mockCredentialsReady = {
	organization_name: 'Test Organization',
	organization_id: 'org-test-123',
	ttn_application_id: 'ft-test-app',
	ttn_region: 'nam1',
	org_api_secret: null,
	org_api_secret_last4: 'ABCD',
	org_api_secret_status: 'decrypted',
	app_api_secret: null,
	app_api_secret_last4: 'EFGH',
	app_api_secret_status: 'decrypted',
	webhook_secret: null,
	webhook_secret_last4: 'IJKL',
	webhook_secret_status: 'decrypted',
	webhook_url: 'https://api.freshtrack.io/webhooks/ttn',
	provisioning_status: 'ready',
	provisioning_step: null,
	provisioning_step_details: {
		preflight_done: true,
		organization_created: true,
		org_api_key_created: true,
		application_created: true,
		app_rights_verified: true,
		app_api_key_created: true,
		webhook_created: true,
	},
	provisioning_error: null,
	provisioning_attempt_count: 1,
	last_http_status: null,
	last_http_body: null,
	credentials_last_rotated_at: '2026-01-15T10:00:00Z',
	app_rights_check_status: null,
	last_ttn_correlation_id: null,
	last_ttn_error_name: null,
}

const mockCredentialsFailed = {
	...mockCredentialsReady,
	provisioning_status: 'failed',
	provisioning_step: 'create_application',
	provisioning_error: 'Application already exists with different owner',
	last_http_status: 403,
	last_http_body: '{"code":7,"message":"no_application_rights"}',
	last_ttn_error_name: 'no_application_rights',
}

const mockCredentialsMissing = {
	organization_name: 'New Organization',
	organization_id: 'org-new-456',
	ttn_application_id: null,
	ttn_region: null,
	org_api_secret: null,
	org_api_secret_last4: null,
	org_api_secret_status: 'empty',
	app_api_secret: null,
	app_api_secret_last4: null,
	app_api_secret_status: 'empty',
	webhook_secret: null,
	webhook_secret_last4: null,
	webhook_secret_status: 'empty',
	webhook_url: null,
	provisioning_status: 'idle',
	provisioning_step: null,
	provisioning_step_details: null,
	provisioning_error: null,
	provisioning_attempt_count: null,
	last_http_status: null,
	last_http_body: null,
	credentials_last_rotated_at: null,
	app_rights_check_status: null,
	last_ttn_correlation_id: null,
	last_ttn_error_name: null,
}

describe('TTNCredentialsPanel', () => {
	let queryClient: QueryClient

	beforeEach(() => {
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		// Reset all mock functions
		credentialsRefetchMock.mockReset()
		statusRefetchMock.mockReset()
		provisionMutateMock.mockReset()
		startFreshMutateMock.mockReset()
		deepCleanMutateMock.mockReset()
		toastMock.success.mockReset()
		toastMock.error.mockReset()
	})

	const renderComponent = (props: { organizationId: string | null; readOnly?: boolean }) => {
		return render(
			<QueryClientProvider client={queryClient}>
				<TTNCredentialsPanel {...props} />
			</QueryClientProvider>
		)
	}

	// ============ RENDERING TESTS ============

	describe('Rendering', () => {
		it('renders loading skeleton initially', () => {
			// Never resolve to keep in loading state
			credentialsRefetchMock.mockReturnValue(new Promise(() => {}))

			renderComponent({ organizationId: 'test-org-id' })

			// Skeletons should be visible
			const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
			expect(skeletons.length).toBeGreaterThan(0)
		})

		it('renders credential fields after successful load', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			// Wait for data to load
			await waitFor(() => {
				expect(screen.getByText('Test Organization')).toBeInTheDocument()
			})

			// Credential labels should be visible
			expect(screen.getByText('Organization API Secret')).toBeInTheDocument()
			expect(screen.getByText('Application API Secret')).toBeInTheDocument()
			expect(screen.getByText('Webhook Secret')).toBeInTheDocument()
			expect(screen.getByText('Webhook URL')).toBeInTheDocument()
		})

		it('renders error when fetch fails', async () => {
			credentialsRefetchMock.mockRejectedValue(new Error('Network error'))

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Network error')).toBeInTheDocument()
			})

			expect(toastMock.error).toHaveBeenCalledWith('Network error')
		})

		it('shows "No organization selected" when organizationId is null', () => {
			renderComponent({ organizationId: null })

			expect(screen.getByText('No organization selected')).toBeInTheDocument()
		})
	})

	// ============ STATUS BADGE TESTS ============

	describe('Status Badges', () => {
		it('shows Fully Provisioned badge for ready status', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Fully Provisioned')).toBeInTheDocument()
			})
		})

		it('shows Failed badge for failed status', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Failed')).toBeInTheDocument()
			})
		})

		it('shows Not Configured badge when no credentials', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsMissing, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Not Configured')).toBeInTheDocument()
			})
		})
	})

	// ============ ACTION BUTTON TESTS ============

	describe('Action Buttons', () => {
		it('calls provision mutation when Retry Provisioning clicked', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })
			provisionMutateMock.mockResolvedValue({ success: true })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByRole('button', { name: /retry provisioning/i }))

			await waitFor(() => {
				expect(provisionMutateMock).toHaveBeenCalledWith({
					organizationId: 'test-org-id',
					action: 'retry',
				})
			})
		})

		it('calls startFresh mutation when Start Fresh clicked (failed state)', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })
			startFreshMutateMock.mockResolvedValue({ success: true })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Start Fresh')).toBeInTheDocument()
			})

			// Click Start Fresh (first one in failed state)
			const buttons = screen.getAllByRole('button', { name: /start fresh/i })
			fireEvent.click(buttons[0])

			await waitFor(() => {
				expect(startFreshMutateMock).toHaveBeenCalledWith({
					organizationId: 'test-org-id',
					region: 'nam1',
				})
			})
		})

		it('shows confirmation dialog for Deep Clean', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Deep Clean')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByRole('button', { name: /deep clean/i }))

			await waitFor(() => {
				expect(screen.getByText('Deep Clean TTN Resources?')).toBeInTheDocument()
			})
		})

		it('calls deepClean mutation after confirming dialog', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })
			deepCleanMutateMock.mockResolvedValue({ success: true, deleted_devices: 3 })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Deep Clean')).toBeInTheDocument()
			})

			// Open dialog
			fireEvent.click(screen.getByRole('button', { name: /deep clean/i }))

			await waitFor(() => {
				expect(screen.getByRole('checkbox')).toBeInTheDocument()
			})

			// Check confirmation checkbox
			fireEvent.click(screen.getByRole('checkbox'))

			// Click confirm button
			fireEvent.click(screen.getByRole('button', { name: /deep clean & reset/i }))

			await waitFor(() => {
				expect(deepCleanMutateMock).toHaveBeenCalledWith({
					organizationId: 'test-org-id',
				})
			})
		})

		it('calls getStatus on Check Status click', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })
			statusRefetchMock.mockResolvedValue({ data: { status: 'ready' }, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Check Status')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByRole('button', { name: /check status/i }))

			await waitFor(() => {
				expect(statusRefetchMock).toHaveBeenCalled()
			})
		})
	})

	// ============ ERROR HANDLING TESTS ============

	describe('Error Handling', () => {
		it('shows error toast on provision failure', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })
			provisionMutateMock.mockResolvedValue({
				success: false,
				error: 'Application creation failed',
				message: 'TTN API returned 403',
			})

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByRole('button', { name: /retry provisioning/i }))

			await waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledWith('Application creation failed', {
					description: 'TTN API returned 403',
				})
			})
		})

		it('shows "use Start Fresh" message when flag is set', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })
			provisionMutateMock.mockResolvedValue({
				success: false,
				use_start_fresh: true,
				message: 'App owned by different account',
			})

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Retry Provisioning')).toBeInTheDocument()
			})

			fireEvent.click(screen.getByRole('button', { name: /retry provisioning/i }))

			await waitFor(() => {
				expect(toastMock.error).toHaveBeenCalledWith('Cannot retry - use Start Fresh', {
					description: 'App owned by different account',
				})
			})
		})

		it('shows inline error details for failed state', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Provisioning Failed')).toBeInTheDocument()
			})

			expect(screen.getByText('Application already exists with different owner')).toBeInTheDocument()
		})
	})

	// ============ PERMISSION TESTS ============

	describe('Permissions (readOnly)', () => {
		it('shows View Only badge when readOnly=true', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id', readOnly: true })

			await waitFor(() => {
				expect(screen.getByText('View Only')).toBeInTheDocument()
			})
		})

		it('hides action buttons when readOnly=true', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id', readOnly: true })

			await waitFor(() => {
				expect(screen.getByText('View Only')).toBeInTheDocument()
			})

			// These action buttons should not be visible
			expect(screen.queryByRole('button', { name: /start fresh/i })).not.toBeInTheDocument()
			expect(screen.queryByRole('button', { name: /deep clean/i })).not.toBeInTheDocument()

			// Check Status is still visible (read-only operation)
			expect(screen.getByRole('button', { name: /check status/i })).toBeInTheDocument()
		})
	})

	// ============ TTN CONSOLE LINK TESTS ============

	describe('TTN Console Link', () => {
		it('shows link when application is configured', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				const link = screen.getByRole('link', { name: /open in ttn console/i })
				expect(link).toHaveAttribute(
					'href',
					'https://nam1.cloud.thethings.network/console/applications/ft-test-app'
				)
			})
		})

		it('hides link when no application configured', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsMissing, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Not Configured')).toBeInTheDocument()
			})

			expect(screen.queryByRole('link', { name: /open in ttn console/i })).not.toBeInTheDocument()
		})
	})

	// ============ STEP TRACKER TESTS ============

	describe('Provisioning Step Tracker', () => {
		it('shows step tracker when provisioning failed', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsFailed, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Provisioning Steps')).toBeInTheDocument()
			})

			expect(screen.getByText('Preflight Check')).toBeInTheDocument()
			expect(screen.getByText('Create Application')).toBeInTheDocument()
		})

		it('hides step tracker when provisioning is ready', async () => {
			credentialsRefetchMock.mockResolvedValue({ data: mockCredentialsReady, error: null })

			renderComponent({ organizationId: 'test-org-id' })

			await waitFor(() => {
				expect(screen.getByText('Fully Provisioned')).toBeInTheDocument()
			})

			expect(screen.queryByText('Provisioning Steps')).not.toBeInTheDocument()
		})
	})
})
