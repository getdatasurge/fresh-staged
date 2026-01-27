import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	useAcknowledgeAlert,
	useFetchAlerts,
	useFetchUnitAlerts,
	useResolveAlert,
} from '../useUnitAlerts'

// Mock dependencies
vi.mock('@stackframe/react', () => ({
	useUser: () => ({
		id: 'test-user-id',
		getAuthJson: vi.fn(() => ({
			accessToken: 'test-token',
		})),
	}),
}))

vi.mock('../useOrgScope', () => ({
	useOrgScope: () => ({
		orgId: 'test-org-id',
		isReady: true,
	}),
}))

const mockUseTRPC = vi.fn()

vi.mock('@/lib/trpc', () => ({
	useTRPC: () => mockUseTRPC(),
}))

describe('useAlerts hooks', () => {
	let queryClient: QueryClient
	let wrapper: ({ children }: { children: ReactNode }) => JSX.Element

	beforeEach(() => {
		vi.clearAllMocks()
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})
		wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		)
	})

	describe('useFetchUnitAlerts', () => {
		it('fetches alerts for a specific unit', async () => {
			const mockAlerts = [
				{
					id: 'alert-1',
					unitId: 'unit-1',
					type: 'temperature',
					status: 'active',
					severity: 'critical',
				},
			]

			const mockUseQuery = vi.fn().mockReturnValue({
				data: mockAlerts,
				isSuccess: true,
				isLoading: false,
				error: null,
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					listByOrg: {
						useQuery: mockUseQuery,
					},
				},
			})

			const { result } = renderHook(() => useFetchUnitAlerts('unit-1'), {
				wrapper,
			})

			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			expect(result.current.data).toEqual(mockAlerts)
			expect(mockUseQuery).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: 'test-org-id',
					unitId: 'unit-1',
				}),
				expect.any(Object),
			)
		})

		it('passes filter parameters to API', async () => {
			const mockUseQuery = vi.fn().mockReturnValue({
				data: [],
				isSuccess: true,
				isLoading: false,
				error: null,
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					listByOrg: {
						useQuery: mockUseQuery,
					},
				},
			})

			const { result } = renderHook(
				() =>
					useFetchUnitAlerts('unit-1', {
						status: 'active',
						page: 2,
						limit: 10,
					}),
				{ wrapper },
			)

			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			expect(mockUseQuery).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: 'test-org-id',
					unitId: 'unit-1',
					status: 'active',
					page: 2,
					limit: 10,
				}),
				expect.any(Object),
			)
		})

		it('is disabled when unitId is null', () => {
			const mockUseQuery = vi.fn().mockReturnValue({
				data: undefined,
				isSuccess: false,
				isLoading: false,
				error: null,
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					listByOrg: {
						useQuery: mockUseQuery,
					},
				},
			})

			const { result } = renderHook(() => useFetchUnitAlerts(null), { wrapper })

			expect(result.current.data).toBeUndefined()
			expect(mockUseQuery).toHaveBeenCalledWith(
				expect.objectContaining({
					unitId: '',
				}),
				expect.objectContaining({
					enabled: false,
				}),
			)
		})
	})

	describe('useFetchAlerts', () => {
		it('fetches all alerts for organization', async () => {
			const mockAlerts = [
				{
					id: 'alert-1',
					unitId: 'unit-1',
					type: 'temperature',
					status: 'active',
				},
				{ id: 'alert-2', unitId: 'unit-2', type: 'offline', status: 'active' },
			]

			const mockUseQuery = vi.fn().mockReturnValue({
				data: mockAlerts,
				isSuccess: true,
				isLoading: false,
				error: null,
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					listByOrg: {
						useQuery: mockUseQuery,
					},
				},
			})

			const { result } = renderHook(() => useFetchAlerts(), { wrapper })

			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			expect(result.current.data).toEqual(mockAlerts)
			expect(mockUseQuery).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: 'test-org-id',
				}),
				expect.any(Object),
			)
		})

		it('passes filter parameters to API', async () => {
			const mockUseQuery = vi.fn().mockReturnValue({
				data: [],
				isSuccess: true,
				isLoading: false,
				error: null,
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					listByOrg: {
						useQuery: mockUseQuery,
					},
				},
			})

			const { result } = renderHook(
				() =>
					useFetchAlerts({
						status: ['active', 'acknowledged'],
						unitId: 'unit-1',
						siteId: 'site-1',
						page: 1,
						limit: 20,
					}),
				{ wrapper },
			)

			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			expect(mockUseQuery).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: 'test-org-id',
					status: ['active', 'acknowledged'],
					unitId: 'unit-1',
					siteId: 'site-1',
					page: 1,
					limit: 20,
				}),
				expect.any(Object),
			)
		})
	})

	describe('useAcknowledgeAlert', () => {
		it('acknowledges an alert', async () => {
			const mockAcknowledgedAlert = {
				id: 'alert-1',
				status: 'acknowledged',
			}

			const mockUseMutation = vi.fn().mockReturnValue({
				mutateAsync: vi.fn().mockResolvedValue(mockAcknowledgedAlert),
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					acknowledge: {
						useMutation: mockUseMutation,
					},
				},
			})

			const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper })

			await act(async () => {
				await result.current.mutateAsync({
					alertId: 'alert-1',
					notes: 'Investigating',
				})
			})

			expect(mockUseMutation).toHaveBeenCalled()
		})

		it('invalidates alerts cache after acknowledgement', async () => {
			const mockAcknowledgedAlert = {
				id: 'alert-1',
				status: 'acknowledged',
			}

			const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

			const mockUseMutation = vi.fn().mockImplementation(options => ({
				mutateAsync: vi.fn().mockImplementation(async () => {
					options.onSuccess()
					return mockAcknowledgedAlert
				}),
			}))

			mockUseTRPC.mockReturnValue({
				alerts: {
					acknowledge: {
						useMutation: mockUseMutation,
					},
				},
			})

			// Pre-populate cache
			queryClient.setQueryData(
				['org', 'test-org-id', 'alerts'],
				[{ id: 'alert-1', status: 'active' }],
			)

			const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper })

			await act(async () => {
				await result.current.mutateAsync({ alertId: 'alert-1' })
			})

			expect(invalidateSpy).toHaveBeenCalled()
		})

		it('handles acknowledgement errors', async () => {
			const mockUseMutation = vi.fn().mockReturnValue({
				mutateAsync: vi.fn().mockRejectedValue(new Error('API Error')),
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					acknowledge: {
						useMutation: mockUseMutation,
					},
				},
			})

			const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper })

			await act(async () => {
				await expect(
					result.current.mutateAsync({ alertId: 'alert-1' }),
				).rejects.toThrow('API Error')
			})
		})
	})

	describe('useResolveAlert', () => {
		it('resolves an alert with corrective action', async () => {
			const mockResolvedAlert = {
				id: 'alert-1',
				status: 'resolved',
			}

			const mockUseMutation = vi.fn().mockReturnValue({
				mutateAsync: vi.fn().mockResolvedValue(mockResolvedAlert),
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					resolve: {
						useMutation: mockUseMutation,
					},
				},
			})

			const { result } = renderHook(() => useResolveAlert(), { wrapper })

			await act(async () => {
				await result.current.mutateAsync({
					alertId: 'alert-1',
					resolution: 'Temperature normalized',
					correctiveAction: 'Adjusted thermostat',
				})
			})

			expect(mockUseMutation).toHaveBeenCalled()
		})

		it('invalidates alerts cache after resolution', async () => {
			const mockResolvedAlert = {
				id: 'alert-1',
				status: 'resolved',
			}

			const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

			const mockUseMutation = vi.fn().mockImplementation(options => ({
				mutateAsync: vi.fn().mockImplementation(async () => {
					options.onSuccess()
					return mockResolvedAlert
				}),
			}))

			mockUseTRPC.mockReturnValue({
				alerts: {
					resolve: {
						useMutation: mockUseMutation,
					},
				},
			})

			// Pre-populate cache
			queryClient.setQueryData(
				['org', 'test-org-id', 'alerts'],
				[{ id: 'alert-1', status: 'acknowledged' }],
			)

			const { result } = renderHook(() => useResolveAlert(), { wrapper })

			await act(async () => {
				await result.current.mutateAsync({
					alertId: 'alert-1',
					resolution: 'Fixed',
				})
			})

			expect(invalidateSpy).toHaveBeenCalled()
		})

		it('handles resolution errors', async () => {
			const mockUseMutation = vi.fn().mockReturnValue({
				mutateAsync: vi.fn().mockRejectedValue(new Error('Resolution failed')),
			})

			mockUseTRPC.mockReturnValue({
				alerts: {
					resolve: {
						useMutation: mockUseMutation,
					},
				},
			})

			const { result } = renderHook(() => useResolveAlert(), { wrapper })

			await act(async () => {
				await expect(
					result.current.mutateAsync({
						alertId: 'alert-1',
						resolution: 'Fixed',
					}),
				).rejects.toThrow('Resolution failed')
			})
		})
	})
})
