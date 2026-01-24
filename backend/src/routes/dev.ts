import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext } from '../middleware/index.js';
import {
  SimulationRequestSchema,
  SimulationResponseSchema,
  type SimulationRequest,
} from '../schemas/simulation.js';
import { ErrorResponseSchema } from '../schemas/common.js';
import * as simulationService from '../services/simulation.service.js';
import { forbidden, serverError } from '../utils/errors.js';

/**
 * Development Routes
 *
 * These routes are only available in development mode (NODE_ENV !== 'production').
 * They provide testing utilities such as sensor data simulation.
 *
 * POST /api/dev/simulate - Generate simulated sensor readings
 */

/**
 * Middleware that blocks access in production mode
 */
function requireDevelopmentMode(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  if (process.env.NODE_ENV === 'production') {
    forbidden(reply, 'Development endpoints are not available in production');
    return;
  }
  done();
}

/**
 * Register development routes
 */
export default async function devRoutes(app: FastifyInstance) {
  /**
   * POST /api/dev/simulate
   *
   * Generate simulated sensor readings for a unit.
   * Only available in development mode.
   *
   * Requires authentication and organization context to ensure
   * the target unit belongs to an organization the user has access to.
   */
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/simulate',
    preHandler: [requireDevelopmentMode, requireAuth, requireOrgContext],
    schema: {
      body: SimulationRequestSchema,
      response: {
        200: SimulationResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const body = request.body as SimulationRequest;
      const organizationId = request.user!.organizationId!;

      try {
        const result = await simulationService.runSimulation(
          {
            unitId: body.unitId,
            durationMinutes: body.durationMinutes,
            intervalSeconds: body.intervalSeconds,
            baseTemperature: body.baseTemperature,
            variance: body.variance,
            includeHumidity: body.includeHumidity,
            includeBattery: body.includeBattery,
          },
          organizationId
        );

        return reply.code(200).send(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('No valid units found')) {
          return forbidden(reply, 'Unit does not belong to organization');
        }

        request.log.error({ error }, 'Simulation failed');
        return serverError(reply, 'Simulation failed');
      }
    },
  });
}
