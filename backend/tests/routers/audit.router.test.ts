/**
 * Tests for Audit tRPC Router
 *
 * Tests both procedures on the audit router (logEvent mutation, list query)
 * with comprehensive coverage of:
 * - Authentication boundary (UNAUTHORIZED when user is null)
 * - Authorization boundary (FORBIDDEN when user lacks org membership)
 * - Input validation (Zod schema enforcement)
 * - Happy-path behavior with correct service delegation
 * - Pagination defaults and calculation
 */

import { TRPCError } from '@trpc/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditRouter } from '../../src/routers/audit.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock AuditService (the service layer the router delegates to)
vi.mock('../../src/services/AuditService.js', () => ({
  AuditService: {
    logEvent: vi.fn(),
    listEvents: vi.fn(),
  },
}));

// Mock userService (consumed by orgProcedure's hasOrgAccess middleware)
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
  isSuperAdmin: vi.fn(),
}));

// Mock the database client (transitive dependency of services barrel)
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    query: {},
  },
}));

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const ORG_ID = '00000000-0000-4000-a000-000000000001';
const SITE_ID = '00000000-0000-4000-a000-000000000010';
const AREA_ID = '00000000-0000-4000-a000-000000000020';
const UNIT_ID = '00000000-0000-4000-a000-000000000030';
const USER_ID = 'user-1';
const PROFILE_ID = 'profile-1';

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

/** Authenticated user context (before org middleware enriches it). */
const authenticatedCtx = () => ({
  req: {} as any,
  res: { header: vi.fn() } as any,
  user: {
    id: USER_ID,
    email: 'user@test.com',
    name: 'Test User',
  },
});

