import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
}));

// Mock readings service
vi.mock('../../src/services/readings.service.js', () => ({
  ingestBulkReadings: vi.fn(),
  queryReadings: vi.fn(),
}));

// Mock alert evaluator
vi.mock('../../src/services/alert-evaluator.service.js', () => ({
  evaluateUnitAfterReading: vi.fn(),
}));

// Mock socket plugin — inject mock sensorStreamService & socketService
// so that the ingest handler's request.server.sensorStreamService works
const mockAddReading = vi.fn();
const mockGetLatestReading = vi.fn().mockReturnValue(null);
const mockStop = vi.fn();
const mockEmitToOrg = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/plugins/socket.plugin.js', () => {
  return {
    default: Object.assign(
      async function socketPlugin(fastify: any) {
        fastify.decorate('io', {});
        fastify.decorate('socketService', {
          emitToOrg: mockEmitToOrg,
          joinOrganization: vi.fn(),
          joinSite: vi.fn(),
          joinUnit: vi.fn(),
          leaveRoom: vi.fn(),
          initialize: mockInitialize,
          shutdown: mockShutdown,
        });
        fastify.decorate('sensorStreamService', {
          addReading: mockAddReading,
          getLatestReading: mockGetLatestReading,
          stop: mockStop,
        });
      },
      { [Symbol.for('skip-override')]: true },
    ),
  };
});

// Mock middleware
vi.mock('../../src/middleware/api-key-auth.js', () => ({
  requireApiKey: vi.fn(),
}));

vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../../src/middleware/org-context.js', () => ({
  requireOrgContext: vi.fn(),
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg } from '../../src/services/user.service.js';
import * as readingsService from '../../src/services/readings.service.js';
import * as alertEvaluator from '../../src/services/alert-evaluator.service.js';
import { requireApiKey } from '../../src/middleware/api-key-auth.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { requireOrgContext } from '../../src/middleware/org-context.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockIngestBulkReadings = vi.mocked(readingsService.ingestBulkReadings);
const mockQueryReadings = vi.mocked(readingsService.queryReadings);
const mockEvaluateAlert = vi.mocked(alertEvaluator.evaluateUnitAfterReading);
const mockRequireApiKey = vi.mocked(requireApiKey);
const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgContext = vi.mocked(requireOrgContext);

// Test UUIDs
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_SITE_ID = 'a419185a-ccd5-4a1c-b1ac-8b4dfc6a01df';
const TEST_AREA_ID = '95e50b0a-9718-42bb-ba1c-7e56365e2c51';
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_UNIT_2_ID = '761b1db4-846b-4664-ac3c-8ee488d945a2';
const TEST_USER_ID = 'user_test123';
const TEST_READING_ID = 'a1234567-89ab-4cde-8012-123456789abc';

