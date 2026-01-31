import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as areaService from '../services/area.service.js';
import { notFound } from '../utils/errors.js';
import {
  AreaSchema,
  AreasListSchema,
  CreateAreaSchema,
  UpdateAreaSchema,
  AreaRequiredParamsSchema,
} from '../schemas/areas.js';
import { SiteParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function areaRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/sites/:siteId/areas - List areas
  app.get(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: SiteParamsSchema,
        response: {
          200: AreasListSchema,
        },
      },
    },
    async (request) => {
      const areas = await areaService.listAreas(
        request.params.siteId,
        request.user!.organizationId!,
      );
      return areas;
    },
  );

  // POST /api/orgs/:organizationId/sites/:siteId/areas - Create area
  app.post(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: SiteParamsSchema,
        body: CreateAreaSchema,
        response: {
          201: AreaSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const area = await areaService.createArea(
        request.params.siteId,
        request.user!.organizationId!,
        request.body,
      );

      if (!area) {
        return notFound(reply, 'Site not found or access denied');
      }

      reply.code(201);
      return area;
    },
  );

  // GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId - Get area
  app.get(
    '/:areaId',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: AreaRequiredParamsSchema,
        response: {
          200: AreaSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const area = await areaService.getArea(
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
      );

      if (!area) {
        return notFound(reply, 'Area not found');
      }

      return area;
    },
  );

  // PUT /api/orgs/:organizationId/sites/:siteId/areas/:areaId - Update area
  app.put(
    '/:areaId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: AreaRequiredParamsSchema,
        body: UpdateAreaSchema,
        response: {
          200: AreaSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const area = await areaService.updateArea(
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
        request.body,
      );

      if (!area) {
        return notFound(reply, 'Area not found');
      }

      return area;
    },
  );

  // DELETE /api/orgs/:organizationId/sites/:siteId/areas/:areaId - Delete area (soft)
  app.delete(
    '/:areaId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: AreaRequiredParamsSchema,
        response: {
          204: { type: 'null' as const, description: 'No content' },
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const area = await areaService.deleteArea(
        request.params.areaId,
        request.params.siteId,
        request.user!.organizationId!,
      );

      if (!area) {
        return notFound(reply, 'Area not found');
      }

      reply.code(204);
      return;
    },
  );
}
