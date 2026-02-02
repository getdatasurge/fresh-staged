import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '../../src/db/client.js';
import {
  clearThresholdCache,
  resolveEffectiveThresholds,
  createAlertIfNotExists,
  evaluateUnitAfterReading,
} from '../../src/services/alert-evaluator.service.js';

// ---------------------------------------------------------------------------
// Test data constants
// ---------------------------------------------------------------------------
const TEST_UNIT_ID = '6ee7bf36-9c9f-4a00-99ec-6e0730558f67';
const TEST_SITE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_AREA_ID = 'f0e1d2c3-b4a5-6789-0123-456789abcdef';

// ---------------------------------------------------------------------------
// Chainable DB mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock that mirrors Drizzle's fluent query API.
 *
 * Drizzle query builder objects are "thenable" -- they can be awaited directly
 * (resolving to the query result) OR you can keep chaining methods like
 * `.where()`, `.limit()`, `.orderBy()`, `.innerJoin()`.
 *
 * This helper returns a chain object whose every method returns a new thenable
 * so that both patterns work:
 *   await db.select().from(t).where(...)            // ends at .where()
 *   await db.select().from(t).where(...).limit(1)   // ends at .limit()
 */
function buildSelectChain(resolveValue: unknown = []) {
  // Create a thenable object: has .then/.catch so it can be awaited,
  // but also has .limit, .orderBy, .where, .innerJoin, .from, .leftJoin
  function makeThenable(): any {
    const promise = Promise.resolve(resolveValue);
    const obj: Record<string, unknown> = {};
    // Make it awaitable
    obj.then = (onFulfilled: any, onRejected?: any) => promise.then(onFulfilled, onRejected);
    obj.catch = (onRejected: any) => promise.catch(onRejected);
    // Chainable methods all return a new thenable
    obj.limit = vi.fn(() => makeThenable());
    obj.orderBy = vi.fn(() => makeThenable());
    obj.where = vi.fn(() => makeThenable());
    obj.innerJoin = vi.fn(() => makeThenable());
    obj.leftJoin = vi.fn(() => makeThenable());
    obj.from = vi.fn(() => makeThenable());
    return obj;
  }
  return makeThenable();
}

function buildInsertChain(resolveValue: unknown = []) {
  const returning = vi.fn(() => Promise.resolve(resolveValue));
  const values = vi.fn(() => ({ returning }));
  return { values, returning };
}

function buildUpdateChain(resolveValue: unknown = []) {
  const returning = vi.fn(() => Promise.resolve(resolveValue));
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { set, where, returning };
}

// ---------------------------------------------------------------------------
// Module-level mock state.
// We store references here so individual tests can reconfigure them.
// ---------------------------------------------------------------------------
let selectChain: ReturnType<typeof buildSelectChain>;
let insertChain: ReturnType<typeof buildInsertChain>;
let updateChain: ReturnType<typeof buildUpdateChain>;

// Transaction mock – behaves exactly like `db` but with its own chains
let txSelectChain: ReturnType<typeof buildSelectChain>;
let txInsertChain: ReturnType<typeof buildInsertChain>;
let txUpdateChain: ReturnType<typeof buildUpdateChain>;

const txMock = {
  select: vi.fn(() => txSelectChain),
  insert: vi.fn(() => txInsertChain),
  update: vi.fn(() => txUpdateChain),
};

vi.mock('../../src/db/client.js', () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    // transaction receives a callback; we invoke it with our txMock
    transaction: vi.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  },
}));

vi.mock('../../src/services/queue.service.js', () => ({
  getQueueService: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal unit row returned by DB queries inside the service */
function makeUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_UNIT_ID,
    areaId: TEST_AREA_ID,
    name: 'Walk-in Cooler #1',
    unitType: 'walk_in_cooler',
    status: 'ok',
    tempMin: 320, // 32.0 F
    tempMax: 400, // 40.0 F
    tempUnit: 'F',
    manualMonitoringRequired: false,
    manualMonitoringInterval: null,
    lastReadingAt: null,
    lastTemperature: null,
    lastManualLogAt: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    deletedAt: null,
    ...overrides,
  };
}

/** Minimal alert row that matches Alert type shape */
function makeAlert(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'alert-001',
    unitId: TEST_UNIT_ID,
    alertRuleId: null,
    alertType: 'alarm_active',
    severity: 'warning',
    status: 'active',
    message: 'Temperature above threshold',
    triggerTemperature: 420,
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
    ...overrides,
  };
}

