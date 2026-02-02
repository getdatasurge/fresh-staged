/**
 * Tests for TTN Settings tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - get: Retrieve TTN settings for organization
 * - update: Modify TTN settings (admin/owner only)
 * - test: Test TTN connection
 * - getCredentials: Retrieve decrypted TTN credentials
 * - getStatus: Retrieve provisioning status
 * - provision: Retry failed provisioning
 * - startFresh: Deprovision and re-provision
 * - deepClean: Delete all TTN resources
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// Mock the new TtnSettingsService
vi.mock('../../src/services/ttn/settings.ts', () => ({
  TtnSettingsService: {
    testConnection: vi.fn(),
  },
}));

// Mock TtnProvisioningService
vi.mock('../../src/services/ttn/provisioning.js', () => ({
  TtnProvisioningService: {
    retryProvisioning: vi.fn(),
    startFresh: vi.fn(),
    deepClean: vi.fn(),
    validateConfiguration: vi.fn(),
    provisionOrganization: vi.fn(),
  },
}));

// Mock TtnCrypto
vi.mock('../../src/services/ttn/crypto.js', () => ({
  TtnCrypto: {
    deobfuscateKey: vi.fn((key: string) => (key ? `decrypted-${key}` : '')),
    obfuscateKey: vi.fn((key: string) => `encrypted-${key}`),
  },
}));

// Mock db client
vi.mock('../../src/db/client.js', () => ({
  db: {
    query: {
      organizations: {
        findFirst: vi.fn(),
      },
      ttnConnections: {
        findFirst: vi.fn(),
      },
    },
  },
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
  let mockTtnSettingsService: any;

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
    const ttnSettingsModule = await import('../../src/services/ttn/settings.ts');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockGetTTNSettings = ttnSettingsService.getTTNSettings as any;
    mockUpdateTTNSettings = ttnSettingsService.updateTTNSettings as any;
    mockUpdateTestResult = ttnSettingsService.updateTestResult as any;
    mockIsTTNConfigured = ttnSettingsService.isTTNConfigured as any;
    mockTtnSettingsService = ttnSettingsModule.TtnSettingsService as any;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });

    // Mock the testConnection method
    mockTtnSettingsService.testConnection.mockResolvedValue({
      success: true,
      testedAt: new Date().toISOString(),
      endpointTested: '/api/v3/applications/freshtrack-app',
      effectiveApplicationId: 'freshtrack-app',
      clusterTested: 'nam1',
      apiKeyLast4: 'abcd',
      applicationName: 'FreshTrack App',
      request_id: 'test-request-id',
    });
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

      await expect(caller.test({ organizationId: orgId })).rejects.toThrow(TRPCError);

      await expect(caller.test({ organizationId: orgId })).rejects.toMatchObject({
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

  describe('getCredentials', () => {
    let mockDbQuery: any;

    beforeEach(async () => {
      const dbModule = await import('../../src/db/client.js');
      mockDbQuery = dbModule.db.query;
    });

    it('should return empty credentials when no connection configured', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDbQuery.organizations.findFirst.mockResolvedValue({ name: 'Test Org' });
      mockDbQuery.ttnConnections.findFirst.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getCredentials({ organizationId: orgId });

      expect(result.organization_name).toBe('Test Org');
      expect(result.ttn_application_id).toBeNull();
      expect(result.org_api_secret_status).toBe('empty');
      expect(result.app_api_secret_status).toBe('empty');
      expect(result.webhook_secret_status).toBe('empty');
    });

    it('should return decrypted credentials when connection exists', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDbQuery.organizations.findFirst.mockResolvedValue({ name: 'Test Org' });
      mockDbQuery.ttnConnections.findFirst.mockResolvedValue({
        ttnApplicationId: 'freshtrack-app',
        applicationId: null,
        ttnRegion: 'nam1',
        ttnOrgApiKeyEncrypted: 'org-key-encrypted',
        ttnOrgApiKeyLast4: 'key1',
        ttnApiKeyEncrypted: 'app-key-encrypted',
        ttnApiKeyLast4: 'key2',
        ttnWebhookSecretEncrypted: 'webhook-encrypted',
        ttnWebhookSecretLast4: 'hook',
        ttnWebhookUrl: 'https://example.com/webhook',
        provisioningStatus: 'ready',
        provisioningStep: null,
        provisioningStepDetails: null,
        provisioningError: null,
        provisioningAttemptCount: 0,
        lastHttpStatus: null,
        lastHttpBody: null,
        appRightsCheckStatus: null,
        lastTtnCorrelationId: null,
        lastTtnErrorName: null,
        credentialsLastRotatedAt: null,
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getCredentials({ organizationId: orgId });

      expect(result.organization_name).toBe('Test Org');
      expect(result.ttn_application_id).toBe('freshtrack-app');
      expect(result.org_api_secret_status).toBe('decrypted');
      expect(result.app_api_secret_status).toBe('decrypted');
      expect(result.webhook_secret_status).toBe('decrypted');
      expect(result.provisioning_status).toBe('ready');
    });

    it('should allow manager role access', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');
      mockDbQuery.organizations.findFirst.mockResolvedValue({ name: 'Test Org' });
      mockDbQuery.ttnConnections.findFirst.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getCredentials({ organizationId: orgId });

      expect(result.organization_name).toBe('Test Org');
    });

    it('should reject viewer role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.getCredentials({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should map legacy status values (not_started -> idle)', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDbQuery.organizations.findFirst.mockResolvedValue({ name: 'Test Org' });
      mockDbQuery.ttnConnections.findFirst.mockResolvedValue({
        provisioningStatus: 'not_started',
        ttnApplicationId: null,
        applicationId: null,
        ttnRegion: null,
        ttnOrgApiKeyEncrypted: null,
        ttnOrgApiKeyLast4: null,
        ttnApiKeyEncrypted: null,
        ttnApiKeyLast4: null,
        ttnWebhookSecretEncrypted: null,
        ttnWebhookSecretLast4: null,
        ttnWebhookUrl: null,
        provisioningStep: null,
        provisioningStepDetails: null,
        provisioningError: null,
        provisioningAttemptCount: 0,
        lastHttpStatus: null,
        lastHttpBody: null,
        appRightsCheckStatus: null,
        lastTtnCorrelationId: null,
        lastTtnErrorName: null,
        credentialsLastRotatedAt: null,
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getCredentials({ organizationId: orgId });

      expect(result.provisioning_status).toBe('idle');
    });
  });

  describe('getStatus', () => {
    let mockDbQuery: any;

    beforeEach(async () => {
      const dbModule = await import('../../src/db/client.js');
      mockDbQuery = dbModule.db.query;
    });

    it('should return idle status when no connection configured', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDbQuery.ttnConnections.findFirst.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getStatus({ organizationId: orgId });

      expect(result.provisioning_status).toBe('idle');
      expect(result.provisioning_error).toBeNull();
    });

    it('should return provisioning status from connection', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockDbQuery.ttnConnections.findFirst.mockResolvedValue({
        provisioningStatus: 'failed',
        provisioningStep: 'webhook',
        provisioningStepDetails: '{"webhook_created": false}',
        provisioningError: 'Webhook creation failed',
        provisioningAttemptCount: 3,
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getStatus({ organizationId: orgId });

      expect(result.provisioning_status).toBe('failed');
      expect(result.provisioning_step).toBe('webhook');
      expect(result.provisioning_error).toBe('Webhook creation failed');
      expect(result.provisioning_attempt_count).toBe(3);
      expect(result.provisioning_step_details).toEqual({ webhook_created: false });
    });
  });

  describe('provision (retry)', () => {
    let mockProvisioningService: any;

    beforeEach(async () => {
      const provisioningModule = await import('../../src/services/ttn/provisioning.js');
      mockProvisioningService = provisioningModule.TtnProvisioningService;
    });

    it('should allow admin to retry provisioning', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockProvisioningService.retryProvisioning.mockResolvedValue({
        success: true,
        message: 'Retry successful',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.provision({
        organizationId: orgId,
        action: 'retry',
      });

      expect(result.success).toBe(true);
      expect(mockProvisioningService.retryProvisioning).toHaveBeenCalledWith(orgId);
    });

    it('should allow owner to retry provisioning', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockProvisioningService.retryProvisioning.mockResolvedValue({
        success: true,
        message: 'Retry successful',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.provision({
        organizationId: orgId,
        action: 'retry',
      });

      expect(result.success).toBe(true);
    });

    it('should reject manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.provision({ organizationId: orgId, action: 'retry' }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should return use_start_fresh=true for no_application_rights', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockProvisioningService.retryProvisioning.mockResolvedValue({
        success: false,
        error: 'Application exists but current key has no rights to it',
        use_start_fresh: true,
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.provision({
        organizationId: orgId,
        action: 'retry',
      });

      expect(result.success).toBe(false);
      expect(result.use_start_fresh).toBe(true);
    });
  });

  describe('startFresh', () => {
    let mockProvisioningService: any;

    beforeEach(async () => {
      const provisioningModule = await import('../../src/services/ttn/provisioning.js');
      mockProvisioningService = provisioningModule.TtnProvisioningService;
    });

    it('should allow admin to start fresh', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockProvisioningService.startFresh.mockResolvedValue({
        success: true,
        message: 'Credentials cleared. Ready for fresh provisioning.',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.startFresh({
        organizationId: orgId,
        region: 'nam1',
      });

      expect(result.success).toBe(true);
      expect(mockProvisioningService.startFresh).toHaveBeenCalledWith(orgId, 'nam1');
    });

    it('should reject manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.startFresh({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should use default region if not provided', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockProvisioningService.startFresh.mockResolvedValue({
        success: true,
        message: 'Credentials cleared.',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await caller.startFresh({ organizationId: orgId });

      expect(mockProvisioningService.startFresh).toHaveBeenCalledWith(orgId, 'nam1');
    });
  });

  describe('deepClean', () => {
    let mockProvisioningService: any;

    beforeEach(async () => {
      const provisioningModule = await import('../../src/services/ttn/provisioning.js');
      mockProvisioningService = provisioningModule.TtnProvisioningService;
    });

    it('should allow admin to deep clean', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockProvisioningService.deepClean.mockResolvedValue({
        success: true,
        deleted_devices: 5,
        deleted_app: true,
        deleted_org: false,
        message: 'Deep clean completed.',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.deepClean({ organizationId: orgId });

      expect(result.success).toBe(true);
      expect(result.deleted_devices).toBe(5);
      expect(result.deleted_app).toBe(true);
      expect(mockProvisioningService.deepClean).toHaveBeenCalledWith(orgId);
    });

    it('should allow owner to deep clean', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockProvisioningService.deepClean.mockResolvedValue({
        success: true,
        deleted_devices: 0,
        deleted_app: false,
        deleted_org: false,
        message: 'No resources to delete.',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.deepClean({ organizationId: orgId });

      expect(result.success).toBe(true);
    });

    it('should reject manager role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('manager');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.deepClean({ organizationId: orgId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should return error when TTN_ADMIN_API_KEY not configured', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockProvisioningService.deepClean.mockResolvedValue({
        success: false,
        error: 'TTN_ADMIN_API_KEY not configured',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.deepClean({ organizationId: orgId });

      expect(result.success).toBe(false);
      expect(result.error).toBe('TTN_ADMIN_API_KEY not configured');
    });
  });
});
