import { z } from 'zod';
import { UuidSchema, TimestampSchema, OrgParamsSchema } from './common.js';
import { FrequencyPlanIdSchema } from './ttn-devices.js';

// Gateway EUI validation (16 hex characters)
export const GatewayEuiSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{16}$/, 'Gateway EUI must be 16 hexadecimal characters');

// Gateway ID validation (alphanumeric, lowercase, hyphens, 3-36 chars)
export const TTNGatewayIdSchema = z
  .string()
  .min(3)
  .max(36)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Gateway ID must be lowercase alphanumeric with optional hyphens, cannot start or end with hyphen',
  );

// Gateway status enum
export const GatewayStatusSchema = z.enum(['online', 'offline', 'disconnected', 'unknown']);

// TTN gateway params (for routes with :gatewayId)
export const TTNGatewayParamsSchema = OrgParamsSchema.extend({
  gatewayId: z.string().min(1),
});

// Register (create) gateway request body
export const RegisterTTNGatewaySchema = z.object({
  gatewayId: TTNGatewayIdSchema,
  gatewayEui: GatewayEuiSchema,
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).optional(),
  frequencyPlanId: FrequencyPlanIdSchema.optional().default('US_902_928_FSB_2'),
  // Location data
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  altitude: z.number().optional(),
  // Local database linking
  siteId: UuidSchema.optional(),
});

// Update gateway request body
export const UpdateTTNGatewaySchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).optional(),
  frequencyPlanId: FrequencyPlanIdSchema.optional(),
  // Location updates
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  altitude: z.number().nullable().optional(),
  // Local database updates
  siteId: UuidSchema.nullable().optional(),
});

// TTN gateway response from our API
export const TTNGatewayResponseSchema = z.object({
  id: UuidSchema,
  gatewayId: z.string(),
  gatewayEui: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  frequencyPlanId: z.string().nullable(),
  status: GatewayStatusSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  altitude: z.number().nullable(),
  siteId: UuidSchema.nullable(),
  lastSeenAt: TimestampSchema.nullable(),
  ttnSynced: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// List response
export const TTNGatewaysListSchema = z.array(TTNGatewayResponseSchema);

// Type exports
export type RegisterTTNGatewayRequest = z.infer<typeof RegisterTTNGatewaySchema>;
export type UpdateTTNGatewayRequest = z.infer<typeof UpdateTTNGatewaySchema>;
export type TTNGatewayResponse = z.infer<typeof TTNGatewayResponseSchema>;
export type GatewayStatus = z.infer<typeof GatewayStatusSchema>;