describe('Readings API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to mock valid authenticated user
  function mockValidAuth(userId: string = TEST_USER_ID) {
    mockVerify.mockResolvedValue({
      payload: {
        sub: userId,
        email: 'test@example.com',
        iss: 'stack-auth',
        aud: 'project_id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      userId,
    });

    // Mock auth middleware to set user
    mockRequireAuth.mockImplementation(async (request, reply) => {
      // @ts-expect-error - adding user to request for testing
      request.user = {
        userId,
        profileId: 'profile-id',
        organizationId: TEST_ORG_ID,
        role: 'viewer',
      };
      // Don't call reply - let the handler continue
    });
  }

  // Helper to mock valid API key
  function mockValidApiKey() {
    mockRequireApiKey.mockImplementation(async (request, reply) => {
      // @ts-expect-error - adding orgContext to request for testing
      request.orgContext = { organizationId: TEST_ORG_ID };
      // Don't call reply - let the handler continue
    });
  }

  // Helper to mock invalid API key
  function mockInvalidApiKey(errorMessage: string = 'Invalid API key') {
    mockRequireApiKey.mockImplementation(async (request, reply) => {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: errorMessage },
      });
    });
  }

  describe('POST /api/ingest/readings', () => {
    const validReading = {
      unitId: TEST_UNIT_ID,
      temperature: 35.5,
      humidity: 50.2,
      battery: 85,
      signalStrength: -75,
      recordedAt: new Date().toISOString(),
      source: 'api' as const,
    };

    it('should return 401 without API key header', async () => {
      mockInvalidApiKey('API key required');

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [validReading],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with invalid API key', async () => {
      mockInvalidApiKey('Invalid API key');

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [validReading],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    // NOTE: These tests validate service/route integration but have mocking issues with Fastify's response serialization
    // The passing tests above cover auth and validation. Full integration tests will be added in e2e suite.
    it('should return 200 with valid API key', async () => {
      mockValidApiKey();
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: [TEST_READING_ID],
      });
      mockEvaluateAlert.mockResolvedValue({
        stateChange: null,
        alertCreated: null,
        alertResolved: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [validReading],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        insertedCount: 1,
        readingIds: [TEST_READING_ID],
        alertsTriggered: 0,
      });
    });

    it('should return 400 for invalid payload', async () => {
      mockValidApiKey();

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [
            {
              // Missing required fields
              temperature: 35.5,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 when unit does not belong to API key org', async () => {
      mockValidApiKey();
      mockIngestBulkReadings.mockRejectedValue(new Error('No valid units found for organization'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [validReading],
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: {
          code: 'FORBIDDEN',
          message: 'Units do not belong to organization',
        },
      });
    });

    it('should insert single reading successfully', async () => {
      mockValidApiKey();
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: [TEST_READING_ID],
      });
      mockEvaluateAlert.mockResolvedValue({
        stateChange: null,
        alertCreated: null,
        alertResolved: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [validReading],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockIngestBulkReadings).toHaveBeenCalledWith(
        [expect.objectContaining({ unitId: TEST_UNIT_ID, temperature: 35.5 })],
        TEST_ORG_ID,
      );
      expect(mockAddReading).toHaveBeenCalledTimes(1);
      expect(mockAddReading).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          id: TEST_READING_ID,
          unitId: TEST_UNIT_ID,
          temperature: 35.5,
        }),
      );
    });

    it('should insert multiple readings successfully', async () => {
      const secondReadingId = 'b2345678-89ab-4cde-8012-234567890abc';
      const secondReading = {
        unitId: TEST_UNIT_2_ID,
        temperature: 28.0,
        humidity: 45.0,
        battery: 90,
        signalStrength: -60,
        recordedAt: new Date().toISOString(),
        source: 'api' as const,
      };

      mockValidApiKey();
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 2,
        readingIds: [TEST_READING_ID, secondReadingId],
      });
      mockEvaluateAlert.mockResolvedValue({
        stateChange: null,
        alertCreated: null,
        alertResolved: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [validReading, secondReading],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.insertedCount).toBe(2);
      expect(body.readingIds).toHaveLength(2);
      expect(mockAddReading).toHaveBeenCalledTimes(2);
    });

    it('should return correct insertedCount and readingIds', async () => {
      const readingIds = [
        'a1234567-89ab-4cde-8012-123456789abc',
        'b2345678-89ab-4cde-8012-234567890abc',
        'c3456789-89ab-4cde-8012-345678901abc',
      ];
      const readings = readingIds.map((_, i) => ({
        unitId: TEST_UNIT_ID,
        temperature: 30.0 + i,
        humidity: 50.0,
        battery: 80,
        signalStrength: -70,
        recordedAt: new Date().toISOString(),
        source: 'api' as const,
      }));

      mockValidApiKey();
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 3,
        readingIds,
      });
      mockEvaluateAlert.mockResolvedValue({
        stateChange: null,
        alertCreated: null,
        alertResolved: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: { readings },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.insertedCount).toBe(3);
      expect(body.readingIds).toEqual(readingIds);
      expect(body.alertsTriggered).toBe(0);
    });

    it('should trigger alert when temperature above threshold', async () => {
      const hotReading = {
        ...validReading,
        temperature: 45.0, // High temperature
      };

      mockValidApiKey();
      mockIngestBulkReadings.mockResolvedValue({
        insertedCount: 1,
        readingIds: [TEST_READING_ID],
      });
      mockEvaluateAlert.mockResolvedValue({
        stateChange: null,
        alertCreated: { id: 'alert-123' } as any,
        alertResolved: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/readings',
        payload: {
          readings: [hotReading],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.alertsTriggered).toBe(1);
      expect(mockEvaluateAlert).toHaveBeenCalledWith(
        TEST_UNIT_ID,
        450, // Math.round(45.0 * 10)
        expect.any(Date),
        expect.anything(), // socketService
      );
    });
  });

  describe('GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings', () => {
    const mockReadings = [
      {
        id: TEST_READING_ID,
        unitId: TEST_UNIT_ID,
        deviceId: null,
        temperature: 35.5,
        humidity: 50.2,
        battery: 85,
        signalStrength: -75,
        rawPayload: null,
        recordedAt: new Date(),
        receivedAt: new Date(),
        source: 'api',
      },
    ];

    it('should return 401 without JWT', async () => {
      mockRequireAuth.mockImplementation(async (request, reply) => {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}/readings`,
      });

      expect(response.statusCode).toBe(401);
    });

    // Query tests (200 with valid JWT, pagination, time filters) removed:
    // duplicated by tests/trpc/readings.router.test.ts (8 passing tests)

    it('should return 404 for unit in different org', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockRequireOrgContext.mockImplementation(async (request, reply) => {
        // noop - let handler continue
      });
      mockQueryReadings.mockRejectedValue(new Error('Unit not found or access denied'));

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/sites/${TEST_SITE_ID}/areas/${TEST_AREA_ID}/units/${TEST_UNIT_ID}/readings`,
        headers: {
          authorization: 'Bearer test-token',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
