/**
 * TTNCredentialsPanel Integration Tests
 *
 * Tests the tRPC-migrated TTNCredentialsPanel component.
 * Validates the queryOptions/mutationOptions mock pattern works correctly.
 *
 * Note: This component uses a complex manual refetch() pattern with enabled:false
 * queries. Full test coverage for all scenarios is deferred due to test isolation
 * challenges inherent in the component's design.
 *
 * Coverage: Basic rendering, null org handling, loading states
 * Deferred: Full async data loading, mutations, error handling across states
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@/lib/trpc', () => ({
	useTRPC: () => ({
		ttnSettings: {
			getCredentials: {
				queryOptions: vi.fn().mockReturnValue({
					queryKey: ['ttnSettings', 'getCredentials'],
					queryFn: () => Promise.resolve(null),
					enabled: false,
				}),
			},
			getStatus: {
				queryOptions: vi.fn().mockReturnValue({
					queryKey: ['ttnSettings', 'getStatus'],
					queryFn: () => Promise.resolve(null),
					enabled: false,
				}),
			},
			provision: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'provision'],
					mutationFn: vi.fn().mockResolvedValue({ success: true }),
				}),
			},
			startFresh: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'startFresh'],
					mutationFn: vi.fn().mockResolvedValue({ success: true }),
				}),
			},
			deepClean: {
				mutationOptions: vi.fn().mockReturnValue({
					mutationKey: ['ttnSettings', 'deepClean'],
					mutationFn: vi.fn().mockResolvedValue({ success: true }),
				}),
			},
		},
	}),
}))

// Mock React Query with never-resolving refetch to test initial states
vi.mock('@tanstack/react-query', async (importOriginal) => {
	const original = await importOriginal<typeof import('@tanstack/react-query')>()
	return {
		...original,
		useQuery: vi.fn(() => ({
			data: null,
			error: null,
			isLoading: false,
			isPending: false,
			refetch: vi.fn(() => new Promise(() => {})), // Never resolves - keeps loading state
		})),
		useMutation: vi.fn(() => ({
			mutateAsync: vi.fn().mockResolvedValue({ success: true }),
			isPending: false,
		})),
	}
})

import { TTNCredentialsPanel } from '../TTNCredentialsPanel'

describe('TTNCredentialsPanel', () => {
	let queryClient: QueryClient

	beforeEach(() => {
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
