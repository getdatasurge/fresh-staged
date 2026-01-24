import { z } from 'zod';

// --- Primitive Types ---

// UUID validation (RFC 4122)
export const UuidSchema = z.string().uuid();

// ISO 8601 timestamp that converts to Date
export const TimestampSchema = z.coerce.date();

// --- Common Params ---

// Organization-scoped route params
export const OrgParamsSchema = z.object({
  organizationId: UuidSchema,
});

// Site-scoped route params (includes org)
export const SiteParamsSchema = z.object({
  organizationId: UuidSchema,
  siteId: UuidSchema,
});

// Area-scoped route params (includes org, site)
export const AreaParamsSchema = z.object({
  organizationId: UuidSchema,
  siteId: UuidSchema,
  areaId: UuidSchema,
});

// Unit-scoped route params (full hierarchy)
export const UnitParamsSchema = z.object({
  organizationId: UuidSchema,
  siteId: UuidSchema,
  areaId: UuidSchema,
  unitId: UuidSchema,
});

// --- Response Types ---

// Structured error response (used across all endpoints)
export const ErrorDetailSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});

// Type exports for TypeScript usage
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
