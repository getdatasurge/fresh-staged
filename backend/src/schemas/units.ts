import { z } from 'zod';
import { AreaParamsSchema, TimestampSchema, UuidSchema } from './common.js';

// Unit type enum (matches database enum)
export const UnitTypeSchema = z.enum([
  'fridge',
  'freezer',
  'display_case',
  'walk_in_cooler',
  'walk_in_freezer',
  'blast_chiller',
]);

// Unit status enum (matches database enum)
export const UnitStatusSchema = z.enum([
  'ok',
  'excursion',
  'alarm_active',
  'monitoring_interrupted',
  'manual_required',
  'restoring',
  'offline',
]);

// Temperature unit (F or C)
export const TempUnitSchema = z.enum(['F', 'C']);

// Unit params with required unitId
export const UnitRequiredParamsSchema = AreaParamsSchema.extend({
  unitId: UuidSchema,
});

// Full unit response schema
export const UnitSchema = z.object({
  id: UuidSchema,
  areaId: UuidSchema,
  name: z.string(),
  unitType: UnitTypeSchema,
  status: UnitStatusSchema,
  tempMin: z.number().int(),
  tempMax: z.number().int(),
  tempUnit: TempUnitSchema,
  manualMonitoringRequired: z.boolean(),
  manualMonitoringInterval: z.number().int().nullable(),
  lastReadingAt: TimestampSchema.nullable(),
  lastTemperature: z.number().int().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// Create unit request body with temperature validation
export const CreateUnitSchema = z
  .object({
    name: z.string().min(1).max(256),
    unitType: UnitTypeSchema,
    status: UnitStatusSchema.optional().default('ok'),
    tempMin: z.number().int(),
    tempMax: z.number().int(),
    tempUnit: TempUnitSchema.default('F'),
    manualMonitoringRequired: z.boolean().default(false),
    manualMonitoringInterval: z.number().int().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((data) => data.tempMin < data.tempMax, {
    message: 'tempMin must be less than tempMax',
    path: ['tempMax'],
  });

// Update unit request body (all fields optional, with same refinement)
export const UpdateUnitSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    unitType: UnitTypeSchema.optional(),
    status: UnitStatusSchema.optional(),
    tempMin: z.number().int().optional(),
    tempMax: z.number().int().optional(),
    tempUnit: TempUnitSchema.optional(),
    manualMonitoringRequired: z.boolean().optional(),
    manualMonitoringInterval: z.number().int().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      // Only validate if both tempMin and tempMax are provided
      if (data.tempMin !== undefined && data.tempMax !== undefined) {
        return data.tempMin < data.tempMax;
      }
      return true;
    },
    {
      message: 'tempMin must be less than tempMax',
      path: ['tempMax'],
    },
  );

// Units list response
export const UnitsListSchema = z.array(UnitSchema);

// Unit with hierarchy info (for dashboards)
export const UnitWithHierarchySchema = UnitSchema.extend({
  areaName: z.string(),
  siteName: z.string(),
  siteId: z.string().uuid(),
  lastManualLogAt: TimestampSchema.nullable().optional(),
});

export const UnitsWithHierarchyListSchema = z.array(UnitWithHierarchySchema);

// Type exports
export type UnitResponse = z.infer<typeof UnitSchema>;
export type UnitWithHierarchyResponse = z.infer<typeof UnitWithHierarchySchema>;
export type CreateUnitRequest = z.infer<typeof CreateUnitSchema>;
export type UpdateUnitRequest = z.infer<typeof UpdateUnitSchema>;
export type UnitType = z.infer<typeof UnitTypeSchema>;
export type UnitStatus = z.infer<typeof UnitStatusSchema>;
export type TempUnit = z.infer<typeof TempUnitSchema>;
