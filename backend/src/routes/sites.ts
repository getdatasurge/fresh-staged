import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as siteService from '../services/site.service.js';
import { notFound } from '../utils/errors.js';
import {
  SiteSchema,
  SitesListSchema,
  CreateSiteSchema,
  UpdateSiteSchema,
  SiteParamsSchema,
} from '../schemas/sites.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function siteRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/sites - List sites
  app.get(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: OrgParamsSchema,
        response: {
          200: SitesListSchema,
        },
      },
    },
    async (request) => {
      const sites = await siteService.listSites(request.user!.organizationId!);
      return sites;
    },
  );

  // POST /api/orgs/:organizationId/sites - Create site
  app.post(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: OrgParamsSchema,
        body: CreateSiteSchema,
        response: {
          201: SiteSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.createSite(request.user!.organizationId!, request.body);

      reply.code(201);
      return site;
    },
  );

  // GET /api/orgs/:organizationId/sites/:siteId - Get site
  app.get(
    '/:siteId',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: SiteParamsSchema,
        response: {
          200: SiteSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.getSite(request.params.siteId, request.user!.organizationId!);

      if (!site) {
        return notFound(reply, 'Site not found');
      }

      return site;
    },
  );

  // PUT /api/orgs/:organizationId/sites/:siteId - Update site
  app.put(
    '/:siteId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: SiteParamsSchema,
        body: UpdateSiteSchema,
        response: {
          200: SiteSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.updateSite(
        request.params.siteId,
        request.user!.organizationId!,
        request.body,
      );

      if (!site) {
        return notFound(reply, 'Site not found');
      }

      return site;
    },
  );

  // DELETE /api/orgs/:organizationId/sites/:siteId - Delete site (soft)
  app.delete(
    '/:siteId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: SiteParamsSchema,
        response: {
          204: { type: 'null' as const, description: 'No content' },
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.deleteSite(
        request.params.siteId,
        request.user!.organizationId!,
      );

      if (!site) {
        return notFound(reply, 'Site not found');
      }

      reply.code(204);
      return;
    },
  );
}
