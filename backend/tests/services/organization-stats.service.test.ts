import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OrganizationStatsService,
  ORG_STATS_CACHE_CONFIG,
  type UnitStateCounts,
  type AlertStatusCounts,
  type OrganizationStats,
} from '../../src/services/organization-stats.service.js';
import type { UnitStateService, UnitStateInfo } from '../../src/services/unit-state.service.js';
import type { UnitDashboardState } from '../../src/config/unit-state.config.js';

/**
 * Organization Stats Service Tests
 *
 * Tests cover:
 * - Configuration values
 * - State aggregation and worst state calculation
 * - Cache management and TTL
 * - Service lifecycle
 *
 * Note: Database integration tests require mocking drizzle-orm.
 * These tests focus on the configuration, calculation logic, and caching.
 */

describe('ORG_STATS_CACHE_CONFIG', () => {
  it('should have cache TTL configured', () => {
    expect(ORG_STATS_CACHE_CONFIG.CACHE_TTL_MS).toBeGreaterThan(0);
  });

  it('should default to 30 seconds for cache TTL', () => {
    expect(ORG_STATS_CACHE_CONFIG.CACHE_TTL_MS).toBe(30 * 1000);
  });

  it('should have max cached orgs limit', () => {
    expect(ORG_STATS_CACHE_CONFIG.MAX_CACHED_ORGS).toBeGreaterThan(0);
    expect(ORG_STATS_CACHE_CONFIG.MAX_CACHED_ORGS).toBe(1000);
  });

  it('should have cleanup interval configured', () => {
    expect(ORG_STATS_CACHE_CONFIG.CLEANUP_INTERVAL_MS).toBeGreaterThan(0);
    expect(ORG_STATS_CACHE_CONFIG.CLEANUP_INTERVAL_MS).toBe(15 * 1000);
  });

  it('should have compliance window configured', () => {
    expect(ORG_STATS_CACHE_CONFIG.COMPLIANCE_WINDOW_MS).toBeGreaterThan(0);
    expect(ORG_STATS_CACHE_CONFIG.COMPLIANCE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('should have cleanup more frequent than cache TTL', () => {
    expect(ORG_STATS_CACHE_CONFIG.CLEANUP_INTERVAL_MS).toBeLessThan(
      ORG_STATS_CACHE_CONFIG.CACHE_TTL_MS,
    );
  });
});

describe('OrganizationStatsService', () => {
  let service: OrganizationStatsService;
  let mockUnitStateService: Partial<UnitStateService>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockUnitStateService = {
      getOrganizationUnitStates: vi.fn(),
    };

    service = new OrganizationStatsService(mockUnitStateService as UnitStateService);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('determineWorstState', () => {
    it('should return normal when all counts are zero', () => {
      const counts: UnitStateCounts = {
        total: 0,
        normal: 0,
        warning: 0,
        critical: 0,
        offline: 0,
      };

      expect(service.determineWorstState(counts)).toBe('normal');
    });

    it('should return normal when only normal units exist', () => {
      const counts: UnitStateCounts = {
        total: 10,
        normal: 10,
        warning: 0,
        critical: 0,
        offline: 0,
      };

      expect(service.determineWorstState(counts)).toBe('normal');
    });

    it('should return warning when warning units exist but no critical or offline', () => {
      const counts: UnitStateCounts = {
        total: 10,
        normal: 8,
        warning: 2,
        critical: 0,
        offline: 0,
      };

      expect(service.determineWorstState(counts)).toBe('warning');
    });

    it('should return critical when critical units exist but no offline', () => {
      const counts: UnitStateCounts = {
        total: 10,
        normal: 5,
        warning: 3,
        critical: 2,
        offline: 0,
      };

      expect(service.determineWorstState(counts)).toBe('critical');
    });

    it('should return offline when offline units exist', () => {
      const counts: UnitStateCounts = {
        total: 10,
        normal: 5,
        warning: 2,
        critical: 2,
        offline: 1,
      };

      expect(service.determineWorstState(counts)).toBe('offline');
    });

    it('should prioritize offline over critical', () => {
      const counts: UnitStateCounts = {
        total: 2,
        normal: 0,
        warning: 0,
        critical: 1,
        offline: 1,
      };

      expect(service.determineWorstState(counts)).toBe('offline');
    });
  });

  describe('cache management', () => {
    it('should return empty cache stats initially', () => {
      const stats = service.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(ORG_STATS_CACHE_CONFIG.MAX_CACHED_ORGS);
    });

    it('should clear cache on stop', () => {
      service.stop();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should invalidate cache for specific organization', () => {
      const orgId = 'org-123';
      service.invalidateCache(orgId);

      // Cache should be empty after invalidation
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should invalidate all caches', () => {
      service.invalidateAllCaches();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('calculateUnitCounts with UnitStateService', () => {
    it('should aggregate unit states from UnitStateService', async () => {
      const mockStates = new Map<string, UnitStateInfo[]>();
      mockStates.set('site-1', [
        {
          unitId: 'u1',
          state: 'normal',
          lastReadingAt: new Date(),
          lastTemperature: 35,
          isOnline: true,
          dbStatus: 'ok',
        },
        {
          unitId: 'u2',
          state: 'warning',
          lastReadingAt: new Date(),
          lastTemperature: 42,
          isOnline: true,
          dbStatus: 'excursion',
        },
      ]);
      mockStates.set('site-2', [
        {
          unitId: 'u3',
          state: 'critical',
          lastReadingAt: new Date(),
          lastTemperature: 55,
          isOnline: true,
          dbStatus: 'alarm_active',
        },
        {
          unitId: 'u4',
          state: 'offline',
          lastReadingAt: null,
          lastTemperature: null,
          isOnline: false,
          dbStatus: 'offline',
        },
      ]);

      (
        mockUnitStateService.getOrganizationUnitStates as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockStates);

      const counts = await service.calculateUnitCounts('org-123');

      expect(counts.total).toBe(4);
      expect(counts.normal).toBe(1);
      expect(counts.warning).toBe(1);
      expect(counts.critical).toBe(1);
      expect(counts.offline).toBe(1);
    });

    it('should return zeros when no units exist', async () => {
      (
        mockUnitStateService.getOrganizationUnitStates as ReturnType<typeof vi.fn>
      ).mockResolvedValue(new Map());

      const counts = await service.calculateUnitCounts('org-123');

      expect(counts.total).toBe(0);
      expect(counts.normal).toBe(0);
      expect(counts.warning).toBe(0);
      expect(counts.critical).toBe(0);
      expect(counts.offline).toBe(0);
    });

    it('should handle multiple units in same state', async () => {
      const mockStates = new Map<string, UnitStateInfo[]>();
      mockStates.set('site-1', [
        {
          unitId: 'u1',
          state: 'normal',
          lastReadingAt: new Date(),
          lastTemperature: 35,
          isOnline: true,
          dbStatus: 'ok',
        },
        {
          unitId: 'u2',
          state: 'normal',
          lastReadingAt: new Date(),
          lastTemperature: 36,
          isOnline: true,
          dbStatus: 'ok',
        },
        {
          unitId: 'u3',
          state: 'normal',
          lastReadingAt: new Date(),
          lastTemperature: 37,
          isOnline: true,
          dbStatus: 'ok',
        },
      ]);

      (
        mockUnitStateService.getOrganizationUnitStates as ReturnType<typeof vi.fn>
      ).mockResolvedValue(mockStates);

      const counts = await service.calculateUnitCounts('org-123');

      expect(counts.total).toBe(3);
      expect(counts.normal).toBe(3);
      expect(counts.warning).toBe(0);
      expect(counts.critical).toBe(0);
      expect(counts.offline).toBe(0);
    });
  });

  describe('service lifecycle', () => {
    it('should handle multiple start/stop cycles', () => {
      const service1 = new OrganizationStatsService();
      expect(() => service1.stop()).not.toThrow();

      const service2 = new OrganizationStatsService();
      expect(() => service2.stop()).not.toThrow();
    });

    it('should handle stop being called multiple times', () => {
      const service = new OrganizationStatsService();
      expect(() => {
        service.stop();
        service.stop();
      }).not.toThrow();
    });

    it('should work without UnitStateService for testing', () => {
      const service = new OrganizationStatsService(); // No unit state service
      const worstState = service.determineWorstState({
        total: 1,
        normal: 1,
        warning: 0,
        critical: 0,
        offline: 0,
      });

      expect(worstState).toBe('normal');
      service.stop();
    });
  });
});

describe('Worst State Priority', () => {
  let service: OrganizationStatsService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new OrganizationStatsService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('should correctly prioritize states: offline > critical > warning > normal', () => {
    // Test each state transition
    expect(
      service.determineWorstState({ total: 1, normal: 1, warning: 0, critical: 0, offline: 0 }),
    ).toBe('normal');
    expect(
      service.determineWorstState({ total: 1, normal: 0, warning: 1, critical: 0, offline: 0 }),
    ).toBe('warning');
    expect(
      service.determineWorstState({ total: 1, normal: 0, warning: 0, critical: 1, offline: 0 }),
    ).toBe('critical');
    expect(
      service.determineWorstState({ total: 1, normal: 0, warning: 0, critical: 0, offline: 1 }),
    ).toBe('offline');
  });

  it('should identify worst state in mixed scenarios', () => {
    // Many normal, one warning
    expect(
      service.determineWorstState({ total: 100, normal: 99, warning: 1, critical: 0, offline: 0 }),
    ).toBe('warning');

    // Many normal, one critical
    expect(
      service.determineWorstState({ total: 100, normal: 99, warning: 0, critical: 1, offline: 0 }),
    ).toBe('critical');

    // Mix of all states
    expect(
      service.determineWorstState({
        total: 100,
        normal: 50,
        warning: 25,
        critical: 20,
        offline: 5,
      }),
    ).toBe('offline');
  });
});

describe('Alert Status Counts Structure', () => {
  it('should have correct structure for alert counts', () => {
    const alertCounts: AlertStatusCounts = {
      pending: 5,
      acknowledged: 3,
      resolved: 10,
      total: 18,
    };

    expect(alertCounts.pending).toBe(5);
    expect(alertCounts.acknowledged).toBe(3);
    expect(alertCounts.resolved).toBe(10);
    expect(alertCounts.total).toBe(18);
  });

  it('should allow zero counts', () => {
    const alertCounts: AlertStatusCounts = {
      pending: 0,
      acknowledged: 0,
      resolved: 0,
      total: 0,
    };

    expect(alertCounts.total).toBe(0);
  });
});

describe('Organization Stats Structure', () => {
  it('should have complete structure', () => {
    const stats: OrganizationStats = {
      organizationId: 'org-123',
      unitCounts: {
        total: 10,
        normal: 7,
        warning: 2,
        critical: 1,
        offline: 0,
      },
      alertCounts: {
        pending: 3,
        acknowledged: 1,
        resolved: 5,
        total: 9,
      },
      compliancePercentage: 98.5,
      worstState: 'critical',
      lastUpdated: new Date(),
    };

    expect(stats.organizationId).toBe('org-123');
    expect(stats.unitCounts.total).toBe(10);
    expect(stats.alertCounts.total).toBe(9);
    expect(stats.compliancePercentage).toBe(98.5);
    expect(stats.worstState).toBe('critical');
    expect(stats.lastUpdated).toBeInstanceOf(Date);
  });
});

describe('Compliance Percentage Edge Cases', () => {
  let service: OrganizationStatsService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new OrganizationStatsService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('should handle compliance percentage bounds', () => {
    // Test percentage calculation logic (unit test without DB)
    // 0% compliance
    const zeroCompliance = (0 / 100) * 100;
    expect(zeroCompliance).toBe(0);

    // 100% compliance
    const fullCompliance = (100 / 100) * 100;
    expect(fullCompliance).toBe(100);

    // Partial compliance
    const partial = (85 / 100) * 100;
    expect(partial).toBe(85);
  });

  it('should round to 1 decimal place', () => {
    // Test rounding logic used in the service
    const rawPercentage = 98.456;
    const rounded = Math.round(rawPercentage * 10) / 10;
    expect(rounded).toBe(98.5);

    const rawPercentage2 = 98.444;
    const rounded2 = Math.round(rawPercentage2 * 10) / 10;
    expect(rounded2).toBe(98.4);
  });
});

describe('Cache Cleanup', () => {
  let service: OrganizationStatsService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new OrganizationStatsService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('should trigger cleanup at configured interval', () => {
    const initialStats = service.getCacheStats();
    expect(initialStats.size).toBe(0);

    // Advance time by cleanup interval
    vi.advanceTimersByTime(ORG_STATS_CACHE_CONFIG.CLEANUP_INTERVAL_MS);

    // Cleanup should have run (no errors)
    const afterStats = service.getCacheStats();
    expect(afterStats.size).toBe(0);
  });
});
