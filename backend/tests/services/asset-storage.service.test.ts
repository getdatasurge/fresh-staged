import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock AWS SDK before importing the service
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
    },
    PutObjectCommand: class PutObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class DeleteObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
    HeadBucketCommand: class HeadBucketCommand {
      constructor(public params: Record<string, unknown>) {}
    },
  };
});

import {
  validateFileType,
  validateFileSize,
  validateFile,
  uploadAsset,
  deleteAsset,
  checkStorageHealth,
  resetS3Client,
  StorageConfigError,
  StorageError,
  FileValidationError,
  VALIDATION_CONSTANTS,
} from '../../src/services/asset-storage.service.js';

describe('Asset Storage Service', () => {
  const TEST_ORG_ID = 'bfc91766-90f0-4caf-b428-06cdcc49866a';
  const TEST_ENTITY_ID = 'abc12345-90f0-4caf-b428-06cdcc49866a';

  beforeEach(() => {
    vi.clearAllMocks();
    resetS3Client();

    // Set up environment variables
    process.env.MINIO_ENDPOINT = 'http://localhost:9000';
    process.env.MINIO_ROOT_USER = 'minioadmin';
    process.env.MINIO_ROOT_PASSWORD = 'minioadmin123';
    process.env.MINIO_BUCKET_ASSETS = 'assets';
  });

  afterEach(() => {
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_ROOT_USER;
    delete process.env.MINIO_ROOT_PASSWORD;
    delete process.env.MINIO_BUCKET_ASSETS;
  });

  describe('validateFileType', () => {
    it('should accept JPEG images', () => {
      const result = validateFileType('image/jpeg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept PNG images', () => {
      const result = validateFileType('image/png');
      expect(result.valid).toBe(true);
    });

    it('should accept GIF images', () => {
      const result = validateFileType('image/gif');
      expect(result.valid).toBe(true);
    });

    it('should accept WebP images', () => {
      const result = validateFileType('image/webp');
      expect(result.valid).toBe(true);
    });

    it('should accept SVG images', () => {
      const result = validateFileType('image/svg+xml');
      expect(result.valid).toBe(true);
    });

    it('should reject PDF files', () => {
      const result = validateFileType('application/pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
      expect(result.error).toContain('application/pdf');
    });

    it('should reject text files', () => {
      const result = validateFileType('text/plain');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject video files', () => {
      const result = validateFileType('video/mp4');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject application/octet-stream', () => {
      const result = validateFileType('application/octet-stream');
      expect(result.valid).toBe(false);
    });

    it('should include allowed types in error message', () => {
      const result = validateFileType('application/zip');
      expect(result.error).toContain('image/jpeg');
      expect(result.error).toContain('image/png');
    });
  });

  describe('validateFileSize', () => {
    it('should accept files under 5MB', () => {
      const result = validateFileSize(1024 * 1024); // 1MB
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept files exactly 5MB', () => {
      const result = validateFileSize(5 * 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should reject files over 5MB', () => {
      const result = validateFileSize(5 * 1024 * 1024 + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size of 5MB');
    });

    it('should reject files significantly over 5MB', () => {
      const result = validateFileSize(10 * 1024 * 1024); // 10MB
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10.00MB');
    });

    it('should reject empty files', () => {
      const result = validateFileSize(0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should reject negative size', () => {
      const result = validateFileSize(-100);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should accept small files', () => {
      const result = validateFileSize(1); // 1 byte
      expect(result.valid).toBe(true);
    });
  });

  describe('validateFile', () => {
    it('should accept valid image under size limit', () => {
      const result = validateFile('image/png', 1024 * 1024);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid type even with valid size', () => {
      const result = validateFile('application/pdf', 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject valid type with oversized file', () => {
      const result = validateFile('image/jpeg', 10 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject invalid type before checking size', () => {
      // Even with oversized file, type error should come first
      const result = validateFile('text/plain', 100 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject empty images', () => {
      const result = validateFile('image/jpeg', 0);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });
  });

  describe('VALIDATION_CONSTANTS', () => {
    it('should export allowed MIME types', () => {
      expect(VALIDATION_CONSTANTS.ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(VALIDATION_CONSTANTS.ALLOWED_MIME_TYPES).toContain('image/png');
      expect(VALIDATION_CONSTANTS.ALLOWED_MIME_TYPES).toContain('image/gif');
      expect(VALIDATION_CONSTANTS.ALLOWED_MIME_TYPES).toContain('image/webp');
      expect(VALIDATION_CONSTANTS.ALLOWED_MIME_TYPES).toContain('image/svg+xml');
    });

    it('should export max file size as 5MB', () => {
      expect(VALIDATION_CONSTANTS.MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
    });
  });

  describe('uploadAsset', () => {
    it('should upload valid image to S3', async () => {
      mockSend.mockResolvedValue({});

      const imageData = Buffer.from('fake-image-data');
      const result = await uploadAsset({
        organizationId: TEST_ORG_ID,
        assetType: 'site',
        entityId: TEST_ENTITY_ID,
        filename: 'test-image.jpg',
        mimeType: 'image/jpeg',
        data: imageData,
      });

      expect(result.url).toContain('http://localhost:9000/assets/');
      expect(result.url).toContain(TEST_ORG_ID);
      expect(result.url).toContain('site');
      expect(result.url).toContain(TEST_ENTITY_ID);
      expect(result.url).toContain('.jpg');
      expect(result.key).toContain(TEST_ORG_ID);
      expect(result.bucket).toBe('assets');
      expect(result.size).toBe(imageData.length);

      expect(mockSend).toHaveBeenCalledTimes(1);
      // Check that the command was created with correct params
      const commandArg = mockSend.mock.calls[0][0];
      expect(commandArg.params.Bucket).toBe('assets');
      expect(commandArg.params.ContentType).toBe('image/jpeg');
      expect(commandArg.params.ContentLength).toBe(imageData.length);
    });

    it('should generate correct key structure', async () => {
      mockSend.mockResolvedValue({});

      const result = await uploadAsset({
        organizationId: TEST_ORG_ID,
        assetType: 'unit',
        entityId: TEST_ENTITY_ID,
        filename: 'photo.png',
        mimeType: 'image/png',
        data: Buffer.from('data'),
      });

      // Key format: org_id/asset_type/entity_id/timestamp_random.ext
      const keyParts = result.key.split('/');
      expect(keyParts[0]).toBe(TEST_ORG_ID);
      expect(keyParts[1]).toBe('unit');
      expect(keyParts[2]).toBe(TEST_ENTITY_ID);
      expect(keyParts[3]).toMatch(/^\d+_[a-z0-9]+\.png$/);
    });

    it('should throw FileValidationError for invalid type', async () => {
      await expect(
        uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'site',
          entityId: TEST_ENTITY_ID,
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          data: Buffer.from('data'),
        }),
      ).rejects.toThrow(FileValidationError);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should throw FileValidationError for oversized file', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

      await expect(
        uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'site',
          entityId: TEST_ENTITY_ID,
          filename: 'large-image.jpg',
          mimeType: 'image/jpeg',
          data: largeBuffer,
        }),
      ).rejects.toThrow(FileValidationError);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should throw StorageError on S3 failure', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      await expect(
        uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'site',
          entityId: TEST_ENTITY_ID,
          filename: 'image.jpg',
          mimeType: 'image/jpeg',
          data: Buffer.from('data'),
        }),
      ).rejects.toThrow(StorageError);
    });

    it('should throw StorageConfigError when MINIO_ENDPOINT is missing', async () => {
      delete process.env.MINIO_ENDPOINT;
      resetS3Client();

      await expect(
        uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'site',
          entityId: TEST_ENTITY_ID,
          filename: 'image.jpg',
          mimeType: 'image/jpeg',
          data: Buffer.from('data'),
        }),
      ).rejects.toThrow(StorageConfigError);
    });

    it('should throw StorageConfigError when MINIO_ROOT_USER is missing', async () => {
      delete process.env.MINIO_ROOT_USER;
      resetS3Client();

      await expect(
        uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'site',
          entityId: TEST_ENTITY_ID,
          filename: 'image.jpg',
          mimeType: 'image/jpeg',
          data: Buffer.from('data'),
        }),
      ).rejects.toThrow(StorageConfigError);
    });

    it('should throw StorageConfigError when MINIO_ROOT_PASSWORD is missing', async () => {
      delete process.env.MINIO_ROOT_PASSWORD;
      resetS3Client();

      await expect(
        uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'site',
          entityId: TEST_ENTITY_ID,
          filename: 'image.jpg',
          mimeType: 'image/jpeg',
          data: Buffer.from('data'),
        }),
      ).rejects.toThrow(StorageConfigError);
    });

    it('should use correct extension for each MIME type', async () => {
      mockSend.mockResolvedValue({});

      const testCases = [
        { mimeType: 'image/jpeg', ext: '.jpg' },
        { mimeType: 'image/png', ext: '.png' },
        { mimeType: 'image/gif', ext: '.gif' },
        { mimeType: 'image/webp', ext: '.webp' },
        { mimeType: 'image/svg+xml', ext: '.svg' },
      ];

      for (const { mimeType, ext } of testCases) {
        resetS3Client();
        const result = await uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType: 'avatar',
          entityId: TEST_ENTITY_ID,
          filename: 'image.file',
          mimeType,
          data: Buffer.from('data'),
        });

        expect(result.key).toContain(ext);
      }
    });

    it('should support all asset types', async () => {
      mockSend.mockResolvedValue({});

      const assetTypes = ['site', 'unit', 'avatar', 'corrective-action'] as const;

      for (const assetType of assetTypes) {
        resetS3Client();
        const result = await uploadAsset({
          organizationId: TEST_ORG_ID,
          assetType,
          entityId: TEST_ENTITY_ID,
          filename: 'image.jpg',
          mimeType: 'image/jpeg',
          data: Buffer.from('data'),
        });

        expect(result.key).toContain(`/${assetType}/`);
      }
    });
  });

  describe('deleteAsset', () => {
    it('should delete asset from S3', async () => {
      mockSend.mockResolvedValue({});

      const key = `${TEST_ORG_ID}/site/${TEST_ENTITY_ID}/1234567890_abc123.jpg`;
      await deleteAsset(key);

      expect(mockSend).toHaveBeenCalledTimes(1);
      // Check that the command was created with correct params
      const commandArg = mockSend.mock.calls[0][0];
      expect(commandArg.params.Bucket).toBe('assets');
      expect(commandArg.params.Key).toBe(key);
    });

    it('should throw StorageError on S3 failure', async () => {
      mockSend.mockRejectedValue(new Error('Access denied'));

      await expect(deleteAsset('some/key.jpg')).rejects.toThrow(StorageError);
    });
  });

  describe('checkStorageHealth', () => {
    it('should return true when bucket is accessible', async () => {
      mockSend.mockResolvedValue({});

      const result = await checkStorageHealth();
      expect(result).toBe(true);
    });

    it('should return false when bucket is not accessible', async () => {
      mockSend.mockRejectedValue(new Error('Bucket not found'));

      const result = await checkStorageHealth();
      expect(result).toBe(false);
    });
  });

  describe('resetS3Client', () => {
    it('should allow reconfiguration after reset', async () => {
      mockSend.mockResolvedValue({});

      // First upload with original config
      await uploadAsset({
        organizationId: TEST_ORG_ID,
        assetType: 'site',
        entityId: TEST_ENTITY_ID,
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        data: Buffer.from('data'),
      });

      // Reset and change config
      resetS3Client();
      process.env.MINIO_BUCKET_ASSETS = 'new-bucket';

      const result = await uploadAsset({
        organizationId: TEST_ORG_ID,
        assetType: 'site',
        entityId: TEST_ENTITY_ID,
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        data: Buffer.from('data'),
      });

      expect(result.bucket).toBe('new-bucket');
    });
  });
});
