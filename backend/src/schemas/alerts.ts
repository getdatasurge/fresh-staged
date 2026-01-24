import { z } from 'zod';
import { UuidSchema, TimestampSchema, OrgParamsSchema } from './common.js';

// --- Enum Schemas (match database enums) ---

export const AlertTypeSchema = z.enum([
  'alarm_active',
  'monitoring_interrupted',
  'missed_manual_entry',
  'low_battery',
  'sensor_fault',
  'door_open',
  'calibration_due',
]);

export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const AlertStatusSchema = z.enum([
  'active',
  'acknowledged',
  'resolved',
  'escalated',
]);

// --- Alert Response Schema ---

export const AlertSchema = z.object({
  id: UuidSchema,
  unitId: UuidSchema,
  alertRuleId: UuidSchema.nullable(),
  alertType: AlertTypeSchema,
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  message: z.string().nullable(),
  triggerTemperature: z.number().int().nullable(),
  thresholdViolated: z.string().max(16).nullable(),
  triggeredAt: TimestampSchema,
  acknowledgedAt: TimestampSchema.nullable(),
  acknowledgedBy: UuidSchema.nullable(),
  resolvedAt: TimestampSchema.nullable(),
  resolvedBy: UuidSchema.nullable(),
  escalatedAt: TimestampSchema.nullable(),
  escalationLevel: z.number().int(),
  metadata: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const AlertsListSchema = z.array(AlertSchema);

// --- Request Body Schemas ---

export const AlertAcknowledgeSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export const AlertResolveSchema = z.object({
  resolution: z.string().min(1).max(2000),
  correctiveAction: z.string().max(2000).optional(),
});

// --- Query Params Schema ---

export const AlertQuerySchema = z.object({
  unitId: UuidSchema.optional(),
  status: AlertStatusSchema.optional(),
  severity: AlertSeveritySchema.optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// --- Route Params Schemas ---

export const AlertParamsSchema = OrgParamsSchema.extend({
  alertId: UuidSchema,
});

// --- Type Exports ---

export type Alert = z.infer<typeof AlertSchema>;
export type AlertsList = z.infer<typeof AlertsListSchema>;
export type AlertAcknowledge = z.infer<typeof AlertAcknowledgeSchema>;
export type AlertResolve = z.infer<typeof AlertResolveSchema>;
export type AlertQuery = z.infer<typeof AlertQuerySchema>;
export type AlertParams = z.infer<typeof AlertParamsSchema>;
