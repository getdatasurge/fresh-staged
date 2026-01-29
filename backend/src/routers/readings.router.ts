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

import { TRPCError } from '@trpc/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { alerts, correctiveActions } from '../db/schema/alerts.js'
import { eventLogs } from '../db/schema/audit.js'
import { manualTemperatureLogs } from '../db/schema/telemetry.js'
import { profiles } from '../db/schema/users.js'
import { ReadingResponseSchema } from '../schemas/readings.js'
import * as readingsService from '../services/readings.service.js'
import { router } from '../trpc/index.js'
import { orgProcedure } from '../trpc/procedures.js'

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

  /**
   * List manual temperature logs
   */
  listManual: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid().optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const limit = input.limit ?? 50;
      const offset = input.page ? (input.page - 1) * limit : 0;

      try {
        return readingsService.queryManualLogs({
          organizationId: ctx.user.organizationId,
          unitId: input.unitId,
          start: input.start,
          end: input.end,
          limit,
          offset,
        });
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
   * List door events for a unit
   */
  listDoorEvents: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      return readingsService.queryDoorEvents({
        organizationId: ctx.user.organizationId,
        unitId: input.unitId,
        limit: input.limit || 10,
      });
    }),

  /**
   * List event logs (annotations) for a unit
   * Returns event logs with author profile info joined
   */
  listEventLogs: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid(),
      eventTypes: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;
      const eventTypes = input.eventTypes ?? ['note_added', 'comment', 'shift_handoff', 'annotation'];

      const logs = await db
        .select({
          id: eventLogs.id,
          title: eventLogs.title,
          eventData: eventLogs.eventData,
          recordedAt: eventLogs.recordedAt,
          actorId: eventLogs.actorId,
          authorName: profiles.fullName,
          authorEmail: profiles.email,
        })
        .from(eventLogs)
        .leftJoin(profiles, eq(eventLogs.actorId, profiles.id))
        .where(
          and(
            eq(eventLogs.unitId, input.unitId),
            eq(eventLogs.organizationId, ctx.user.organizationId),
            inArray(eventLogs.eventType, eventTypes)
          )
        )
        .orderBy(desc(eventLogs.recordedAt))
        .limit(limit);

      return logs;
    }),

  /**
   * Create an event log (annotation)
   */
  createEventLog: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid(),
      eventType: z.string(),
      eventData: z.record(z.string(), z.unknown()),
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [log] = await db
        .insert(eventLogs)
        .values({
          organizationId: ctx.user.organizationId,
          unitId: input.unitId,
          eventType: input.eventType,
          eventData: input.eventData,
          title: input.title,
          actorId: ctx.user.profileId,
          actorType: 'user',
          recordedAt: new Date(),
        })
        .returning();

      return log;
    }),

  /**
   * Delete an event log (annotation)
   * Only managers, admins, and owners can delete
   */
  deleteEventLog: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      eventLogId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers and above can delete
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can delete annotations',
        });
      }

      await db
        .delete(eventLogs)
        .where(
          and(
            eq(eventLogs.id, input.eventLogId),
            eq(eventLogs.organizationId, ctx.user.organizationId)
          )
        );

      return { success: true };
    }),

  /**
   * Log manual temperature with corrective action and alert resolution
   * Used by LogTempModal for full temperature logging workflow
   */
  logManualTemperature: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      unitId: z.string().uuid(),
      temperature: z.number(),
      notes: z.string().nullable().optional(),
      correctiveAction: z.string().nullable().optional(),
      isInRange: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate unit belongs to org
      const validUnits = await readingsService.validateUnitsInOrg([input.unitId], ctx.user.organizationId);

      if (validUnits.length === 0) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Unit not found or access denied',
        });
      }

      const now = new Date();

      // Insert manual temperature log
      const [log] = await db
        .insert(manualTemperatureLogs)
        .values({
          unitId: input.unitId,
          temperature: String(input.temperature),
          notes: input.notes || null,
          recordedAt: now,
          profileId: ctx.user.profileId,
        })
        .returning();

      // If out of range and corrective action provided, create corrective action record
      if (!input.isInRange && input.correctiveAction?.trim()) {
        await db
          .insert(correctiveActions)
          .values({
            alertId: log.id, // Reference the log as context
            unitId: input.unitId,
            profileId: ctx.user.profileId,
            actionTaken: 'manual_temp_log',
            description: input.correctiveAction.trim(),
            actionAt: now,
          });
      }

      // If in range, resolve any existing missed_manual_entry alerts for this unit
      if (input.isInRange) {
        await db
          .update(alerts)
          .set({
            status: 'resolved',
            resolvedAt: now,
            resolvedBy: ctx.user.profileId,
          })
          .where(
            and(
              eq(alerts.unitId, input.unitId),
              eq(alerts.alertType, 'missed_manual_entry'),
              inArray(alerts.status, ['active', 'acknowledged'])
            )
          );
      }

      return { success: true, logId: log.id };
    }),
});
