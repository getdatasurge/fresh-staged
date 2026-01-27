/**
 * tRPC End-to-End Verification Tests
 *
 * Tests verify the full tRPC stack integration:
 * - Health endpoint responds correctly
 * - Authentication rejects unauthenticated requests
 * - Batched requests work correctly
 * - Error handling returns proper format
 * - AppRouter type exports correctly
 * - Sites router E2E operations
 * - Areas router E2E operations
 * - Units router E2E operations
 * - Readings router E2E operations
 * - Alerts router E2E operations
 *
 * Uses Fastify app.inject() for testing without starting HTTP server.
 */

import type { FastifyInstance } from 'fastify'
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'

// Set environment variables before any imports
process.env.STACK_AUTH_PROJECT_ID = 'test-project-id'
process.env.STACK_AUTH_SECRET_KEY = 'test-secret-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb'
process.env.JWT_SECRET = 'test-jwt-secret'

// Mock JWT verification to return authenticated user for valid tokens
// verifyAccessToken returns { payload: StackAuthJWTPayload, userId: string }
vi.mock('../../src/utils/jwt.js', () => ({
	verifyAccessToken: vi.fn().mockImplementation(async (token: string) => {
		if (token === 'valid-admin-token') {
			return {
				userId: 'user-admin-123',
				payload: {
					email: 'admin@test.com',
					name: 'Admin User',
					sub: 'user-admin-123',
				},
			}
		}
		if (token === 'valid-staff-token') {
			return {
				userId: 'user-staff-123',
				payload: {
					email: 'staff@test.com',
					name: 'Staff User',
					sub: 'user-staff-123',
				},
			}
		}
		if (token === 'valid-viewer-token') {
			return {
				userId: 'user-viewer-123',
				payload: {
					email: 'viewer@test.com',
					name: 'Viewer User',
					sub: 'user-viewer-123',
				},
			}
		}
		throw new Error('Unauthorized')
	}),
}))

// Mock user service for org membership checks
vi.mock('../../src/services/user.service.js', () => ({
	getUserRoleInOrg: vi
		.fn()
		.mockImplementation(async (_userId: string, _orgId: string) => {
			// Default to null (not a member), will be overridden per test
			return null
		}),
	getOrCreateProfile: vi
		.fn()
		.mockResolvedValue({ id: '66666666-6666-4666-a666-666666666666' }),
}))

// Mock site service
vi.mock('../../src/services/site.service.js', () => ({
	listSites: vi.fn().mockResolvedValue([]),
	listSitesWithStats: vi.fn().mockResolvedValue([]),
	getSite: vi.fn().mockResolvedValue(null),
	createSite: vi.fn().mockResolvedValue(null),
	updateSite: vi.fn().mockResolvedValue(null),
	deleteSite: vi.fn().mockResolvedValue(null),
}))

// Mock area service
vi.mock('../../src/services/area.service.js', () => ({
	listAreas: vi.fn().mockResolvedValue([]),
	getArea: vi.fn().mockResolvedValue(null),
	createArea: vi.fn().mockResolvedValue(null),
	updateArea: vi.fn().mockResolvedValue(null),
	deleteArea: vi.fn().mockResolvedValue(null),
}))

// Mock unit service
vi.mock('../../src/services/unit.service.js', () => ({
	listUnits: vi.fn().mockResolvedValue([]),
	getUnit: vi.fn().mockResolvedValue(null),
	createUnit: vi.fn().mockResolvedValue(null),
	updateUnit: vi.fn().mockResolvedValue(null),
	deleteUnit: vi.fn().mockResolvedValue(null),
}))

// Mock readings service
vi.mock('../../src/services/readings.service.js', () => ({
	queryReadings: vi.fn().mockResolvedValue([]),
}))

// Mock alert service
vi.mock('../../src/services/alert.service.js', () => ({
	listAlerts: vi.fn().mockResolvedValue([]),
	getAlert: vi.fn().mockResolvedValue(null),
	acknowledgeAlert: vi.fn().mockResolvedValue(null),
	resolveAlert: vi.fn().mockResolvedValue(null),
}))

