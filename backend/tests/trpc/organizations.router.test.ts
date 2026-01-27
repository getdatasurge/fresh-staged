/**
 * Tests for Organizations tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - get: Organization retrieval
 * - update: Organization settings modification (owner only)
 * - listMembers: Member list retrieval
 * - stats: Dashboard statistics
 */

import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { organizationsRouter } from '../../src/routers/organizations.router.js'
import { createCallerFactory } from '../../src/trpc/index.js'

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
	getUserRoleInOrg: vi.fn(),
	getOrCreateProfile: vi.fn(),
}))

// Mock the organization services
vi.mock('../../src/services/organization.service.js', () => ({
	getOrganization: vi.fn(),
	updateOrganization: vi.fn(),
	listMembers: vi.fn(),
}))

vi.mock('../../src/services/organization-stats.service.js', () => ({
	getOrganizationStatsService: vi.fn(),
}))

describe('Organizations tRPC Router', () => {
	const createCaller = createCallerFactory(organizationsRouter)

	// Get the mocked functions
	let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>
	let mockGetOrCreateProfile: ReturnType<typeof vi.fn>
	let mockGetOrganization: ReturnType<typeof vi.fn>
	let mockUpdateOrganization: ReturnType<typeof vi.fn>
	let mockListMembers: ReturnType<typeof vi.fn>
	let mockGetOrganizationStatsService: ReturnType<typeof vi.fn>

	// Create context that simulates authenticated user
	const createOrgContext = (role: string = 'admin') => ({
		req: {} as any,
		res: {} as any,
		user: {
			id: 'user-123',
			email: 'test@example.com',
			name: 'Test User',
		},
	})

	beforeEach(async () => {
		vi.clearAllMocks()

		// Import the mocked modules to get references to mocked functions
		const userService = await import('../../src/services/user.service.js')
		const orgService =
			await import('../../src/services/organization.service.js')
		const statsService =
			await import('../../src/services/organization-stats.service.js')

		mockGetUserRoleInOrg = userService.getUserRoleInOrg as any
		mockGetOrCreateProfile = userService.getOrCreateProfile as any
		mockGetOrganization = orgService.getOrganization as any
		mockUpdateOrganization = orgService.updateOrganization as any
		mockListMembers = orgService.listMembers as any
		mockGetOrganizationStatsService =
			statsService.getOrganizationStatsService as any
	})

	describe('get', () => {
		it('should return organization data', async () => {
			// Mock middleware checks
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			const mockOrg = {
				id: '123e4567-e89b-42d3-a456-426614174000',
				name: 'Test Org',
				slug: 'test-org',
				timezone: 'America/New_York',
				complianceMode: 'standard' as const,
				sensorLimit: 100,
				logoUrl: null,
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-01'),
			}
			mockGetOrganization.mockResolvedValue(mockOrg)

			const ctx = createOrgContext()
			const caller = createCaller(ctx)

			const result = await caller.get({
				organizationId: '123e4567-e89b-42d3-a456-426614174000',
			})

			expect(result).toEqual(mockOrg)
			expect(mockGetOrganization).toHaveBeenCalledWith(
				'123e4567-e89b-42d3-a456-426614174000',
			)
		})

		it('should throw NOT_FOUND when organization does not exist', async () => {
			// Mock middleware checks
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			mockGetOrganization.mockResolvedValue(null)

			const ctx = createOrgContext()
			const caller = createCaller(ctx)

			await expect(
				caller.get({ organizationId: '123e4567-e89b-42d3-a456-426614174000' }),
			).rejects.toThrow(TRPCError)

			await expect(
				caller.get({ organizationId: '123e4567-e89b-42d3-a456-426614174000' }),
			).rejects.toMatchObject({
				code: 'NOT_FOUND',
				message: 'Organization not found',
			})
		})
	})

	describe('update', () => {
		it('should update organization when user is owner', async () => {
			// Mock middleware checks - owner role
			mockGetUserRoleInOrg.mockResolvedValue('owner')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			const updatedOrg = {
				id: '123e4567-e89b-42d3-a456-426614174000',
				name: 'Updated Org',
				slug: 'test-org',
				timezone: 'America/Los_Angeles',
				complianceMode: 'haccp' as const,
				sensorLimit: 100,
				logoUrl: 'https://example.com/logo.png',
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-15'),
			}
			mockUpdateOrganization.mockResolvedValue(updatedOrg)

			const ctx = createOrgContext('owner')
			const caller = createCaller(ctx)

			const result = await caller.update({
				organizationId: '123e4567-e89b-42d3-a456-426614174000',
				data: {
					name: 'Updated Org',
					timezone: 'America/Los_Angeles',
					complianceMode: 'haccp',
					logoUrl: 'https://example.com/logo.png',
				},
			})

			expect(result).toEqual(updatedOrg)
			expect(mockUpdateOrganization).toHaveBeenCalledWith(
				'123e4567-e89b-42d3-a456-426614174000',
				{
					name: 'Updated Org',
					timezone: 'America/Los_Angeles',
					complianceMode: 'haccp',
					logoUrl: 'https://example.com/logo.png',
				},
			)
		})

		it('should throw FORBIDDEN when user is not owner', async () => {
			// Mock middleware checks - admin role (not owner)
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			const ctx = createOrgContext('admin')
			const caller = createCaller(ctx)

			await expect(
				caller.update({
					organizationId: '123e4567-e89b-42d3-a456-426614174000',
					data: { name: 'Updated Org' },
				}),
			).rejects.toThrow(TRPCError)

			await expect(
				caller.update({
					organizationId: '123e4567-e89b-42d3-a456-426614174000',
					data: { name: 'Updated Org' },
				}),
			).rejects.toMatchObject({
				code: 'FORBIDDEN',
				message: 'Only organization owners can update settings',
			})
		})

		it('should throw NOT_FOUND when organization does not exist', async () => {
			// Mock middleware checks - owner role
			mockGetUserRoleInOrg.mockResolvedValue('owner')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			mockUpdateOrganization.mockResolvedValue(null)

			const ctx = createOrgContext('owner')
			const caller = createCaller(ctx)

			await expect(
				caller.update({
					organizationId: '123e4567-e89b-42d3-a456-426614174000',
					data: { name: 'Updated Org' },
				}),
			).rejects.toThrow(TRPCError)

			await expect(
				caller.update({
					organizationId: '123e4567-e89b-42d3-a456-426614174000',
					data: { name: 'Updated Org' },
				}),
			).rejects.toMatchObject({
				code: 'NOT_FOUND',
				message: 'Organization not found',
			})
		})
	})

	describe('listMembers', () => {
		it('should return member list', async () => {
			// Mock middleware checks
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			const mockMembers = [
				{
					userId: '223e4567-e89b-42d3-a456-426614174001',
					email: 'owner@example.com',
					fullName: 'Owner User',
					role: 'owner' as const,
					joinedAt: new Date('2024-01-01'),
				},
				{
					userId: '323e4567-e89b-42d3-a456-426614174002',
					email: 'admin@example.com',
					fullName: 'Admin User',
					role: 'admin' as const,
					joinedAt: new Date('2024-01-05'),
				},
			]
			mockListMembers.mockResolvedValue(mockMembers)

			const ctx = createOrgContext()
			const caller = createCaller(ctx)

			const result = await caller.listMembers({
				organizationId: '123e4567-e89b-42d3-a456-426614174000',
			})

			expect(result).toEqual(mockMembers)
			expect(mockListMembers).toHaveBeenCalledWith(
				'123e4567-e89b-42d3-a456-426614174000',
			)
		})

		it('should return empty array when no members', async () => {
			// Mock middleware checks
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			mockListMembers.mockResolvedValue([])

			const ctx = createOrgContext()
			const caller = createCaller(ctx)

			const result = await caller.listMembers({
				organizationId: '123e4567-e89b-42d3-a456-426614174000',
			})

			expect(result).toEqual([])
		})
	})

	describe('stats', () => {
		it('should return organization stats', async () => {
			// Mock middleware checks
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			const mockStats = {
				organizationId: '123e4567-e89b-42d3-a456-426614174000',
				unitCounts: {
					total: 10,
					normal: 7,
					warning: 2,
					critical: 1,
					offline: 0,
				},
				alertCounts: {
					pending: 3,
					acknowledged: 2,
					resolved: 15,
					total: 20,
				},
				compliancePercentage: 95.5,
				memberCount: 10,
				siteCount: 5,
				worstState: 'critical' as const,
				lastUpdated: new Date('2024-01-15T12:00:00Z'),
			}

			const mockStatsService = {
				getOrganizationStats: vi.fn().mockResolvedValue(mockStats),
			}
			mockGetOrganizationStatsService.mockReturnValue(mockStatsService)

			const ctx = createOrgContext()
			const caller = createCaller(ctx)

			const result = await caller.stats({
				organizationId: '123e4567-e89b-42d3-a456-426614174000',
			})

			expect(result).toEqual(mockStats)
			expect(mockStatsService.getOrganizationStats).toHaveBeenCalledWith(
				'123e4567-e89b-42d3-a456-426614174000',
			)
		})

		it('should throw INTERNAL_SERVER_ERROR when stats service not initialized', async () => {
			// Mock middleware checks
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' })

			mockGetOrganizationStatsService.mockReturnValue(null)

			const ctx = createOrgContext()
			const caller = createCaller(ctx)

			await expect(
				caller.stats({
					organizationId: '123e4567-e89b-42d3-a456-426614174000',
				}),
			).rejects.toThrow(TRPCError)

			await expect(
				caller.stats({
					organizationId: '123e4567-e89b-42d3-a456-426614174000',
				}),
			).rejects.toMatchObject({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Organization stats service not initialized',
			})
		})
	})
})
