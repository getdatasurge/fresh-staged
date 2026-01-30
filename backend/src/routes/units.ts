import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as unitService from '../services/unit.service.js';
import { notFound } from '../utils/errors.js';
import {
  UnitSchema,
  UnitsListSchema,
  CreateUnitSchema,
  UpdateUnitSchema,
  UnitRequiredParamsSchema,
} from '../schemas/units.js';
import { AreaParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function unitRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units - List units
  app.get(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: AreaParamsSchema,
        response: {
          200: UnitsListSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const units = await unitService.listUnits(
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
      );

      if (units === null) {
        return notFound(reply, 'Area not found');
      }

      return units;
    },
  );

  // POST /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units - Create unit
  app.post(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
      schema: {
        params: AreaParamsSchema,
        body: CreateUnitSchema,
        response: {
          201: UnitSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const unit = await unitService.createUnit(
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
        request.body,
      );

      if (!unit) {
        return notFound(reply, 'Area not found');
      }

      reply.code(201);
      return unit;
    },
  );

  // GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId - Get unit
  app.get(
    '/:unitId',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: UnitRequiredParamsSchema,
        response: {
          200: UnitSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const unit = await unitService.getUnit(
        request.params.unitId,
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
      );

      if (!unit) {
        return notFound(reply, 'Unit not found');
      }

      return unit;
    },
  );

  // PUT /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId - Update unit
  app.put(
    '/:unitId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
      schema: {
        params: UnitRequiredParamsSchema,
        body: UpdateUnitSchema,
        response: {
          200: UnitSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const unit = await unitService.updateUnit(
        request.params.unitId,
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
        request.body,
      );

      if (!unit) {
        return notFound(reply, 'Unit not found');
      }

      return unit;
    },
  );

  // DELETE /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId - Delete unit
  app.delete(
    '/:unitId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
      schema: {
        params: UnitRequiredParamsSchema,
        response: {
          204: { type: 'null' as const, description: 'No content' },
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const unit = await unitService.deleteUnit(
        request.params.unitId,
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
      );

      if (!unit) {
        return notFound(reply, 'Unit not found');
      }

      reply.code(204);
      return;
    },
  );
}
