import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as ttnGatewayService from '../services/ttn-gateway.service.js';
import { notFound, validationError } from '../utils/errors.js';
import {
  TTNGatewayResponseSchema,
  TTNGatewaysListSchema,
  RegisterTTNGatewaySchema,
  UpdateTTNGatewaySchema,
  TTNGatewayParamsSchema,
} from '../schemas/ttn-gateways.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function ttnGatewayRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/ttn/gateways - List TTN gateways for organization
  app.get('/', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      response: {
        200: TTNGatewaysListSchema,
      },
    },
  }, async (request) => {
    const gateways = await ttnGatewayService.listTTNGateways(
      request.user!.organizationId!
    );
    return gateways;
  });

  // POST /api/orgs/:organizationId/ttn/gateways - Register a new gateway
  app.post('/', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: OrgParamsSchema,
      body: RegisterTTNGatewaySchema,
      response: {
        201: TTNGatewayResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const gateway = await ttnGatewayService.registerTTNGateway(
        request.user!.organizationId!,
        request.body
      );

      reply.code(201);
      return gateway;
    } catch (error) {
      // Check by name to work with mocked error classes in tests
      if (error instanceof Error &&
          (error.name === 'TTNConfigError' || error.name === 'TTNRegistrationError')) {
        return validationError(reply, error.message);
      }
      throw error;
    }
  });

  // GET /api/orgs/:organizationId/ttn/gateways/:gatewayId - Get a specific gateway
  app.get('/:gatewayId', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: TTNGatewayParamsSchema,
      response: {
        200: TTNGatewayResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const gateway = await ttnGatewayService.getTTNGateway(
      request.params.gatewayId,
      request.user!.organizationId!
    );

    if (!gateway) {
      return notFound(reply, 'Gateway not found');
    }

    return gateway;
  });

  // PUT /api/orgs/:organizationId/ttn/gateways/:gatewayId - Update a gateway
  app.put('/:gatewayId', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: TTNGatewayParamsSchema,
      body: UpdateTTNGatewaySchema,
      response: {
        200: TTNGatewayResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const gateway = await ttnGatewayService.updateTTNGateway(
      request.params.gatewayId,
      request.user!.organizationId!,
      request.body
    );

    if (!gateway) {
      return notFound(reply, 'Gateway not found');
    }

    return gateway;
  });

  // DELETE /api/orgs/:organizationId/ttn/gateways/:gatewayId - Deregister a gateway
  app.delete('/:gatewayId', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: TTNGatewayParamsSchema,
      response: {
        204: { type: 'null' as const, description: 'No content' },
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const deleted = await ttnGatewayService.deregisterTTNGateway(
      request.params.gatewayId,
      request.user!.organizationId!
    );

    if (!deleted) {
      return notFound(reply, 'Gateway not found');
    }

    reply.code(204);
    return;
  });

  // POST /api/orgs/:organizationId/ttn/gateways/:gatewayId/status - Refresh gateway status
  app.post('/:gatewayId/status', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: TTNGatewayParamsSchema,
      response: {
        200: TTNGatewayResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const gateway = await ttnGatewayService.updateGatewayStatus(
      request.params.gatewayId,
      request.user!.organizationId!
    );

    if (!gateway) {
      return notFound(reply, 'Gateway not found');
    }

    return gateway;
  });
}
