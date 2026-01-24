import { z } from 'zod';
import { UuidSchema, TimestampSchema, OrgParamsSchema } from './common.js';

// Compliance mode enum matching database
const ComplianceModeSchema = z.enum(['standard', 'haccp']);

// Full organization response schema
export const OrganizationSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  complianceMode: ComplianceModeSchema,
  sensorLimit: z.number().int(),
  logoUrl: z.string().url().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// Update organization request body
export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  timezone: z.string().max(100).optional(),
  complianceMode: ComplianceModeSchema.optional(),
  logoUrl: z.string().url().nullable().optional(),
});

// Role enum matching database
const AppRoleSchema = z.enum(['owner', 'admin', 'manager', 'staff', 'viewer']);

// Organization member response schema
export const MemberSchema = z.object({
  userId: UuidSchema,
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: AppRoleSchema,
  joinedAt: TimestampSchema,
});

// Members list response
export const MembersListSchema = z.array(MemberSchema);

// Re-export params for routes
export { OrgParamsSchema };

// Type exports
export type OrganizationResponse = z.infer<typeof OrganizationSchema>;
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationSchema>;
export type MemberResponse = z.infer<typeof MemberSchema>;
