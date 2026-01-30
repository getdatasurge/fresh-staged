import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth, requireOrgContext } from '../middleware/index.js';
import * as checkoutService from '../services/checkout.service.js';
import { notFound, validationError } from '../utils/errors.js';
import {
  CreateCheckoutSessionSchema,
  CheckoutSessionResponseSchema,
  CreatePortalSessionSchema,
  PortalSessionResponseSchema,
  SubscriptionResponseSchema,
} from '../schemas/payments.js';
import { OrgParamsSchema, ErrorResponseSchema } from '../schemas/common.js';

export default async function paymentRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId/payments/subscription - Get subscription details
  app.get(
    '/subscription',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: OrgParamsSchema,
        response: {
          200: SubscriptionResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const subscription = await checkoutService.getSubscription(request.user!.organizationId!);

      if (!subscription) {
        return notFound(reply, 'Subscription not found');
      }

      return subscription;
    },
  );

  // POST /api/orgs/:organizationId/payments/checkout - Create Stripe checkout session
  app.post(
    '/checkout',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: OrgParamsSchema,
        body: CreateCheckoutSessionSchema,
        response: {
          200: CheckoutSessionResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await checkoutService.createCheckoutSession(
          request.user!.organizationId!,
          request.user!.id,
          request.body,
        );

        return session;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'StripeConfigError' || error.name === 'CheckoutError')
        ) {
          return validationError(reply, error.message);
        }
        throw error;
      }
    },
  );

  // POST /api/orgs/:organizationId/payments/portal - Create Stripe billing portal session
  app.post(
    '/portal',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: OrgParamsSchema,
        body: CreatePortalSessionSchema,
        response: {
          200: PortalSessionResponseSchema,
          400: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await checkoutService.createPortalSession(
          request.user!.organizationId!,
          request.body,
        );

        return session;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'StripeConfigError' || error.name === 'PortalError')
        ) {
          return validationError(reply, error.message);
        }
        throw error;
      }
    },
  );
}
