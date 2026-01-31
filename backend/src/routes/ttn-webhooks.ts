import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  TTNUplinkWebhookSchema,
  TTNWebhookResponseSchema,
  type TTNUplinkWebhook,
} from '../schemas/ttn-webhooks.js';
import { ErrorResponseSchema } from '../schemas/common.js';
import * as ttnWebhookService from '../services/ttn-webhook.service.js';
import * as readingsService from '../services/readings.service.js';
import * as alertEvaluator from '../services/alert-evaluator.service.js';

/**
 * TTN Webhook Routes
 *
 * POST /api/webhooks/ttn - Receive uplink messages from The Things Network
 *
 * Authentication:
 * - Uses X-API-Key or X-Webhook-Secret header with the organization's webhook secret
 * - The secret is configured when setting up the TTN connection
 *
 * Payload:
 * - Standard TTN v3 uplink message format
 * - Requires decoded_payload with temperature data (use TTN payload formatter)
 *
 * Processing:
 * 1. Verify API key against stored organization secrets
 * 2. Look up device by dev_eui to get unit context
 * 3. Extract sensor data from decoded_payload
 * 4. Store reading in database
 * 5. Trigger alert evaluation
 * 6. Update device metadata (lastSeenAt, battery, signal)
 */
export default async function ttnWebhookRoutes(app: FastifyInstance) {
  /**
   * Receive TTN uplink message webhook
   *
   * This endpoint receives uplink messages from TTN when sensors transmit data.
   * The data flow is:
   * Device -> Gateway -> TTN -> Webhook -> This endpoint -> Database
   */
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/',
    schema: {
      description: 'Receive uplink message from The Things Network',
      tags: ['TTN Webhooks'],
      body: TTNUplinkWebhookSchema,
      response: {
        200: TTNWebhookResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        404: ErrorResponseSchema,
        422: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      // Extract API key from headers (TTN sends it in configured header)
      const apiKey =
        (request.headers['x-api-key'] as string) || (request.headers['x-webhook-secret'] as string);

      // Verify webhook authentication
      const verification = await ttnWebhookService.verifyWebhookApiKey(apiKey || '');

      if (!verification.valid) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: verification.error || 'Invalid API key',
          },
        });
      }

      const webhook = request.body as TTNUplinkWebhook;
      const { end_device_ids, uplink_message } = webhook;

      // Get device EUI from webhook
      const devEui = end_device_ids.dev_eui || end_device_ids.device_id;

      if (!devEui) {
        return reply.code(400).send({
          error: {
            code: 'BAD_REQUEST',
            message: 'Missing device identifier (dev_eui or device_id)',
          },
        });
      }

      // Look up device and get unit context
      const deviceLookup = await ttnWebhookService.lookupDeviceByEui(devEui);

      if (!deviceLookup) {
        request.log.warn(
          { devEui, applicationId: end_device_ids.application_ids.application_id },
          'Device not found for TTN uplink',
        );
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Device with EUI ${devEui} not found or not linked to a unit`,
          },
        });
      }

      // Verify device belongs to the authenticated organization
      if (deviceLookup.organizationId !== verification.organizationId) {
        request.log.warn(
          {
            devEui,
            deviceOrgId: deviceLookup.organizationId,
            authOrgId: verification.organizationId,
          },
          'Device organization mismatch',
        );
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Device does not belong to authenticated organization',
          },
        });
      }

      // Extract sensor data from decoded payload
      let sensorData: ttnWebhookService.ExtractedSensorData;
      try {
        sensorData = ttnWebhookService.extractSensorData(uplink_message);
      } catch (error: any) {
        request.log.error(
          { error: error.message, devEui, decoded_payload: uplink_message.decoded_payload },
          'Failed to extract sensor data from TTN uplink',
        );
        return reply.code(422).send({
          error: {
            code: 'UNPROCESSABLE_ENTITY',
            message: error.message,
          },
        });
      }

      // Convert to reading format
      const reading = ttnWebhookService.convertToReading(webhook, deviceLookup, sensorData);

      // Store reading in database
      let readingId: string;
      try {
        const result = await readingsService.ingestBulkReadings(
          [reading],
          verification.organizationId!,
        );

        if (result.insertedCount === 0) {
          throw new Error('Failed to insert reading');
        }

        readingId = result.readingIds[0];
      } catch (error: any) {
        request.log.error(
          { error: error.message, devEui, unitId: deviceLookup.unitId },
          'Failed to store sensor reading',
        );
        throw error;
      }

      // Add reading to real-time streaming service
      request.server.sensorStreamService.addReading(verification.organizationId!, {
        id: readingId,
        unitId: deviceLookup.unitId,
        deviceId: deviceLookup.deviceId,
        temperature: sensorData.temperature,
        humidity: sensorData.humidity ?? null,
        battery: sensorData.battery ?? null,
        signalStrength: sensorData.signalStrength ?? null,
        recordedAt: new Date(reading.recordedAt),
        source: 'ttn',
      });

      // Evaluate alerts for this unit
      let alertsTriggered = 0;
      try {
        // Convert temperature to integer (multiply by 10 for precision)
        // e.g., 35.5°C -> 355
        const tempInt = Math.round(sensorData.temperature * 10);

        const evaluation = await alertEvaluator.evaluateUnitAfterReading(
          deviceLookup.unitId,
          tempInt,
          new Date(reading.recordedAt),
          request.server.socketService,
        );

        if (evaluation.alertCreated || evaluation.alertResolved) {
          alertsTriggered = 1;
        }
      } catch (error: any) {
        // Log error but don't fail the webhook response
        request.log.error(
          { error: error.message, unitId: deviceLookup.unitId },
          'Failed to evaluate alerts after TTN uplink',
        );
      }

      // Update device metadata (lastSeenAt, battery, signal)
      try {
        await ttnWebhookService.updateDeviceMetadata(deviceLookup.deviceId, sensorData);
      } catch (error: any) {
        // Log error but don't fail the webhook response
        request.log.error(
          { error: error.message, deviceId: deviceLookup.deviceId },
          'Failed to update device metadata',
        );
      }

      request.log.info(
        {
          devEui,
          unitId: deviceLookup.unitId,
          temperature: sensorData.temperature,
          readingId,
          alertsTriggered,
        },
        'Processed TTN uplink successfully',
      );

      return reply.code(200).send({
        success: true,
        message: 'Uplink processed successfully',
        readingId,
        alertsTriggered,
      });
    },
  });
}
