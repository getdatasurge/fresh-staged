import { z } from 'zod';
import { UuidSchema, TimestampSchema, OrgParamsSchema } from './common.js';

/**
 * E.164 phone number format validation
 * Format: +[country code][subscriber number]
 * - Must start with +
 * - Country code: 1-3 digits (cannot start with 0)
 * - Total length: 2-15 digits after +
 *
 * Examples:
 * - +15551234567 (US)
 * - +442071234567 (UK)
 * - +819012345678 (Japan)
 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const E164PhoneSchema = z
  .string()
  .regex(E164_REGEX, 'Phone number must be in E.164 format (e.g., +15551234567)');

// --- Request Schemas ---

/**
 * POST /api/alerts/sms/config - Create or update SMS configuration
 */
export const SmsConfigCreateSchema = z.object({
  telnyxApiKey: z
    .string()
    .min(10, 'API key must be at least 10 characters')
    .max(512, 'API key must not exceed 512 characters'),
  telnyxPhoneNumber: E164PhoneSchema,
  telnyxMessagingProfileId: z
    .string()
    .max(256, 'Messaging profile ID must not exceed 256 characters')
    .optional(),
  isEnabled: z.boolean().optional().default(true),
});

/**
 * PATCH update - allows partial updates
 */
export const SmsConfigUpdateSchema = z.object({
  telnyxApiKey: z
    .string()
    .min(10, 'API key must be at least 10 characters')
    .max(512, 'API key must not exceed 512 characters')
    .optional(),
  telnyxPhoneNumber: E164PhoneSchema.optional(),
  telnyxMessagingProfileId: z
    .string()
    .max(256, 'Messaging profile ID must not exceed 256 characters')
    .nullable()
    .optional(),
  isEnabled: z.boolean().optional(),
});

// --- Response Schemas ---

/**
 * SMS config response - API key is redacted for security
 */
export const SmsConfigResponseSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  telnyxApiKeyConfigured: z.boolean(),
  telnyxPhoneNumber: z.string(),
  telnyxMessagingProfileId: z.string().nullable(),
  isEnabled: z.boolean(),
  lastTestAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

/**
 * Success response for config creation/update
 */
export const SmsConfigSuccessSchema = z.object({
  success: z.boolean(),
  config: SmsConfigResponseSchema,
});

/**
 * Response when no config exists
 */
export const SmsConfigNotFoundSchema = z.object({
  configured: z.literal(false),
  message: z.string(),
});

/**
 * GET response - either config or not found
 */
export const SmsConfigGetResponseSchema = z.union([
  SmsConfigResponseSchema,
  SmsConfigNotFoundSchema,
]);

// --- Route Params ---

export const SmsConfigParamsSchema = OrgParamsSchema;

// --- Type Exports ---

export type SmsConfigCreate = z.infer<typeof SmsConfigCreateSchema>;
export type SmsConfigUpdate = z.infer<typeof SmsConfigUpdateSchema>;
export type SmsConfigResponse = z.infer<typeof SmsConfigResponseSchema>;
export type SmsConfigParams = z.infer<typeof SmsConfigParamsSchema>;
