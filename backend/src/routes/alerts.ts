import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as alertService from '../services/alert.service.js';
import { notFound, conflict } from '../utils/errors.js';
import {
  AlertSchema,
  AlertsListSchema,
  AlertAcknowledgeSchema,
  AlertResolveSchema,
  AlertQuerySchema,
  AlertParamsSchema,
} from '../schemas/alerts.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function alertRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/alerts - List alerts
  app.get(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: OrgParamsSchema,
        querystring: AlertQuerySchema,
        response: {
          200: AlertsListSchema,
        },
      },
    },
    async (request, reply) => {
      const alerts = await alertService.listAlerts(request.user!.organizationId!, request.query);

      return alerts;
    },
  );

  // GET /api/orgs/:organizationId/alerts/:alertId - Get single alert
  app.get(
    '/:alertId',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: AlertParamsSchema,
        response: {
          200: AlertSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const alert = await alertService.getAlert(
        request.params.alertId,
        request.user!.organizationId!,
      );

      if (!alert) {
        return notFound(reply, 'Alert not found');
      }

      return alert;
    },
  );

  // POST /api/orgs/:organizationId/alerts/:alertId/acknowledge - Acknowledge alert
  app.post(
    '/:alertId/acknowledge',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('staff')],
      schema: {
        params: AlertParamsSchema,
        body: AlertAcknowledgeSchema,
        response: {
          200: AlertSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await alertService.acknowledgeAlert(
        request.params.alertId,
        request.user!.organizationId!,
        request.user!.profileId!,
        request.body.notes,
      );

      if (result === null) {
        return notFound(reply, 'Alert not found');
      }

      if (result === 'already_acknowledged') {
        return conflict(reply, 'Alert is already acknowledged');
      }

      return result;
    },
  );

  // POST /api/orgs/:organizationId/alerts/:alertId/resolve - Resolve alert
  app.post(
    '/:alertId/resolve',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('staff')],
      schema: {
        params: AlertParamsSchema,
        body: AlertResolveSchema,
        response: {
          200: AlertSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const alert = await alertService.resolveAlert(
        request.params.alertId,
        request.user!.organizationId!,
        request.user!.profileId!,
        request.body.resolution,
        request.body.correctiveAction,
      );

      if (!alert) {
        return notFound(reply, 'Alert not found');
      }

      return alert;
    },
  );
}
