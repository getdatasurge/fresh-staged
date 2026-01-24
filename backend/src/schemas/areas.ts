import { z } from 'zod';
import { UuidSchema, TimestampSchema, SiteParamsSchema, AreaParamsSchema } from './common.js';

// Re-export AreaParamsSchema from common for convenience
export { AreaParamsSchema };

// Schema for route params that require areaId
export const AreaRequiredParamsSchema = z.object({
  organizationId: UuidSchema,
  siteId: UuidSchema,
  areaId: UuidSchema,
});

// Full area response schema
export const AreaSchema = z.object({
  id: UuidSchema,
  siteId: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// Create area request body
export const CreateAreaSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

// Update area request body (all fields optional)
export const UpdateAreaSchema = CreateAreaSchema.partial();

// Areas list response
export const AreasListSchema = z.array(AreaSchema);

// Type exports
export type AreaResponse = z.infer<typeof AreaSchema>;
export type CreateAreaRequest = z.infer<typeof CreateAreaSchema>;
export type UpdateAreaRequest = z.infer<typeof UpdateAreaSchema>;
