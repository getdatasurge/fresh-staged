import { z } from 'zod';
import { UuidSchema } from './common.js';

// --- Input Schemas ---

/**
 * Schema for simulation request body
 *
 * Configures how simulated sensor readings are generated:
 * - unitId: Target unit to generate readings for
 * - durationMinutes: How far back to generate readings (1-1440 minutes, default 60)
 * - intervalSeconds: Time between readings (10-3600 seconds, default 60)
 * - baseTemperature: Center temperature in Celsius (-50 to 50, default 4)
 * - variance: Maximum deviation from base (0.1 to 20, default 2)
 * - includeHumidity: Whether to generate humidity values
 * - includeBattery: Whether to generate battery/signal values
 */
export const SimulationRequestSchema = z.object({
  unitId: UuidSchema,
  durationMinutes: z.number().int().min(1).max(1440).default(60),
  intervalSeconds: z.number().int().min(10).max(3600).default(60),
  baseTemperature: z.number().min(-50).max(50).default(4),
  variance: z.number().min(0.1).max(20).default(2),
  includeHumidity: z.boolean().default(false),
  includeBattery: z.boolean().default(false),
});

// --- Response Schemas ---

/**
 * Schema for simulation response
 */
export const SimulationResponseSchema = z.object({
  success: z.boolean(),
  generatedCount: z.number().int(),
  readingIds: z.array(UuidSchema),
  startTime: z.date(),
  endTime: z.date(),
});

// --- Type Exports ---

export type SimulationRequest = z.infer<typeof SimulationRequestSchema>;
export type SimulationResponse = z.infer<typeof SimulationResponseSchema>;