/** Minimal alert rule row */
function makeAlertRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-001',
    organizationId: TEST_ORG_ID,
    siteId: null as string | null,
    unitId: null as string | null,
    name: 'Default rule',
    tempMin: null as number | null,
    tempMax: null as number | null,
    delayMinutes: 10,
    alertType: 'alarm_active',
    severity: 'warning',
    isEnabled: true,
    schedule: null,
    manualIntervalMinutes: null,
    manualGraceMinutes: null,
    expectedReadingIntervalSeconds: null,
    offlineTriggerMultiplier: null,
    offlineTriggerAdditionalMinutes: null,
    offlineWarningMissedCheckins: null,
    offlineCriticalMissedCheckins: null,
    manualLogMissedCheckinsThreshold: null,
    doorOpenWarningMinutes: null,
    doorOpenCriticalMinutes: null,
    doorOpenMaxMaskMinutesPerDay: null,
    excursionConfirmMinutesDoorClosed: null,
    excursionConfirmMinutesDoorOpen: null,
    maxExcursionMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reconfigurable select mock for resolveEffectiveThresholds
//
// The function makes two sequential select() calls:
//   1. units join areas join sites -> returns unit + siteId + organizationId
//   2. alertRules -> returns array of rules
//
// We track call order via a counter and return different results.
// ---------------------------------------------------------------------------
function setupSelectForThresholds(
  unitRow: Record<string, unknown> | null,
  rules: Array<Record<string, unknown>> = [],
) {
  let callIndex = 0;

  const dbSelect = vi.mocked(db.select);
  dbSelect.mockImplementation(() => {
    const idx = callIndex++;
    if (idx === 0) {
      // First call: unit lookup with joins
      const result = unitRow
        ? [{ unit: unitRow, siteId: TEST_SITE_ID, organizationId: TEST_ORG_ID }]
        : [];
      return buildSelectChain(result) as any;
    }
    // Second call: alert rules
    return buildSelectChain(rules) as any;
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Alert Evaluator Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset shared chain instances
    selectChain = buildSelectChain();
    insertChain = buildInsertChain();
    updateChain = buildUpdateChain();

    txSelectChain = buildSelectChain();
    txInsertChain = buildInsertChain();
    txUpdateChain = buildUpdateChain();

    // Always clear the in-memory threshold cache between tests
    clearThresholdCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // clearThresholdCache
  // =========================================================================
  describe('clearThresholdCache', () => {
    it('should clear a specific unit from the cache', async () => {
      // Populate the cache by resolving thresholds for a unit
      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);

      // The next call should use the cache (reset the mock counter)
      const dbSelect = vi.mocked(db.select);
      dbSelect.mockClear();

      // Verify the cache is populated (no DB call)
      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);
      // select was NOT called because cache was used
      expect(dbSelect).not.toHaveBeenCalled();

      // Now clear only this unit
      clearThresholdCache(TEST_UNIT_ID);

      // Next call should hit the DB again
      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);
      expect(dbSelect).toHaveBeenCalled();
    });

    it('should clear all entries when no unitId is provided', async () => {
      // Populate cache for two different units
      const UNIT_2 = '11111111-2222-3333-4444-555555555555';

      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);

      setupSelectForThresholds(makeUnit({ id: UNIT_2 }), []);
      await resolveEffectiveThresholds(UNIT_2);

      // Clear all
      clearThresholdCache();

      const dbSelect = vi.mocked(db.select);
      dbSelect.mockClear();

      // Both should now miss the cache
      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);
      expect(dbSelect).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // resolveEffectiveThresholds
  // =========================================================================
  describe('resolveEffectiveThresholds', () => {
    it('should return unit own thresholds when no alert rules exist', async () => {
      setupSelectForThresholds(makeUnit({ tempMin: 320, tempMax: 400 }), []);

      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(result).toEqual({
        tempMin: 320,
        tempMax: 400,
        hysteresis: 5,
        confirmTimeSeconds: 600,
      });
    });

    it('should return unit-level rule thresholds (overriding unit thresholds)', async () => {
      const rule = makeAlertRule({
        unitId: TEST_UNIT_ID,
        siteId: null,
        tempMin: 300,
        tempMax: 380,
        delayMinutes: 5,
      });

      setupSelectForThresholds(makeUnit({ tempMin: 320, tempMax: 400 }), [rule]);

      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(result.tempMin).toBe(300);
      expect(result.tempMax).toBe(380);
      expect(result.confirmTimeSeconds).toBe(300); // 5 * 60
    });

    it('should return site-level rule when no unit rule exists', async () => {
      const siteRule = makeAlertRule({
        siteId: TEST_SITE_ID,
        unitId: null,
        tempMin: 310,
        tempMax: 390,
        delayMinutes: 15,
      });

      setupSelectForThresholds(makeUnit({ tempMin: 320, tempMax: 400 }), [siteRule]);

      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(result.tempMin).toBe(310);
      expect(result.tempMax).toBe(390);
      expect(result.confirmTimeSeconds).toBe(900); // 15 * 60
    });

    it('should return org-level rule when no unit or site rule exists', async () => {
      const orgRule = makeAlertRule({
        siteId: null,
        unitId: null,
        tempMin: 280,
        tempMax: 420,
        delayMinutes: 20,
      });

      setupSelectForThresholds(makeUnit({ tempMin: 320, tempMax: 400 }), [orgRule]);

      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(result.tempMin).toBe(280);
      expect(result.tempMax).toBe(420);
      expect(result.confirmTimeSeconds).toBe(1200); // 20 * 60
    });

    it('should prefer unit rule over site and org rules', async () => {
      const unitRule = makeAlertRule({
        id: 'rule-unit',
        unitId: TEST_UNIT_ID,
        siteId: null,
        tempMin: 300,
        tempMax: 380,
        delayMinutes: 5,
      });
      const siteRule = makeAlertRule({
        id: 'rule-site',
        siteId: TEST_SITE_ID,
        unitId: null,
        tempMin: 310,
        tempMax: 390,
        delayMinutes: 15,
      });
      const orgRule = makeAlertRule({
        id: 'rule-org',
        siteId: null,
        unitId: null,
        tempMin: 280,
        tempMax: 420,
        delayMinutes: 20,
      });

      setupSelectForThresholds(makeUnit(), [unitRule, siteRule, orgRule]);

      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(result.tempMin).toBe(300);
      expect(result.tempMax).toBe(380);
    });

    it('should use cached result on second call (DB not called twice)', async () => {
      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);

      const dbSelect = vi.mocked(db.select);
      dbSelect.mockClear();

      // Second call - should use cache
      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(dbSelect).not.toHaveBeenCalled();
      expect(result.tempMin).toBe(320);
      expect(result.tempMax).toBe(400);
    });

    it('should expire cache after TTL', async () => {
      vi.useFakeTimers();
      try {
        setupSelectForThresholds(makeUnit(), []);
        await resolveEffectiveThresholds(TEST_UNIT_ID);

        const dbSelect = vi.mocked(db.select);
        dbSelect.mockClear();

        // Advance past the 60-second TTL
        vi.advanceTimersByTime(61_000);

        setupSelectForThresholds(makeUnit(), []);
        await resolveEffectiveThresholds(TEST_UNIT_ID);

        // Should have called DB again because cache expired
        expect(dbSelect).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw when unit not found', async () => {
      setupSelectForThresholds(null, []);

      await expect(resolveEffectiveThresholds(TEST_UNIT_ID)).rejects.toThrow(
        `Unit ${TEST_UNIT_ID} not found`,
      );
    });

    it('should throw when no thresholds configured (null tempMin/tempMax and no rules)', async () => {
      setupSelectForThresholds(makeUnit({ tempMin: null, tempMax: null }), []);

      await expect(resolveEffectiveThresholds(TEST_UNIT_ID)).rejects.toThrow(
        /no temperature thresholds configured/,
      );
    });

    it('should be invalidated by clearThresholdCache', async () => {
      setupSelectForThresholds(makeUnit(), []);
      await resolveEffectiveThresholds(TEST_UNIT_ID);

      clearThresholdCache(TEST_UNIT_ID);

      const dbSelect = vi.mocked(db.select);
      dbSelect.mockClear();

      setupSelectForThresholds(makeUnit({ tempMin: 350, tempMax: 450 }), []);
      const result = await resolveEffectiveThresholds(TEST_UNIT_ID);

      expect(dbSelect).toHaveBeenCalled();
      expect(result.tempMin).toBe(350);
      expect(result.tempMax).toBe(450);
    });
  });

  // =========================================================================
  // createAlertIfNotExists
  // =========================================================================
  describe('createAlertIfNotExists', () => {
    it('should create alert when no existing active/acknowledged alert', async () => {
      const newAlert = makeAlert();

      // txSelectChain: existing check returns empty
      txSelectChain = buildSelectChain([]);
      // txInsertChain: returns the newly created alert
      txInsertChain = buildInsertChain([newAlert]);

      const result = await createAlertIfNotExists(txMock as any, {
        unitId: TEST_UNIT_ID,
        alertType: 'alarm_active',
        severity: 'warning',
        message: 'Temp above threshold',
        triggerTemperature: 420,
        thresholdViolated: 'max',
        triggeredAt: new Date(),
      });

      expect(result).toEqual(newAlert);
      expect(txMock.insert).toHaveBeenCalled();
    });

    it('should return null when active alert of same type already exists', async () => {
      const existingAlert = makeAlert({ status: 'active' });

      // txSelectChain: existing check finds one
      txSelectChain = buildSelectChain([existingAlert]);

      const result = await createAlertIfNotExists(txMock as any, {
        unitId: TEST_UNIT_ID,
        alertType: 'alarm_active',
        severity: 'warning',
        message: 'Temp above threshold',
        triggerTemperature: 420,
        thresholdViolated: 'max',
        triggeredAt: new Date(),
      });

      expect(result).toBeNull();
      expect(txMock.insert).not.toHaveBeenCalled();
    });

    it('should return null when acknowledged alert of same type already exists', async () => {
      const acknowledgedAlert = makeAlert({ status: 'acknowledged' });

      txSelectChain = buildSelectChain([acknowledgedAlert]);

      const result = await createAlertIfNotExists(txMock as any, {
        unitId: TEST_UNIT_ID,
        alertType: 'alarm_active',
        severity: 'warning',
        message: 'Temp above threshold',
        triggerTemperature: 420,
        thresholdViolated: 'max',
        triggeredAt: new Date(),
      });

      expect(result).toBeNull();
      expect(txMock.insert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // evaluateUnitAfterReading  (state machine)
  // =========================================================================
  describe('evaluateUnitAfterReading', () => {
    /**
     * Helper that wires up all the mocks needed for a single
     * evaluateUnitAfterReading call.
     *
     * The transaction callback receives `txMock`. Inside the function:
     *   - 1st tx.select => unit + organizationId  (from units join areas join sites)
     *   - resolveEffectiveThresholds uses db.select (non-tx) for the threshold query
     *   - tx.update calls for status changes, alert escalation, alert resolution
     *   - tx.insert for createAlertIfNotExists
     *
     * We need to set up both `db.select` (for resolveEffectiveThresholds) and
     * `txMock.select` (for the unit fetch inside the transaction).
     */
    function setupEvaluation(opts: {
      unitStatus?: string;
      unitUpdatedAt?: Date;
      tempMin?: number;
      tempMax?: number;
      rules?: Array<Record<string, unknown>>;
      existingAlert?: Record<string, unknown> | null;
      createdAlert?: Record<string, unknown> | null;
      escalatedAlert?: Record<string, unknown> | null;
      resolvedAlert?: Record<string, unknown> | null;
    }) {
      const {
        unitStatus = 'ok',
        unitUpdatedAt = new Date('2024-06-01'),
        tempMin = 320,
        tempMax = 400,
        rules = [],
        existingAlert = null,
        createdAlert = null,
        escalatedAlert = null,
        resolvedAlert = null,
      } = opts;

      const unit = makeUnit({
        status: unitStatus,
        updatedAt: unitUpdatedAt,
        tempMin,
        tempMax,
      });

      // -- tx.select calls inside evaluateUnitAfterReading --
      // First tx.select: unit lookup
      let txSelectCallIndex = 0;
      txMock.select.mockImplementation(() => {
        const idx = txSelectCallIndex++;
        if (idx === 0) {
          // Unit fetch
          return buildSelectChain([{ unit, organizationId: TEST_ORG_ID }]) as any;
        }
        // createAlertIfNotExists existing check
        return buildSelectChain(existingAlert ? [existingAlert] : []) as any;
      });

      // -- tx.insert for createAlertIfNotExists --
      const alertToReturn = createdAlert || makeAlert();
      txMock.insert.mockImplementation(() => buildInsertChain([alertToReturn]) as any);

      // -- tx.update calls --
      // May be called multiple times: unit status update, alert escalation, alert resolution
      let txUpdateCallIndex = 0;
      txMock.update.mockImplementation(() => {
        const idx = txUpdateCallIndex++;
        if (escalatedAlert && idx === 1) {
          return buildUpdateChain([escalatedAlert]) as any;
        }
        if (resolvedAlert && idx === 1) {
          return buildUpdateChain([resolvedAlert]) as any;
        }
        return buildUpdateChain([]) as any;
      });

      // -- db.select for resolveEffectiveThresholds (outside transaction) --
      setupSelectForThresholds(makeUnit({ tempMin, tempMax }), rules);
    }

    // ----- ok -> excursion transitions -----

    it('should transition ok -> excursion when temp is above max threshold', async () => {
      setupEvaluation({ unitStatus: 'ok', tempMax: 400 });

      // 42.0 F = 420 integer, above 400 max
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 420, new Date());

      expect(result.stateChange).not.toBeNull();
      expect(result.stateChange!.from).toBe('ok');
      expect(result.stateChange!.to).toBe('excursion');
      expect(result.stateChange!.reason).toContain('above');
    });

    it('should transition ok -> excursion when temp is below min threshold', async () => {
      setupEvaluation({ unitStatus: 'ok', tempMin: 320 });

      // 30.0 F = 300 integer, below 320 min
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 300, new Date());

      expect(result.stateChange).not.toBeNull();
      expect(result.stateChange!.from).toBe('ok');
      expect(result.stateChange!.to).toBe('excursion');
      expect(result.stateChange!.reason).toContain('below');
    });

    it('should create a warning-level alert on ok -> excursion', async () => {
      const createdAlert = makeAlert({ severity: 'warning' });
      setupEvaluation({
        unitStatus: 'ok',
        tempMax: 400,
        createdAlert,
      });

      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 420, new Date());

      expect(result.alertCreated).not.toBeNull();
      expect(result.alertCreated!.severity).toBe('warning');
    });

    // ----- excursion -> alarm_active -----

    it('should transition excursion -> alarm_active when confirmation time has elapsed', async () => {
      // Unit has been in excursion status since 20 minutes ago
      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
      const escalatedAlert = makeAlert({
        severity: 'critical',
        escalationLevel: 1,
      });

      setupEvaluation({
        unitStatus: 'excursion',
        unitUpdatedAt: twentyMinAgo,
        tempMax: 400,
        escalatedAlert,
      });

      // Still above threshold
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 420, new Date());

      expect(result.stateChange).not.toBeNull();
      expect(result.stateChange!.from).toBe('excursion');
      expect(result.stateChange!.to).toBe('alarm_active');
      expect(result.stateChange!.reason).toContain('confirmed');
    });

    it('should stay in excursion when not enough time has passed', async () => {
      // Unit entered excursion only 2 minutes ago (confirm time = 600s = 10 min)
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);

      setupEvaluation({
        unitStatus: 'excursion',
        unitUpdatedAt: twoMinAgo,
        tempMax: 400,
      });

      // Still above threshold but not long enough
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 420, new Date());

      // No state change because we haven't been in excursion long enough
      expect(result.stateChange).toBeNull();
    });

    // ----- (excursion | alarm_active) -> restoring -----

    it('should transition excursion -> restoring when temp returns to range with hysteresis', async () => {
      const resolvedAlert = makeAlert({
        status: 'resolved',
        resolvedAt: new Date(),
      });

      setupEvaluation({
        unitStatus: 'excursion',
        unitUpdatedAt: new Date(Date.now() - 5 * 60 * 1000),
        tempMin: 320,
        tempMax: 400,
        resolvedAlert,
      });

      // Temp = 360 (36.0 F) - well within 320+5=325 and 400-5=395 range
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 360, new Date());

      expect(result.stateChange).not.toBeNull();
      expect(result.stateChange!.from).toBe('excursion');
      expect(result.stateChange!.to).toBe('restoring');
      expect(result.stateChange!.reason).toContain('returned to acceptable range');
    });

    it('should transition alarm_active -> restoring when temp returns to range with hysteresis', async () => {
      const resolvedAlert = makeAlert({
        status: 'resolved',
        resolvedAt: new Date(),
      });

      setupEvaluation({
        unitStatus: 'alarm_active',
        unitUpdatedAt: new Date(Date.now() - 30 * 60 * 1000),
        tempMin: 320,
        tempMax: 400,
        resolvedAlert,
      });

      // Temp = 360 (36.0 F) - within hysteresis band
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 360, new Date());

      expect(result.stateChange).not.toBeNull();
      expect(result.stateChange!.from).toBe('alarm_active');
      expect(result.stateChange!.to).toBe('restoring');
      expect(result.alertResolved).not.toBeNull();
    });

    // ----- no change -----

    it('should not change state when ok and temp is in range', async () => {
      setupEvaluation({
        unitStatus: 'ok',
        tempMin: 320,
        tempMax: 400,
      });

      // 36.0 F = 360, well within 320-400
      const result = await evaluateUnitAfterReading(TEST_UNIT_ID, 360, new Date());

      expect(result.stateChange).toBeNull();
      expect(result.alertCreated).toBeNull();
      expect(result.alertResolved).toBeNull();
    });

    // ----- Socket emissions -----

    describe('Socket emissions', () => {
      it('should emit alert:triggered on ok -> excursion', async () => {
        const createdAlert = makeAlert({
          id: 'alert-triggered-001',
          severity: 'warning',
          triggeredAt: new Date(),
        });

        setupEvaluation({
          unitStatus: 'ok',
          tempMax: 400,
          createdAlert,
        });

        const mockSocket = { emitToOrg: vi.fn() };

        await evaluateUnitAfterReading(TEST_UNIT_ID, 420, new Date(), mockSocket as any);

        expect(mockSocket.emitToOrg).toHaveBeenCalledWith(
          TEST_ORG_ID,
          'alert:triggered',
          expect.objectContaining({
            alertId: 'alert-triggered-001',
            unitId: TEST_UNIT_ID,
            severity: 'warning',
          }),
        );
      });

      it('should emit alert:escalated on excursion -> alarm_active', async () => {
        const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
        const escalatedAlert = makeAlert({
          id: 'alert-escalated-001',
          severity: 'critical',
          escalationLevel: 1,
        });

        setupEvaluation({
          unitStatus: 'excursion',
          unitUpdatedAt: twentyMinAgo,
          tempMax: 400,
          escalatedAlert,
        });

        const mockSocket = { emitToOrg: vi.fn() };

        await evaluateUnitAfterReading(TEST_UNIT_ID, 420, new Date(), mockSocket as any);

        expect(mockSocket.emitToOrg).toHaveBeenCalledWith(
          TEST_ORG_ID,
          'alert:escalated',
          expect.objectContaining({
            alertId: 'alert-escalated-001',
            escalationLevel: 1,
          }),
        );
      });

      it('should emit alert:resolved on restoring', async () => {
        const resolvedAlert = makeAlert({
          id: 'alert-resolved-001',
          status: 'resolved',
          resolvedAt: new Date(),
        });

        setupEvaluation({
          unitStatus: 'alarm_active',
          unitUpdatedAt: new Date(Date.now() - 30 * 60 * 1000),
          tempMin: 320,
          tempMax: 400,
          resolvedAlert,
        });

        const mockSocket = { emitToOrg: vi.fn() };

        await evaluateUnitAfterReading(TEST_UNIT_ID, 360, new Date(), mockSocket as any);

        expect(mockSocket.emitToOrg).toHaveBeenCalledWith(
          TEST_ORG_ID,
          'alert:resolved',
          expect.objectContaining({
            alertId: 'alert-resolved-001',
            unitId: TEST_UNIT_ID,
          }),
        );
      });
    });
  });
});
