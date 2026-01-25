/**
 * Tests for TTN Settings tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - get: Retrieve TTN settings for organization
 * - update: Modify TTN settings (admin/owner only)
 * - test: Test TTN connection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ttnSettingsRouter } from '../../src/routers/ttn-settings.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the TTN settings service
vi.mock('../../src/services/ttn-settings.service.js', () => ({
  getTTNSettings: vi.fn(),
  updateTTNSettings: vi.fn(),
  updateTestResult: vi.fn(),
  isTTNConfigured: vi.fn(),
}));

describe('TTN Settings tRPC Router', () => {
  const createCaller = createCallerFactory(ttnSettingsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockGetTTNSettings: ReturnType<typeof vi.fn>;
  let mockUpdateTTNSettings: ReturnType<typeof vi.fn>;
  let mockUpdateTestResult: ReturnType<typeof vi.fn>;
  let mockIsTTNConfigured: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';

  // Sample TTN settings data
  const mockSettings = {
    organization_id: orgId,
    ttn_region: 'nam1',
    ttn_application_id: 'freshtrack-app',
    is_enabled: true,
    provisioning_status: 'ready',
    provisioning_step: null,
    provisioning_started_at: null,
    provisioning_last_heartbeat_at: null,
    provisioning_attempt_count: 0,
    provisioning_error: null,
    last_http_status: null,
    last_http_body: null,
    provisioning_last_step: null,
    provisioning_can_retry: true,
    provisioned_at: '2024-01-01T00:00:00Z',
    has_api_key: true,
    api_key_last4: 'abcd',
    api_key_updated_at: '2024-01-01T00:00:00Z',
    has_webhook_secret: false,
    webhook_secret_last4: null,
    webhook_url: null,
    webhook_id: null,
    webhook_events: null,
    last_connection_test_at: null,
    last_connection_test_result: null,
    last_updated_source: null,
    last_test_source: null,
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
    const ttnSettingsService = await import('../../src/services/ttn-settings.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockGetTTNSettings = ttnSettingsService.getTTNSettings as any;
    mockUpdateTTNSettings = ttnSettingsService.updateTTNSettings as any;
    mockUpdateTestResult = ttnSettingsService.updateTestResult as any;
    mockIsTTNConfigured = ttnSettingsService.isTTNConfigured as any;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('get', () => {
    it('should return null when settings do not exist', async () => {
      mockGetTTNSettings.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toBeNull();
      expect(mockGetTTNSettings).toHaveBeenCalledWith(orgId);
    });

    it('should return settings when they exist', async () => {
      mockGetTTNSettings.mockResolvedValue(mockSettings);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockSettings);
    });

    it('should work for any authenticated role (viewer)', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');
      mockGetTTNSettings.mockResolvedValue(mockSettings);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockSettings);
    });

    it('should work for staff role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockGetTTNSettings.mockResolvedValue(mockSettings);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockSettings);
    });

    it('should work for manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockGetTTNSettings.mockResolvedValue(mockSettings);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockSettings);
    });
  });

  describe('update', () => {
    const updateInput = {
      organizationId: orgId,
      data: { is_enabled: false },
    };

    it('should update settings when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpdateTTNSettings.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update(updateInput);

      expect(result).toEqual({ success: true });
      expect(mockUpdateTTNSettings).toHaveBeenCalledWith(orgId, updateInput.data);
    });

    it('should update settings when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockUpdateTTNSettings.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.update(updateInput);

      expect(result).toEqual({ success: true });
    });

    it('should throw FORBIDDEN when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.update(updateInput)).rejects.toThrow(TRPCError);

      await expect(caller.update(updateInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only administrators can update TTN settings',
      });
    });

    it('should throw FORBIDDEN when user is manager', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.update(updateInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when user is viewer', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.update(updateInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should accept multiple update fields', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpdateTTNSettings.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const multiInput = {
        organizationId: orgId,
        data: {
          is_enabled: true,
          ttn_region: 'eu1',
        },
      };

      const result = await caller.update(multiInput);

      expect(result).toEqual({ success: true });
      expect(mockUpdateTTNSettings).toHaveBeenCalledWith(orgId, multiInput.data);
    });
  });

  describe('test', () => {
    it('should throw BAD_REQUEST when TTN not configured', async () => {
      mockIsTTNConfigured.mockResolvedValue(false);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.test({ organizationId: orgId })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.test({ organizationId: orgId })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'TTN not configured for this organization',
      });
    });

    it('should return test result when TTN is configured', async () => {
      mockIsTTNConfigured.mockResolvedValue(true);
      mockGetTTNSettings.mockResolvedValue(mockSettings);
      mockUpdateTestResult.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.test({ organizationId: orgId });

      expect(result.success).toBe(true);
      expect(result.clusterTested).toBe('nam1');
      expect(result.effectiveApplicationId).toBe('freshtrack-app');
      expect(result.apiKeyLast4).toBe('abcd');
      expect(result.request_id).toBeDefined();
      expect(result.testedAt).toBeDefined();
    });

    it('should update test result in database', async () => {
      mockIsTTNConfigured.mockResolvedValue(true);
      mockGetTTNSettings.mockResolvedValue(mockSettings);
      mockUpdateTestResult.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.test({ organizationId: orgId });

      expect(mockUpdateTestResult).toHaveBeenCalled();
      const updateCall = mockUpdateTestResult.mock.calls[0];
      expect(updateCall[0]).toBe(orgId);
      expect(updateCall[1]).toMatchObject({
        success: true,
        clusterTested: 'nam1',
      });
    });

    it('should default to nam1 cluster when region is null', async () => {
      mockIsTTNConfigured.mockResolvedValue(true);
      mockGetTTNSettings.mockResolvedValue({
        ...mockSettings,
        ttn_region: null,
      });
      mockUpdateTestResult.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.test({ organizationId: orgId });

      expect(result.clusterTested).toBe('nam1');
    });

    it('should work for staff role (read access allowed)', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');
      mockIsTTNConfigured.mockResolvedValue(true);
      mockGetTTNSettings.mockResolvedValue(mockSettings);
      mockUpdateTestResult.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.test({ organizationId: orgId });

      expect(result.success).toBe(true);
    });

    it('should work for manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockIsTTNConfigured.mockResolvedValue(true);
      mockGetTTNSettings.mockResolvedValue(mockSettings);
      mockUpdateTestResult.mockResolvedValue(true);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.test({ organizationId: orgId });

      expect(result.success).toBe(true);
    });
  });
});
