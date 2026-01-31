/**
 * Tests for Notification Policies tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - listByOrg: List org-level policies
 * - listBySite: List site-level policies
 * - listByUnit: List unit-level policies
 * - getEffective: Get effective policy with source flags
 * - upsert: Create/update policy (admin/owner only)
 * - delete: Delete policy (admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { notificationPoliciesRouter } from '../../src/routers/notification-policies.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the notification policy service
vi.mock('../../src/services/notification-policy.service.js', () => ({
  listNotificationPolicies: vi.fn(),
  getEffectiveNotificationPolicy: vi.fn(),
  upsertNotificationPolicy: vi.fn(),
  deleteNotificationPolicy: vi.fn(),
}));

describe('Notification Policies tRPC Router', () => {
  const createCaller = createCallerFactory(notificationPoliciesRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockListPolicies: ReturnType<typeof vi.fn>;
  let mockGetEffectivePolicy: ReturnType<typeof vi.fn>;
  let mockUpsertPolicy: ReturnType<typeof vi.fn>;
  let mockDeletePolicy: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const siteId = '223e4567-e89b-12d3-a456-426614174001';
  const unitId = '323e4567-e89b-12d3-a456-426614174002';
  const policyId = '423e4567-e89b-12d3-a456-426614174003';
  const profileId = '723e4567-e89b-12d3-a456-426614174005';

  // Sample policy data
  const mockPolicy = {
    id: policyId,
    organization_id: orgId,
    site_id: null,
    unit_id: null,
    alert_type: 'temp_excursion',
    initial_channels: ['EMAIL'],
    requires_ack: true,
    ack_deadline_minutes: 30,
    escalation_steps: [],
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

  const mockEffectivePolicy = {
    alert_type: 'temp_excursion',
    initial_channels: ['EMAIL'],
    requires_ack: true,
    ack_deadline_minutes: 30,
    escalation_steps: [],
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
    source_unit: false,
    source_site: false,
    source_org: true,
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
    const policyService = await import('../../src/services/notification-policy.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockListPolicies = policyService.listNotificationPolicies as any;
    mockGetEffectivePolicy = policyService.getEffectiveNotificationPolicy as any;
    mockUpsertPolicy = policyService.upsertNotificationPolicy as any;
    mockDeletePolicy = policyService.deleteNotificationPolicy as any;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: profileId });
  });

  describe('listByOrg', () => {
    it('should return org-level policies', async () => {
      const policies = [mockPolicy];
      mockListPolicies.mockResolvedValue(policies);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.listByOrg({ organizationId: orgId });

      expect(result).toEqual(policies);
      expect(mockListPolicies).toHaveBeenCalledWith({ organizationId: orgId });
    });

    it('should return empty array when no policies', async () => {
      mockListPolicies.mockResolvedValue([]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.listByOrg({ organizationId: orgId });

      expect(result).toEqual([]);
    });
  });

  describe('listBySite', () => {
    it('should return site-level policies', async () => {
      const sitePolicy = { ...mockPolicy, organization_id: null, site_id: siteId };
      mockListPolicies.mockResolvedValue([sitePolicy]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.listBySite({ organizationId: orgId, siteId });

      expect(result).toHaveLength(1);
      expect(result[0].site_id).toBe(siteId);
      expect(mockListPolicies).toHaveBeenCalledWith({ siteId });
    });
  });

  describe('listByUnit', () => {
    it('should return unit-level policies', async () => {
      const unitPolicy = { ...mockPolicy, organization_id: null, unit_id: unitId };
      mockListPolicies.mockResolvedValue([unitPolicy]);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.listByUnit({ organizationId: orgId, unitId });

      expect(result).toHaveLength(1);
      expect(result[0].unit_id).toBe(unitId);
      expect(mockListPolicies).toHaveBeenCalledWith({ unitId });
    });
  });

  describe('getEffective', () => {
    it('should return effective policy with source flags', async () => {
      mockGetEffectivePolicy.mockResolvedValue(mockEffectivePolicy);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getEffective({
        organizationId: orgId,
        unitId,
        alertType: 'temp_excursion',
      });

      expect(result).toEqual(mockEffectivePolicy);
      expect(result?.source_org).toBe(true);
      expect(mockGetEffectivePolicy).toHaveBeenCalledWith(unitId, 'temp_excursion');
    });

    it('should return null when no policy at any level', async () => {
      mockGetEffectivePolicy.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getEffective({
        organizationId: orgId,
        unitId,
        alertType: 'nonexistent_type',
      });

      expect(result).toBeNull();
    });

    it('should return unit-level policy with source_unit flag', async () => {
      const unitEffectivePolicy = {
        ...mockEffectivePolicy,
        source_unit: true,
        source_site: false,
        source_org: false,
      };
      mockGetEffectivePolicy.mockResolvedValue(unitEffectivePolicy);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getEffective({
        organizationId: orgId,
        unitId,
        alertType: 'temp_excursion',
      });

      expect(result?.source_unit).toBe(true);
      expect(result?.source_site).toBe(false);
      expect(result?.source_org).toBe(false);
    });
  });

  describe('upsert', () => {
    it('should upsert policy for admin role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpsertPolicy.mockResolvedValue(mockPolicy);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.upsert({
        organizationId: orgId,
        scope: { organization_id: orgId },
        alertType: 'temp_excursion',
        policy: { requires_ack: true },
      });

      expect(result).toEqual(mockPolicy);
      expect(mockUpsertPolicy).toHaveBeenCalled();
    });

    it('should upsert policy for owner role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockUpsertPolicy.mockResolvedValue(mockPolicy);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.upsert({
        organizationId: orgId,
        scope: { organization_id: orgId },
        alertType: 'temp_excursion',
        policy: { requires_ack: true },
      });

      expect(result).toEqual(mockPolicy);
    });

    it('should throw FORBIDDEN for manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.upsert({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
          policy: { requires_ack: true },
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.upsert({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
          policy: { requires_ack: true },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN for staff role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.upsert({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
          policy: { requires_ack: true },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN for viewer role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.upsert({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
          policy: { requires_ack: true },
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should upsert site-level policy', async () => {
      const sitePolicy = { ...mockPolicy, organization_id: null, site_id: siteId };
      mockUpsertPolicy.mockResolvedValue(sitePolicy);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.upsert({
        organizationId: orgId,
        scope: { site_id: siteId },
        alertType: 'temp_excursion',
        policy: { severity_threshold: 'CRITICAL' },
      });

      expect(result.site_id).toBe(siteId);
    });

    it('should upsert unit-level policy', async () => {
      const unitPolicy = { ...mockPolicy, organization_id: null, unit_id: unitId };
      mockUpsertPolicy.mockResolvedValue(unitPolicy);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.upsert({
        organizationId: orgId,
        scope: { unit_id: unitId },
        alertType: 'temp_excursion',
        policy: { requires_ack: false },
      });

      expect(result.unit_id).toBe(unitId);
    });
  });

  describe('delete', () => {
    it('should delete policy for admin role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDeletePolicy.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete({
        organizationId: orgId,
        scope: { organization_id: orgId },
        alertType: 'temp_excursion',
      });

      expect(result).toEqual({ success: true });
      expect(mockDeletePolicy).toHaveBeenCalled();
    });

    it('should delete policy for owner role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockDeletePolicy.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete({
        organizationId: orgId,
        scope: { organization_id: orgId },
        alertType: 'temp_excursion',
      });

      expect(result).toEqual({ success: true });
    });

    it('should throw FORBIDDEN for manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN for staff role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN for viewer role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.delete({
          organizationId: orgId,
          scope: { organization_id: orgId },
          alertType: 'temp_excursion',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should return success: false when policy not found', async () => {
      mockDeletePolicy.mockResolvedValue(false);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete({
        organizationId: orgId,
        scope: { organization_id: orgId },
        alertType: 'nonexistent_type',
      });

      expect(result).toEqual({ success: false });
    });

    it('should delete site-level policy', async () => {
      mockDeletePolicy.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete({
        organizationId: orgId,
        scope: { site_id: siteId },
        alertType: 'temp_excursion',
      });

      expect(result).toEqual({ success: true });
      expect(mockDeletePolicy).toHaveBeenCalledWith({ site_id: siteId }, 'temp_excursion');
    });

    it('should delete unit-level policy', async () => {
      mockDeletePolicy.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.delete({
        organizationId: orgId,
        scope: { unit_id: unitId },
        alertType: 'temp_excursion',
      });

      expect(result).toEqual({ success: true });
      expect(mockDeletePolicy).toHaveBeenCalledWith({ unit_id: unitId }, 'temp_excursion');
    });
  });
});
