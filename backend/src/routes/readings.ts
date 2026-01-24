import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireApiKey, requireAuth, requireOrgContext } from '../middleware/index.js';
import {
  BulkReadingsSchema,
  ReadingQuerySchema,
  BulkIngestResponseSchema,
  ReadingResponseSchema,
  type BulkReadings,
  type ReadingQuery,
} from '../schemas/readings.js';
import { UnitRequiredParamsSchema } from '../schemas/units.js';
import { ErrorResponseSchema } from '../schemas/common.js';
import * as readingsService from '../services/readings.service.js';
import * as alertEvaluator from '../services/alert-evaluator.service.js';
import { notFound, forbidden } from '../utils/errors.js';

/**
 * Readings Routes
 *
 * POST /api/ingest/readings - Bulk sensor data ingestion (API key auth)
 * GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings - Query readings (JWT auth)
 */

/**
 * Register bulk ingestion route
 */
async function registerIngestRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/ingest/readings',
    preHandler: [requireApiKey],
    schema: {
      body: BulkReadingsSchema,
      response: {
        200: BulkIngestResponseSchema,
        403: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const { readings } = request.body as BulkReadings;
      const organizationId = request.orgContext!.organizationId;

      try {
        // Insert bulk readings
        const result = await readingsService.ingestBulkReadings(
          readings,
          organizationId
        );

        // Evaluate alerts for each unique unit
        const uniqueUnitIds = [...new Set(readings.map((r) => r.unitId))];
        let alertsTriggered = 0;

        for (const unitId of uniqueUnitIds) {
          // Find latest reading for this unit
          const unitReadings = readings.filter((r) => r.unitId === unitId);
          const latestReading = unitReadings.reduce((latest, current) => {
            return new Date(current.recordedAt) > new Date(latest.recordedAt)
              ? current
              : latest;
          });

          // Convert temperature to integer (multiply by 10 for precision)
          // e.g., 35.5°C -> 355
          const tempInt = Math.round(latestReading.temperature * 10);

          try {
            // Evaluate alert state machine
            const evaluation = await alertEvaluator.evaluateUnitAfterReading(
              unitId,
              tempInt,
              new Date(latestReading.recordedAt)
            );

            if (evaluation.alertCreated || evaluation.alertResolved) {
              alertsTriggered++;
            }
          } catch (error) {
            // Log error but don't fail entire ingestion
            request.log.error(
              { error, unitId },
              'Failed to evaluate alerts for unit'
            );
          }
        }

        return reply.code(200).send({
          success: true,
          insertedCount: result.insertedCount,
          readingIds: result.readingIds,
          alertsTriggered,
        });
      } catch (error: any) {
        if (error.message?.includes('No valid units found')) {
          return forbidden(reply, 'Units do not belong to organization');
        }

        throw error;
      }
    },
  });
}

/**
 * Register query routes
 */
async function registerQueryRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId/readings',
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: UnitRequiredParamsSchema,
      querystring: ReadingQuerySchema,
      response: {
        200: z.array(ReadingResponseSchema),
      },
    },
    handler: async (request, reply) => {
      const { organizationId, unitId } = request.params as z.infer<typeof UnitRequiredParamsSchema>;
      const queryParams = request.query as ReadingQuery;

      try {
        const readings = await readingsService.queryReadings({
          ...queryParams,
          unitId,
          organizationId,
        });

        return reply.code(200).send(readings);
      } catch (error: any) {
        if (error.message?.includes('Unit not found or access denied')) {
          return notFound(reply, 'Unit');
        }

        throw error;
      }
    },
  });
}

/**
 * Register all readings routes
 */
export default async function readingsRoutes(app: FastifyInstance) {
  // Register both route groups
  await registerIngestRoutes(app);
  await registerQueryRoutes(app);
}
