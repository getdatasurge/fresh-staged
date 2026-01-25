import { z } from 'zod';
import { SiteParamsSchema, TimestampSchema, UuidSchema } from './common.js';

// Re-export SiteParamsSchema from common for convenience
export { SiteParamsSchema };

// Full site response schema
export const SiteSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  timezone: z.string(),
  complianceMode: z.string().nullable().optional(),
  manualLogCadenceSeconds: z.number().int().nullable().optional(),
  correctiveActionRequired: z.boolean().nullable().optional(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// Create site request body
export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(256),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(128).nullable().optional(),
  state: z.string().max(64).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().max(64).nullable().optional(),
  timezone: z.string().max(100).default('UTC'),
  complianceMode: z.string().optional(),
  manualLogCadenceSeconds: z.number().int().optional(),
  correctiveActionRequired: z.boolean().optional(),
  latitude: z.string().max(32).nullable().optional(),
  longitude: z.string().max(32).nullable().optional(),
});

// Update site request body (all fields optional)
export const UpdateSiteSchema = CreateSiteSchema.partial();

// Sites list response
export const SitesListSchema = z.array(SiteSchema);

// Type exports
export type SiteResponse = z.infer<typeof SiteSchema>;
export type CreateSiteRequest = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteRequest = z.infer<typeof UpdateSiteSchema>;
