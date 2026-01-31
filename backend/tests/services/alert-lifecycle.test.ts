import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Alert Lifecycle Service Tests
 *
 * Tests cover the alert acknowledge/resolve lifecycle:
 * - Acknowledge: active → acknowledged (staff+ role)
 * - Resolve: active/acknowledged → resolved (staff+ role)
 * - Corrective actions attached during resolution
 * - Audit trail: timestamps and user attribution
 * - Invalid state transitions (already acknowledged, not found)
 * - Unit status reset on resolution
 *
 * Database calls are fully mocked using vi.mock for the db module.
 */

// --- Mock Setup ---

// Chainable query builders that simulate Drizzle ORM patterns

/** Creates a chain for verifyAlertAccess: select → from → innerJoin(x3) → where → limit */
function createAccessChain(result: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      }),
    }),
  };
}

/** Creates a chain for update: set → where → returning */
function createUpdateChain(result: any[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

/** Creates a chain for insert: values → (no returning) */
function createInsertChain() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a chain for update without returning (unit status reset) */
function createUpdateNoReturnChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
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

// Mock the queue service (not under test)
vi.mock('../../src/services/queue.service.js', () => ({
  getQueueService: vi.fn().mockReturnValue(null),
}));

// Now import after mocks
import { db } from '../../src/db/client.js';
import {
  acknowledgeAlert,
  resolveAlert,
  verifyAlertAccess,
  getAlert,
  listAlerts,
} from '../../src/services/alert.service.js';

// --- Helper Factories ---

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
    triggeredAt: new Date('2024-06-01T12:00:00Z'),
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    escalatedAt: null,
    escalationLevel: 0,
    metadata: null,
    createdAt: new Date('2024-06-01T12:00:00Z'),
    updatedAt: new Date('2024-06-01T12:00:00Z'),
    ...overrides,
  };
}

// --- Test Suite ---

