import { z } from 'zod';

// --- Asset Type Schema ---

export const AssetTypeSchema = z.enum(['site', 'unit', 'avatar', 'corrective-action']);

export type AssetType = z.infer<typeof AssetTypeSchema>;

// --- Request Schemas ---

// Query params for upload endpoint
export const UploadQuerySchema = z.object({
  assetType: AssetTypeSchema,
  entityId: z.string().uuid(),
});

// --- Response Schemas ---

// Successful upload response
export const UploadResponseSchema = z.object({
  url: z.string().url(),
  key: z.string(),
  size: z.number().int().positive(),
  mimeType: z.string(),
});

// --- Type Exports ---

export type UploadQuery = z.infer<typeof UploadQuerySchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
