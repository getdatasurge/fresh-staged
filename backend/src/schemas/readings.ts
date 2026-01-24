import { z } from 'zod';
import { UuidSchema } from './common.js';

// --- Enums ---

// Source of a sensor reading
export const ReadingSourceSchema = z.enum(['ttn', 'manual', 'api', 'import']);

// --- Input Schemas ---

// Single reading in a bulk ingestion payload
export const SingleReadingSchema = z.object({
  unitId: UuidSchema,
  deviceId: UuidSchema.optional(),
  temperature: z.number(), // Stored as numeric(7,2) in DB
  humidity: z.number().optional(),
  battery: z.number().int().min(0).max(100).optional(),
  signalStrength: z.number().int().optional(),
  recordedAt: z.string().datetime(), // ISO 8601 string
  source: ReadingSourceSchema.default('api'),
  rawPayload: z.string().optional(),
});

// Bulk readings ingestion request
export const BulkReadingsSchema = z.object({
  readings: z.array(SingleReadingSchema).min(1).max(1000),
});

// Query parameters for reading retrieval
export const ReadingQuerySchema = z.object({
  unitId: UuidSchema.optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// --- Response Schemas ---

// Full reading response (matches DB schema)
export const ReadingResponseSchema = z.object({
  id: UuidSchema,
  unitId: UuidSchema,
  deviceId: UuidSchema.nullable(),
  temperature: z.number(),
  humidity: z.number().nullable(),
  battery: z.number().int().nullable(),
  signalStrength: z.number().int().nullable(),
  rawPayload: z.string().nullable(),
  recordedAt: z.date(),
  receivedAt: z.date(),
  source: z.string().nullable(),
});

// Bulk ingestion response
export const BulkIngestResponseSchema = z.object({
  success: z.boolean(),
  insertedCount: z.number().int(),
  readingIds: z.array(UuidSchema),
  alertsTriggered: z.number().int(),
});

// --- Type Exports ---

export type ReadingSource = z.infer<typeof ReadingSourceSchema>;
export type SingleReading = z.infer<typeof SingleReadingSchema>;
export type BulkReadings = z.infer<typeof BulkReadingsSchema>;
export type ReadingQuery = z.infer<typeof ReadingQuerySchema>;
export type ReadingResponse = z.infer<typeof ReadingResponseSchema>;
export type BulkIngestResponse = z.infer<typeof BulkIngestResponseSchema>;