/** Unauthenticated context (no JWT / expired token). */
const unauthenticatedCtx = () => ({
  req: {} as any,
  res: { header: vi.fn() } as any,
  user: null,
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Audit tRPC Router', () => {
  const createCaller = createCallerFactory(auditRouter);

  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockLogEvent: ReturnType<typeof vi.fn>;
  let mockListEvents: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Obtain references to mocked functions so we can configure per-test
    const userService = await import('../../src/services/user.service.js');
    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;

    const { AuditService } = await import('../../src/services/AuditService.js');
    mockLogEvent = AuditService.logEvent as any;
    mockListEvents = AuditService.listEvents as any;

    // Default happy-path stubs (overridden in specific tests as needed)
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: PROFILE_ID, isNew: false });
    mockLogEvent.mockResolvedValue({ success: true });
    mockListEvents.mockResolvedValue([]);
  });

  // =========================================================================
  // logEvent — authentication boundary
  // =========================================================================

  describe('logEvent', () => {
    const validLogEventInput = {
      eventType: 'sensor.created',
      title: 'Sensor provisioned',
      organizationId: ORG_ID,
    };

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      const caller = createCaller(unauthenticatedCtx());

      await expect(caller.logEvent(validLogEventInput)).rejects.toThrow(TRPCError);
      await expect(caller.logEvent(validLogEventInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });

      // Service layer should never be reached
      expect(mockLogEvent).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when user has no role in the organization', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const caller = createCaller(authenticatedCtx());

      await expect(caller.logEvent(validLogEventInput)).rejects.toThrow(TRPCError);
      await expect(caller.logEvent(validLogEventInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      expect(mockGetUserRoleInOrg).toHaveBeenCalledWith(USER_ID, ORG_ID);
      expect(mockLogEvent).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // logEvent — happy path
    // -----------------------------------------------------------------------

    it('should call AuditService.logEvent with correct params and return { success: true }', async () => {
      const caller = createCaller(authenticatedCtx());

      const result = await caller.logEvent(validLogEventInput);

      expect(result).toEqual({ success: true });
      expect(mockLogEvent).toHaveBeenCalledTimes(1);

      // The router spreads input and adds actorId + actorType from context
      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'sensor.created',
          title: 'Sensor provisioned',
          organizationId: ORG_ID,
          actorId: USER_ID,
          actorType: 'user',
        }),
      );
    });

    it('should pass all optional fields through to AuditService.logEvent', async () => {
      const caller = createCaller(authenticatedCtx());

      const fullInput = {
        eventType: 'compliance.violation',
        category: 'compliance' as const,
        severity: 'critical' as const,
        title: 'Temperature threshold exceeded',
        organizationId: ORG_ID,
        siteId: SITE_ID,
        areaId: AREA_ID,
        unitId: UNIT_ID,
        eventData: { temperatureC: 42.5, threshold: 40 },
        impersonationSessionId: 'imp-session-1',
        actingAdminId: 'admin-user-2',
      };

      const result = await caller.logEvent(fullInput);

      expect(result).toEqual({ success: true });
      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'compliance.violation',
          category: 'compliance',
          severity: 'critical',
          title: 'Temperature threshold exceeded',
          organizationId: ORG_ID,
          siteId: SITE_ID,
          areaId: AREA_ID,
          unitId: UNIT_ID,
          eventData: { temperatureC: 42.5, threshold: 40 },
          impersonationSessionId: 'imp-session-1',
          actingAdminId: 'admin-user-2',
          actorId: USER_ID,
          actorType: 'user',
        }),
      );
    });

    it('should apply Zod defaults for category and severity when omitted', async () => {
      const caller = createCaller(authenticatedCtx());

      await caller.logEvent(validLogEventInput);

      // category defaults to 'user_action', severity defaults to 'info'
      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'user_action',
          severity: 'info',
        }),
      );
    });

    // -----------------------------------------------------------------------
    // logEvent — input validation
    // -----------------------------------------------------------------------

    it('should reject logEvent when organizationId is not a valid UUID', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(
        caller.logEvent({
          eventType: 'test.event',
          title: 'Test',
          organizationId: 'not-a-uuid',
        }),
      ).rejects.toThrow();
    });

    it('should reject logEvent when category is not in the allowed enum', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(
        caller.logEvent({
          eventType: 'test.event',
          title: 'Test',
          organizationId: ORG_ID,
          category: 'invalid_category' as any,
        }),
      ).rejects.toThrow();
    });

    it('should reject logEvent when severity is not in the allowed enum', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(
        caller.logEvent({
          eventType: 'test.event',
          title: 'Test',
          organizationId: ORG_ID,
          severity: 'extreme' as any,
        }),
      ).rejects.toThrow();
    });

    it('should reject logEvent when siteId is present but not a valid UUID', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(
        caller.logEvent({
          eventType: 'test.event',
          title: 'Test',
          organizationId: ORG_ID,
          siteId: 'bad-uuid',
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // list — authentication boundary
  // =========================================================================

  describe('list', () => {
    const validListInput = { organizationId: ORG_ID };

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      const caller = createCaller(unauthenticatedCtx());

      await expect(caller.list(validListInput)).rejects.toThrow(TRPCError);
      await expect(caller.list(validListInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });

      expect(mockListEvents).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when user has no role in the organization', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const caller = createCaller(authenticatedCtx());

      await expect(caller.list(validListInput)).rejects.toThrow(TRPCError);
      await expect(caller.list(validListInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      expect(mockGetUserRoleInOrg).toHaveBeenCalledWith(USER_ID, ORG_ID);
      expect(mockListEvents).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // list — happy path
    // -----------------------------------------------------------------------

    it('should call AuditService.listEvents with organizationId from context and return its result', async () => {
      const fakeEvents = [
        {
          id: 'evt-1',
          eventType: 'sensor.created',
          title: 'Sensor provisioned',
          organizationId: ORG_ID,
        },
        {
          id: 'evt-2',
          eventType: 'alert.triggered',
          title: 'Alert fired',
          organizationId: ORG_ID,
        },
      ];
      mockListEvents.mockResolvedValue(fakeEvents);

      const caller = createCaller(authenticatedCtx());

      const result = await caller.list(validListInput);

      expect(result).toEqual(fakeEvents);
      expect(mockListEvents).toHaveBeenCalledTimes(1);

      // The router uses ctx.user.organizationId (set by hasOrgAccess middleware),
      // NOT input.organizationId directly. Both should match ORG_ID here.
      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
        }),
      );
    });

    it('should pass optional filter fields through to AuditService.listEvents', async () => {
      mockListEvents.mockResolvedValue([]);
      const caller = createCaller(authenticatedCtx());

      const startDate = '2025-06-01T00:00:00.000Z';
      const endDate = '2025-06-30T23:59:59.000Z';

      await caller.list({
        organizationId: ORG_ID,
        siteId: SITE_ID,
        areaId: AREA_ID,
        unitId: UNIT_ID,
        start: startDate,
        end: endDate,
      });

      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          siteId: SITE_ID,
          areaId: AREA_ID,
          unitId: UNIT_ID,
          start: startDate,
          end: endDate,
        }),
      );
    });

    // -----------------------------------------------------------------------
    // list — pagination defaults
    // -----------------------------------------------------------------------

    it('should default limit to 50 and offset to 0 when page and limit are omitted', async () => {
      mockListEvents.mockResolvedValue([]);
      const caller = createCaller(authenticatedCtx());

      await caller.list(validListInput);

      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        }),
      );
    });

    it('should compute correct offset from page and limit', async () => {
      mockListEvents.mockResolvedValue([]);
      const caller = createCaller(authenticatedCtx());

      // page 3, limit 20 => offset = (3-1)*20 = 40
      await caller.list({
        organizationId: ORG_ID,
        page: 3,
        limit: 20,
      });

      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 40,
        }),
      );
    });

    it('should use default limit of 50 when only page is provided', async () => {
      mockListEvents.mockResolvedValue([]);
      const caller = createCaller(authenticatedCtx());

      // page 2, no limit => limit defaults to 50, offset = (2-1)*50 = 50
      await caller.list({
        organizationId: ORG_ID,
        page: 2,
      });

      expect(mockListEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 50,
        }),
      );
    });

    // -----------------------------------------------------------------------
    // list — input validation
    // -----------------------------------------------------------------------

    it('should reject list when organizationId is not a valid UUID', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(caller.list({ organizationId: 'not-a-uuid' })).rejects.toThrow();
    });

    it('should reject list when page is less than 1', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(caller.list({ organizationId: ORG_ID, page: 0 })).rejects.toThrow();
    });

    it('should reject list when limit exceeds 1000', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(caller.list({ organizationId: ORG_ID, limit: 1001 })).rejects.toThrow();
    });

    it('should reject list when limit is less than 1', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(caller.list({ organizationId: ORG_ID, limit: 0 })).rejects.toThrow();
    });

    it('should reject list when start is not a valid ISO datetime', async () => {
      const caller = createCaller(authenticatedCtx());

      await expect(
        caller.list({ organizationId: ORG_ID, start: 'last-tuesday' }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Service error propagation
  // =========================================================================

  describe('service error propagation', () => {
    it('should propagate errors from AuditService.logEvent', async () => {
      mockLogEvent.mockRejectedValue(new Error('Database write failed'));

      const caller = createCaller(authenticatedCtx());

      await expect(
        caller.logEvent({
          eventType: 'test.event',
          title: 'Test',
          organizationId: ORG_ID,
        }),
      ).rejects.toThrow('Database write failed');
    });

    it('should propagate errors from AuditService.listEvents', async () => {
      mockListEvents.mockRejectedValue(new Error('Database read failed'));

      const caller = createCaller(authenticatedCtx());

      await expect(caller.list({ organizationId: ORG_ID })).rejects.toThrow('Database read failed');
    });
  });
});
