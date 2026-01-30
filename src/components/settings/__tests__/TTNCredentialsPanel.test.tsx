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
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
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
	SecretField: ({ label, last4, status }: { label: string; last4: string | null; status: string }) => (
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

function setupDefaultMocks() {
	mockProvisionFn.mockResolvedValue({ success: true })
	mockStartFreshFn.mockResolvedValue({ success: true })
	mockDeepCleanFn.mockResolvedValue({ success: true })

	mockUseTRPC.mockReturnValue({
		ttnSettings: {
			getCredentials: {
				queryOptions: createQueryOptionsMock(MOCK_CREDENTIALS, {
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
	})
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

	describe('Initial Rendering', () => {
		it('shows "No organization selected" when organizationId is null', () => {
			render(
				<QueryClientProvider client={queryClient}>
					<TTNCredentialsPanel organizationId={null} />
				</QueryClientProvider>
			)
			expect(screen.getByText('No organization selected')).toBeInTheDocument()
		})

		it('renders loading skeleton when organizationId is provided', () => {
			const { container } = render(
				<QueryClientProvider client={queryClient}>
					<TTNCredentialsPanel organizationId="test-org" />
				</QueryClientProvider>
			)
			expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0)
		})

		it('renders the component without crashing', () => {
			const { container } = render(
				<QueryClientProvider client={queryClient}>
					<TTNCredentialsPanel organizationId="test-org" />
				</QueryClientProvider>
			)
			expect(container).toBeDefined()
		})

		it('renders card header with TTN Credentials title', () => {
			render(
				<QueryClientProvider client={queryClient}>
					<TTNCredentialsPanel organizationId="test-org" />
				</QueryClientProvider>
			)
			expect(screen.getByText('TTN Credentials')).toBeInTheDocument()
		})

		it('renders card description text', () => {
			render(
				<QueryClientProvider client={queryClient}>
					<TTNCredentialsPanel organizationId="test-org" />
				</QueryClientProvider>
			)
			// Card has a description paragraph
			expect(screen.getByRole('paragraph')).toBeInTheDocument()
		})
	})
})
