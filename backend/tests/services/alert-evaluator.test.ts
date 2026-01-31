import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SocketService } from '../../src/services/socket.service.js';

/**
 * Alert Evaluator Service Tests
 *
 * Tests cover the state machine for temperature alert evaluation:
 * - Threshold resolution with unit > site > org hierarchy
 * - Idempotent alert creation (no duplicates)
 * - State transitions: ok → excursion → alarm_active → restoring → ok
 * - Alert resolution when temperature returns to range
 * - Hysteresis to prevent alert flapping
 * - Edge cases: boundary values, multiple units, confirm time
 *
 * Database calls are fully mocked using vi.mock for the db module.
 */

// --- Mock Setup ---

// Build chainable query mocks
function createSelectChain(result: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createAlertRuleSelectChain(result: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

// Mock the database module
vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

// Mock the queue service (SMS notifications — not under test here)
vi.mock('../../src/services/queue.service.js', () => ({
  getQueueService: vi.fn().mockReturnValue(null),
}));

// Now import after mocks
import { db } from '../../src/db/client.js';
import {
  evaluateUnitAfterReading,
  resolveEffectiveThresholds,
  createAlertIfNotExists,
  type EvaluationResult,
  type EffectiveThresholds,
} from '../../src/services/alert-evaluator.service.js';

// --- Helper Factories ---

function makeUnit(overrides: Partial<any> = {}) {
  return {
    id: 'unit-1',
    areaId: 'area-1',
    name: 'Walk-In Cooler',
    unitType: 'walk_in_cooler',
    status: 'ok',
    tempMin: 320, // 32.0°F
    tempMax: 400, // 40.0°F
    tempUnit: 'F',
    isActive: true,
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastReadingAt: null,
    lastTemperature: null,
    manualMonitoringRequired: false,
    manualMonitoringInterval: null,
    lastManualLogAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

function makeAlertRule(overrides: Partial<any> = {}) {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    siteId: null,
    unitId: 'unit-1',
    name: 'Default Rule',
    tempMin: 320,
    tempMax: 400,
    delayMinutes: 5,
    alertType: 'alarm_active',
    severity: 'warning',
    isEnabled: true,
    ...overrides,
  };
}

function makeAlert(overrides: Partial<any> = {}) {
  return {
    id: 'alert-1',
    unitId: 'unit-1',
    alertRuleId: 'rule-1',
    alertType: 'alarm_active',
    severity: 'warning',
    status: 'active',
    message: 'Temperature above threshold',
    triggerTemperature: 450,
    thresholdViolated: 'max',
    triggeredAt: new Date(),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    escalatedAt: null,
    escalationLevel: 0,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// --- Test Suite ---

describe('Alert Evaluator Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  // resolveEffectiveThresholds
  // -------------------------------------------------------
  describe('resolveEffectiveThresholds', () => {
    it('should use unit thresholds when no alert rules exist', async () => {
      const unit = makeUnit({ tempMin: 320, tempMax: 400 });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createSelectChain([{ unit, siteId: 'site-1', organizationId: 'org-1' }]) as any;
        }
        return createAlertRuleSelectChain([]) as any;
      });

      const thresholds = await resolveEffectiveThresholds('unit-1');

      expect(thresholds.tempMin).toBe(320);
      expect(thresholds.tempMax).toBe(400);
      expect(thresholds.hysteresis).toBe(5);
      expect(thresholds.confirmTimeSeconds).toBe(600); // 10 min default
    });

    it('should use unit-specific rule when available (unit > site > org)', async () => {
      const unit = makeUnit({ tempMin: 320, tempMax: 400 });
      const unitRule = makeAlertRule({
        unitId: 'unit-1',
        siteId: null,
        tempMin: 300,
        tempMax: 380,
        delayMinutes: 10,
      });
      const siteRule = makeAlertRule({
        id: 'rule-2',
        unitId: null,
        siteId: 'site-1',
        tempMin: 310,
        tempMax: 390,
        delayMinutes: 15,
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createSelectChain([{ unit, siteId: 'site-1', organizationId: 'org-1' }]) as any;
        }
        return createAlertRuleSelectChain([unitRule, siteRule]) as any;
      });

      const thresholds = await resolveEffectiveThresholds('unit-1');

      // Should use unit rule (300, 380) not site rule
      expect(thresholds.tempMin).toBe(300);
      expect(thresholds.tempMax).toBe(380);
      expect(thresholds.confirmTimeSeconds).toBe(600); // 10 * 60
    });

    it('should fall back to site rule when no unit rule exists', async () => {
      const unit = makeUnit({ tempMin: 320, tempMax: 400 });
      const siteRule = makeAlertRule({
        id: 'rule-2',
        unitId: null,
        siteId: 'site-1',
        tempMin: 310,
        tempMax: 390,
        delayMinutes: 8,
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createSelectChain([{ unit, siteId: 'site-1', organizationId: 'org-1' }]) as any;
        }
        return createAlertRuleSelectChain([siteRule]) as any;
      });

      const thresholds = await resolveEffectiveThresholds('unit-1');

      expect(thresholds.tempMin).toBe(310);
      expect(thresholds.tempMax).toBe(390);
      expect(thresholds.confirmTimeSeconds).toBe(480);
    });

    it('should fall back to org rule when no unit or site rule exists', async () => {
      const unit = makeUnit({ tempMin: 320, tempMax: 400 });
      const orgRule = makeAlertRule({
        id: 'rule-3',
        unitId: null,
        siteId: null,
        tempMin: 280,
        tempMax: 420,
        delayMinutes: 15,
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createSelectChain([{ unit, siteId: 'site-1', organizationId: 'org-1' }]) as any;
        }
        return createAlertRuleSelectChain([orgRule]) as any;
      });

      const thresholds = await resolveEffectiveThresholds('unit-1');

      expect(thresholds.tempMin).toBe(280);
      expect(thresholds.tempMax).toBe(420);
      expect(thresholds.confirmTimeSeconds).toBe(900);
    });

    it('should throw when unit not found', async () => {
      vi.mocked(db.select).mockImplementation(() => createSelectChain([]) as any);

      await expect(resolveEffectiveThresholds('nonexistent-unit')).rejects.toThrow(/not found/);
    });

    it('should throw when no thresholds configured', async () => {
      const unit = makeUnit({ tempMin: null, tempMax: null });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createSelectChain([{ unit, siteId: 'site-1', organizationId: 'org-1' }]) as any;
        }
        return createAlertRuleSelectChain([]) as any;
      });

      await expect(resolveEffectiveThresholds('unit-1')).rejects.toThrow(
        /no temperature thresholds/i,
      );
    });
  });

  // -------------------------------------------------------
  // createAlertIfNotExists (idempotency)
  // -------------------------------------------------------
  describe('createAlertIfNotExists', () => {
    it('should create alert when no existing active alert for unit+type', async () => {
      const newAlert = makeAlert({ id: 'new-alert-1' });
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([newAlert]),
          }),
        }),
      };

      const result = await createAlertIfNotExists(tx as any, {
        unitId: 'unit-1',
        alertType: 'alarm_active',
        severity: 'warning',
        message: 'Test alert',
        triggerTemperature: 450,
        thresholdViolated: 'max',
        triggeredAt: new Date(),
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('new-alert-1');
      expect(tx.insert).toHaveBeenCalled();
    });

    it('should NOT create duplicate alert when active alert exists (idempotency)', async () => {
      const existingAlert = makeAlert({ id: 'existing-1', status: 'active' });
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingAlert]),
            }),
          }),
        }),
        insert: vi.fn(),
      };

      const result = await createAlertIfNotExists(tx as any, {
        unitId: 'unit-1',
        alertType: 'alarm_active',
        severity: 'warning',
        message: 'Duplicate test',
        triggerTemperature: 450,
        thresholdViolated: 'max',
        triggeredAt: new Date(),
      });

      expect(result).toBeNull();
      expect(tx.insert).not.toHaveBeenCalled();
    });

    it('should NOT create duplicate when acknowledged alert exists', async () => {
      const acknowledgedAlert = makeAlert({ id: 'ack-1', status: 'acknowledged' });
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([acknowledgedAlert]),
            }),
          }),
        }),
        insert: vi.fn(),
      };

      const result = await createAlertIfNotExists(tx as any, {
        unitId: 'unit-1',
        alertType: 'alarm_active',
        severity: 'warning',
        message: 'Duplicate test',
        triggerTemperature: 450,
        thresholdViolated: 'max',
        triggeredAt: new Date(),
      });

      expect(result).toBeNull();
      expect(tx.insert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // evaluateUnitAfterReading — State Machine Transitions
  // -------------------------------------------------------
  describe('evaluateUnitAfterReading', () => {
    let mockSocketService: {
      emitToOrg: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockSocketService = {
        emitToOrg: vi.fn(),
      };
    });

    /**
     * Sets up mocks for evaluateUnitAfterReading.
     *
     * This configures both:
     * 1. db.select — used by resolveEffectiveThresholds (called within the transaction)
     * 2. db.transaction — wraps the main evaluation logic with tx operations
     *
     * Inside the transaction:
     * - tx.select: Unit+org lookup (call 1), existing alert check (call 2+)
     * - tx.insert: Alert creation
     * - tx.update: Unit status change (call 1), alert escalation/resolution (call 2)
     */
    function setupEvaluationMock(options: {
      unit: any;
      organizationId?: string;
      thresholds?: {
        tempMin: number;
        tempMax: number;
        hysteresis: number;
        confirmTimeSeconds: number;
      };
      alertRules?: any[];
      existingAlerts?: any[];
      insertedAlert?: any;
      escalatedAlert?: any;
      resolvedAlert?: any;
    }) {
      const {
        unit,
        organizationId = 'org-1',
        thresholds = { tempMin: 320, tempMax: 400, hysteresis: 5, confirmTimeSeconds: 300 },
        alertRules = [
          makeAlertRule({
            tempMin: thresholds.tempMin,
            tempMax: thresholds.tempMax,
            delayMinutes: thresholds.confirmTimeSeconds / 60,
          }),
        ],
        existingAlerts = [],
        insertedAlert = null,
        escalatedAlert = null,
        resolvedAlert = null,
      } = options;

      // db.select is called by resolveEffectiveThresholds (NOT inside tx)
      let dbSelectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        dbSelectCallCount++;
        if (dbSelectCallCount === 1) {
          // Unit lookup for resolveEffectiveThresholds
          return createSelectChain([{ unit, siteId: 'site-1', organizationId }]) as any;
        }
        // Alert rules lookup for resolveEffectiveThresholds
        return createAlertRuleSelectChain(alertRules) as any;
      });

      // db.transaction wraps the main evaluation
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        let txSelectCallCount = 0;
        let txUpdateCallCount = 0;

        const tx = {
          select: vi.fn().mockImplementation(() => {
            txSelectCallCount++;
            return {
              from: vi.fn().mockImplementation(() => {
                if (txSelectCallCount === 1) {
                  // Unit + org context lookup (with joins)
                  return {
                    innerJoin: vi.fn().mockReturnValue({
                      innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue([{ unit, organizationId }]),
                        }),
                      }),
                    }),
                  };
                }
                // createAlertIfNotExists: existing alert check
                return {
                  where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue(existingAlerts),
                  }),
                };
              }),
            };
          }),

          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue(insertedAlert ? [insertedAlert] : []),
            }),
          }),

          update: vi.fn().mockImplementation(() => {
            txUpdateCallCount++;
            return {
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockImplementation(() => {
                  // First update = unit status change
                  if (txUpdateCallCount === 1) {
                    return Promise.resolve();
                  }
                  // Second update = alert escalation or resolution
                  if (escalatedAlert) {
                    return { returning: vi.fn().mockResolvedValue([escalatedAlert]) };
                  }
                  if (resolvedAlert) {
                    return { returning: vi.fn().mockResolvedValue([resolvedAlert]) };
                  }
                  return { returning: vi.fn().mockResolvedValue([]) };
                }),
              }),
            };
          }),
        };

        return callback(tx);
      });
    }

    // --- Transition 1: ok → excursion ---
    describe('ok → excursion (temperature above max threshold)', () => {
      it('should create alert when temperature exceeds max threshold', async () => {
        const unit = makeUnit({ status: 'ok' });
        const createdAlert = makeAlert({
          id: 'created-1',
          severity: 'warning',
          triggerTemperature: 450,
          thresholdViolated: 'max',
        });

        setupEvaluationMock({
          unit,
          existingAlerts: [],
          insertedAlert: createdAlert,
        });

        const result = await evaluateUnitAfterReading('unit-1', 450, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.from).toBe('ok');
        expect(result.stateChange!.to).toBe('excursion');
        expect(result.stateChange!.reason).toContain('above');
        expect(result.alertCreated).not.toBeNull();
        expect(result.alertCreated!.id).toBe('created-1');
      });

      it('should create alert when temperature falls below min threshold', async () => {
        const unit = makeUnit({ status: 'ok' });
        const createdAlert = makeAlert({
          id: 'created-below',
          severity: 'warning',
          triggerTemperature: 280,
          thresholdViolated: 'min',
        });

        setupEvaluationMock({
          unit,
          existingAlerts: [],
          insertedAlert: createdAlert,
        });

        const result = await evaluateUnitAfterReading('unit-1', 280, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.from).toBe('ok');
        expect(result.stateChange!.to).toBe('excursion');
        expect(result.stateChange!.reason).toContain('below');
        expect(result.alertCreated).not.toBeNull();
      });

      it('should emit socket event when alert created with socketService', async () => {
        const unit = makeUnit({ status: 'ok' });
        const createdAlert = makeAlert({
          id: 'socket-alert',
          unitId: 'unit-1',
          alertType: 'alarm_active',
          severity: 'warning',
          message: 'Temperature above threshold',
          triggerTemperature: 450,
          thresholdViolated: 'max',
          triggeredAt: new Date('2024-06-01T12:00:00Z'),
        });

        setupEvaluationMock({
          unit,
          existingAlerts: [],
          insertedAlert: createdAlert,
        });

        await evaluateUnitAfterReading(
          'unit-1',
          450,
          new Date(),
          mockSocketService as unknown as SocketService,
        );

        expect(mockSocketService.emitToOrg).toHaveBeenCalledWith(
          'org-1',
          'alert:triggered',
          expect.objectContaining({
            alertId: 'socket-alert',
            unitId: 'unit-1',
            alertType: 'alarm_active',
            severity: 'warning',
          }),
        );
      });
    });

    // --- No alert for in-range reading ---
    describe('no state change for in-range readings', () => {
      it('should NOT create alert when temperature is within range', async () => {
        const unit = makeUnit({ status: 'ok' });

        setupEvaluationMock({ unit });

        const result = await evaluateUnitAfterReading('unit-1', 350, new Date());

        expect(result.stateChange).toBeNull();
        expect(result.alertCreated).toBeNull();
        expect(result.alertResolved).toBeNull();
      });
    });

    // --- Transition 2: excursion → alarm_active ---
    describe('excursion → alarm_active (confirmation time elapsed)', () => {
      it('should NOT escalate if confirm time has not elapsed (brief excursion)', async () => {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const unit = makeUnit({ status: 'excursion', updatedAt: twoMinutesAgo });

        setupEvaluationMock({ unit });

        const result = await evaluateUnitAfterReading('unit-1', 450, new Date());

        expect(result.stateChange).toBeNull();
      });

      it('should escalate to alarm_active after confirm time has elapsed', async () => {
        const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
        const unit = makeUnit({ status: 'excursion', updatedAt: sixMinutesAgo });
        const escalatedAlert = makeAlert({
          id: 'escalated-1',
          severity: 'critical',
          escalationLevel: 1,
          escalatedAt: new Date(),
        });

        setupEvaluationMock({
          unit,
          escalatedAlert,
        });

        const result = await evaluateUnitAfterReading('unit-1', 450, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.from).toBe('excursion');
        expect(result.stateChange!.to).toBe('alarm_active');
        expect(result.stateChange!.reason).toContain('confirmed');
      });
    });

    // --- Transition 3: excursion/alarm_active → restoring ---
    describe('excursion/alarm_active → restoring (temperature returns to range)', () => {
      it('should resolve alert when temperature returns to normal from excursion', async () => {
        const unit = makeUnit({ status: 'excursion' });
        const resolved = makeAlert({
          id: 'resolved-1',
          status: 'resolved',
          resolvedAt: new Date(),
        });

        setupEvaluationMock({ unit, resolvedAlert: resolved });

        const result = await evaluateUnitAfterReading('unit-1', 360, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.from).toBe('excursion');
        expect(result.stateChange!.to).toBe('restoring');
        expect(result.stateChange!.reason).toContain('returned');
        expect(result.alertResolved).not.toBeNull();
        expect(result.alertResolved!.id).toBe('resolved-1');
      });

      it('should resolve alert when temperature returns from alarm_active', async () => {
        const unit = makeUnit({ status: 'alarm_active' });
        const resolved = makeAlert({
          id: 'resolved-2',
          status: 'resolved',
          resolvedAt: new Date(),
        });

        setupEvaluationMock({ unit, resolvedAlert: resolved });

        const result = await evaluateUnitAfterReading('unit-1', 360, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.from).toBe('alarm_active');
        expect(result.stateChange!.to).toBe('restoring');
        expect(result.alertResolved).not.toBeNull();
      });

      it('should NOT resolve when temp is in range but NOT within hysteresis band', async () => {
        // tempMax=400, hysteresis=5 → need temp <= 395 AND temp >= 325
        // 398 > 395, so hysteresis check fails
        const unit = makeUnit({ status: 'excursion' });

        setupEvaluationMock({ unit });

        const result = await evaluateUnitAfterReading('unit-1', 398, new Date());

        expect(result.stateChange).toBeNull();
        expect(result.alertResolved).toBeNull();
      });

      it('should emit socket event on alert resolution', async () => {
        const unit = makeUnit({ status: 'alarm_active' });
        const resolved = makeAlert({
          id: 'socket-resolved',
          unitId: 'unit-1',
          status: 'resolved',
          resolvedAt: new Date('2024-06-01T13:00:00Z'),
        });

        setupEvaluationMock({ unit, resolvedAlert: resolved });

        await evaluateUnitAfterReading(
          'unit-1',
          360,
          new Date(),
          mockSocketService as unknown as SocketService,
        );

        expect(mockSocketService.emitToOrg).toHaveBeenCalledWith(
          'org-1',
          'alert:resolved',
          expect.objectContaining({
            alertId: 'socket-resolved',
            unitId: 'unit-1',
          }),
        );
      });
    });

    // --- Idempotency ---
    describe('idempotency — no duplicate alerts for ongoing excursions', () => {
      it('should not create duplicate alert when one is already active', async () => {
        const unit = makeUnit({ status: 'ok' });

        setupEvaluationMock({
          unit,
          existingAlerts: [makeAlert({ id: 'existing-active', status: 'active' })],
          insertedAlert: null,
        });

        const result = await evaluateUnitAfterReading('unit-1', 450, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.to).toBe('excursion');
        expect(result.alertCreated).toBeNull();
      });
    });

    // --- Edge case: boundary values ---
    describe('edge case — reading at threshold boundary', () => {
      it('should NOT create alert when temperature equals max threshold exactly', async () => {
        const unit = makeUnit({ status: 'ok' });
        setupEvaluationMock({ unit });

        // latestTemp > tempMax is strict >, so 400 == 400 does NOT trigger
        const result = await evaluateUnitAfterReading('unit-1', 400, new Date());

        expect(result.stateChange).toBeNull();
        expect(result.alertCreated).toBeNull();
      });

      it('should NOT create alert when temperature equals min threshold exactly', async () => {
        const unit = makeUnit({ status: 'ok' });
        setupEvaluationMock({ unit });

        // latestTemp < tempMin is strict <, so 320 == 320 does NOT trigger
        const result = await evaluateUnitAfterReading('unit-1', 320, new Date());

        expect(result.stateChange).toBeNull();
        expect(result.alertCreated).toBeNull();
      });

      it('should create alert at 1 unit above max threshold', async () => {
        const unit = makeUnit({ status: 'ok' });
        const createdAlert = makeAlert({ id: 'boundary-alert', triggerTemperature: 401 });

        setupEvaluationMock({
          unit,
          existingAlerts: [],
          insertedAlert: createdAlert,
        });

        const result = await evaluateUnitAfterReading('unit-1', 401, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.to).toBe('excursion');
        expect(result.alertCreated).not.toBeNull();
      });

      it('should create alert at 1 unit below min threshold', async () => {
        const unit = makeUnit({ status: 'ok' });
        const createdAlert = makeAlert({ id: 'boundary-alert-min', triggerTemperature: 319 });

        setupEvaluationMock({
          unit,
          existingAlerts: [],
          insertedAlert: createdAlert,
        });

        const result = await evaluateUnitAfterReading('unit-1', 319, new Date());

        expect(result.stateChange).not.toBeNull();
        expect(result.stateChange!.to).toBe('excursion');
        expect(result.alertCreated).not.toBeNull();
      });
    });

    // --- Multiple units ---
    describe('handles multiple simultaneous excursions across different units', () => {
      it('should evaluate each unit independently', async () => {
        // Unit A: ok → excursion (above max)
        const unitA = makeUnit({ id: 'unit-A', status: 'ok' });
        const alertA = makeAlert({ id: 'alert-A', unitId: 'unit-A' });

        setupEvaluationMock({
          unit: unitA,
          existingAlerts: [],
          insertedAlert: alertA,
        });

        const resultA = await evaluateUnitAfterReading('unit-A', 450, new Date());
        expect(resultA.stateChange).not.toBeNull();
        expect(resultA.stateChange!.to).toBe('excursion');
        expect(resultA.alertCreated!.id).toBe('alert-A');

        // Unit B: ok → excursion (below min), different thresholds
        vi.clearAllMocks();
        const unitB = makeUnit({ id: 'unit-B', status: 'ok' });
        const alertB = makeAlert({ id: 'alert-B', unitId: 'unit-B' });

        setupEvaluationMock({
          unit: unitB,
          thresholds: { tempMin: 200, tempMax: 300, hysteresis: 5, confirmTimeSeconds: 300 },
          existingAlerts: [],
          insertedAlert: alertB,
        });

        const resultB = await evaluateUnitAfterReading('unit-B', 150, new Date());
        expect(resultB.stateChange).not.toBeNull();
        expect(resultB.stateChange!.to).toBe('excursion');
        expect(resultB.alertCreated!.id).toBe('alert-B');
      });
    });

    // --- Unit-specific overrides ---
    describe('respects unit-specific override rules over site/org defaults', () => {
      it('should use unit rule thresholds instead of site defaults', async () => {
        const unit = makeUnit({ status: 'ok' });

        // Unit-specific rule has wider range: 200-500
        setupEvaluationMock({
          unit,
          thresholds: { tempMin: 200, tempMax: 500, hysteresis: 5, confirmTimeSeconds: 180 },
        });

        // 450 is within unit rule range (200-500), so no alert
        const result = await evaluateUnitAfterReading('unit-1', 450, new Date());

        expect(result.stateChange).toBeNull();
        expect(result.alertCreated).toBeNull();
      });
    });

    // --- Error handling ---
    describe('error handling', () => {
      it('should throw when unit not found', async () => {
        vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
          const emptyTx = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                  innerJoin: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          };
          return callback(emptyTx);
        });

        await expect(evaluateUnitAfterReading('nonexistent', 350, new Date())).rejects.toThrow(
          /not found/,
        );
      });
    });

    // --- Full lifecycle ---
    describe('full state machine path', () => {
      it('should support complete lifecycle: ok → excursion → alarm_active → restoring', async () => {
        // Step 1: ok → excursion
        const unitStep1 = makeUnit({ status: 'ok' });
        const alertCreated = makeAlert({ id: 'lifecycle-alert' });

        setupEvaluationMock({
          unit: unitStep1,
          existingAlerts: [],
          insertedAlert: alertCreated,
        });

        const step1 = await evaluateUnitAfterReading('unit-1', 450, new Date());
        expect(step1.stateChange!.from).toBe('ok');
        expect(step1.stateChange!.to).toBe('excursion');
        expect(step1.alertCreated).not.toBeNull();

        // Step 2: excursion → alarm_active
        vi.clearAllMocks();
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const unitStep2 = makeUnit({ status: 'excursion', updatedAt: tenMinutesAgo });
        const escalated = makeAlert({
          id: 'lifecycle-escalated',
          severity: 'critical',
          escalationLevel: 1,
        });

        setupEvaluationMock({ unit: unitStep2, escalatedAlert: escalated });

        const step2 = await evaluateUnitAfterReading('unit-1', 450, new Date());
        expect(step2.stateChange!.from).toBe('excursion');
        expect(step2.stateChange!.to).toBe('alarm_active');

        // Step 3: alarm_active → restoring
        vi.clearAllMocks();
        const unitStep3 = makeUnit({ status: 'alarm_active' });
        const resolved = makeAlert({
          id: 'lifecycle-resolved',
          status: 'resolved',
          resolvedAt: new Date(),
        });

        setupEvaluationMock({ unit: unitStep3, resolvedAlert: resolved });

        const step3 = await evaluateUnitAfterReading('unit-1', 360, new Date());
        expect(step3.stateChange!.from).toBe('alarm_active');
        expect(step3.stateChange!.to).toBe('restoring');
        expect(step3.alertResolved).not.toBeNull();
      });
    });
  });
});
