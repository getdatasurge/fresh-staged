import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  TelnyxWebhookEventSchema,
  TelnyxWebhookResponseSchema,
} from '../schemas/telnyx-webhooks.js';
import { ErrorResponseSchema } from '../schemas/common.js';
import * as telnyxWebhookService from '../services/telnyx-webhook.service.js';

/**
 * Telnyx Webhook Routes
 *
 * POST /api/webhooks/telnyx - Receive Telnyx message delivery events
 *
 * Handled Events:
 * - message.sent: Message accepted by carrier
 * - message.delivered: Message delivered to recipient
 * - message.failed: Message delivery failed
 *
 * Authentication:
 * - No authentication required (Telnyx doesn't support webhook signing)
 * - Validate event structure via Zod schema
 * - Rate limiting should be applied at infrastructure level
 *
 * Note: Unlike Stripe, Telnyx does not provide webhook signature verification.
 * Security is maintained through:
 * 1. HTTPS-only endpoints
 * 2. Schema validation
 * 3. Message ID correlation with our database
 */
export default async function telnyxWebhookRoutes(app: FastifyInstance) {
  /**
   * Receive Telnyx webhook events
   */
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/',
    schema: {
      description: 'Receive webhook events from Telnyx for SMS delivery status',
      tags: ['Telnyx Webhooks'],
      body: TelnyxWebhookEventSchema,
      response: {
        200: TelnyxWebhookResponseSchema,
        400: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const event = request.body;

      try {
        const result = await telnyxWebhookService.handleTelnyxWebhookEvent(event);

        request.log.info(
          {
            eventType: event.data.event_type,
            messageId: event.data.payload.id,
            updated: result.updated,
          },
          'Telnyx webhook processed'
        );

        return reply.code(200).send({ received: true });
      } catch (error) {
        if (error instanceof telnyxWebhookService.TelnyxWebhookError) {
          request.log.warn(
            { error: error.message, eventType: event.data.event_type },
            'Telnyx webhook validation error'
          );
          return reply.code(400).send({
            error: {
              code: 'BAD_REQUEST',
              message: error.message,
            },
          });
        }

        // Log and rethrow unexpected errors
        request.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Telnyx webhook processing error'
        );
        throw error;
      }
    },
  });
}
