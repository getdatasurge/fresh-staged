import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext } from '../middleware/index.js';
import * as checkoutService from '../services/checkout.service.js';
import { validationError } from '../utils/errors.js';
import {
  CreateCheckoutSessionSchema,
  CheckoutSessionResponseSchema,
} from '../schemas/payments.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function paymentRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/orgs/:organizationId/payments/checkout - Create Stripe checkout session
  app.post('/checkout', {
    preHandler: [requireAuth, requireOrgContext],
    schema: {
      params: OrgParamsSchema,
      body: CreateCheckoutSessionSchema,
      response: {
        200: CheckoutSessionResponseSchema,
        400: ErrorResponseSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const session = await checkoutService.createCheckoutSession(
        request.user!.organizationId!,
        request.user!.id,
        request.body
      );

      return session;
    } catch (error) {
      if (error instanceof Error &&
          (error.name === 'StripeConfigError' || error.name === 'CheckoutError')) {
        return validationError(reply, error.message);
      }
      throw error;
    }
  });
}
