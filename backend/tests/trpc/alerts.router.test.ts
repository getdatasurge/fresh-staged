/**
 * Tests for Alerts tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - list: List alerts with filters
 * - get: Alert retrieval by ID
 * - acknowledge: Acknowledge alert (staff/manager/admin/owner only)
 * - resolve: Resolve alert (staff/manager/admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { alertsRouter } from '../../src/routers/alerts.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the alert service
vi.mock('../../src/services/alert.service.js', () => ({
  listAlerts: vi.fn(),
  getAlert: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));

describe('Alerts tRPC Router', () => {
  const createCaller = createCallerFactory(alertsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListAlerts: ReturnType<typeof vi.fn>;
  let mockGetAlert: ReturnType<typeof vi.fn>;
  let mockAcknowledgeAlert: ReturnType<typeof vi.fn>;
  let mockResolveAlert: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const alertId = '423e4567-e89b-12d3-a456-426614174003';
  const unitId = '523e4567-e89b-12d3-a456-426614174004';
  const profileId = '723e4567-e89b-12d3-a456-426614174005';

  // Sample alert data
  const mockAlert = {
    id: alertId,
    unitId: unitId,
    alertRuleId: null,
    alertType: 'alarm_active',
    severity: 'critical',
    status: 'active',
    message: 'Temperature exceeds maximum threshold',
    triggerTemperature: 4500,
    thresholdViolated: 'max',
    triggeredAt: new Date('2024-01-01T12:00:00Z'),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    escalatedAt: null,
    escalationLevel: 0,
    metadata: null,
    createdAt: new Date('2024-01-01T12:00:00Z'),
    updatedAt: new Date('2024-01-01T12:00:00Z'),
  };

  // Create context that simulates authenticated user
  const createOrgContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules to get references to mocked functions
    const userService = await import('../../src/services/user.service.js');
    const alertService = await import('../../src/services/alert.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListAlerts = alertService.listAlerts as any;
    mockGetAlert = alertService.getAlert as any;
    mockAcknowledgeAlert = alertService.acknowledgeAlert as any;
    mockResolveAlert = alertService.resolveAlert as any;

    // Default to staff role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('staff');
    mockGetOrCreateProfile.mockResolvedValue({ id: profileId });
  });

  describe('list', () => {
    it('should list alerts for organization', async () => {
      const mockAlerts = [mockAlert, { ...mockAlert, id: '623e4567-e89b-12d3-a456-426614174005' }];
      mockListAlerts.mockResolvedValue(mockAlerts);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual(mockAlerts);
      expect(mockListAlerts).toHaveBeenCalledWith(orgId, {
        status: undefined,
        severity: undefined,
        unitId: undefined,
        start: undefined,
        end: undefined,
        limit: 100,
        offset: 0,
      });
    });

    it('should list alerts with status filter', async () => {
      const activeAlerts = [mockAlert];
      mockListAlerts.mockResolvedValue(activeAlerts);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({
        organizationId: orgId,
        status: 'active',
      });

      expect(result).toEqual(activeAlerts);
      expect(mockListAlerts).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          status: 'active',
        }),
      );
    });

    it('should list alerts with unitId filter', async () => {
      const unitAlerts = [mockAlert];
      mockListAlerts.mockResolvedValue(unitAlerts);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({
        organizationId: orgId,
        unitId,
      });

      expect(result).toEqual(unitAlerts);
      expect(mockListAlerts).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          unitId,
        }),
      );
    });

    it('should list alerts with severity filter', async () => {
      const criticalAlerts = [mockAlert];
      mockListAlerts.mockResolvedValue(criticalAlerts);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({
        organizationId: orgId,
        severity: 'critical',
      });

      expect(result).toEqual(criticalAlerts);
      expect(mockListAlerts).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          severity: 'critical',
        }),
      );
    });

    it('should return empty array when no alerts', async () => {
      mockListAlerts.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.list({ organizationId: orgId });

      expect(result).toEqual([]);
    });

    it('should calculate offset from page correctly', async () => {
      mockListAlerts.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.list({
        organizationId: orgId,
        page: 3,
        limit: 20,
      });

      expect(mockListAlerts).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          limit: 20,
          offset: 40, // (3-1) * 20 = 40
        }),
      );
    });
  });

  describe('get', () => {
    it('should get alert by ID', async () => {
      mockGetAlert.mockResolvedValue(mockAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId, alertId });

      expect(result).toEqual(mockAlert);
      expect(mockGetAlert).toHaveBeenCalledWith(alertId, orgId);
    });

    it('should throw NOT_FOUND when alert does not exist', async () => {
      mockGetAlert.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.get({ organizationId: orgId, alertId })).rejects.toThrow(TRPCError);

      await expect(caller.get({ organizationId: orgId, alertId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Alert not found',
      });
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge alert when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      const acknowledgedAlert = {
        ...mockAlert,
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: profileId,
      };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.acknowledge({
        organizationId: orgId,
        alertId,
        notes: 'Investigating issue',
      });

      expect(result).toEqual(acknowledgedAlert);
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith(
        alertId,
        orgId,
        profileId,
        'Investigating issue',
      );
    });

    it('should acknowledge alert when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      const acknowledgedAlert = { ...mockAlert, status: 'acknowledged' };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.acknowledge({
        organizationId: orgId,
        alertId,
      });

      expect(result).toEqual(acknowledgedAlert);
    });

    it('should acknowledge alert when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      const acknowledgedAlert = { ...mockAlert, status: 'acknowledged' };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.acknowledge({
        organizationId: orgId,
        alertId,
      });

      expect(result).toEqual(acknowledgedAlert);
    });

    it('should acknowledge alert when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      const acknowledgedAlert = { ...mockAlert, status: 'acknowledged' };
      mockAcknowledgeAlert.mockResolvedValue(acknowledgedAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.acknowledge({
        organizationId: orgId,
        alertId,
      });

      expect(result).toEqual(acknowledgedAlert);
    });

    it('should throw FORBIDDEN when viewer tries to acknowledge', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.acknowledge({ organizationId: orgId, alertId })).rejects.toThrow(
        TRPCError,
      );

      await expect(caller.acknowledge({ organizationId: orgId, alertId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when alert does not exist', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockAcknowledgeAlert.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.acknowledge({ organizationId: orgId, alertId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Alert not found',
      });
    });

    it('should throw CONFLICT when alert already acknowledged', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockAcknowledgeAlert.mockResolvedValue('already_acknowledged');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.acknowledge({ organizationId: orgId, alertId })).rejects.toThrow(
        TRPCError,
      );

      await expect(caller.acknowledge({ organizationId: orgId, alertId })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Alert is already acknowledged',
      });
    });
  });

  describe('resolve', () => {
    it('should resolve alert when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      const resolvedAlert = {
        ...mockAlert,
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: profileId,
      };
      mockResolveAlert.mockResolvedValue(resolvedAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.resolve({
        organizationId: orgId,
        alertId,
        resolution: 'Fixed temperature sensor',
        correctiveAction: 'Replaced faulty sensor',
      });

      expect(result).toEqual(resolvedAlert);
      expect(mockResolveAlert).toHaveBeenCalledWith(
        alertId,
        orgId,
        profileId,
        'Fixed temperature sensor',
        'Replaced faulty sensor',
      );
    });

    it('should resolve alert when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      const resolvedAlert = { ...mockAlert, status: 'resolved' };
      mockResolveAlert.mockResolvedValue(resolvedAlert);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.resolve({
        organizationId: orgId,
        alertId,
        resolution: 'Issue resolved',
      });

      expect(result).toEqual(resolvedAlert);
    });

    it('should throw FORBIDDEN when viewer tries to resolve', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.resolve({
          organizationId: orgId,
          alertId,
          resolution: 'Issue resolved',
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.resolve({
          organizationId: orgId,
          alertId,
          resolution: 'Issue resolved',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when resolving non-existent alert', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockResolveAlert.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.resolve({
          organizationId: orgId,
          alertId,
          resolution: 'Issue resolved',
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Alert not found',
      });
    });
  });
});
