import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Stack Auth before importing hook
vi.mock('@stackframe/react', () => ({
	useUser: vi.fn(() => ({
		getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
	})),
	useStackApp: vi.fn(() => ({})),
}))

import { useNavTree } from '../useNavTree'

// Mock dependencies
vi.mock('@/lib/supabase-placeholder', () => ({
	supabase: {
		auth: {
			getSession: vi.fn(() =>
				Promise.resolve({
					data: {
						session: {
							access_token: 'test-token',
						},
					},
				}),
			),
		},
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					is: vi.fn(() => ({
						not: vi.fn(() => ({
							data: [],
							error: null,
						})),
					})),
				})),
			})),
		})),
	},
}))

const mockUseTRPC = vi.fn()

vi.mock('@/lib/trpc', () => ({
	useTRPC: () => mockUseTRPC(),
}))

describe('useSites hooks', () => {
	let queryClient: QueryClient
	let wrapper: ({ children }: { children: ReactNode }) => JSX.Element

	beforeEach(() => {
		vi.clearAllMocks()
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})
		wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		)
	})

	describe('useNavTree', () => {
		it('fetches sites and units using tRPC', async () => {
			const mockSites = [
				{
					id: 'site-1',
					name: 'Site 1',
					organizationId: 'org-1',
					isActive: true,
				},
				{
					id: 'site-2',
					name: 'Site 2',
					organizationId: 'org-1',
					isActive: true,
				},
			]

			const mockUnits = [
				{
					id: 'unit-1',
					name: 'Unit 1',
					unitType: 'freezer',
					status: 'ok',
					areaId: 'area-1',
					areaName: 'Area 1',
					siteId: 'site-1',
				},
			]

			const mockSitesQuery = {
				data: mockSites,
				isLoading: false,
				error: null,
			}

			const mockUnitsQuery = {
				data: mockUnits,
				isLoading: false,
				error: null,
			}

			mockUseTRPC.mockReturnValue({
				sites: {
					list: {
						useQuery: vi.fn().mockReturnValue(mockSitesQuery),
					},
				},
				units: {
					listByOrg: {
						useQuery: vi.fn().mockReturnValue(mockUnitsQuery),
					},
				},
			})

			const { result } = renderHook(() => useNavTree('org-1'), { wrapper })

			await waitFor(() => expect(result.current.isLoading).toBe(false))

			expect(result.current.sites).toHaveLength(2)
		})

		it('builds navigation tree structure', async () => {
			const mockSites = [
				{
					id: 'site-1',
					name: 'Site 1',
					organizationId: 'org-1',
					isActive: true,
				},
			]

			const mockUnits = [
				{
					id: 'unit-1',
					name: 'Unit 1',
					unitType: 'freezer',
					status: 'ok',
					areaId: 'area-1',
					areaName: 'Area 1',
					siteId: 'site-1',
				},
			]

			const mockSitesQuery = {
				data: mockSites,
				isLoading: false,
				error: null,
			}

			const mockUnitsQuery = {
				data: mockUnits,
				isLoading: false,
				error: null,
			}

			mockUseTRPC.mockReturnValue({
				sites: {
					list: {
						useQuery: vi.fn().mockReturnValue(mockSitesQuery),
					},
				},
				units: {
					listByOrg: {
						useQuery: vi.fn().mockReturnValue(mockUnitsQuery),
					},
				},
			})

			const { result } = renderHook(() => useNavTree('org-1'), { wrapper })

			await waitFor(() => expect(result.current.isLoading).toBe(false))

			const site = result.current.sites[0]
			expect(site.siteId).toBe('site-1')
			expect(site.siteName).toBe('Site 1')
			expect(site.units).toHaveLength(1)
			expect(site.units[0].unitId).toBe('unit-1')
			expect(site.units[0].areaName).toBe('Area 1')
		})

		it('detects single site correctly', async () => {
			const mockSites = [
				{
					id: 'site-1',
					name: 'Single Site',
					organizationId: 'org-1',
					isActive: true,
				},
			]

			const mockSitesQuery = {
				data: mockSites,
				isLoading: false,
				error: null,
			}

			const mockUnitsQuery = {
				data: [],
				isLoading: false,
				error: null,
			}

			mockUseTRPC.mockReturnValue({
				sites: {
					list: {
						useQuery: vi.fn().mockReturnValue(mockSitesQuery),
					},
				},
				units: {
					listByOrg: {
						useQuery: vi.fn().mockReturnValue(mockUnitsQuery),
					},
				},
			})

			const { result } = renderHook(() => useNavTree('org-1'), { wrapper })

			await waitFor(() => expect(result.current.isLoading).toBe(false))

			expect(result.current.hasSingleSite).toBe(true)
		})

		it('handles multiple sites', async () => {
			const mockSites = [
				{
					id: 'site-1',
					name: 'Site 1',
					organizationId: 'org-1',
					isActive: true,
				},
				{
					id: 'site-2',
					name: 'Site 2',
					organizationId: 'org-1',
					isActive: true,
				},
			]

			const mockSitesQuery = {
				data: mockSites,
				isLoading: false,
				error: null,
			}

			const mockUnitsQuery = {
				data: [],
				isLoading: false,
				error: null,
			}

			mockUseTRPC.mockReturnValue({
				sites: {
					list: {
						useQuery: vi.fn().mockReturnValue(mockSitesQuery),
					},
				},
				units: {
					listByOrg: {
						useQuery: vi.fn().mockReturnValue(mockUnitsQuery),
					},
				},
			})

			const { result } = renderHook(() => useNavTree('org-1'), { wrapper })

			await waitFor(() => expect(result.current.isLoading).toBe(false))

			expect(result.current.hasSingleSite).toBe(false)
			expect(result.current.sites).toHaveLength(2)
		})

		it('returns empty when organizationId is null', () => {
			mockUseTRPC.mockReturnValue({
				sites: {
					list: {
						useQuery: vi.fn().mockReturnValue({
							data: null,
							isLoading: false,
							error: null,
						}),
					},
				},
				units: {
					listByOrg: {
						useQuery: vi.fn().mockReturnValue({
							data: null,
							isLoading: false,
							error: null,
						}),
					},
				},
			})

			const { result } = renderHook(() => useNavTree(null), { wrapper })

			expect(result.current.sites).toEqual([])
			expect(result.current.hasSingleSite).toBe(false)
		})

		it('handles errors gracefully', async () => {
			const mockSitesQuery = {
				data: null,
				isLoading: false,
				error: new Error('API Error'),
			}

			const mockUnitsQuery = {
				data: null,
				isLoading: false,
				error: null,
			}

			mockUseTRPC.mockReturnValue({
				sites: {
					list: {
						useQuery: vi.fn().mockReturnValue(mockSitesQuery),
					},
				},
				units: {
					listByOrg: {
						useQuery: vi.fn().mockReturnValue(mockUnitsQuery),
					},
				},
			})

			const { result } = renderHook(() => useNavTree('org-1'), { wrapper })

			await waitFor(() => expect(result.current.isLoading).toBe(false))

			expect(result.current.error).toBeDefined()
			expect(result.current.sites).toEqual([])
		})
	})
})
