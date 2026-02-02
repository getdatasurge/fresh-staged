/**
 * Tests for Inspector tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - validateSession: Validate inspector token via raw SQL
 * - checkUserAccess: Verify user has org access with allowed role
 * - getOrgData: Get organization name, timezone, and sites
 * - getUnits: Get units with area info, optional site filter
 * - getInspectionData: Get sensor readings, manual logs, alerts,
 *   corrective actions, and monitoring gaps for a date range
 */

import { TRPCError } from '@trpc/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inspectorRouter } from '../../src/routers/inspector.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.hoisted runs before vi.mock factories, so these variables are available
// inside mock factories despite hoisting.
const { mockExecute, mockDbChain } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockDbChain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    execute: mockExecute,
  };
  return { mockExecute, mockDbChain };
});

// Mock the user service (used by orgProcedure and protectedProcedure middleware)
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
  isSuperAdmin: vi.fn(),
  getProfileByUserId: vi.fn(),
  getUserPrimaryOrganization: vi.fn(),
}));

// Mock the database client with the hoisted chain-friendly mock
vi.mock('../../src/db/client.js', () => ({
  db: mockDbChain,
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Inspector tRPC Router', () => {
  const createCaller = createCallerFactory(inspectorRouter);

  // Mocked service references (assigned in beforeEach after dynamic import)
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;

  // Valid UUIDs used across tests
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const siteId = '223e4567-e89b-12d3-a456-426614174001';
  const unitId1 = '323e4567-e89b-12d3-a456-426614174002';
  const unitId2 = '423e4567-e89b-12d3-a456-426614174003';
  const profileId = '523e4567-e89b-12d3-a456-426614174004';

  // -----------------------------------------------------------------------
  // Context factories
  // -----------------------------------------------------------------------
  const createAuthContext = () => ({
    req: {} as any,
    res: { header: vi.fn() } as any,
    user: {
      id: 'user-1',
      email: 'user@test.com',
      name: 'Test User',
    },
  });

  const createNoAuthContext = () => ({
    req: {} as any,
    res: { header: vi.fn() } as any,
    user: null,
  });

  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-import mocked modules to get fresh references after clearAllMocks
    const userService = await import('../../src/services/user.service.js');
    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;

    // Sensible defaults: user is an admin with a profile
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: profileId, isNew: false });

    // Default db.execute to return empty rows
    mockExecute.mockResolvedValue({ rows: [] });

    // Default db select chain to resolve to empty array (via limit as terminal)
    mockDbChain.limit.mockResolvedValue([]);
    // For queries without .limit() that terminate at .where() or .orderBy()
    mockDbChain.where.mockReturnThis();
    mockDbChain.orderBy.mockResolvedValue([]);
  });

  // =========================================================================
  // validateSession
  // =========================================================================
  describe('validateSession', () => {
    it('should throw UNAUTHORIZED when user is null', async () => {
      const caller = createCaller(createNoAuthContext());

      await expect(caller.validateSession({ token: 'some-token' })).rejects.toThrow(TRPCError);

      await expect(caller.validateSession({ token: 'some-token' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should throw NOT_FOUND when token does not match any session', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const caller = createCaller(createAuthContext());

      await expect(caller.validateSession({ token: 'invalid-token' })).rejects.toThrow(TRPCError);

      await expect(caller.validateSession({ token: 'invalid-token' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should throw FORBIDDEN when session is inactive', async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            organization_id: orgId,
            allowed_site_ids: null,
            expires_at: new Date(Date.now() + 86400000).toISOString(), // future
            is_active: false,
          },
        ],
      });
      // Org membership check must pass before session status is checked
      mockDbChain.limit.mockResolvedValueOnce([{ id: 'role-1' }]);

      const caller = createCaller(createAuthContext());

      await expect(caller.validateSession({ token: 'inactive-token' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Inspector session is inactive',
      });
    });

    it('should throw FORBIDDEN when session has expired', async () => {
      mockExecute.mockResolvedValue({
        rows: [
          {
            organization_id: orgId,
            allowed_site_ids: null,
            expires_at: new Date(Date.now() - 86400000).toISOString(), // past
            is_active: true,
          },
        ],
      });
      // Org membership check must pass before expiry is checked
      mockDbChain.limit.mockResolvedValueOnce([{ id: 'role-1' }]);

      const caller = createCaller(createAuthContext());

      await expect(caller.validateSession({ token: 'expired-token' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Inspector session has expired',
      });
    });

    it('should return organizationId and allowedSiteIds for a valid session', async () => {
      const allowedSites = [siteId];

      // First call: SELECT session
      // Second call: UPDATE last_used_at
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              organization_id: orgId,
              allowed_site_ids: allowedSites,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              is_active: true,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE response
      // Org membership check must pass
      mockDbChain.limit.mockResolvedValueOnce([{ id: 'role-1' }]);

      const caller = createCaller(createAuthContext());
      const result = await caller.validateSession({ token: 'valid-token' });

      expect(result).toEqual({
        organizationId: orgId,
        allowedSiteIds: allowedSites,
      });

      // db.execute should be called twice: SELECT then UPDATE
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('should return null allowedSiteIds when session has no site restrictions', async () => {
      mockExecute
        .mockResolvedValueOnce({
          rows: [
            {
              organization_id: orgId,
              allowed_site_ids: null,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              is_active: true,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });
      // Org membership check must pass
      mockDbChain.limit.mockResolvedValueOnce([{ id: 'role-1' }]);

      const caller = createCaller(createAuthContext());
      const result = await caller.validateSession({ token: 'valid-token' });

      expect(result).toEqual({
        organizationId: orgId,
        allowedSiteIds: null,
      });
    });

    it('should reject input with empty token string', async () => {
      const caller = createCaller(createAuthContext());

      // z.string().min(1) rejects empty strings
      await expect(caller.validateSession({ token: '' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // checkUserAccess
  // =========================================================================
  describe('checkUserAccess', () => {
    it('should throw UNAUTHORIZED when user is null', async () => {
      const caller = createCaller(createNoAuthContext());

      await expect(caller.checkUserAccess({ organizationId: orgId })).rejects.toThrow(TRPCError);

      await expect(caller.checkUserAccess({ organizationId: orgId })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should throw FORBIDDEN when user has no org role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const caller = createCaller(createAuthContext());

      await expect(caller.checkUserAccess({ organizationId: orgId })).rejects.toThrow(TRPCError);

      await expect(caller.checkUserAccess({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should return organizationId and role when user has a valid role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');

      const caller = createCaller(createAuthContext());
      const result = await caller.checkUserAccess({ organizationId: orgId });

      expect(result).toEqual({
        organizationId: orgId,
        role: 'admin',
      });
    });

    it.each(['viewer', 'staff', 'manager', 'admin', 'owner'] as const)(
      'should allow access for role: %s',
      async (role) => {
        mockGetUserRoleInOrg.mockResolvedValue(role);

        const caller = createCaller(createAuthContext());
        const result = await caller.checkUserAccess({ organizationId: orgId });

        expect(result).toEqual({
          organizationId: orgId,
          role,
        });
      },
    );

    it('should throw FORBIDDEN for a role not in the allowed list', async () => {
      // orgProcedure sets ctx.user.role from getUserRoleInOrg. The procedure
      // then checks against the allowedRoles list. A role like 'guest' is not
      // in ['viewer','staff','manager','admin','owner'].
      mockGetUserRoleInOrg.mockResolvedValue('guest');

      const caller = createCaller(createAuthContext());

      await expect(caller.checkUserAccess({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'No access to inspector mode',
      });
    });

    it('should reject input with invalid UUID for organizationId', async () => {
      const caller = createCaller(createAuthContext());

      await expect(caller.checkUserAccess({ organizationId: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // getOrgData
  // =========================================================================
  describe('getOrgData', () => {
    it('should throw UNAUTHORIZED when user is null', async () => {
      const caller = createCaller(createNoAuthContext());

      await expect(caller.getOrgData({ organizationId: orgId })).rejects.toThrow(TRPCError);

      await expect(caller.getOrgData({ organizationId: orgId })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should throw FORBIDDEN when user has no org role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const caller = createCaller(createAuthContext());

      await expect(caller.getOrgData({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw NOT_FOUND when organization does not exist', async () => {
      // db.select().from().where().limit() returns [] (no org)
      mockDbChain.limit.mockResolvedValueOnce([]);
      // The second chained query (sites) should not even be reached
      // because the procedure throws first.

      const caller = createCaller(createAuthContext());

      await expect(caller.getOrgData({ organizationId: orgId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    });

    it('should return org name, timezone, and sites', async () => {
      const mockOrg = { name: 'Test Org', timezone: 'America/New_York' };
      const mockSites = [{ id: siteId, name: 'Site A', timezone: 'America/New_York' }];

      // Org query: .select().from().where().limit(1) -- .limit() is terminal
      mockDbChain.limit.mockResolvedValueOnce([mockOrg]);
      // Sites query: .select().from().where() -- .where() is terminal (awaited)
      // First .where() call (org query) must return this for chaining to .limit()
      // Second .where() call (sites query) must resolve to mockSites
      mockDbChain.where
        .mockReturnValueOnce(mockDbChain) // org query: chain to .limit()
        .mockResolvedValueOnce(mockSites); // sites query: resolve directly

      const caller = createCaller(createAuthContext());
      const result = await caller.getOrgData({ organizationId: orgId });

      expect(result).toEqual({
        name: 'Test Org',
        timezone: 'America/New_York',
        sites: mockSites,
      });
    });

    it('should filter sites by allowedSiteIds when provided', async () => {
      const siteId2 = '623e4567-e89b-12d3-a456-426614174005';
      const mockOrg = { name: 'Test Org', timezone: 'UTC' };
      const mockSites = [
        { id: siteId, name: 'Site A', timezone: 'UTC' },
        { id: siteId2, name: 'Site B', timezone: 'UTC' },
      ];

      mockDbChain.limit.mockResolvedValueOnce([mockOrg]);
      mockDbChain.where.mockReturnValueOnce(mockDbChain).mockResolvedValueOnce(mockSites);

      const caller = createCaller(createAuthContext());
      const result = await caller.getOrgData({
        organizationId: orgId,
        allowedSiteIds: [siteId],
      });

      // Only Site A should be returned
      expect(result.sites).toHaveLength(1);
      expect(result.sites[0].id).toBe(siteId);
      expect(result.sites[0].name).toBe('Site A');
    });

    it('should return all sites when allowedSiteIds is empty array', async () => {
      const mockOrg = { name: 'Test Org', timezone: 'UTC' };
      const mockSites = [{ id: siteId, name: 'Site A', timezone: 'UTC' }];

      mockDbChain.limit.mockResolvedValueOnce([mockOrg]);
      mockDbChain.where.mockReturnValueOnce(mockDbChain).mockResolvedValueOnce(mockSites);

      const caller = createCaller(createAuthContext());
      const result = await caller.getOrgData({
        organizationId: orgId,
        allowedSiteIds: [],
      });

      // Empty allowedSiteIds should NOT filter (length === 0 condition)
      expect(result.sites).toHaveLength(1);
    });
  });

  // =========================================================================
  // getUnits
  // =========================================================================
  describe('getUnits', () => {
    it('should throw UNAUTHORIZED when user is null', async () => {
      const caller = createCaller(createNoAuthContext());

      await expect(caller.getUnits({ organizationId: orgId })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should throw FORBIDDEN when user has no org role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const caller = createCaller(createAuthContext());

      await expect(caller.getUnits({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should return mapped unit data', async () => {
      const mockUnitsData = [
        {
          id: unitId1,
          name: 'Walk-in Cooler',
          unitType: 'cooler',
          tempMax: 40,
          tempMin: 32,
          areaId: 'area-1',
          areaName: 'Kitchen',
          siteId: siteId,
        },
      ];

      // getUnits query terminates at .where() (no .limit() or .orderBy())
      mockDbChain.where.mockResolvedValueOnce(mockUnitsData);

      const caller = createCaller(createAuthContext());
      const result = await caller.getUnits({ organizationId: orgId });

      expect(result).toEqual([
        {
          id: unitId1,
          name: 'Walk-in Cooler',
          unit_type: 'cooler',
          temp_limit_high: 40,
          temp_limit_low: 32,
          area: { name: 'Kitchen' },
          site_id: siteId,
        },
      ]);
    });

    it('should return empty array when no units exist', async () => {
      mockDbChain.where.mockResolvedValueOnce([]);

      const caller = createCaller(createAuthContext());
      const result = await caller.getUnits({ organizationId: orgId });

      expect(result).toEqual([]);
    });

    it('should accept optional siteId filter', async () => {
      mockDbChain.where.mockResolvedValueOnce([]);

      const caller = createCaller(createAuthContext());
      const result = await caller.getUnits({
        organizationId: orgId,
        siteId: siteId,
      });

      expect(result).toEqual([]);
      // Verify the query was executed (where was called)
      expect(mockDbChain.where).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getInspectionData
  // =========================================================================
  describe('getInspectionData', () => {
    const startDate = '2024-01-01T00:00:00.000Z';
    const endDate = '2024-01-31T23:59:59.000Z';

    it('should throw UNAUTHORIZED when user is null', async () => {
      const caller = createCaller(createNoAuthContext());

      await expect(
        caller.getInspectionData({
          organizationId: orgId,
          unitIds: [unitId1],
          startDate,
          endDate,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('should throw FORBIDDEN when user has no org role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const caller = createCaller(createAuthContext());

      await expect(
        caller.getInspectionData({
          organizationId: orgId,
          unitIds: [unitId1],
          startDate,
          endDate,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('should return empty arrays when unitIds is empty', async () => {
      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [],
        startDate,
        endDate,
      });

      expect(result).toEqual({
        temperatureLogs: [],
        exceptions: [],
        correctiveActions: [],
        monitoringGaps: [],
      });

      // No database queries should have been made beyond the orgProcedure middleware ones
    });

    it('should return sensor readings, manual logs, alerts, corrective actions, and monitoring gaps', async () => {
      const recordedAt = new Date('2024-01-15T10:00:00Z');
      const actionAt = new Date('2024-01-15T11:00:00Z');

      // Mock the four database queries that getInspectionData performs sequentially.
      // Each query chain terminates at .orderBy() (the last chained call).
      mockDbChain.orderBy
        // 1. sensorReadings query
        .mockResolvedValueOnce([
          {
            id: 'sr-1',
            unitId: unitId1,
            temperature: '35.5',
            recordedAt,
          },
        ])
        // 2. manualTemperatureLogs query
        .mockResolvedValueOnce([
          {
            id: 'ml-1',
            unitId: unitId1,
            temperature: '36.0',
            recordedAt,
            profileId: profileId,
            notes: 'Routine check',
            profileName: 'John Doe',
            profileEmail: 'john@test.com',
          },
        ])
        // 3. alerts query
        .mockResolvedValueOnce([
          {
            id: 'alert-1',
            unitId: unitId1,
            alertType: 'temp_high',
            message: 'Temperature too high',
            severity: 'critical',
            status: 'active',
            triggeredAt: recordedAt,
            acknowledgedBy: null,
            metadata: null,
            acknowledgerName: null,
            acknowledgerEmail: null,
          },
        ])
        // 4. correctiveActions query
        .mockResolvedValueOnce([
          {
            id: 'ca-1',
            unitId: unitId1,
            description: 'Compressor failure',
            actionTaken: 'Replaced compressor',
            actionAt,
            profileId: profileId,
            profileName: 'Jane Smith',
            profileEmail: 'jane@test.com',
          },
        ])
        // 5. eventLogs (monitoring gaps) query
        .mockResolvedValueOnce([
          {
            id: 'gap-1',
            unitId: unitId1,
            eventType: 'unit_state_change',
            eventData: {
              from_status: 'online',
              to_status: 'offline',
              duration_minutes: 45,
            },
            recordedAt,
          },
        ]);

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      // Sensor readings
      expect(result.sensorReadings).toHaveLength(1);
      expect(result.sensorReadings[0]).toEqual({
        id: 'sr-1',
        unit_id: unitId1,
        temperature: 35.5,
        recorded_at: recordedAt.toISOString(),
      });

      // Manual logs
      expect(result.manualLogs).toHaveLength(1);
      expect(result.manualLogs[0]).toEqual({
        id: 'ml-1',
        unit_id: unitId1,
        temperature: 36.0,
        logged_at: recordedAt.toISOString(),
        logged_by: 'John Doe',
        notes: 'Routine check',
      });

      // Alerts
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]).toEqual({
        id: 'alert-1',
        unit_id: unitId1,
        alert_type: 'temp_high',
        title: 'Temperature too high',
        severity: 'critical',
        status: 'active',
        triggered_at: recordedAt.toISOString(),
        acknowledged_by: null,
        acknowledgment_notes: undefined,
      });

      // Corrective actions
      expect(result.correctiveActions).toHaveLength(1);
      expect(result.correctiveActions[0]).toEqual({
        id: 'ca-1',
        unit_id: unitId1,
        action_taken: 'Replaced compressor',
        root_cause: 'Compressor failure',
        completed_at: actionAt.toISOString(),
        created_by: 'Jane Smith',
      });

      // Monitoring gaps
      expect(result.monitoringGaps).toHaveLength(1);
      expect(result.monitoringGaps[0]).toEqual({
        id: 'gap-1',
        unit_id: unitId1,
        gap_type: 'online \u2192 offline',
        start_at: recordedAt.toISOString(),
        duration_minutes: 45,
      });
    });

    it('should use profileEmail as fallback when profileName is null for manual logs', async () => {
      const recordedAt = new Date('2024-01-15T10:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([]) // sensor readings
        .mockResolvedValueOnce([
          {
            id: 'ml-1',
            unitId: unitId1,
            temperature: '33.0',
            recordedAt,
            profileId: profileId,
            notes: null,
            profileName: null,
            profileEmail: 'fallback@test.com',
          },
        ])
        .mockResolvedValueOnce([]) // alerts
        .mockResolvedValueOnce([]) // corrective actions
        .mockResolvedValueOnce([]); // event logs

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      expect(result.manualLogs[0].logged_by).toBe('fallback@test.com');
    });

    it('should use "Unknown" when both profileName and profileEmail are null', async () => {
      const recordedAt = new Date('2024-01-15T10:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([]) // sensor readings
        .mockResolvedValueOnce([
          {
            id: 'ml-1',
            unitId: unitId1,
            temperature: '33.0',
            recordedAt,
            profileId: null,
            notes: null,
            profileName: null,
            profileEmail: null,
          },
        ])
        .mockResolvedValueOnce([]) // alerts
        .mockResolvedValueOnce([]) // corrective actions
        .mockResolvedValueOnce([]); // event logs

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      expect(result.manualLogs[0].logged_by).toBe('Unknown');
    });

    it('should filter out monitoring gaps that are not offline, monitoring_interrupted, or missed_manual_log', async () => {
      const recordedAt = new Date('2024-01-15T10:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([]) // sensor readings
        .mockResolvedValueOnce([]) // manual logs
        .mockResolvedValueOnce([]) // alerts
        .mockResolvedValueOnce([]) // corrective actions
        .mockResolvedValueOnce([
          // This event should be included (to_status = 'offline')
          {
            id: 'gap-1',
            unitId: unitId1,
            eventType: 'unit_state_change',
            eventData: {
              from_status: 'online',
              to_status: 'offline',
              duration_minutes: 30,
            },
            recordedAt,
          },
          // This event should be included (to_status = 'monitoring_interrupted')
          {
            id: 'gap-2',
            unitId: unitId1,
            eventType: 'unit_state_change',
            eventData: {
              from_status: 'online',
              to_status: 'monitoring_interrupted',
              duration_minutes: 15,
            },
            recordedAt,
          },
          // This event should be included (eventType = 'missed_manual_log')
          {
            id: 'gap-3',
            unitId: unitId1,
            eventType: 'missed_manual_log',
            eventData: { duration_minutes: 120 },
            recordedAt,
          },
          // This event should be EXCLUDED (to_status = 'online', not a gap)
          {
            id: 'gap-4',
            unitId: unitId1,
            eventType: 'unit_state_change',
            eventData: {
              from_status: 'offline',
              to_status: 'online',
              duration_minutes: 0,
            },
            recordedAt,
          },
        ]);

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      expect(result.monitoringGaps).toHaveLength(3);
      expect(result.monitoringGaps.map((g) => g.id)).toEqual(['gap-1', 'gap-2', 'gap-3']);
    });

    it('should parse alert metadata for acknowledgment notes', async () => {
      const triggeredAt = new Date('2024-01-15T10:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([]) // sensor readings
        .mockResolvedValueOnce([]) // manual logs
        .mockResolvedValueOnce([
          {
            id: 'alert-1',
            unitId: unitId1,
            alertType: 'temp_high',
            message: 'Too hot',
            severity: 'warning',
            status: 'acknowledged',
            triggeredAt,
            acknowledgedBy: profileId,
            metadata: JSON.stringify({
              acknowledgmentNotes: 'Investigating the issue',
            }),
            acknowledgerName: 'Admin User',
            acknowledgerEmail: 'admin@test.com',
          },
        ])
        .mockResolvedValueOnce([]) // corrective actions
        .mockResolvedValueOnce([]); // event logs

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      expect(result.alerts[0].acknowledged_by).toBe('Admin User');
      expect(result.alerts[0].acknowledgment_notes).toBe('Investigating the issue');
    });

    it('should use description as fallback when actionTaken is null for corrective actions', async () => {
      const actionAt = new Date('2024-01-15T12:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([]) // sensor readings
        .mockResolvedValueOnce([]) // manual logs
        .mockResolvedValueOnce([]) // alerts
        .mockResolvedValueOnce([
          {
            id: 'ca-1',
            unitId: unitId1,
            description: 'Root cause description',
            actionTaken: null,
            actionAt,
            profileId: profileId,
            profileName: 'Tech',
            profileEmail: 'tech@test.com',
          },
        ])
        .mockResolvedValueOnce([]); // event logs

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      // actionTaken is null so it falls back to description
      expect(result.correctiveActions[0].action_taken).toBe('Root cause description');
      expect(result.correctiveActions[0].root_cause).toBe('Root cause description');
    });

    it('should handle monitoring gap with null eventData gracefully', async () => {
      const recordedAt = new Date('2024-01-15T10:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([]) // sensor readings
        .mockResolvedValueOnce([]) // manual logs
        .mockResolvedValueOnce([]) // alerts
        .mockResolvedValueOnce([]) // corrective actions
        .mockResolvedValueOnce([
          {
            id: 'gap-1',
            unitId: unitId1,
            eventType: 'missed_manual_log',
            eventData: null,
            recordedAt,
          },
        ]);

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1],
        startDate,
        endDate,
      });

      // missed_manual_log passes the filter even with null eventData
      expect(result.monitoringGaps).toHaveLength(1);
      expect(result.monitoringGaps[0].gap_type).toBe('Missed Manual Log');
      expect(result.monitoringGaps[0].duration_minutes).toBe(0);
    });

    it('should handle multiple unitIds', async () => {
      const recordedAt = new Date('2024-01-15T10:00:00Z');

      mockDbChain.orderBy
        .mockResolvedValueOnce([
          {
            id: 'sr-1',
            unitId: unitId1,
            temperature: '35.0',
            recordedAt,
          },
          {
            id: 'sr-2',
            unitId: unitId2,
            temperature: '38.0',
            recordedAt,
          },
        ])
        .mockResolvedValueOnce([]) // manual logs
        .mockResolvedValueOnce([]) // alerts
        .mockResolvedValueOnce([]) // corrective actions
        .mockResolvedValueOnce([]); // event logs

      const caller = createCaller(createAuthContext());
      const result = await caller.getInspectionData({
        organizationId: orgId,
        unitIds: [unitId1, unitId2],
        startDate,
        endDate,
      });

      expect(result.sensorReadings).toHaveLength(2);
      expect(result.sensorReadings[0].unit_id).toBe(unitId1);
      expect(result.sensorReadings[1].unit_id).toBe(unitId2);
    });

    it('should reject invalid datetime strings for startDate/endDate', async () => {
      const caller = createCaller(createAuthContext());

      await expect(
        caller.getInspectionData({
          organizationId: orgId,
          unitIds: [unitId1],
          startDate: 'not-a-date',
          endDate,
        }),
      ).rejects.toThrow();
    });
  });
});