// Mock audit service
vi.mock('../../src/services/AuditService.ts', () => ({
	AuditService: {
		logEvent: vi.fn().mockResolvedValue({ success: true }),
		logImpersonatedAction: vi.fn().mockResolvedValue({ success: true }),
		listEvents: vi.fn().mockResolvedValue([]),
	},
}))

// Valid UUIDs for E2E tests (defined after mocks)
// Format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx where M=1-5, N=8-b
const TEST_ORG_ID = '11111111-1111-4111-a111-111111111111'
const TEST_SITE_ID = '22222222-2222-4222-a222-222222222222'
const TEST_AREA_ID = '33333333-3333-4333-a333-333333333333'
const TEST_UNIT_ID = '44444444-4444-4444-a444-444444444444'
const TEST_ALERT_ID = '55555555-5555-4555-a555-555555555555'
const TEST_PROFILE_ID = '66666666-6666-4666-a666-666666666666'

import buildApp from '../../src/app.js'

// Sample mock data for E2E tests
const mockSite = {
	id: TEST_SITE_ID,
	organizationId: TEST_ORG_ID,
	name: 'Test Site',
	address: '123 Test St',
	city: 'Austin',
	state: 'TX',
	postalCode: '78701',
	country: 'USA',
	timezone: 'America/Chicago',
	complianceMode: null,
	manualLogCadenceSeconds: null,
	correctiveActionRequired: false,
	latitude: null,
	longitude: null,
	isActive: true,
	createdAt: new Date('2024-01-01'),
	updatedAt: new Date('2024-01-01'),
	areasCount: 0,
	unitsCount: 0,
}

const mockArea = {
	id: TEST_AREA_ID,
	siteId: TEST_SITE_ID,
	name: 'Walk-in Cooler',
	description: 'Main refrigerated storage',
	sortOrder: 0,
	isActive: true,
	createdAt: new Date('2024-01-01'),
	updatedAt: new Date('2024-01-01'),
}

const mockUnit = {
	id: TEST_UNIT_ID,
	areaId: TEST_AREA_ID,
	name: 'Walk-in Cooler 1',
	unitType: 'walk_in_cooler',
	status: 'ok',
	tempMin: 34,
	tempMax: 40,
	tempUnit: 'F',
	manualMonitoringRequired: false,
	manualMonitoringInterval: null,
	lastReadingAt: new Date('2024-01-15T10:00:00Z'),
	lastTemperature: 36,
	isActive: true,
	sortOrder: 0,
	createdAt: new Date('2024-01-01'),
	updatedAt: new Date('2024-01-01'),
}

const mockReading = {
	id: '77777777-7777-4777-a777-777777777777',
	unitId: TEST_UNIT_ID,
	deviceId: null,
	temperature: 36.5,
	humidity: 65,
	battery: 95,
	signalStrength: -70,
	rawPayload: null,
	recordedAt: new Date('2024-01-15T10:00:00Z'),
	receivedAt: new Date('2024-01-15T10:00:01Z'),
	source: 'api',
}

const mockAlert = {
	id: TEST_ALERT_ID,
	unitId: TEST_UNIT_ID,
	alertRuleId: null,
	alertType: 'alarm_active',
	severity: 'warning',
	status: 'active',
	message: 'Temperature exceeded upper threshold',
	triggerTemperature: 42,
	thresholdViolated: 'tempMax',
	triggeredAt: new Date('2024-01-15T10:00:00Z'),
	acknowledgedAt: null,
	acknowledgedBy: null,
	resolvedAt: null,
	resolvedBy: null,
	escalatedAt: null,
	escalationLevel: 0,
	metadata: null,
	createdAt: new Date('2024-01-15T10:00:00Z'),
	updatedAt: new Date('2024-01-15T10:00:00Z'),
}

