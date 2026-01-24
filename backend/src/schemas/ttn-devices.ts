import { z } from 'zod';
import { UuidSchema, TimestampSchema, OrgParamsSchema } from './common.js';

// Device EUI validation (16 hex characters)
export const DevEuiSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{16}$/, 'Device EUI must be 16 hexadecimal characters');

// Join EUI / App EUI validation (16 hex characters)
export const JoinEuiSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{16}$/, 'Join EUI must be 16 hexadecimal characters');

// App Key validation (32 hex characters)
export const AppKeySchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{32}$/, 'App Key must be 32 hexadecimal characters');

// Device ID validation (alphanumeric, lowercase, hyphens, 3-36 chars)
export const TTNDeviceIdSchema = z
  .string()
  .min(3)
  .max(36)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Device ID must be lowercase alphanumeric with optional hyphens, cannot start or end with hyphen'
  );

// Frequency plan IDs supported by TTN
export const FrequencyPlanIdSchema = z.enum([
  'US_902_928_FSB_1',
  'US_902_928_FSB_2',
  'US_902_928_FSB_3',
  'US_902_928_FSB_4',
  'US_902_928_FSB_5',
  'US_902_928_FSB_6',
  'US_902_928_FSB_7',
  'US_902_928_FSB_8',
  'EU_863_870',
  'EU_863_870_TTN',
  'AU_915_928_FSB_1',
  'AU_915_928_FSB_2',
  'AS_923',
  'AS_923_2',
  'KR_920_923',
  'IN_865_867',
]);

// LoRaWAN version enum
export const LoRaWANVersionSchema = z.enum([
  'MAC_V1_0',
  'MAC_V1_0_1',
  'MAC_V1_0_2',
  'MAC_V1_0_3',
  'MAC_V1_0_4',
  'MAC_V1_1',
]);

// LoRaWAN PHY version enum
export const LoRaWANPhyVersionSchema = z.enum([
  'PHY_V1_0',
  'PHY_V1_0_1',
  'PHY_V1_0_2_REV_A',
  'PHY_V1_0_2_REV_B',
  'PHY_V1_0_3_REV_A',
  'PHY_V1_1_REV_A',
  'PHY_V1_1_REV_B',
]);

// TTN device params (for routes with :deviceId)
export const TTNDeviceParamsSchema = OrgParamsSchema.extend({
  deviceId: z.string().min(1),
});

// Provision (create) device request body
export const ProvisionTTNDeviceSchema = z.object({
  deviceId: TTNDeviceIdSchema,
  devEui: DevEuiSchema,
  joinEui: JoinEuiSchema,
  appKey: AppKeySchema,
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).optional(),
  frequencyPlanId: FrequencyPlanIdSchema.optional().default('US_902_928_FSB_2'),
  lorawanVersion: LoRaWANVersionSchema.optional().default('MAC_V1_0_3'),
  lorawanPhyVersion: LoRaWANPhyVersionSchema.optional().default('PHY_V1_0_3_REV_A'),
  // Local database linking
  unitId: UuidSchema.optional(),
});

// Update device request body
export const UpdateTTNDeviceSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).optional(),
  // Local database updates
  unitId: UuidSchema.nullable().optional(),
  status: z.enum(['active', 'inactive', 'pairing', 'error']).optional(),
});

// TTN device response from our API
export const TTNDeviceResponseSchema = z.object({
  id: UuidSchema,
  deviceId: z.string(),
  devEui: z.string(),
  joinEui: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  unitId: UuidSchema.nullable(),
  status: z.enum(['active', 'inactive', 'pairing', 'error']),
  lastSeenAt: TimestampSchema.nullable(),
  ttnSynced: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// List response
export const TTNDevicesListSchema = z.array(TTNDeviceResponseSchema);

// Type exports
export type ProvisionTTNDeviceRequest = z.infer<typeof ProvisionTTNDeviceSchema>;
export type UpdateTTNDeviceRequest = z.infer<typeof UpdateTTNDeviceSchema>;
export type TTNDeviceResponse = z.infer<typeof TTNDeviceResponseSchema>;
export type FrequencyPlanId = z.infer<typeof FrequencyPlanIdSchema>;
export type LoRaWANVersion = z.infer<typeof LoRaWANVersionSchema>;
export type LoRaWANPhyVersion = z.infer<typeof LoRaWANPhyVersionSchema>;