describe('Alert Lifecycle Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  // verifyAlertAccess
  // -------------------------------------------------------
  describe('verifyAlertAccess', () => {
    it('should return alert when it belongs to the organization', async () => {
      const alert = makeAlert();
      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert }]) as any);

      const result = await verifyAlertAccess('alert-1', 'org-1');

      expect(result).toEqual(alert);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when alert does not belong to the organization', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await verifyAlertAccess('alert-1', 'wrong-org');

      expect(result).toBeNull();
    });

    it('should return null for nonexistent alert', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await verifyAlertAccess('nonexistent', 'org-1');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------
  // acknowledgeAlert
  // -------------------------------------------------------
  describe('acknowledgeAlert', () => {
    it('should acknowledge an active alert and record user + timestamp', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const acknowledgedAlert = makeAlert({
        status: 'acknowledged',
        acknowledgedAt: new Date('2024-06-01T12:30:00Z'),
        acknowledgedBy: 'profile-staff-1',
        metadata: JSON.stringify({ acknowledgementNotes: 'Investigating now' }),
      });

      // verifyAlertAccess: select chain
      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);
      // update chain
      vi.mocked(db.update).mockReturnValue(createUpdateChain([acknowledgedAlert]) as any);

      const result = await acknowledgeAlert(
        'alert-1',
        'org-1',
        'profile-staff-1',
        'Investigating now',
      );

      expect(result).not.toBeNull();
      expect(result).not.toBe('already_acknowledged');
      const ack = result as typeof acknowledgedAlert;
      expect(ack.status).toBe('acknowledged');
      expect(ack.acknowledgedBy).toBe('profile-staff-1');
      expect(ack.acknowledgedAt).toEqual(new Date('2024-06-01T12:30:00Z'));
      expect(db.update).toHaveBeenCalled();
    });

    it('should store acknowledgment notes in metadata', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const acknowledgedAlert = makeAlert({
        status: 'acknowledged',
        metadata: JSON.stringify({ acknowledgementNotes: 'Compressor checked' }),
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);
      vi.mocked(db.update).mockReturnValue(createUpdateChain([acknowledgedAlert]) as any);

      const result = await acknowledgeAlert('alert-1', 'org-1', 'profile-1', 'Compressor checked');

      expect(result).not.toBe('already_acknowledged');
      const ack = result as typeof acknowledgedAlert;
      const meta = JSON.parse(ack.metadata!);
      expect(meta.acknowledgementNotes).toBe('Compressor checked');
    });

    it('should acknowledge without notes (preserves existing metadata)', async () => {
      const existingMeta = JSON.stringify({ someKey: 'someValue' });
      const activeAlert = makeAlert({ status: 'active', metadata: existingMeta });
      const acknowledgedAlert = makeAlert({
        status: 'acknowledged',
        metadata: existingMeta, // Preserved when no notes
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);
      vi.mocked(db.update).mockReturnValue(createUpdateChain([acknowledgedAlert]) as any);

      const result = await acknowledgeAlert(
        'alert-1',
        'org-1',
        'profile-1',
        // no notes
      );

      expect(result).not.toBe('already_acknowledged');
      const ack = result as typeof acknowledgedAlert;
      expect(ack.metadata).toBe(existingMeta);
    });

    it('should return "already_acknowledged" if alert is already acknowledged', async () => {
      const alreadyAcked = makeAlert({ status: 'acknowledged' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: alreadyAcked }]) as any);

      const result = await acknowledgeAlert('alert-1', 'org-1', 'profile-1', 'Trying again');

      expect(result).toBe('already_acknowledged');
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should return null when alert does not exist or is not accessible', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await acknowledgeAlert('nonexistent', 'org-1', 'profile-1');

      expect(result).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should return null when alert belongs to a different organization', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await acknowledgeAlert('alert-1', 'wrong-org', 'profile-1', 'Notes');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------
  // resolveAlert
  // -------------------------------------------------------
  describe('resolveAlert', () => {
    it('should resolve an active alert with resolution text and record user + timestamp', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const resolvedAlert = makeAlert({
        status: 'resolved',
        resolvedAt: new Date('2024-06-01T13:00:00Z'),
        resolvedBy: 'profile-manager-1',
        metadata: JSON.stringify({ resolution: 'Compressor repaired' }),
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      // Transaction mock
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any) // alert update
            .mockReturnValueOnce(createUpdateNoReturnChain() as any), // unit status reset
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert(
        'alert-1',
        'org-1',
        'profile-manager-1',
        'Compressor repaired',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
      expect(result!.resolvedBy).toBe('profile-manager-1');
      expect(result!.resolvedAt).toEqual(new Date('2024-06-01T13:00:00Z'));
    });

    it('should resolve an acknowledged alert (acknowledge → resolve)', async () => {
      const acknowledgedAlert = makeAlert({
        status: 'acknowledged',
        acknowledgedAt: new Date('2024-06-01T12:30:00Z'),
        acknowledgedBy: 'profile-staff-1',
      });
      const resolvedAlert = makeAlert({
        status: 'resolved',
        acknowledgedAt: new Date('2024-06-01T12:30:00Z'),
        acknowledgedBy: 'profile-staff-1',
        resolvedAt: new Date('2024-06-01T13:00:00Z'),
        resolvedBy: 'profile-manager-1',
        metadata: JSON.stringify({ resolution: 'Thermostat adjusted' }),
      });

      vi.mocked(db.select).mockReturnValue(
        createAccessChain([{ alert: acknowledgedAlert }]) as any,
      );

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert(
        'alert-1',
        'org-1',
        'profile-manager-1',
        'Thermostat adjusted',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
    });

    it('should create a corrective action record when correctiveAction is provided', async () => {
      const activeAlert = makeAlert({ status: 'active', unitId: 'unit-1' });
      const resolvedAlert = makeAlert({
        status: 'resolved',
        resolvedBy: 'profile-1',
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      let txInsertCalled = false;
      let insertedValues: any = null;

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockImplementation(() => {
            txInsertCalled = true;
            return {
              values: vi.fn().mockImplementation((vals: any) => {
                insertedValues = vals;
                return Promise.resolve();
              }),
            };
          }),
        };
        return callback(tx);
      });

      await resolveAlert(
        'alert-1',
        'org-1',
        'profile-1',
        'Compressor failed',
        'Replaced compressor fan motor',
      );

      expect(txInsertCalled).toBe(true);
      expect(insertedValues).not.toBeNull();
      expect(insertedValues.alertId).toBe('alert-1');
      expect(insertedValues.unitId).toBe('unit-1');
      expect(insertedValues.profileId).toBe('profile-1');
      expect(insertedValues.description).toBe('Compressor failed');
      expect(insertedValues.actionTaken).toBe('Replaced compressor fan motor');
      expect(insertedValues.resolvedAlert).toBe(true);
      expect(insertedValues.actionAt).toBeInstanceOf(Date);
    });

    it('should NOT create corrective action when correctiveAction is not provided', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const resolvedAlert = makeAlert({ status: 'resolved' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      let txInsertCalled = false;

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockImplementation(() => {
            txInsertCalled = true;
            return { values: vi.fn().mockResolvedValue(undefined) };
          }),
        };
        return callback(tx);
      });

      await resolveAlert(
        'alert-1',
        'org-1',
        'profile-1',
        'Issue self-resolved',
        // no correctiveAction
      );

      expect(txInsertCalled).toBe(false);
    });

    it('should store resolution text in metadata', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const resolvedAlert = makeAlert({
        status: 'resolved',
        metadata: JSON.stringify({ resolution: 'Door was left open; closed it' }),
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert(
        'alert-1',
        'org-1',
        'profile-1',
        'Door was left open; closed it',
      );

      expect(result).not.toBeNull();
      const meta = JSON.parse(result!.metadata!);
      expect(meta.resolution).toBe('Door was left open; closed it');
    });

    it('should reset unit status to ok when unit is in alarm state', async () => {
      const activeAlert = makeAlert({ status: 'active', unitId: 'unit-1' });
      const resolvedAlert = makeAlert({ status: 'resolved' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      let unitUpdateCalled = false;

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi.fn().mockImplementation(() => {
            // Track the second update call (unit status reset)
            const callCount = tx.update.mock.calls.length;
            if (callCount === 1) {
              // First call: alert status update
              return createUpdateChain([resolvedAlert]) as any;
            }
            // Second call: unit status reset
            unitUpdateCalled = true;
            return createUpdateNoReturnChain() as any;
          }),
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      await resolveAlert('alert-1', 'org-1', 'profile-1', 'Fixed');

      expect(unitUpdateCalled).toBe(true);
    });

    it('should return null when alert does not exist', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await resolveAlert('nonexistent', 'org-1', 'profile-1', 'Some resolution');

      expect(result).toBeNull();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should return null when alert belongs to a different organization', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await resolveAlert('alert-1', 'wrong-org', 'profile-1', 'Some resolution');

      expect(result).toBeNull();
    });

    it('should return null when transaction update returns no results', async () => {
      const activeAlert = makeAlert({ status: 'active' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi.fn().mockReturnValue(createUpdateChain([]) as any), // empty return
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert('alert-1', 'org-1', 'profile-1', 'Fix');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------
  // Audit trail: timestamps and user attribution
  // -------------------------------------------------------
  describe('audit trail — timestamps and user attribution', () => {
    it('should record acknowledgedBy with the profile ID of the user who acknowledged', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const ackTime = new Date('2024-06-01T14:00:00Z');
      const acknowledgedAlert = makeAlert({
        status: 'acknowledged',
        acknowledgedAt: ackTime,
        acknowledgedBy: 'profile-staff-42',
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);
      vi.mocked(db.update).mockReturnValue(createUpdateChain([acknowledgedAlert]) as any);

      const result = await acknowledgeAlert('alert-1', 'org-1', 'profile-staff-42');

      expect(result).not.toBe('already_acknowledged');
      const ack = result as typeof acknowledgedAlert;
      expect(ack.acknowledgedBy).toBe('profile-staff-42');
      expect(ack.acknowledgedAt).toEqual(ackTime);
    });

    it('should record resolvedBy with the profile ID of the user who resolved', async () => {
      const activeAlert = makeAlert({ status: 'active' });
      const resolveTime = new Date('2024-06-01T15:00:00Z');
      const resolvedAlert = makeAlert({
        status: 'resolved',
        resolvedAt: resolveTime,
        resolvedBy: 'profile-admin-99',
        metadata: JSON.stringify({ resolution: 'Fixed' }),
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert('alert-1', 'org-1', 'profile-admin-99', 'Fixed');

      expect(result).not.toBeNull();
      expect(result!.resolvedBy).toBe('profile-admin-99');
      expect(result!.resolvedAt).toEqual(resolveTime);
    });

    it('should preserve acknowledge info when alert is subsequently resolved', async () => {
      const acknowledgedAlert = makeAlert({
        status: 'acknowledged',
        acknowledgedAt: new Date('2024-06-01T12:30:00Z'),
        acknowledgedBy: 'profile-staff-1',
      });
      const resolvedAlert = makeAlert({
        status: 'resolved',
        acknowledgedAt: new Date('2024-06-01T12:30:00Z'),
        acknowledgedBy: 'profile-staff-1',
        resolvedAt: new Date('2024-06-01T13:00:00Z'),
        resolvedBy: 'profile-manager-1',
        metadata: JSON.stringify({ resolution: 'Fixed' }),
      });

      vi.mocked(db.select).mockReturnValue(
        createAccessChain([{ alert: acknowledgedAlert }]) as any,
      );

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert('alert-1', 'org-1', 'profile-manager-1', 'Fixed');

      expect(result).not.toBeNull();
      // Acknowledgment info preserved alongside resolution info
      expect(result!.acknowledgedBy).toBe('profile-staff-1');
      expect(result!.acknowledgedAt).toEqual(new Date('2024-06-01T12:30:00Z'));
      expect(result!.resolvedBy).toBe('profile-manager-1');
      expect(result!.resolvedAt).toEqual(new Date('2024-06-01T13:00:00Z'));
    });
  });

  // -------------------------------------------------------
  // State transition edge cases
  // -------------------------------------------------------
  describe('state transition edge cases', () => {
    it('should allow resolving an already resolved alert (no state guard in service)', async () => {
      // The service does NOT guard against re-resolving - verifyAlertAccess
      // only checks org membership. The resolveAlert function will re-resolve.
      const resolvedAlert = makeAlert({ status: 'resolved' });
      const reResolvedAlert = makeAlert({
        status: 'resolved',
        resolvedAt: new Date('2024-06-01T16:00:00Z'),
        resolvedBy: 'profile-2',
        metadata: JSON.stringify({ resolution: 'Re-resolved' }),
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: resolvedAlert }]) as any);

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([reResolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockReturnValue(createInsertChain() as any),
        };
        return callback(tx);
      });

      const result = await resolveAlert('alert-1', 'org-1', 'profile-2', 'Re-resolved');

      // Service allows re-resolve (no state guard)
      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
    });

    it('should allow acknowledging an active alert that was escalated', async () => {
      const escalatedAlert = makeAlert({
        status: 'escalated',
        escalationLevel: 2,
        escalatedAt: new Date('2024-06-01T14:00:00Z'),
      });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: escalatedAlert }]) as any);

      // Since status is 'escalated' (not 'acknowledged'), the function
      // should proceed to acknowledge
      const acknowledgedVersion = makeAlert({
        ...escalatedAlert,
        status: 'acknowledged',
        acknowledgedAt: new Date('2024-06-01T14:30:00Z'),
        acknowledgedBy: 'profile-1',
      });
      vi.mocked(db.update).mockReturnValue(createUpdateChain([acknowledgedVersion]) as any);

      const result = await acknowledgeAlert('alert-1', 'org-1', 'profile-1');

      expect(result).not.toBe('already_acknowledged');
      expect(result).not.toBeNull();
      const ack = result as typeof acknowledgedVersion;
      expect(ack.status).toBe('acknowledged');
    });
  });

  // -------------------------------------------------------
  // getAlert (wrapper for verifyAlertAccess)
  // -------------------------------------------------------
  describe('getAlert', () => {
    it('should return the alert via verifyAlertAccess', async () => {
      const alert = makeAlert({ id: 'get-test-1' });
      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert }]) as any);

      const result = await getAlert('get-test-1', 'org-1');

      expect(result).toEqual(alert);
    });

    it('should return null for inaccessible alert', async () => {
      vi.mocked(db.select).mockReturnValue(createAccessChain([]) as any);

      const result = await getAlert('nonexistent', 'org-1');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------
  // Corrective action details
  // -------------------------------------------------------
  describe('corrective action details', () => {
    it('should set resolvedAlert flag to true on the corrective action', async () => {
      const activeAlert = makeAlert({ status: 'active', unitId: 'unit-1' });
      const resolvedAlert = makeAlert({ status: 'resolved' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      let insertedData: any = null;

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((vals: any) => {
              insertedData = vals;
              return Promise.resolve();
            }),
          })),
        };
        return callback(tx);
      });

      await resolveAlert(
        'alert-1',
        'org-1',
        'profile-1',
        'Root cause: power outage',
        'Rebooted compressor and verified temps',
      );

      expect(insertedData).not.toBeNull();
      expect(insertedData.resolvedAlert).toBe(true);
      expect(insertedData.description).toBe('Root cause: power outage');
      expect(insertedData.actionTaken).toBe('Rebooted compressor and verified temps');
    });

    it('should set actionAt timestamp on corrective action', async () => {
      const activeAlert = makeAlert({ status: 'active', unitId: 'unit-1' });
      const resolvedAlert = makeAlert({ status: 'resolved' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      let insertedData: any = null;

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((vals: any) => {
              insertedData = vals;
              return Promise.resolve();
            }),
          })),
        };
        return callback(tx);
      });

      const beforeCall = new Date();
      await resolveAlert('alert-1', 'org-1', 'profile-1', 'Fixed issue', 'Replaced part');
      const afterCall = new Date();

      expect(insertedData.actionAt).toBeInstanceOf(Date);
      expect(insertedData.actionAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(insertedData.actionAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should link corrective action to the correct alert and unit', async () => {
      const activeAlert = makeAlert({
        id: 'alert-xyz',
        status: 'active',
        unitId: 'unit-abc',
      });
      const resolvedAlert = makeAlert({ status: 'resolved' });

      vi.mocked(db.select).mockReturnValue(createAccessChain([{ alert: activeAlert }]) as any);

      let insertedData: any = null;

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const tx = {
          update: vi
            .fn()
            .mockReturnValueOnce(createUpdateChain([resolvedAlert]) as any)
            .mockReturnValueOnce(createUpdateNoReturnChain() as any),
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((vals: any) => {
              insertedData = vals;
              return Promise.resolve();
            }),
          })),
        };
        return callback(tx);
      });

      await resolveAlert('alert-xyz', 'org-1', 'profile-1', 'Fixed', 'Action taken');

      expect(insertedData.alertId).toBe('alert-xyz');
      expect(insertedData.unitId).toBe('unit-abc');
      expect(insertedData.profileId).toBe('profile-1');
    });
  });
});
