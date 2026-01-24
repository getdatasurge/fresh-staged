import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as orgService from '../services/organization.service.js';
import { getOrganizationStatsService } from '../services/organization-stats.service.js';
import { notFound } from '../utils/errors.js';
import {
  OrganizationSchema,
  UpdateOrganizationSchema,
  MembersListSchema,
  OrgParamsSchema,
  OrganizationStatsSchema,
} from '../schemas/organizations.js';
import { ErrorResponseSchema } from '../schemas/common.js';

export default async function organizationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId - Get organization details
  app.get('/:organizationId', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      response: {
        200: OrganizationSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const org = await orgService.getOrganization(request.user!.organizationId!);

    if (!org) {
      return notFound(reply, 'Organization not found');
    }

    return org;
  });

  // PUT /api/orgs/:organizationId - Update organization settings
  app.put('/:organizationId', {
    preHandler: [requireAuth, requireOrgContext, requireRole('owner')],
    schema: {
      params: OrgParamsSchema,
      body: UpdateOrganizationSchema,
      response: {
        200: OrganizationSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const org = await orgService.updateOrganization(
      request.user!.organizationId!,
      request.body
    );

    if (!org) {
      return notFound(reply, 'Organization not found');
    }

    return org;
  });

  // GET /api/orgs/:organizationId/members - List organization members
  app.get('/:organizationId/members', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      response: {
        200: MembersListSchema,
      },
    },
  }, async (request) => {
    const members = await orgService.listMembers(request.user!.organizationId!);
    return members;
  });

  // GET /api/orgs/:organizationId/stats - Get organization stats for dashboard
  app.get('/:organizationId/stats', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      response: {
        200: OrganizationStatsSchema,
        503: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const statsService = getOrganizationStatsService();

    if (!statsService) {
      return reply.status(503).send({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Organization stats service not initialized',
        },
      });
    }

    const stats = await statsService.getOrganizationStats(request.user!.organizationId!);
    return stats;
  });
}
