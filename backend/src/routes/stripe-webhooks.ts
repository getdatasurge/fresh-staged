import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WebhookResponseSchema } from '../schemas/payments.js';
import { ErrorResponseSchema } from '../schemas/common.js';
import * as stripeWebhookService from '../services/stripe-webhook.service.js';

/**
 * Stripe Webhook Routes
 *
 * POST /api/webhooks/stripe - Receive Stripe events
 *
 * Authentication:
 * - Uses Stripe webhook signature verification
 * - The signing secret is configured via STRIPE_WEBHOOK_SECRET env var
 *
 * Handled Events:
 * - checkout.session.completed - Activates subscription after successful payment
 * - customer.subscription.updated - Syncs subscription status changes
 * - customer.subscription.deleted - Deactivates subscription when canceled
 * - invoice.payment_failed - Notifies admin about failed payments
 */
export default async function stripeWebhookRoutes(app: FastifyInstance) {
  // Add raw body parser for webhook signature verification
  // Stripe requires the raw request body for signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  /**
   * Receive Stripe webhook events
   */
  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/',
    schema: {
      description: 'Receive webhook events from Stripe',
      tags: ['Stripe Webhooks'],
      response: {
        200: WebhookResponseSchema,
        400: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      // Get Stripe signature from header
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        return reply.code(400).send({
          error: {
            code: 'BAD_REQUEST',
            message: 'Missing stripe-signature header',
          },
        });
      }

      // Get raw body (we configured addContentTypeParser to give us a Buffer)
      const rawBody = request.body as Buffer;

      // Verify signature and construct event
      let event;
      try {
        event = stripeWebhookService.verifyWebhookSignature(rawBody, signature);
      } catch (error) {
        if (error instanceof stripeWebhookService.SignatureVerificationError) {
          request.log.warn(
            { error: error.message },
            'Stripe webhook signature verification failed',
          );
          return reply.code(400).send({
            error: {
              code: 'BAD_REQUEST',
              message: error.message,
            },
          });
        }
        throw error;
      }

      // Handle the event
      try {
        await stripeWebhookService.handleWebhookEvent(event);
        request.log.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook processed');
      } catch (error) {
        if (error instanceof stripeWebhookService.WebhookError) {
          request.log.error(
            { error: error.message, eventType: event.type },
            'Stripe webhook handler error',
          );
          return reply.code(400).send({
            error: {
              code: 'BAD_REQUEST',
              message: error.message,
            },
          });
        }
        throw error;
      }

      return reply.code(200).send({ received: true });
    },
  });
}
