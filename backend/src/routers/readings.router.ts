/**
 * Readings tRPC Router
 *
 * Provides type-safe procedures for sensor reading queries:
 * - list: Query readings for a unit with pagination and date filters
 * - latest: Get the most recent reading for a unit
 *
 * NOTE: Bulk ingestion (POST /api/ingest/readings) stays as REST - it uses API key auth.
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ReadingResponseSchema } from '../schemas/readings.js';
import * as readingsService from '../services/readings.service.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

/**
 * Input schema for readings list with optional filters
 */
const ReadingsListInput = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
});

/**
 * Input schema for latest reading query
 */
const ReadingLatestInput = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
});

export const readingsRouter = router({
  /**
   * List readings for unit with pagination and filters
   * Equivalent to: GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId/readings
   *
   * Returns readings matching filters, ordered by recordedAt.
   */
  list: orgProcedure
    .input(ReadingsListInput)
    .output(z.array(ReadingResponseSchema))
    .query(async ({ ctx, input }) => {
      try {
        // Convert page to offset for service call
        const limit = input.limit ?? 100;
        const offset = input.page ? (input.page - 1) * limit : 0;

        const readings = await readingsService.queryReadings({
          unitId: input.unitId,
          organizationId: ctx.user.organizationId,
          limit,
          offset,
          start: input.start,
          end: input.end,
        });

        return readings;
      } catch (error: any) {
        if (error.message?.includes('Unit not found or access denied')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Unit not found or access denied',
          });
        }
        throw error;
      }
    }),

  /**
   * Get latest reading for unit
   * Convenience endpoint for dashboards
   *
   * Returns the most recent reading or null if none exist.
   */
  latest: orgProcedure
    .input(ReadingLatestInput)
    .output(ReadingResponseSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        const readings = await readingsService.queryReadings({
          unitId: input.unitId,
          organizationId: ctx.user.organizationId,
          limit: 1,
          offset: 0,
        });

        return readings[0] ?? null;
      } catch (error: any) {
        if (error.message?.includes('Unit not found or access denied')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Unit not found or access denied',
          });
        }
        throw error;
      }
    }),

  /**
   * Create a manual temperature reading
   */
  createManual: orgProcedure
    .input(z.object({
      unitId: z.string().uuid(),
      temperature: z.number(),
      notes: z.string().optional(),
      recordedAt: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Access check is handled inside service via validateUnitsInOrg usually,
      // but here we just need to ensure the unit belongs to org.
      const validUnits = await readingsService.validateUnitsInOrg([input.unitId], ctx.user.organizationId);
      
      if (validUnits.length === 0) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Unit not found or access denied',
        });
      }

      return readingsService.createManualReading({
        unitId: input.unitId,
        profileId: ctx.user.profileId,
        temperature: input.temperature,
        notes: input.notes,
        recordedAt: new Date(input.recordedAt),
      });
    }),
});
