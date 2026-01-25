/**
 * Tests for SMS Config tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - get: Get SMS configuration
 * - upsert: Create or update SMS configuration (admin/owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { smsConfigRouter } from '../../src/routers/sms-config.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the SMS config service
vi.mock('../../src/services/sms-config.service.js', () => ({
  getSmsConfig: vi.fn(),
  upsertSmsConfig: vi.fn(),
  SmsConfigError: class SmsConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SmsConfigError';
    }
  },
}));

describe('SMS Config tRPC Router', () => {
  const createCaller = createCallerFactory(smsConfigRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockGetSmsConfig: ReturnType<typeof vi.fn>;
  let mockUpsertSmsConfig: ReturnType<typeof vi.fn>;
  let SmsConfigError: any;

  const orgId = '123e4567-e89b-12d3-a456-426614174000';

  // Sample SMS config data
  const mockConfig = {
    id: '223e4567-e89b-12d3-a456-426614174001',
    organizationId: orgId,
    telnyxApiKeyConfigured: true,
    telnyxPhoneNumber: '+15551234567',
    telnyxMessagingProfileId: null,
    isEnabled: true,
    lastTestAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
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

    // Import the mocked modules
    const userService = await import('../../src/services/user.service.js');
    const smsConfigService = await import('../../src/services/sms-config.service.js');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockGetSmsConfig = smsConfigService.getSmsConfig as any;
    mockUpsertSmsConfig = smsConfigService.upsertSmsConfig as any;
    SmsConfigError = smsConfigService.SmsConfigError;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('get', () => {
    it('should return SMS config when it exists', async () => {
      mockGetSmsConfig.mockResolvedValue(mockConfig);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockConfig);
      expect(mockGetSmsConfig).toHaveBeenCalledWith(orgId);
    });

    it('should return unconfigured message when no config exists', async () => {
      mockGetSmsConfig.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual({
        configured: false,
        message: 'SMS configuration not set up. Use upsert to configure.',
      });
    });

    it('should work for viewer role (read-only)', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');
      mockGetSmsConfig.mockResolvedValue(mockConfig);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockConfig);
    });

    it('should work for member role', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('member');
      mockGetSmsConfig.mockResolvedValue(mockConfig);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.get({ organizationId: orgId });

      expect(result).toEqual(mockConfig);
    });
  });

  describe('upsert', () => {
    const validInput = {
      organizationId: orgId,
      data: {
        telnyxApiKey: 'test-api-key-12345',
        telnyxPhoneNumber: '+15551234567',
        isEnabled: true,
      },
    };

    it('should create config when user is admin', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockResolvedValue(mockConfig);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.upsert(validInput);

      expect(result).toEqual(mockConfig);
      expect(mockUpsertSmsConfig).toHaveBeenCalledWith(orgId, validInput.data);
    });

    it('should create config when user is owner', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('owner');
      mockUpsertSmsConfig.mockResolvedValue(mockConfig);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.upsert(validInput);

      expect(result).toEqual(mockConfig);
    });

    it('should throw FORBIDDEN when user is viewer', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('viewer');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.upsert(validInput)).rejects.toThrow(TRPCError);

      await expect(caller.upsert(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only organization admins or owners can configure SMS',
      });
    });

    it('should throw FORBIDDEN when user is member', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('member');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.upsert(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw FORBIDDEN when user is staff', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('staff');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.upsert(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should throw BAD_REQUEST when SmsConfigError occurs', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockRejectedValue(new SmsConfigError('Invalid API key'));

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.upsert(validInput)).rejects.toThrow(TRPCError);

      await expect(caller.upsert(validInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid API key',
      });
    });

    it('should rethrow non-SmsConfigError errors', async () => {
      mockGetUserRoleInOrg.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockRejectedValue(new Error('Database connection failed'));

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(caller.upsert(validInput)).rejects.toThrow('Database connection failed');
    });
  });
});
