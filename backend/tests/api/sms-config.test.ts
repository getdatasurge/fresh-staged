import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock user service for org context
vi.mock('../../src/services/user.service.js', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock SMS config service
vi.mock('../../src/services/sms-config.service.js', () => ({
  getSmsConfig: vi.fn(),
  upsertSmsConfig: vi.fn(),
  updateSmsConfig: vi.fn(),
  deleteSmsConfig: vi.fn(),
  SmsConfigError: class SmsConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SmsConfigError';
    }
  },
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { getUserRoleInOrg, getOrCreateProfile } from '../../src/services/user.service.js';
import * as smsConfigService from '../../src/services/sms-config.service.js';

const mockVerify = vi.mocked(verifyAccessToken);
const mockGetRole = vi.mocked(getUserRoleInOrg);
const mockGetOrCreateProfile = vi.mocked(getOrCreateProfile);
const mockGetSmsConfig = vi.mocked(smsConfigService.getSmsConfig);
const mockUpsertSmsConfig = vi.mocked(smsConfigService.upsertSmsConfig);

// Valid UUIDs (RFC 4122 v4 compliant)
const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
const TEST_USER_ID = 'user_test123';
const TEST_CONFIG_ID = 'd47c6e9a-1234-5678-9abc-def012345678';

describe('SMS Config API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // Helper to mock a valid authenticated user
  function mockValidAuth(userId: string = TEST_USER_ID) {
    mockVerify.mockResolvedValue({
      payload: {
        sub: userId,
        email: 'test@example.com',
        iss: 'stack-auth',
        aud: 'project_id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      userId,
    });
    mockGetOrCreateProfile.mockResolvedValue({
      id: 'profile_test123',
      isNew: false,
    });
  }

  // Mock SMS config response
  const mockSmsConfigResponse = {
    id: TEST_CONFIG_ID,
    organizationId: TEST_ORG_ID,
    telnyxApiKeyConfigured: true,
    telnyxPhoneNumber: '+15551234567',
    telnyxMessagingProfileId: 'msg_profile_123',
    isEnabled: true,
    lastTestAt: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  describe('GET /api/orgs/:organizationId/alerts/sms/config', () => {
    it('should return SMS config for authenticated user', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetSmsConfig.mockResolvedValue(mockSmsConfigResponse);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_CONFIG_ID,
        organizationId: TEST_ORG_ID,
        telnyxApiKeyConfigured: true,
        telnyxPhoneNumber: '+15551234567',
        isEnabled: true,
      });
    });

    it('should return not configured message when no config exists', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');
      mockGetSmsConfig.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        configured: false,
        message: expect.stringContaining('not set up'),
      });
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should allow any org member to view config', async () => {
      mockValidAuth();
      mockGetSmsConfig.mockResolvedValue(mockSmsConfigResponse);

      // Viewer can view config
      mockGetRole.mockResolvedValue('viewer');
      let response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(response.statusCode).toBe(200);

      // Staff can view config
      mockGetRole.mockResolvedValue('staff');
      response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(response.statusCode).toBe(200);

      // Admin can view config
      mockGetRole.mockResolvedValue('admin');
      response = await app.inject({
        method: 'GET',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should reject invalid organizationId format', async () => {
      mockValidAuth();

      const response = await app.inject({
        method: 'GET',
        url: `/api/orgs/not-a-uuid/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/orgs/:organizationId/alerts/sms/config', () => {
    const validSmsConfigRequest = {
      telnyxApiKey: 'KEY_ABC123DEF456',
      telnyxPhoneNumber: '+15551234567',
      telnyxMessagingProfileId: 'msg_profile_123',
      isEnabled: true,
    };

    it('should create SMS config for admin user', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockResolvedValue(mockSmsConfigResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: TEST_CONFIG_ID,
        organizationId: TEST_ORG_ID,
        telnyxApiKeyConfigured: true,
        telnyxPhoneNumber: '+15551234567',
        isEnabled: true,
      });
    });

    it('should allow owner to create config', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('owner');
      mockUpsertSmsConfig.mockResolvedValue(mockSmsConfigResponse);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject viewer from creating config', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('viewer');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject staff from creating config', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('staff');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject manager from creating config', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('manager');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate E.164 phone number format', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      // Missing + prefix
      let response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxPhoneNumber: '15551234567',
        },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      // Invalid starting digit
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxPhoneNumber: '+05551234567',
        },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      // Too short
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxPhoneNumber: '+1',
        },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should accept valid E.164 phone numbers', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockResolvedValue(mockSmsConfigResponse);

      // US number
      let response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxPhoneNumber: '+15551234567',
        },
      });
      expect(response.statusCode).toBe(200);

      // UK number
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxPhoneNumber: '+442071234567',
        },
      });
      expect(response.statusCode).toBe(200);

      // Japan number
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxPhoneNumber: '+819012345678',
        },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should reject missing required fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      // Missing telnyxApiKey
      let response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          telnyxPhoneNumber: '+15551234567',
        },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      // Missing telnyxPhoneNumber
      response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          telnyxApiKey: 'KEY_ABC123DEF456',
        },
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject API key that is too short', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          ...validSmsConfigRequest,
          telnyxApiKey: 'short',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should accept optional fields', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockResolvedValue({
        ...mockSmsConfigResponse,
        telnyxMessagingProfileId: null,
      });

      // Without optional messagingProfileId
      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: {
          telnyxApiKey: 'KEY_ABC123DEF456',
          telnyxPhoneNumber: '+15551234567',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-member', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject invalid organizationId format', async () => {
      mockValidAuth();

      const response = await app.inject({
        method: 'POST',
        url: `/api/orgs/not-a-uuid/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should pass correct data to service', async () => {
      mockValidAuth();
      mockGetRole.mockResolvedValue('admin');
      mockUpsertSmsConfig.mockResolvedValue(mockSmsConfigResponse);

      await app.inject({
        method: 'POST',
        url: `/api/orgs/${TEST_ORG_ID}/alerts/sms/config`,
        headers: { authorization: 'Bearer test-token' },
        payload: validSmsConfigRequest,
      });

      expect(mockUpsertSmsConfig).toHaveBeenCalledWith(
        TEST_ORG_ID,
        expect.objectContaining({
          telnyxApiKey: 'KEY_ABC123DEF456',
          telnyxPhoneNumber: '+15551234567',
          telnyxMessagingProfileId: 'msg_profile_123',
          isEnabled: true,
        }),
      );
    });
  });
});
