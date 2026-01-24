import { z } from 'zod';

// --- Query Schemas ---

export const EmailAvailabilityQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const PhoneAvailabilityQuerySchema = z.object({
  phone: z
    .string()
    .min(10, 'Phone number too short')
    .max(20, 'Phone number too long')
    .regex(/^[\d+\-()\\s]+$/, 'Invalid phone format'),
});

// --- Response Schemas ---

export const AvailabilityResponseSchema = z.object({
  available: z.boolean(),
});

// --- Type Exports ---

export type EmailAvailabilityQuery = z.infer<typeof EmailAvailabilityQuerySchema>;
export type PhoneAvailabilityQuery = z.infer<typeof PhoneAvailabilityQuerySchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
