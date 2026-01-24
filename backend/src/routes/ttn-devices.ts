import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as ttnDeviceService from '../services/ttn-device.service.js';
import { notFound, validationError } from '../utils/errors.js';
import {
  TTNDeviceResponseSchema,
  TTNDevicesListSchema,
  ProvisionTTNDeviceSchema,
  UpdateTTNDeviceSchema,
  TTNDeviceParamsSchema,
  BootstrapTTNDeviceSchema,
  BootstrapTTNDeviceResponseSchema,
} from '../schemas/ttn-devices.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function ttnDeviceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/ttn/devices - List TTN devices for organization
  app.get('/', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      response: {
        200: TTNDevicesListSchema,
      },
    },
  }, async (request) => {
    const devices = await ttnDeviceService.listTTNDevices(
      request.user!.organizationId!
    );
    return devices;
  });

  // POST /api/orgs/:organizationId/ttn/devices - Provision a new device
  app.post('/', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: OrgParamsSchema,
      body: ProvisionTTNDeviceSchema,
      response: {
        201: TTNDeviceResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const device = await ttnDeviceService.provisionTTNDevice(
        request.user!.organizationId!,
        request.body
      );

      reply.code(201);
      return device;
    } catch (error) {
      // Check by name to work with mocked error classes in tests
      if (error instanceof Error &&
          (error.name === 'TTNConfigError' || error.name === 'TTNProvisioningError')) {
        return validationError(reply, error.message);
      }
      throw error;
    }
  });

  // POST /api/orgs/:organizationId/ttn/devices/bootstrap - Bootstrap a new device with auto-generated credentials
  app.post('/bootstrap', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: OrgParamsSchema,
      body: BootstrapTTNDeviceSchema,
      response: {
        201: BootstrapTTNDeviceResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const device = await ttnDeviceService.bootstrapTTNDevice(
        request.user!.organizationId!,
        request.body
      );

      reply.code(201);
      return device;
    } catch (error) {
      if (error instanceof Error &&
          (error.name === 'TTNConfigError' || error.name === 'TTNProvisioningError')) {
        return validationError(reply, error.message);
      }
      throw error;
    }
  });

  // GET /api/orgs/:organizationId/ttn/devices/:deviceId - Get a specific device
  app.get('/:deviceId', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: TTNDeviceParamsSchema,
      response: {
        200: TTNDeviceResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const device = await ttnDeviceService.getTTNDevice(
      request.params.deviceId,
      request.user!.organizationId!
    );

    if (!device) {
      return notFound(reply, 'Device not found');
    }

    return device;
  });

  // PUT /api/orgs/:organizationId/ttn/devices/:deviceId - Update a device
  app.put('/:deviceId', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: TTNDeviceParamsSchema,
      body: UpdateTTNDeviceSchema,
      response: {
        200: TTNDeviceResponseSchema,
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const device = await ttnDeviceService.updateTTNDevice(
      request.params.deviceId,
      request.user!.organizationId!,
      request.body
    );

    if (!device) {
      return notFound(reply, 'Device not found');
    }

    return device;
  });

  // DELETE /api/orgs/:organizationId/ttn/devices/:deviceId - Deprovision a device
  app.delete('/:deviceId', {
    preHandler: [requireAuth, requireOrgContext, requireRole('manager')],
    schema: {
      params: TTNDeviceParamsSchema,
      response: {
        204: { type: 'null' as const, description: 'No content' },
        404: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const deleted = await ttnDeviceService.deprovisionTTNDevice(
      request.params.deviceId,
      request.user!.organizationId!
    );

    if (!deleted) {
      return notFound(reply, 'Device not found');
    }

    reply.code(204);
    return;
  });
}
