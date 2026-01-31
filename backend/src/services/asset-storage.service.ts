import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';

// --- Configuration ---

interface StorageConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
}

const getStorageConfig = (): StorageConfig => {
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
    region: 'us-east-1', // MinIO uses this as default
  };
};

// Lazy-initialized S3 client
let s3Client: S3Client | null = null;

const getS3Client = (): S3Client => {
  if (!s3Client) {
    const config = getStorageConfig();
    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
};

// --- Custom Errors ---

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

// --- Validation ---

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// File extension mapping for MIME types
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate file type (images only)
 */
export function validateFileType(mimeType: string): FileValidationResult {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `Invalid file type: ${mimeType}. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
    };
  }
  return { valid: true };
}

/**
 * Validate file size (max 5MB)
 */
export function validateFileSize(sizeBytes: number): FileValidationResult {
  if (sizeBytes > MAX_FILE_SIZE) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size ${sizeMB}MB exceeds maximum allowed size of 5MB`,
    };
  }
  if (sizeBytes <= 0) {
    return {
      valid: false,
      error: 'File is empty',
    };
  }
  return { valid: true };
}

/**
 * Validate file for upload
 */
export function validateFile(mimeType: string, sizeBytes: number): FileValidationResult {
  const typeResult = validateFileType(mimeType);
  if (!typeResult.valid) {
    return typeResult;
  }

  const sizeResult = validateFileSize(sizeBytes);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  return { valid: true };
}

// --- Upload Types ---

export type AssetType = 'site' | 'unit' | 'avatar' | 'corrective-action';

export interface UploadParams {
  organizationId: string;
  assetType: AssetType;
  entityId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
}

// --- Storage Operations ---

/**
 * Generate a unique key for the asset
 */
function generateAssetKey(
  organizationId: string,
  assetType: AssetType,
  entityId: string,
  mimeType: string,
): string {
  const extension = MIME_TO_EXTENSION[mimeType] || '';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  // Structure: org_id/asset_type/entity_id/timestamp_random.ext
  return `${organizationId}/${assetType}/${entityId}/${timestamp}_${random}${extension}`;
}

/**
 * Upload an asset to S3-compatible storage
 */
export async function uploadAsset(params: UploadParams): Promise<UploadResult> {
  const { organizationId, assetType, entityId, mimeType, data } = params;

  // Validate the file
  const validation = validateFile(mimeType, data.length);
  if (!validation.valid) {
    throw new FileValidationError(validation.error!);
  }

  const config = getStorageConfig();
  const client = getS3Client();
  const key = generateAssetKey(organizationId, assetType, entityId, mimeType);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
        ContentLength: data.length,
      }),
    );

    // Construct public URL
    const url = `${config.endpoint}/${config.bucket}/${key}`;

    return {
      url,
      key,
      bucket: config.bucket,
      size: data.length,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new StorageError(`Failed to upload asset: ${error.message}`);
    }
    throw new StorageError('Failed to upload asset: Unknown error');
  }
}

/**
 * Delete an asset from storage
 */
export async function deleteAsset(key: string): Promise<void> {
  const config = getStorageConfig();
  const client = getS3Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new StorageError(`Failed to delete asset: ${error.message}`);
    }
    throw new StorageError('Failed to delete asset: Unknown error');
  }
}

/**
 * Check if the storage bucket exists and is accessible
 */
export async function checkStorageHealth(): Promise<boolean> {
  const config = getStorageConfig();
  const client = getS3Client();

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: config.bucket,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

// --- Test Helpers ---

/**
 * Reset the S3 client (for testing)
 */
export function resetS3Client(): void {
  s3Client = null;
}

// Export constants for testing
export const VALIDATION_CONSTANTS = {
  ALLOWED_MIME_TYPES: Array.from(ALLOWED_MIME_TYPES),
  MAX_FILE_SIZE,
} as const;
