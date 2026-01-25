/**
 * Tests for Notification Policy Service
 *
 * Tests cover:
 * - listNotificationPolicies: returns policies for each scope type
 * - getEffectiveNotificationPolicy: inheritance chain testing
 * - upsertNotificationPolicy: creates new, updates existing
 * - deleteNotificationPolicy: deletes existing, returns false for non-existent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database client
vi.mock('../../src/db/client.js', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    })),
  },
}));

// Import after mocking
import { db } from '../../src/db/client.js';
import {
  listNotificationPolicies,
  getEffectiveNotificationPolicy,
  upsertNotificationPolicy,
  deleteNotificationPolicy,
  type NotificationPolicy,
  type EffectiveNotificationPolicy,
} from '../../src/services/notification-policy.service.js';

describe('Notification Policy Service', () => {
  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const siteId = '223e4567-e89b-12d3-a456-426614174001';
  const unitId = '323e4567-e89b-12d3-a456-426614174002';
  const policyId = '423e4567-e89b-12d3-a456-426614174003';
  const areaId = '523e4567-e89b-12d3-a456-426614174004';

  // Sample policy data
  const mockOrgPolicy = {
    id: policyId,
    organization_id: orgId,
    site_id: null,
    unit_id: null,
    alert_type: 'temp_excursion',
    initial_channels: ['EMAIL'],
    requires_ack: true,
    ack_deadline_minutes: 30,
    escalation_steps: JSON.stringify([]),
    send_resolved_notifications: true,
    reminders_enabled: false,
    reminder_interval_minutes: null,
    quiet_hours_enabled: false,
    quiet_hours_start_local: null,
    quiet_hours_end_local: null,
    severity_threshold: 'WARNING',
    allow_warning_notifications: true,
    notify_roles: ['owner', 'admin'],
    notify_site_managers: true,
    notify_assigned_users: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSitePolicy = {
    ...mockOrgPolicy,
    id: '523e4567-e89b-12d3-a456-426614174005',
    organization_id: null,
    site_id: siteId,
    severity_threshold: 'CRITICAL',
  };

  const mockUnitPolicy = {
    ...mockOrgPolicy,
    id: '623e4567-e89b-12d3-a456-426614174006',
    organization_id: null,
    unit_id: unitId,
    requires_ack: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listNotificationPolicies', () => {
    it('should return policies for organizationId scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockOrgPolicy] });

      const result = await listNotificationPolicies({ organizationId: orgId });

      expect(result).toHaveLength(1);
      expect(result[0].organization_id).toBe(orgId);
      expect(result[0].alert_type).toBe('temp_excursion');
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return policies for siteId scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockSitePolicy] });

      const result = await listNotificationPolicies({ siteId });

      expect(result).toHaveLength(1);
      expect(result[0].site_id).toBe(siteId);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return policies for unitId scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockUnitPolicy] });

      const result = await listNotificationPolicies({ unitId });

      expect(result).toHaveLength(1);
      expect(result[0].unit_id).toBe(unitId);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return empty array when no scope provided', async () => {
      const result = await listNotificationPolicies({});

      expect(result).toHaveLength(0);
    });

    it('should return empty array when no policies found', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await listNotificationPolicies({ organizationId: orgId });

      expect(result).toHaveLength(0);
    });

    it('should parse escalation_steps from JSON string', async () => {
      const policyWithSteps = {
        ...mockOrgPolicy,
        escalation_steps: JSON.stringify([
          { delay_minutes: 15, channels: ['SMS'], repeat: false },
        ]),
      };
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [policyWithSteps] });

      const result = await listNotificationPolicies({ organizationId: orgId });

      expect(result[0].escalation_steps).toHaveLength(1);
      expect(result[0].escalation_steps[0].delay_minutes).toBe(15);
    });
  });

  describe('getEffectiveNotificationPolicy', () => {
    // Helper to mock hierarchy lookup
    const mockHierarchyLookup = () => {
      const mockSelect = db.select as ReturnType<typeof vi.fn>;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { unitId, areaId, siteId, organizationId: orgId },
                ]),
              }),
            }),
          }),
        }),
      });
    };

    it('should return unit-level policy when exists (source_unit: true)', async () => {
      mockHierarchyLookup();
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      // First call: unit policy found
      mockExecute.mockResolvedValueOnce({ rows: [mockUnitPolicy] });

      const result = await getEffectiveNotificationPolicy(unitId, 'temp_excursion');

      expect(result).not.toBeNull();
      expect(result?.source_unit).toBe(true);
      expect(result?.source_site).toBe(false);
      expect(result?.source_org).toBe(false);
    });

    it('should fall back to site-level when no unit policy (source_site: true)', async () => {
      mockHierarchyLookup();
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      // First call: no unit policy
      mockExecute.mockResolvedValueOnce({ rows: [] });
      // Second call: site policy found
      mockExecute.mockResolvedValueOnce({ rows: [mockSitePolicy] });

      const result = await getEffectiveNotificationPolicy(unitId, 'temp_excursion');

      expect(result).not.toBeNull();
      expect(result?.source_unit).toBe(false);
      expect(result?.source_site).toBe(true);
      expect(result?.source_org).toBe(false);
    });

    it('should fall back to org-level when no site/unit policy (source_org: true)', async () => {
      mockHierarchyLookup();
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      // First call: no unit policy
      mockExecute.mockResolvedValueOnce({ rows: [] });
      // Second call: no site policy
      mockExecute.mockResolvedValueOnce({ rows: [] });
      // Third call: org policy found
      mockExecute.mockResolvedValueOnce({ rows: [mockOrgPolicy] });

      const result = await getEffectiveNotificationPolicy(unitId, 'temp_excursion');

      expect(result).not.toBeNull();
      expect(result?.source_unit).toBe(false);
      expect(result?.source_site).toBe(false);
      expect(result?.source_org).toBe(true);
    });

    it('should return null when no policy at any level', async () => {
      mockHierarchyLookup();
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      // All calls: no policy
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await getEffectiveNotificationPolicy(unitId, 'temp_excursion');

      expect(result).toBeNull();
    });

    it('should return null when unit does not exist', async () => {
      const mockSelect = db.select as ReturnType<typeof vi.fn>;
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const result = await getEffectiveNotificationPolicy(unitId, 'temp_excursion');

      expect(result).toBeNull();
    });

    it('should include all policy fields in effective policy', async () => {
      mockHierarchyLookup();
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValueOnce({ rows: [mockOrgPolicy] });

      const result = await getEffectiveNotificationPolicy(unitId, 'temp_excursion');

      expect(result).toMatchObject({
        alert_type: 'temp_excursion',
        initial_channels: ['EMAIL'],
        requires_ack: true,
        ack_deadline_minutes: 30,
        send_resolved_notifications: true,
        severity_threshold: 'WARNING',
        notify_roles: ['owner', 'admin'],
      });
    });
  });

  describe('upsertNotificationPolicy', () => {
    it('should create new policy for organization scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockOrgPolicy] });

      const result = await upsertNotificationPolicy(
        { organization_id: orgId },
        'temp_excursion',
        { requires_ack: true, initial_channels: ['EMAIL'] }
      );

      expect(result.organization_id).toBe(orgId);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should create new policy for site scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockSitePolicy] });

      const result = await upsertNotificationPolicy(
        { site_id: siteId },
        'temp_excursion',
        { severity_threshold: 'CRITICAL' }
      );

      expect(result.site_id).toBe(siteId);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should create new policy for unit scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockUnitPolicy] });

      const result = await upsertNotificationPolicy(
        { unit_id: unitId },
        'temp_excursion',
        { requires_ack: false }
      );

      expect(result.unit_id).toBe(unitId);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should throw error when no scope provided', async () => {
      await expect(
        upsertNotificationPolicy({}, 'temp_excursion', { requires_ack: true })
      ).rejects.toThrow('Must provide organization_id, site_id, or unit_id');
    });

    it('should handle escalation_steps serialization', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rows: [mockOrgPolicy] });

      await upsertNotificationPolicy(
        { organization_id: orgId },
        'temp_excursion',
        {
          escalation_steps: [
            { delay_minutes: 15, channels: ['SMS'], repeat: false },
          ],
        }
      );

      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('deleteNotificationPolicy', () => {
    it('should delete existing policy and return true', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rowCount: 1 });

      const result = await deleteNotificationPolicy(
        { organization_id: orgId },
        'temp_excursion'
      );

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return false when policy not found', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rowCount: 0 });

      const result = await deleteNotificationPolicy(
        { organization_id: orgId },
        'nonexistent_type'
      );

      expect(result).toBe(false);
    });

    it('should delete by site scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rowCount: 1 });

      const result = await deleteNotificationPolicy(
        { site_id: siteId },
        'temp_excursion'
      );

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should delete by unit scope', async () => {
      const mockExecute = db.execute as ReturnType<typeof vi.fn>;
      mockExecute.mockResolvedValue({ rowCount: 1 });

      const result = await deleteNotificationPolicy(
        { unit_id: unitId },
        'temp_excursion'
      );

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return false when no scope provided', async () => {
      const result = await deleteNotificationPolicy({}, 'temp_excursion');

      expect(result).toBe(false);
    });
  });
});
