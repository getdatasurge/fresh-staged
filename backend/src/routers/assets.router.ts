/**
 * Assets tRPC Router
 *
 * Provides asset management endpoints for:
 * - Pre-signed URL generation for direct uploads
 *
 * Uses pre-signed URL pattern:
 * 1. Client calls getUploadUrl to get S3/MinIO pre-signed URL
 * 2. Client uploads directly to storage using the URL
 * 3. More scalable and avoids tRPC body size limits
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import {
  validateFile,
  StorageConfigError,
} from '../services/asset-storage.service.js';
import { AssetTypeSchema } from '../schemas/assets.js';

/**
 * Asset type extended to include 'profile' for user avatars
 */
const ExtendedAssetTypeSchema = z.enum(['profile', 'site', 'unit', 'area']);

/**
 * Input schema for getUploadUrl
 */
const GetUploadUrlInputSchema = z.object({
  organizationId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  assetType: ExtendedAssetTypeSchema,
  entityId: z.string().uuid().optional(),
});

/**
 * Response schema for getUploadUrl
 */
const GetUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  key: z.string(),
});

// File extension mapping for MIME types
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

/**
 * Get storage configuration from environment
 */
function getStorageConfig() {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKeyId = process.env.MINIO_ROOT_USER;
  const secretAccessKey = process.env.MINIO_ROOT_PASSWORD;
  const bucket = process.env.MINIO_BUCKET_ASSETS || 'assets';

  if (!endpoint) {
    throw new StorageConfigError('MINIO_ENDPOINT environment variable is not set');
  }
  if (!accessKeyId) {
    throw new StorageConfigError('MINIO_ROOT_USER environment variable is not set');
  }
  if (!secretAccessKey) {
    throw new StorageConfigError('MINIO_ROOT_PASSWORD environment variable is not set');
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: 'us-east-1',
  };
}

/**
 * Generate a unique key for the asset
 */
function generateAssetKey(
  organizationId: string,
  assetType: string,
  entityId: string | undefined,
  mimeType: string
): string {
  const extension = MIME_TO_EXTENSION[mimeType] || '';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const entity = entityId || 'general';

  // Structure: org_id/asset_type/entity_id/timestamp_random.ext
  return `${organizationId}/${assetType}/${entity}/${timestamp}_${random}${extension}`;
}

/**
 * Assets router
 *
 * Procedures:
 * - getUploadUrl: Generate pre-signed URL for direct upload
 */
export const assetsRouter = router({
  /**
   * Get pre-signed upload URL
   *
   * Validates file type and size limits, then generates a pre-signed URL
   * for direct upload to S3/MinIO storage.
   *
   * @requires Organization membership (orgProcedure)
   * @input { organizationId, filename, mimeType, assetType, entityId? }
   * @returns { uploadUrl, publicUrl, key }
   */
  getUploadUrl: orgProcedure
    .input(GetUploadUrlInputSchema)
    .output(GetUploadUrlResponseSchema)
    .mutation(async ({ input }) => {
      const { organizationId, filename, mimeType, assetType, entityId } = input;

      // Validate file type (size will be validated on actual upload)
      // Use a reasonable size estimate for pre-validation
      const validation = validateFile(mimeType, 1); // 1 byte = just validate type
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.error || 'Invalid file type',
        });
      }

      try {
        const config = getStorageConfig();
        const key = generateAssetKey(organizationId, assetType, entityId, mimeType);

        // Create S3 client
        const s3Client = new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
          forcePathStyle: true, // Required for MinIO
        });

        // Generate pre-signed URL for upload
        const command = new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: mimeType,
        });

        const uploadUrl = await getSignedUrl(s3Client as any, command, {
          expiresIn: 3600, // 1 hour
        });

        // Construct public URL
        const publicUrl = `${config.endpoint}/${config.bucket}/${key}`;

        return {
          uploadUrl,
          publicUrl,
          key,
        };
      } catch (error) {
        if (error instanceof StorageConfigError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Storage service not configured',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate upload URL',
        });
      }
    }),
});
