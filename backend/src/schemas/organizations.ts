import { z } from 'zod';
import { OrgParamsSchema, TimestampSchema, UuidSchema } from './common.js';

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

// Dashboard state enum matching unit-state.config.ts
const UnitDashboardStateSchema = z.enum(['normal', 'warning', 'critical', 'offline']);

// Unit counts by state
export const UnitStateCountsSchema = z.object({
  total: z.number().int().min(0),
  normal: z.number().int().min(0),
  warning: z.number().int().min(0),
  critical: z.number().int().min(0),
  offline: z.number().int().min(0),
});

// Alert counts by status
export const AlertStatusCountsSchema = z.object({
  pending: z.number().int().min(0),
  acknowledged: z.number().int().min(0),
  resolved: z.number().int().min(0),
  total: z.number().int().min(0),
});

// Organization stats response schema
export const OrganizationStatsSchema = z.object({
  organizationId: UuidSchema,
  unitCounts: UnitStateCountsSchema,
  alertCounts: AlertStatusCountsSchema,
  compliancePercentage: z.number().min(0).max(100),
  memberCount: z.number().int().min(0),
  worstState: UnitDashboardStateSchema,
  lastUpdated: TimestampSchema,
});

// Re-export params for routes
export { OrgParamsSchema };

// Type exports
export type OrganizationResponse = z.infer<typeof OrganizationSchema>;
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationSchema>;
export type MemberResponse = z.infer<typeof MemberSchema>;
export type OrganizationStatsResponse = z.infer<typeof OrganizationStatsSchema>;
