/**
 * Tests for Assets tRPC Router
 *
 * Tests all procedures with mocked dependencies:
 * - getUploadUrl: Pre-signed URL generation for direct uploads
 *
 * Uses orgProcedure (requires organization context).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { assetsRouter } from '../../src/routers/assets.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock the user service (used by orgProcedure middleware)
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

// Mock the asset storage service
vi.mock('../../src/services/asset-storage.service.js', () => ({
  validateFile: vi.fn(),
  StorageConfigError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StorageConfigError';
    }
  },
}));

// Mock S3 client and presigner
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      constructor() {}
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public params: any) {}
    },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('Assets tRPC Router', () => {
  const createCaller = createCallerFactory(assetsRouter);

  // Get the mocked functions
  let mockGetUserRoleInOrg: ReturnType<typeof vi.fn>;
  let mockGetOrCreateProfile: ReturnType<typeof vi.fn>;
  let mockValidateFile: ReturnType<typeof vi.fn>;
  let mockGetSignedUrl: ReturnType<typeof vi.fn>;

  // Valid UUIDs for testing
  const orgId = '123e4567-e89b-12d3-a456-426614174000';
  const entityId = '223e4567-e89b-12d3-a456-426614174001';

  // Create context that simulates authenticated user with org
  const createOrgContext = () => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  // Create context without authentication
  const createNoAuthContext = () => ({
    req: {} as any,
    res: {} as any,
    user: null,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up environment variables
    process.env.MINIO_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_ROOT_USER = 'minioadmin';
    process.env.MINIO_ROOT_PASSWORD = 'minioadmin';
    process.env.MINIO_BUCKET_ASSETS = 'assets';

    // Import the mocked modules to get references to mocked functions
    const userService = await import('../../src/services/user.service.js');
    const assetService = await import('../../src/services/asset-storage.service.js');
    const presigner = await import('@aws-sdk/s3-request-presigner');

    mockGetUserRoleInOrg = userService.getUserRoleInOrg as any;
    mockGetOrCreateProfile = userService.getOrCreateProfile as any;
    mockValidateFile = assetService.validateFile as any;
    mockGetSignedUrl = presigner.getSignedUrl as any;

    // Default to admin role for most tests
    mockGetUserRoleInOrg.mockResolvedValue('admin');
    mockGetOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  describe('getUploadUrl', () => {
    it('should return pre-signed URL for valid input', async () => {
      mockValidateFile.mockReturnValue({ valid: true });
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned-url?token=abc123');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getUploadUrl({
        organizationId: orgId,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        assetType: 'site',
        entityId: entityId,
      });

      expect(result.uploadUrl).toBe('https://s3.example.com/presigned-url?token=abc123');
      expect(result.publicUrl).toContain('http://localhost:9000/assets/');
      expect(result.key).toContain(orgId);
      expect(result.key).toContain('site');
    });

    it('should generate correct key for profile asset type', async () => {
      mockValidateFile.mockReturnValue({ valid: true });
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned-url');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      const result = await caller.getUploadUrl({
        organizationId: orgId,
        filename: 'avatar.png',
        mimeType: 'image/png',
        assetType: 'profile',
      });

      expect(result.key).toContain(orgId);
      expect(result.key).toContain('profile');
      expect(result.key).toContain('.png');
    });

    it('should throw BAD_REQUEST for invalid file type', async () => {
      mockValidateFile.mockReturnValue({
        valid: false,
        error: 'Invalid file type: application/pdf',
      });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          assetType: 'site',
          entityId: entityId,
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          assetType: 'site',
          entityId: entityId,
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Invalid file type: application/pdf',
      });
    });

    it('should throw INTERNAL_SERVER_ERROR when storage not configured', async () => {
      // Clear environment variables
      delete process.env.MINIO_ENDPOINT;

      mockValidateFile.mockReturnValue({ valid: true });

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          assetType: 'site',
          entityId: entityId,
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          assetType: 'site',
          entityId: entityId,
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Storage service not configured',
      });
    });

    it('should throw UNAUTHORIZED when user is not authenticated', async () => {
      const ctx = createNoAuthContext();
      const caller = createCaller(ctx);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          assetType: 'site',
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          assetType: 'site',
        }),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should throw FORBIDDEN when user is not member of organization', async () => {
      mockGetUserRoleInOrg.mockResolvedValue(null);

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          assetType: 'site',
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.getUploadUrl({
          organizationId: orgId,
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          assetType: 'site',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should validate file type but accept different mime types', async () => {
      mockValidateFile.mockReturnValue({ valid: true });
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned-url');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      // Test with different valid MIME types
      const mimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

      for (const mimeType of mimeTypes) {
        const result = await caller.getUploadUrl({
          organizationId: orgId,
          filename: `photo.${mimeType.split('/')[1]}`,
          mimeType,
          assetType: 'unit',
        });

        expect(result.uploadUrl).toBeDefined();
        expect(result.publicUrl).toBeDefined();
        expect(result.key).toBeDefined();
      }
    });

    it('should handle optional entityId correctly', async () => {
      mockValidateFile.mockReturnValue({ valid: true });
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned-url');

      const ctx = createOrgContext();
      const caller = createCaller(ctx);

      // Without entityId
      const resultWithoutEntity = await caller.getUploadUrl({
        organizationId: orgId,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        assetType: 'area',
      });

      expect(resultWithoutEntity.key).toContain('general');

      // With entityId
      const resultWithEntity = await caller.getUploadUrl({
        organizationId: orgId,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        assetType: 'area',
        entityId: entityId,
      });

      expect(resultWithEntity.key).toContain(entityId);
    });
  });
});
