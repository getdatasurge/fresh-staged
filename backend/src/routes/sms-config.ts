/**
 * SMS Configuration Routes
 *
 * Endpoints for managing Telnyx SMS alerting configuration per organization.
 * Admins can configure SMS settings to enable temperature alerts for operators.
 */

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as smsConfigService from '../services/sms-config.service.js';
import { validationError } from '../utils/errors.js';
import {
  SmsConfigCreateSchema,
  SmsConfigResponseSchema,
  SmsConfigGetResponseSchema,
  SmsConfigParamsSchema,
} from '../schemas/sms-config.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function smsConfigRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/alerts/sms/config - Get current SMS configuration
  app.get(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: OrgParamsSchema,
        response: {
          200: SmsConfigGetResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const config = await smsConfigService.getSmsConfig(request.user!.organizationId!);

      if (!config) {
        return {
          configured: false as const,
          message: 'SMS configuration not set up. Use POST to configure.',
        };
      }

      return config;
    },
  );

  // POST /api/alerts/sms/config - Create or update SMS configuration
  app.post(
    '/',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: OrgParamsSchema,
        body: SmsConfigCreateSchema,
        response: {
          200: SmsConfigResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const config = await smsConfigService.upsertSmsConfig(
          request.user!.organizationId!,
          request.body,
        );

        return config;
      } catch (error) {
        if (error instanceof smsConfigService.SmsConfigError) {
          return validationError(reply, error.message);
        }
        throw error;
      }
    },
  );
}
