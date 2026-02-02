import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { requireOrgContext } from '../../src/middleware/org-context.js';
import * as alertService from '../../src/services/alert.service.js';
import { getUserRoleInOrg } from '../../src/services/user.service.js';
import { verifyAccessToken } from '../../src/utils/jwt.js';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
}));

// Mock alert service
vi.mock('../../src/services/alert.service.js', () => ({
  listAlerts: vi.fn(),
  getAlert: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));

// Mock middleware
vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('../../src/middleware/org-context.js', () => ({
  requireOrgContext: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockListAlerts = vi.mocked(alertService.listAlerts);
const mockGetAlert = vi.mocked(alertService.getAlert);
const mockAcknowledgeAlert = vi.mocked(alertService.acknowledgeAlert);
const mockResolveAlert = vi.mocked(alertService.resolveAlert);
const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireOrgContext = vi.mocked(requireOrgContext);

// Test UUIDs (all must be valid RFC 4122)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_ALERT_ID = 'a1e2f3a4-5678-40ab-8def-123456789012';
const TEST_USER_ID = 'user_test123';
const TEST_PROFILE_ID = 'b2c3d4e5-6789-40ab-8def-abcdef012345';

describe('Alerts API', () => {
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
  function mockValidAuth(role: 'viewer' | 'staff' | 'manager' | 'admin' | 'owner' = 'viewer') {
    mockVerify.mockResolvedValue({
      payload: {
        sub: TEST_USER_ID,
        email: 'test@example.com',
        iss: 'stack-auth',
        aud: 'project_id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      userId: TEST_USER_ID,
    });

    mockRequireAuth.mockImplementation(async (request, _reply) => {
      // @ts-expect-error - adding user to request for testing
      request.user = {
        userId: TEST_USER_ID,
        profileId: TEST_PROFILE_ID,
        organizationId: TEST_ORG_ID,
        role,
      };
    });

    mockRequireOrgContext.mockImplementation(async () => {});
    mockGetRole.mockResolvedValue(role);
  }

  // Valid mock alert that passes AlertSchema Zod validation
  const now = new Date().toISOString();
  const mockAlert = {
    id: TEST_ALERT_ID,
    unitId: TEST_UNIT_ID,
    alertRuleId: null,
    alertType: 'alarm_active' as const,
    severity: 'warning' as const,
    status: 'active' as const,
    message: 'Temperature above threshold',
    triggerTemperature: 450,
    thresholdViolated: 'max',
    triggeredAt: now,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    escalatedAt: null,
    escalationLevel: 0,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };

  describe('GET /api/orgs/:organizationId/alerts', () => {
    it('should return 401 without JWT', async () => {
      mockRequireAuth.mockImplementation(async (request, reply) => {
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return alerts for organization', async () => {
      mockValidAuth('viewer');
      mockListAlerts.mockResolvedValue([mockAlert] as any);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(TEST_ALERT_ID);
    });

    it('should filter by status', async () => {
      mockValidAuth('viewer');
      mockListAlerts.mockResolvedValue([mockAlert] as any);

      await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
        headers: { authorization: 'Bearer test-token' },
        query: { status: 'active' },
      });

      // Verify service was called with correct filter
      expect(mockListAlerts).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('should filter by severity', async () => {
      mockValidAuth('viewer');
      mockListAlerts.mockResolvedValue([mockAlert] as any);

      await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
        headers: { authorization: 'Bearer test-token' },
        query: { severity: 'critical' },
      });

      expect(mockListAlerts).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('should filter by unitId', async () => {
      mockValidAuth('viewer');
      mockListAlerts.mockResolvedValue([mockAlert] as any);

      await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
        headers: { authorization: 'Bearer test-token' },
        query: { unitId: TEST_UNIT_ID },
      });

      expect(mockListAlerts).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({ unitId: TEST_UNIT_ID }),
      );
    });

    it('should support pagination', async () => {
      mockValidAuth('viewer');
      mockListAlerts.mockResolvedValue([mockAlert] as any);

      await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
        headers: { authorization: 'Bearer test-token' },
        query: { limit: '50', offset: '10' },
      });

      expect(mockListAlerts).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({ limit: 50, offset: 10 }),
      );
    });
  });

  describe('GET /api/orgs/:organizationId/alerts/:alertId', () => {
    it('should return alert details', async () => {
      mockValidAuth('viewer');
      mockGetAlert.mockResolvedValue(mockAlert as any);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(TEST_ALERT_ID);
      expect(body.alertType).toBe('alarm_active');
      expect(body.severity).toBe('warning');
      expect(body.status).toBe('active');
    });

    it('should return 404 for non-existent alert', async () => {
      mockValidAuth('viewer');
      mockGetAlert.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for alert in different org', async () => {
      mockValidAuth('viewer');
      // Service returns null when the alert does not belong to the org
      mockGetAlert.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Alert not found');
    });
  });

  describe('POST /api/orgs/:organizationId/alerts/:alertId/acknowledge', () => {
    it('should return 403 for viewer role', async () => {
      mockValidAuth('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/acknowledge`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 200 for staff role', async () => {
      mockValidAuth('staff');

      const acknowledgedAt = new Date().toISOString();
      const acknowledgedAlert = {
        ...mockAlert,
        status: 'acknowledged' as const,
        acknowledgedAt,
        acknowledgedBy: TEST_PROFILE_ID,
        updatedAt: acknowledgedAt,
      };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert as any);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/acknowledge`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('acknowledged');
      expect(body.acknowledgedBy).toBe(TEST_PROFILE_ID);
    });

    it('should change status to acknowledged', async () => {
      mockValidAuth('staff');

      const acknowledgedAt = new Date().toISOString();
      const acknowledgedAlert = {
        ...mockAlert,
        status: 'acknowledged' as const,
        acknowledgedAt,
        acknowledgedBy: TEST_PROFILE_ID,
        updatedAt: acknowledgedAt,
      };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert as any);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/acknowledge`,
        headers: { authorization: 'Bearer test-token' },
        payload: { notes: 'Investigating the issue' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith(
        TEST_ALERT_ID,
        TEST_ORG_ID,
        TEST_PROFILE_ID,
        'Investigating the issue',
      );
      const body = response.json();
      expect(body.status).toBe('acknowledged');
    });

    it('should return 409 if already acknowledged', async () => {
      mockValidAuth('staff');
      mockAcknowledgeAlert.mockResolvedValue('already_acknowledged');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/acknowledge`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/orgs/:organizationId/alerts/:alertId/resolve', () => {
    it('should return 403 for viewer role', async () => {
      mockValidAuth('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/resolve`,
        headers: { authorization: 'Bearer test-token' },
        payload: { resolution: 'Fixed the sensor placement' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 200 for staff role', async () => {
      mockValidAuth('staff');

      const resolvedAt = new Date().toISOString();
      const resolvedAlert = {
        ...mockAlert,
        status: 'resolved' as const,
        resolvedAt,
        resolvedBy: TEST_PROFILE_ID,
        metadata: JSON.stringify({ resolution: 'Fixed the sensor placement' }),
        updatedAt: resolvedAt,
      };
      mockResolveAlert.mockResolvedValue(resolvedAlert as any);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/resolve`,
        headers: { authorization: 'Bearer test-token' },
        payload: { resolution: 'Fixed the sensor placement' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('resolved');
      expect(body.resolvedBy).toBe(TEST_PROFILE_ID);
    });

    it('should change status to resolved', async () => {
      mockValidAuth('staff');

      const resolvedAt = new Date().toISOString();
      const resolvedAlert = {
        ...mockAlert,
        status: 'resolved' as const,
        resolvedAt,
        resolvedBy: TEST_PROFILE_ID,
        metadata: JSON.stringify({ resolution: 'Recalibrated sensor' }),
        updatedAt: resolvedAt,
      };
      mockResolveAlert.mockResolvedValue(resolvedAlert as any);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/resolve`,
        headers: { authorization: 'Bearer test-token' },
        payload: { resolution: 'Recalibrated sensor' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockResolveAlert).toHaveBeenCalledWith(
        TEST_ALERT_ID,
        TEST_ORG_ID,
        TEST_PROFILE_ID,
        'Recalibrated sensor',
        undefined,
      );
      const body = response.json();
      expect(body.status).toBe('resolved');
    });

    it('should create corrective action when provided', async () => {
      mockValidAuth('staff');

      const resolvedAt = new Date().toISOString();
      const resolvedAlert = {
        ...mockAlert,
        status: 'resolved' as const,
        resolvedAt,
        resolvedBy: TEST_PROFILE_ID,
        metadata: JSON.stringify({ resolution: 'Sensor was misaligned' }),
        updatedAt: resolvedAt,
      };
      mockResolveAlert.mockResolvedValue(resolvedAlert as any);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/resolve`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          resolution: 'Sensor was misaligned',
          correctiveAction: 'Re-mounted sensor at correct position',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockResolveAlert).toHaveBeenCalledWith(
        TEST_ALERT_ID,
        TEST_ORG_ID,
        TEST_PROFILE_ID,
        'Sensor was misaligned',
        'Re-mounted sensor at correct position',
      );
    });
  });

  describe('Alert Lifecycle', () => {
    it('should handle full lifecycle: active -> acknowledged -> resolved', async () => {
      mockValidAuth('staff');

      // Step 1: List active alerts
      mockListAlerts.mockResolvedValue([mockAlert] as any);
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts`,
        headers: { authorization: 'Bearer test-token' },
        query: { status: 'active' },
      });
      expect(listResponse.statusCode).toBe(200);
      const alerts = listResponse.json();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].status).toBe('active');

      // Step 2: Acknowledge the alert
      const acknowledgedAt = new Date().toISOString();
      const acknowledgedAlert = {
        ...mockAlert,
        status: 'acknowledged' as const,
        acknowledgedAt,
        acknowledgedBy: TEST_PROFILE_ID,
        updatedAt: acknowledgedAt,
      };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert as any);

      const ackResponse = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/acknowledge`,
        headers: { authorization: 'Bearer test-token' },
        payload: { notes: 'Looking into it' },
      });
      expect(ackResponse.statusCode).toBe(200);
      expect(ackResponse.json().status).toBe('acknowledged');

      // Step 3: Resolve the alert
      const resolvedAt = new Date().toISOString();
      const resolvedAlert = {
        ...acknowledgedAlert,
        status: 'resolved' as const,
        resolvedAt,
        resolvedBy: TEST_PROFILE_ID,
        metadata: JSON.stringify({ resolution: 'Issue resolved after recalibration' }),
        updatedAt: resolvedAt,
      };
      mockResolveAlert.mockResolvedValue(resolvedAlert as any);

      const resolveResponse = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/resolve`,
        headers: { authorization: 'Bearer test-token' },
        payload: { resolution: 'Issue resolved after recalibration' },
      });
      expect(resolveResponse.statusCode).toBe(200);
      expect(resolveResponse.json().status).toBe('resolved');
    });
  });

  describe('Duplicate Prevention', () => {
    it('should prevent duplicate acknowledgment', async () => {
      mockValidAuth('staff');
      mockAcknowledgeAlert.mockResolvedValue('already_acknowledged');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/${TEST_ALERT_ID}/acknowledge`,
        headers: { authorization: 'Bearer test-token' },
        payload: {},
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Alert is already acknowledged');
    });
  });
});
