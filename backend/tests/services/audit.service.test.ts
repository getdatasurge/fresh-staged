import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client.js';
import { AuditService } from '../../src/services/AuditService.js';

// Mock the database client — vi.mock is hoisted automatically by Vitest
vi.mock('../../src/db/client.js', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

const mockDb = vi.mocked(db);

/**
 * AuditService Tests
 *
 * Tests cover:
 * - logEvent: basic event logging, default parameter values, impersonation fields
 * - listEvents: basic listing, filters (site, area, unit, date range), default limit/offset
 * - logImpersonatedAction: delegation to logEvent with correct actorType
 */

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logEvent', () => {
    it('should insert an event log and return success', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      const result = await AuditService.logEvent({
        eventType: 'unit.created',
        title: 'Unit created',
        organizationId: 'org-123',
        actorId: 'user-456',
      });

      expect(result).toEqual({ success: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'unit.created',
          title: 'Unit created',
          organizationId: 'org-123',
          actorId: 'user-456',
        }),
      );
    });

    it('should apply default category of user_action', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'site.updated',
        title: 'Site updated',
        organizationId: 'org-123',
        actorId: 'user-456',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'user_action',
        }),
      );
    });

    it('should apply default severity of info', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'site.updated',
        title: 'Site updated',
        organizationId: 'org-123',
        actorId: 'user-456',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'info',
        }),
      );
    });

    it('should apply default actorType of user', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'site.updated',
        title: 'Site updated',
        organizationId: 'org-123',
        actorId: 'user-456',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'user',
        }),
      );
    });

    it('should allow overriding category, severity, and actorType', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'alert.triggered',
        category: 'system_event',
        severity: 'warning',
        title: 'Alert triggered',
        organizationId: 'org-123',
        actorId: 'system',
        actorType: 'system',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system_event',
          severity: 'warning',
          actorType: 'system',
        }),
      );
    });

    it('should pass optional location fields (siteId, areaId, unitId)', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'reading.recorded',
        title: 'Temperature reading recorded',
        organizationId: 'org-123',
        siteId: 'site-1',
        areaId: 'area-2',
        unitId: 'unit-3',
        actorId: 'user-456',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          siteId: 'site-1',
          areaId: 'area-2',
          unitId: 'unit-3',
        }),
      );
    });

    it('should pass eventData as-is', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      const eventData = { oldName: 'Freezer A', newName: 'Freezer B' };

      await AuditService.logEvent({
        eventType: 'unit.renamed',
        title: 'Unit renamed',
        organizationId: 'org-123',
        actorId: 'user-456',
        eventData,
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventData,
        }),
      );
    });

    it('should set impersonation fields when actingAdminId is provided', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'unit.updated',
        title: 'Unit updated via impersonation',
        organizationId: 'org-123',
        actorId: 'user-456',
        actingAdminId: 'admin-789',
        impersonationSessionId: 'session-abc',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          actingUserId: 'admin-789',
          impersonationSessionId: 'session-abc',
          wasImpersonated: true,
        }),
      );
    });

    it('should set wasImpersonated to false when actingAdminId is not provided', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'unit.updated',
        title: 'Unit updated',
        organizationId: 'org-123',
        actorId: 'user-456',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          actingUserId: null,
          impersonationSessionId: null,
          wasImpersonated: false,
        }),
      );
    });

    it('should include a recordedAt date', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logEvent({
        eventType: 'site.created',
        title: 'Site created',
        organizationId: 'org-123',
        actorId: 'user-456',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          recordedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('listEvents', () => {
    function buildSelectChain(resolvedData: unknown[] = []) {
      const chain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(resolvedData),
      };
      return chain;
    }

    it('should return results from the database', async () => {
      const mockRows = [
        {
          id: 'evt-1',
          eventType: 'unit.created',
          category: 'user_action',
          severity: 'info',
          title: 'Unit created',
          recordedAt: new Date('2026-01-15T10:00:00Z'),
          organizationId: 'org-123',
          siteId: 'site-1',
          areaId: null,
          unitId: null,
          actorId: 'user-456',
          actorType: 'user',
          eventData: null,
          ipAddress: null,
          userAgent: null,
          siteName: 'Main Site',
          areaName: null,
          unitName: null,
          actorName: 'Test User',
          actorEmail: 'test@example.com',
        },
      ];
      const chain = buildSelectChain(mockRows);
      mockDb.select.mockReturnValue(chain as any);

      const results = await AuditService.listEvents({
        organizationId: 'org-123',
      });

      expect(results).toEqual(mockRows);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return an empty array when no events match', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      const results = await AuditService.listEvents({
        organizationId: 'org-123',
      });

      expect(results).toEqual([]);
    });

    it('should chain from -> leftJoin (x4) -> where -> orderBy -> limit -> offset', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      await AuditService.listEvents({ organizationId: 'org-123' });

      expect(chain.from).toHaveBeenCalledTimes(1);
      expect(chain.leftJoin).toHaveBeenCalledTimes(4);
      expect(chain.where).toHaveBeenCalledTimes(1);
      expect(chain.orderBy).toHaveBeenCalledTimes(1);
      expect(chain.limit).toHaveBeenCalledTimes(1);
      expect(chain.offset).toHaveBeenCalledTimes(1);
    });

    it('should use default limit of 50 and offset of 0', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      await AuditService.listEvents({ organizationId: 'org-123' });

      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it('should use provided limit and offset', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      await AuditService.listEvents({
        organizationId: 'org-123',
        limit: 25,
        offset: 100,
      });

      expect(chain.limit).toHaveBeenCalledWith(25);
      expect(chain.offset).toHaveBeenCalledWith(100);
    });

    it('should pass filters through to the query when provided', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      await AuditService.listEvents({
        organizationId: 'org-123',
        siteId: 'site-1',
        areaId: 'area-2',
        unitId: 'unit-3',
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-31T23:59:59Z',
      });

      expect(chain.where).toHaveBeenCalledTimes(1);
      // The where clause is constructed with and() containing all conditions
      // We verify the query executed with the full chain
      expect(chain.from).toHaveBeenCalled();
    });

    it('should handle listing with only organizationId (no optional filters)', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      const results = await AuditService.listEvents({
        organizationId: 'org-999',
      });

      expect(results).toEqual([]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });

    it('should handle listing with only siteId filter', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      await AuditService.listEvents({
        organizationId: 'org-123',
        siteId: 'site-1',
      });

      expect(chain.where).toHaveBeenCalledTimes(1);
    });

    it('should handle listing with only date range filters', async () => {
      const chain = buildSelectChain([]);
      mockDb.select.mockReturnValue(chain as any);

      await AuditService.listEvents({
        organizationId: 'org-123',
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-31T23:59:59Z',
      });

      expect(chain.where).toHaveBeenCalledTimes(1);
    });
  });

  describe('logImpersonatedAction', () => {
    it('should delegate to logEvent with actorType set to user', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      const result = await AuditService.logImpersonatedAction({
        eventType: 'unit.updated',
        title: 'Unit updated via impersonation',
        organizationId: 'org-123',
        actorId: 'user-456',
        actingAdminId: 'admin-789',
        impersonationSessionId: 'session-abc',
      });

      expect(result).toEqual({ success: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: 'user',
          actingUserId: 'admin-789',
          impersonationSessionId: 'session-abc',
          wasImpersonated: true,
        }),
      );
    });

    it('should pass through all other params to logEvent', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logImpersonatedAction({
        eventType: 'reading.corrected',
        category: 'compliance',
        severity: 'warning',
        title: 'Reading corrected by admin impersonating user',
        organizationId: 'org-123',
        siteId: 'site-1',
        areaId: 'area-2',
        unitId: 'unit-3',
        actorId: 'user-456',
        actingAdminId: 'admin-789',
        eventData: { oldValue: 35, newValue: 37 },
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'reading.corrected',
          category: 'compliance',
          severity: 'warning',
          title: 'Reading corrected by admin impersonating user',
          organizationId: 'org-123',
          siteId: 'site-1',
          areaId: 'area-2',
          unitId: 'unit-3',
          actorId: 'user-456',
          actorType: 'user',
          actingUserId: 'admin-789',
          wasImpersonated: true,
          eventData: { oldValue: 35, newValue: 37 },
        }),
      );
    });

    it('should always set wasImpersonated to true since actingAdminId is required', async () => {
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.insert.mockReturnValue(mockInsertChain as any);

      await AuditService.logImpersonatedAction({
        eventType: 'site.viewed',
        title: 'Site viewed via impersonation',
        organizationId: 'org-123',
        actorId: 'user-456',
        actingAdminId: 'admin-001',
      });

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          wasImpersonated: true,
          actingUserId: 'admin-001',
        }),
      );
    });
  });
});