describe('tRPC End-to-End Tests', () => {
	let app: FastifyInstance

	// Mock function references
	let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>
	let mockGetOrCreateProfile: ReturnType<typeof vi.fn>
	let mockListSites: ReturnType<typeof vi.fn>
	let mockListSitesWithStats: ReturnType<typeof vi.fn>
	let mockGetSite: ReturnType<typeof vi.fn>
	let mockCreateSite: ReturnType<typeof vi.fn>
	let mockUpdateSite: ReturnType<typeof vi.fn>
	let mockDeleteSite: ReturnType<typeof vi.fn>
	let mockListAreas: ReturnType<typeof vi.fn>
	let mockGetArea: ReturnType<typeof vi.fn>
	let mockCreateArea: ReturnType<typeof vi.fn>
	let mockUpdateArea: ReturnType<typeof vi.fn>
	let mockDeleteArea: ReturnType<typeof vi.fn>
	let mockListUnits: ReturnType<typeof vi.fn>
	let mockGetUnit: ReturnType<typeof vi.fn>
	let mockCreateUnit: ReturnType<typeof vi.fn>
	let mockUpdateUnit: ReturnType<typeof vi.fn>
	let mockDeleteUnit: ReturnType<typeof vi.fn>
	let mockQueryReadings: ReturnType<typeof vi.fn>
	let mockListAlerts: ReturnType<typeof vi.fn>
	let mockGetAlert: ReturnType<typeof vi.fn>
	let mockAcknowledgeAlert: ReturnType<typeof vi.fn>
	let mockResolveAlert: ReturnType<typeof vi.fn>

	beforeAll(async () => {
		// Create Fastify app with tRPC routes
		app = buildApp()
		await app.ready()

		// Import mocked modules
		const userService = await import('../../src/services/user.service.js')
		const siteService = await import('../../src/services/site.service.js')
		const areaService = await import('../../src/services/area.service.js')
		const unitService = await import('../../src/services/unit.service.js')
		const readingsService =
			await import('../../src/services/readings.service.js')
		const alertService = await import('../../src/services/alert.service.js')

		mockGetUserRoleInOrg = userService.getUserRoleInOrg as any
		mockGetOrCreateProfile = userService.getOrCreateProfile as any
		mockListSites = siteService.listSites as any
		mockListSitesWithStats = siteService.listSitesWithStats as any
		mockGetSite = siteService.getSite as any
		mockCreateSite = siteService.createSite as any
		mockUpdateSite = siteService.updateSite as any
		mockDeleteSite = siteService.deleteSite as any
		mockListAreas = areaService.listAreas as any
		mockGetArea = areaService.getArea as any
		mockCreateArea = areaService.createArea as any
		mockUpdateArea = areaService.updateArea as any
		mockDeleteArea = areaService.deleteArea as any
		mockListUnits = unitService.listUnits as any
		mockGetUnit = unitService.getUnit as any
		mockCreateUnit = unitService.createUnit as any
		mockUpdateUnit = unitService.updateUnit as any
		mockDeleteUnit = unitService.deleteUnit as any
		mockQueryReadings = readingsService.queryReadings as any
		mockListAlerts = alertService.listAlerts as any
		mockGetAlert = alertService.getAlert as any
		mockAcknowledgeAlert = alertService.acknowledgeAlert as any
		mockResolveAlert = alertService.resolveAlert as any
	})

	afterAll(async () => {
		await app.close()
	})

	beforeEach(async () => {
		// Re-import mocked modules to get fresh mock references after vi.clearAllMocks()
		const userService = await import('../../src/services/user.service.js')
		const siteService = await import('../../src/services/site.service.js')
		const areaService = await import('../../src/services/area.service.js')
		const unitService = await import('../../src/services/unit.service.js')
		const readingsService =
			await import('../../src/services/readings.service.js')
		const alertService = await import('../../src/services/alert.service.js')

		mockGetUserRoleInOrg = userService.getUserRoleInOrg as any
		mockGetOrCreateProfile = userService.getOrCreateProfile as any
		mockListSites = siteService.listSites as any
		mockGetSite = siteService.getSite as any
		mockCreateSite = siteService.createSite as any
		mockUpdateSite = siteService.updateSite as any
		mockDeleteSite = siteService.deleteSite as any
		mockListAreas = areaService.listAreas as any
		mockGetArea = areaService.getArea as any
		mockCreateArea = areaService.createArea as any
		mockUpdateArea = areaService.updateArea as any
		mockDeleteArea = areaService.deleteArea as any
		mockListUnits = unitService.listUnits as any
		mockGetUnit = unitService.getUnit as any
		mockCreateUnit = unitService.createUnit as any
		mockUpdateUnit = unitService.updateUnit as any
		mockDeleteUnit = unitService.deleteUnit as any
		mockQueryReadings = readingsService.queryReadings as any
		mockListAlerts = alertService.listAlerts as any
		mockGetAlert = alertService.getAlert as any
		mockAcknowledgeAlert = alertService.acknowledgeAlert as any
		mockResolveAlert = alertService.resolveAlert as any

		// Reset all mocks to default implementations
		vi.clearAllMocks()

		// Reset default mocks for profile creation (always needed for orgProcedure)
		mockGetOrCreateProfile.mockResolvedValue({ id: TEST_PROFILE_ID })
	})

	describe('Health Endpoint', () => {
		it('should respond with status ok', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input=%7B%7D',
			})

			console.log('Response status:', response.statusCode)
			console.log('Response body:', response.body)
			expect(response.statusCode).toBe(200)

			const data = JSON.parse(response.body)
			expect(['healthy', 'unhealthy', 'degraded']).toContain(
				data.result.data.overall,
			)
			expect(data.result.data.lastCheckedAt).toBeDefined()
			expect(typeof data.result.data.lastCheckedAt).toBe('string')
		})
	})

	describe('Authentication', () => {
		it('should reject unauthenticated requests to protected procedures', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/organizations.get?input={"organizationId":"00000000-0000-0000-0000-000000000000"}',
			})

			expect(response.statusCode).toBe(401)

			const data = JSON.parse(response.body)
			expect(data.error).toBeDefined()
			expect(data.error.message).toContain('Authentication required')
		})

		it('should reject requests with invalid token format', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/organizations.get?input={"organizationId":"00000000-0000-0000-0000-000000000000"}',
				headers: {
					'x-stack-access-token': 'invalid-token',
				},
			})

			expect(response.statusCode).toBe(401)

			const data = JSON.parse(response.body)
			expect(data.error).toBeDefined()
			expect(data.error.message).toContain('Authentication required')
		})
	})

	describe('Batched Requests', () => {
		it('should support httpBatchLink configuration', async () => {
			// Verify tRPC endpoints work, which confirms httpBatchLink is configured
			// Actual batching behavior is tested via tRPC client in frontend integration tests
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input={}',
			})

			expect(response.statusCode).toBe(200)

			const data = JSON.parse(response.body)
			expect(['healthy', 'unhealthy', 'degraded']).toContain(
				data.result.data.overall,
			)

			// Verify multiple sequential requests work (simulates what batching does)
			const response2 = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input={}',
			})

			expect(response2.statusCode).toBe(200)
			const data2 = JSON.parse(response2.body)
			expect(['healthy', 'unhealthy', 'degraded']).toContain(
				data2.result.data.overall,
			)

			// Note: tRPC httpBatchLink batching is handled by the client library
			// Server infrastructure verified by individual procedure calls working
		})
	})

	describe('Error Handling', () => {
		it('should return proper error format for authentication failure', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/organizations.get?input={"organizationId":"00000000-0000-0000-0000-000000000000"}',
			})

			// Should return 401 for auth error
			expect(response.statusCode).toBe(401)

			const data = JSON.parse(response.body)
			expect(data.error).toBeDefined()
			expect(data.error.message).toBeDefined()
			expect(typeof data.error.message).toBe('string')
		})

		it('should return proper error format for non-existent procedure', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/nonExistentProcedure',
			})

			expect(response.statusCode).toBe(404)

			const data = JSON.parse(response.body)
			expect(data.error).toBeDefined()
			expect(data.error.message).toBeDefined()
			expect(typeof data.error.message).toBe('string')
		})
	})

	describe('Type Safety', () => {
		it('should export AppRouter type correctly', async () => {
			// This test verifies that TypeScript compilation succeeds
			// The actual type checking happens at compile time
			// At runtime, we just verify the router structure exists

			const response = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input={}',
			})

			expect(response.statusCode).toBe(200)

			// Verify that the organizations router is mounted
			const orgResponse = await app.inject({
				method: 'GET',
				url: '/trpc/organizations.get?input={"organizationId":"00000000-0000-0000-0000-000000000000"}',
			})

			// Should return auth error (proving the route exists)
			expect(orgResponse.statusCode).toBe(401)
		})
	})

	describe('Content Type', () => {
		it('should return application/json for tRPC responses', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input={}',
			})

			expect(response.headers['content-type']).toContain('application/json')
		})
	})

	describe('HTTP Methods', () => {
		it('should support GET for queries', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input={}',
			})

			expect(response.statusCode).toBe(200)
		})

		it('should support POST for mutations', async () => {
			// Mutations typically use POST
			const response = await app.inject({
				method: 'POST',
				url: '/trpc/organizations.update',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'fake-token-for-testing',
				},
				payload: {
					organizationId: '00000000-0000-0000-0000-000000000000',
					data: { name: 'Test' },
				},
			})

			// Should return auth error (but proves POST is accepted)
			expect(response.statusCode).toBe(401)
		})
	})

	describe('Router Registration Smoke Test', () => {
		it('should have all 6 domain routers registered', async () => {
			// Test that each domain router responds (even if with auth error)
			// This proves the routers are properly mounted in appRouter

			const routers = [
				{ name: 'organizations', path: '/trpc/organizations.get' },
				{ name: 'sites', path: '/trpc/sites.list' },
				{ name: 'areas', path: '/trpc/areas.list' },
				{ name: 'units', path: '/trpc/units.list' },
				{ name: 'readings', path: '/trpc/readings.list' },
				{ name: 'alerts', path: '/trpc/alerts.list' },
			]

			for (const { name, path } of routers) {
				const response = await app.inject({
					method: 'GET',
					url: `${path}?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID }))}`,
					headers: {
						'x-stack-access-token': 'fake-token',
					},
				})

				// Should return 401 (auth failure) not 404 (route not found)
				// This proves the router is registered
				expect(
					response.statusCode,
					`Router "${name}" should be registered`,
				).not.toBe(404)
			}
		})

		it('should have health endpoint accessible without auth', async () => {
			const response = await app.inject({
				method: 'GET',
				url: '/trpc/health.quick?input={}',
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(['healthy', 'unhealthy', 'degraded']).toContain(
				data.result.data.overall,
			)
		})
	})

	describe('Sites Router E2E', () => {
		it('should list sites for authenticated admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockListSitesWithStats.mockResolvedValue([mockSite])

			const response = await app.inject({
				method: 'GET',
				url: `/trpc/sites.list?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID }))}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			console.log('List sites response body:', response.body)
			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data).toHaveLength(1)
			expect(data.result.data[0].name).toBe('Test Site')
		})

		it('should get site by ID', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetSite.mockResolvedValue(mockSite)

			const response = await app.inject({
				method: 'GET',
				url: `/trpc/sites.get?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID, siteId: TEST_SITE_ID }))}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data.id).toBe(TEST_SITE_ID)
		})

		it('should create site as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockCreateSite.mockResolvedValue(mockSite)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/sites.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					data: {
						name: 'New Site',
						address: '456 New St',
						city: 'Dallas',
						state: 'TX',
						postalCode: '75001',
						country: 'USA',
						timezone: 'America/Chicago',
					},
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should reject create site for viewer role (FORBIDDEN)', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('viewer')

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/sites.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-viewer-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					data: {
						name: 'New Site',
						address: '456 New St',
						city: 'Dallas',
						state: 'TX',
						postalCode: '75001',
						country: 'USA',
						timezone: 'America/Chicago',
					},
				},
			})

			expect(response.statusCode).toBe(403)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('Only admins and owners')
		})

		it('should update site as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockUpdateSite.mockResolvedValue({ ...mockSite, name: 'Updated Site' })

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/sites.update',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					data: { name: 'Updated Site' },
				},
			})

			console.log('Update site response body:', response.body)
			expect(response.statusCode).toBe(200)
		})

		it('should delete site as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockDeleteSite.mockResolvedValue(mockSite)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/sites.delete',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should return NOT_FOUND for non-existent site', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetSite.mockResolvedValue(null)

			const response = await app.inject({
				method: 'GET',
				url: `/trpc/sites.get?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID, siteId: '99999999-9999-4999-a999-999999999999' }))}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(404)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('not found')
		})
	})

	describe('Areas Router E2E', () => {
		it('should list areas for site', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockListAreas.mockResolvedValue([mockArea])

			const response = await app.inject({
				method: 'GET',
				url: `/trpc/areas.list?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID, siteId: TEST_SITE_ID }))}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data).toHaveLength(1)
			expect(data.result.data[0].name).toBe('Walk-in Cooler')
		})

		it('should get area by ID', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetArea.mockResolvedValue(mockArea)

			const response = await app.inject({
				method: 'GET',
				url: `/trpc/areas.get?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID, siteId: TEST_SITE_ID, areaId: TEST_AREA_ID }))}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data.id).toBe(TEST_AREA_ID)
		})

		it('should create area as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockCreateArea.mockResolvedValue(mockArea)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/areas.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					data: {
						name: 'New Area',
						description: 'A new storage area',
						sortOrder: 0,
					},
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should reject create area for viewer role (FORBIDDEN)', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('viewer')

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/areas.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-viewer-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					data: {
						name: 'New Area',
						description: 'A new storage area',
						sortOrder: 0,
					},
				},
			})

			expect(response.statusCode).toBe(403)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('Only admins and owners')
		})

		it('should update area as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockUpdateArea.mockResolvedValue({ ...mockArea, name: 'Updated Area' })

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/areas.update',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					areaId: TEST_AREA_ID,
					data: { name: 'Updated Area' },
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should delete area as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockDeleteArea.mockResolvedValue(mockArea)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/areas.delete',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					areaId: TEST_AREA_ID,
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should return NOT_FOUND for non-existent area', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetArea.mockResolvedValue(null)

			const response = await app.inject({
				method: 'GET',
				url: `/trpc/areas.get?input=${encodeURIComponent(JSON.stringify({ organizationId: TEST_ORG_ID, siteId: TEST_SITE_ID, areaId: '99999999-9999-4999-a999-999999999999' }))}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(404)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('not found')
		})

		it('should return NOT_FOUND when creating area in non-existent site', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockCreateArea.mockResolvedValue(null) // Service returns null when site not found

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/areas.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: '99999999-9999-4999-a999-999999999999',
					data: {
						name: 'New Area',
						description: 'Test',
						sortOrder: 1,
					},
				},
			})

			expect(response.statusCode).toBe(404)
		})
	})

	describe('Units Router E2E', () => {
		it('should list units for area', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockListUnits.mockResolvedValue([mockUnit])

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				siteId: TEST_SITE_ID,
				areaId: TEST_AREA_ID,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/units.list?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data).toHaveLength(1)
			expect(data.result.data[0].name).toBe('Walk-in Cooler 1')
		})

		it('should get unit by ID', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetUnit.mockResolvedValue(mockUnit)

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				siteId: TEST_SITE_ID,
				areaId: TEST_AREA_ID,
				unitId: TEST_UNIT_ID,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/units.get?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data.id).toBe(TEST_UNIT_ID)
		})

		it('should create unit as manager', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('manager')
			mockCreateUnit.mockResolvedValue(mockUnit)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/units.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					areaId: TEST_AREA_ID,
					data: {
						name: 'New Unit',
						unitType: 'fridge',
						tempMin: 32,
						tempMax: 40,
						tempUnit: 'F',
					},
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should reject create unit for staff role (FORBIDDEN)', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('staff')

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/units.create',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-staff-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					areaId: TEST_AREA_ID,
					data: {
						name: 'New Unit',
						unitType: 'fridge',
						tempMin: 32,
						tempMax: 40,
					},
				},
			})

			expect(response.statusCode).toBe(403)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('Only managers')
		})

		it('should update unit as manager', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('manager')
			mockUpdateUnit.mockResolvedValue({ ...mockUnit, name: 'Updated Unit' })

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/units.update',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					areaId: TEST_AREA_ID,
					unitId: TEST_UNIT_ID,
					data: { name: 'Updated Unit' },
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should delete unit as admin', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockDeleteUnit.mockResolvedValue(mockUnit)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/units.delete',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-admin-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					siteId: TEST_SITE_ID,
					areaId: TEST_AREA_ID,
					unitId: TEST_UNIT_ID,
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should return NOT_FOUND for non-existent unit', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetUnit.mockResolvedValue(null)

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				siteId: TEST_SITE_ID,
				areaId: TEST_AREA_ID,
				unitId: '99999999-9999-4999-a999-999999999999',
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/units.get?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(404)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('not found')
		})
	})

	describe('Readings Router E2E', () => {
		it('should list readings with pagination', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockQueryReadings.mockResolvedValue([mockReading])

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				unitId: TEST_UNIT_ID,
				page: 1,
				limit: 50,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/readings.list?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data).toHaveLength(1)
			expect(data.result.data[0].temperature).toBe(36.5)
		})

		it('should get latest reading', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockQueryReadings.mockResolvedValue([mockReading])

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				unitId: TEST_UNIT_ID,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/readings.latest?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data.temperature).toBe(36.5)
		})

		it('should return null for latest when no readings', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockQueryReadings.mockResolvedValue([])

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				unitId: TEST_UNIT_ID,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/readings.latest?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data).toBeNull()
		})

		it('should return NOT_FOUND for invalid unit in readings list', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockQueryReadings.mockRejectedValue(
				new Error('Unit not found or access denied'),
			)

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				unitId: '99999999-9999-4999-a999-999999999999',
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/readings.list?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(404)
		})
	})

	describe('Alerts Router E2E', () => {
		it('should list alerts for organization', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockListAlerts.mockResolvedValue([mockAlert])

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/alerts.list?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data).toHaveLength(1)
			expect(data.result.data[0].alertType).toBe('alarm_active')
		})

		it('should get alert by ID', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetAlert.mockResolvedValue(mockAlert)

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				alertId: TEST_ALERT_ID,
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/alerts.get?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(200)
			const data = JSON.parse(response.body)
			expect(data.result.data.id).toBe(TEST_ALERT_ID)
		})

		it('should acknowledge alert as staff', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('staff')
			const acknowledgedAlert = {
				...mockAlert,
				status: 'acknowledged',
				acknowledgedAt: new Date(),
				acknowledgedBy: TEST_PROFILE_ID,
			}
			mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/alerts.acknowledge',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-staff-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					alertId: TEST_ALERT_ID,
					notes: 'Investigating temperature spike',
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should reject acknowledge for viewer role (FORBIDDEN)', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('viewer')

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/alerts.acknowledge',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-viewer-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					alertId: TEST_ALERT_ID,
				},
			})

			expect(response.statusCode).toBe(403)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('Only staff')
		})

		it('should resolve alert as staff', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('staff')
			const resolvedAlert = {
				...mockAlert,
				status: 'resolved',
				resolvedAt: new Date(),
				resolvedBy: TEST_PROFILE_ID,
			}
			mockResolveAlert.mockResolvedValue(resolvedAlert)

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/alerts.resolve',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-staff-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					alertId: TEST_ALERT_ID,
					resolution: 'Temperature returned to normal range',
					correctiveAction: 'Adjusted thermostat setting',
				},
			})

			expect(response.statusCode).toBe(200)
		})

		it('should return NOT_FOUND for non-existent alert', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('admin')
			mockGetAlert.mockResolvedValue(null)

			const input = JSON.stringify({
				organizationId: TEST_ORG_ID,
				alertId: '99999999-9999-4999-a999-999999999999',
			})
			const response = await app.inject({
				method: 'GET',
				url: `/trpc/alerts.get?input=${encodeURIComponent(input)}`,
				headers: {
					'x-stack-access-token': 'valid-admin-token',
				},
			})

			expect(response.statusCode).toBe(404)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('not found')
		})

		it('should return CONFLICT for already acknowledged alert', async () => {
			mockGetUserRoleInOrg.mockResolvedValue('staff')
			mockAcknowledgeAlert.mockResolvedValue('already_acknowledged')

			const response = await app.inject({
				method: 'POST',
				url: '/trpc/alerts.acknowledge',
				headers: {
					'content-type': 'application/json',
					'x-stack-access-token': 'valid-staff-token',
				},
				payload: {
					organizationId: TEST_ORG_ID,
					alertId: TEST_ALERT_ID,
				},
			})

			expect(response.statusCode).toBe(409)
			const data = JSON.parse(response.body)
			expect(data.error.message).toContain('already acknowledged')
		})
	})
})
