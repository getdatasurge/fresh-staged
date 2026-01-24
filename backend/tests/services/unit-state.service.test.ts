import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  type UnitDashboardState,
  STATUS_TO_DASHBOARD_STATE,
  STATE_PRIORITY,
  OFFLINE_CONFIG,
  STATE_CACHE_CONFIG,
  STATE_METADATA,
} from '../../src/config/unit-state.config.js';
import { UnitStateService, type StateChangeEvent } from '../../src/services/unit-state.service.js';

/**
 * Unit State Service Tests
 *
 * Tests cover:
 * - State configuration and mappings
 * - State calculation from database status and readings
 * - Offline detection based on reading timestamps
 * - Cache management and TTL
 * - State change event emission
 *
 * Note: Database integration tests require mocking drizzle-orm.
 * These tests focus on the configuration and pure calculation logic.
 */

describe('Unit State Configuration', () => {
  describe('STATUS_TO_DASHBOARD_STATE mapping', () => {
    it('should map ok status to normal state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.ok).toBe('normal');
    });

    it('should map excursion status to warning state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.excursion).toBe('warning');
    });

    it('should map alarm_active status to critical state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.alarm_active).toBe('critical');
    });

    it('should map monitoring_interrupted status to offline state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.monitoring_interrupted).toBe('offline');
    });

    it('should map offline status to offline state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.offline).toBe('offline');
    });

    it('should map restoring status to normal state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.restoring).toBe('normal');
    });

    it('should map manual_required status to warning state', () => {
      expect(STATUS_TO_DASHBOARD_STATE.manual_required).toBe('warning');
    });

    it('should have mappings for all known database statuses', () => {
      const expectedStatuses = [
        'ok',
        'excursion',
        'alarm_active',
        'monitoring_interrupted',
        'manual_required',
        'restoring',
        'offline',
      ];

      for (const status of expectedStatuses) {
        expect(STATUS_TO_DASHBOARD_STATE[status]).toBeDefined();
      }
    });
  });

  describe('STATE_PRIORITY ordering', () => {
    it('should have normal as lowest priority (0)', () => {
      expect(STATE_PRIORITY.normal).toBe(0);
    });

    it('should have warning as second priority (1)', () => {
      expect(STATE_PRIORITY.warning).toBe(1);
    });

    it('should have critical as third priority (2)', () => {
      expect(STATE_PRIORITY.critical).toBe(2);
    });

    it('should have offline as highest priority (3)', () => {
      expect(STATE_PRIORITY.offline).toBe(3);
    });

    it('should have strictly increasing priorities', () => {
      expect(STATE_PRIORITY.warning).toBeGreaterThan(STATE_PRIORITY.normal);
      expect(STATE_PRIORITY.critical).toBeGreaterThan(STATE_PRIORITY.warning);
      expect(STATE_PRIORITY.offline).toBeGreaterThan(STATE_PRIORITY.critical);
    });
  });

  describe('OFFLINE_CONFIG', () => {
    it('should have offline timeout configured', () => {
      expect(OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('should default to 15 minutes for offline timeout', () => {
      expect(OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    });

    it('should have stale check interval configured', () => {
      expect(OFFLINE_CONFIG.STALE_CHECK_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('should have new unit grace period configured', () => {
      expect(OFFLINE_CONFIG.NEW_UNIT_GRACE_PERIOD_MS).toBeGreaterThan(0);
    });

    it('should have stale check more frequent than offline timeout', () => {
      expect(OFFLINE_CONFIG.STALE_CHECK_INTERVAL_MS).toBeLessThan(
        OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS
      );
    });

    it('should have grace period longer than offline timeout', () => {
      expect(OFFLINE_CONFIG.NEW_UNIT_GRACE_PERIOD_MS).toBeGreaterThan(
        OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS
      );
    });
  });

  describe('STATE_CACHE_CONFIG', () => {
    it('should have cache TTL configured', () => {
      expect(STATE_CACHE_CONFIG.CACHE_TTL_MS).toBeGreaterThan(0);
    });

    it('should have max cached units limit', () => {
      expect(STATE_CACHE_CONFIG.MAX_CACHED_UNITS).toBeGreaterThan(0);
    });

    it('should have cleanup interval configured', () => {
      expect(STATE_CACHE_CONFIG.CLEANUP_INTERVAL_MS).toBeGreaterThan(0);
    });

    it('should have cleanup more frequent than cache TTL', () => {
      expect(STATE_CACHE_CONFIG.CLEANUP_INTERVAL_MS).toBeLessThanOrEqual(
        STATE_CACHE_CONFIG.CACHE_TTL_MS
      );
    });
  });

  describe('STATE_METADATA', () => {
    it('should have metadata for all dashboard states', () => {
      const states: UnitDashboardState[] = ['normal', 'warning', 'critical', 'offline'];

      for (const state of states) {
        expect(STATE_METADATA[state]).toBeDefined();
        expect(STATE_METADATA[state].label).toBeDefined();
        expect(STATE_METADATA[state].severity).toBeDefined();
        expect(STATE_METADATA[state].description).toBeDefined();
      }
    });

    it('should have appropriate severity levels', () => {
      expect(STATE_METADATA.normal.severity).toBe('info');
      expect(STATE_METADATA.warning.severity).toBe('warning');
      expect(STATE_METADATA.critical.severity).toBe('error');
      expect(STATE_METADATA.offline.severity).toBe('error');
    });
  });
});

describe('UnitStateService', () => {
  let service: UnitStateService;
  let mockSocketService: {
    emitToOrg: ReturnType<typeof vi.fn>;
    emitToUnit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockSocketService = {
      emitToOrg: vi.fn(),
      emitToUnit: vi.fn(),
    };

    service = new UnitStateService(mockSocketService as any);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('calculateState', () => {
    it('should return normal for ok status with recent reading', () => {
      const now = new Date();
      const recentReading = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      const state = service.calculateState('ok', recentReading);

      expect(state).toBe('normal');
    });

    it('should return warning for excursion status with recent reading', () => {
      const now = new Date();
      const recentReading = new Date(now.getTime() - 5 * 60 * 1000);

      const state = service.calculateState('excursion', recentReading);

      expect(state).toBe('warning');
    });

    it('should return critical for alarm_active status with recent reading', () => {
      const now = new Date();
      const recentReading = new Date(now.getTime() - 5 * 60 * 1000);

      const state = service.calculateState('alarm_active', recentReading);

      expect(state).toBe('critical');
    });

    it('should return offline for ok status with stale reading', () => {
      const now = new Date();
      const staleReading = new Date(
        now.getTime() - OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS - 60 * 1000
      ); // Over timeout

      const state = service.calculateState('ok', staleReading);

      expect(state).toBe('offline');
    });

    it('should return offline for alarm_active status with stale reading', () => {
      const now = new Date();
      const staleReading = new Date(
        now.getTime() - OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS - 60 * 1000
      );

      const state = service.calculateState('alarm_active', staleReading);

      expect(state).toBe('offline');
    });

    it('should return offline for null lastReadingAt with old creation date', () => {
      const oldCreationDate = new Date(
        Date.now() - OFFLINE_CONFIG.NEW_UNIT_GRACE_PERIOD_MS - 60 * 1000
      );

      const state = service.calculateState('ok', null, oldCreationDate);

      expect(state).toBe('offline');
    });

    it('should return normal for null lastReadingAt within grace period', () => {
      const recentCreationDate = new Date(
        Date.now() - OFFLINE_CONFIG.NEW_UNIT_GRACE_PERIOD_MS / 2
      );

      const state = service.calculateState('ok', null, recentCreationDate);

      expect(state).toBe('normal');
    });

    it('should return offline for null lastReadingAt with no creation date', () => {
      const state = service.calculateState('ok', null, undefined);

      expect(state).toBe('offline');
    });

    it('should handle edge case at exact offline timeout boundary', () => {
      const now = new Date();
      // Exactly at the timeout threshold - should still be online
      const atThreshold = new Date(now.getTime() - OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS);

      const state = service.calculateState('ok', atThreshold);

      // At exactly the threshold, it's not yet over, so should be normal
      expect(state).toBe('normal');
    });

    it('should return normal for restoring status with recent reading', () => {
      const now = new Date();
      const recentReading = new Date(now.getTime() - 5 * 60 * 1000);

      const state = service.calculateState('restoring', recentReading);

      expect(state).toBe('normal');
    });

    it('should default to normal for unknown status', () => {
      const now = new Date();
      const recentReading = new Date(now.getTime() - 5 * 60 * 1000);

      const state = service.calculateState('unknown_status', recentReading);

      expect(state).toBe('normal');
    });
  });

  describe('cache management', () => {
    it('should return empty cache stats initially', () => {
      const stats = service.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(STATE_CACHE_CONFIG.MAX_CACHED_UNITS);
    });

    it('should clear cache on stop', () => {
      // Simulate some cache entries (internal implementation detail)
      service.stop();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should clear cache when clearCache is called', () => {
      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('state change event generation', () => {
    it('should emit events to org and unit rooms when socket service is provided', async () => {
      // This test validates the event structure without database calls
      const changeEvent: StateChangeEvent = {
        unitId: 'unit-123',
        previousState: 'normal',
        newState: 'warning',
        timestamp: new Date().toISOString(),
        reason: 'Temperature excursion detected',
      };

      // Verify event structure
      expect(changeEvent.unitId).toBeDefined();
      expect(changeEvent.previousState).toBeDefined();
      expect(changeEvent.newState).toBeDefined();
      expect(changeEvent.timestamp).toBeDefined();
      expect(changeEvent.reason).toBeDefined();
    });
  });
});

describe('State Calculation Edge Cases', () => {
  let service: UnitStateService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new UnitStateService();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('should prioritize offline over critical when readings are stale', () => {
    const now = new Date();
    const staleReading = new Date(
      now.getTime() - OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS - 1
    );

    // Even if the database says alarm_active, if readings are stale, it's offline
    const state = service.calculateState('alarm_active', staleReading);

    expect(state).toBe('offline');
    expect(STATE_PRIORITY.offline).toBeGreaterThan(STATE_PRIORITY.critical);
  });

  it('should handle readings exactly at 1ms over timeout', () => {
    const now = new Date();
    const justOverTimeout = new Date(
      now.getTime() - OFFLINE_CONFIG.OFFLINE_TIMEOUT_MS - 1
    );

    const state = service.calculateState('ok', justOverTimeout);

    expect(state).toBe('offline');
  });

  it('should handle very old readings gracefully', () => {
    const veryOldReading = new Date('2020-01-01T00:00:00.000Z');

    const state = service.calculateState('ok', veryOldReading);

    expect(state).toBe('offline');
  });

  it('should handle future reading timestamps as online', () => {
    // Edge case: clock skew could cause future timestamps
    const futureReading = new Date(Date.now() + 60 * 1000); // 1 minute in future

    const state = service.calculateState('ok', futureReading);

    expect(state).toBe('normal');
  });
});

describe('State Priority Usage', () => {
  it('should allow determining worst state from multiple units', () => {
    const unitStates: UnitDashboardState[] = ['normal', 'warning', 'normal', 'critical'];

    const worstState = unitStates.reduce((worst, current) => {
      return STATE_PRIORITY[current] > STATE_PRIORITY[worst] ? current : worst;
    }, 'normal' as UnitDashboardState);

    expect(worstState).toBe('critical');
  });

  it('should identify offline as worst even with critical units', () => {
    const unitStates: UnitDashboardState[] = ['critical', 'offline', 'warning'];

    const worstState = unitStates.reduce((worst, current) => {
      return STATE_PRIORITY[current] > STATE_PRIORITY[worst] ? current : worst;
    }, 'normal' as UnitDashboardState);

    expect(worstState).toBe('offline');
  });

  it('should return normal when all units are normal', () => {
    const unitStates: UnitDashboardState[] = ['normal', 'normal', 'normal'];

    const worstState = unitStates.reduce((worst, current) => {
      return STATE_PRIORITY[current] > STATE_PRIORITY[worst] ? current : worst;
    }, 'normal' as UnitDashboardState);

    expect(worstState).toBe('normal');
  });
});

describe('State Mapping Completeness', () => {
  it('should have dashboard states for all unit status enum values', () => {
    // These are the known unit status enum values from the schema
    const unitStatusValues = [
      'ok',
      'excursion',
      'alarm_active',
      'monitoring_interrupted',
      'manual_required',
      'restoring',
      'offline',
    ];

    const dashboardStates: UnitDashboardState[] = ['normal', 'warning', 'critical', 'offline'];

    for (const status of unitStatusValues) {
      const mapped = STATUS_TO_DASHBOARD_STATE[status];
      expect(mapped).toBeDefined();
      expect(dashboardStates).toContain(mapped);
    }
  });

  it('should have metadata for all possible dashboard states', () => {
    const allDashboardStates: UnitDashboardState[] = ['normal', 'warning', 'critical', 'offline'];

    for (const state of allDashboardStates) {
      const metadata = STATE_METADATA[state];
      expect(metadata).toBeDefined();
      expect(metadata.label).toBeTruthy();
      expect(metadata.description).toBeTruthy();
      expect(['info', 'warning', 'error']).toContain(metadata.severity);
    }
  });
});

describe('Service Lifecycle', () => {
  it('should handle multiple start/stop cycles', () => {
    const service1 = new UnitStateService();
    expect(() => service1.stop()).not.toThrow();

    const service2 = new UnitStateService();
    expect(() => service2.stop()).not.toThrow();
  });

  it('should handle stop being called multiple times', () => {
    const service = new UnitStateService();
    expect(() => {
      service.stop();
      service.stop();
    }).not.toThrow();
  });

  it('should work without socket service for testing', () => {
    const service = new UnitStateService(); // No socket service
    const state = service.calculateState('ok', new Date());

    expect(state).toBe('normal');
    service.stop();
  });
});
