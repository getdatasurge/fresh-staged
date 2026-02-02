/**
 * Payments tRPC Router
 *
 * Provides type-safe procedures for Stripe billing operations:
 * - getSubscription: Retrieve organization's subscription details
 * - createCheckoutSession: Create a Stripe checkout session
 * - createPortalSession: Create a Stripe billing portal session
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as checkoutService from '../services/checkout.service.js';
import {
  CreateCheckoutSessionSchema,
  CreatePortalSessionSchema,
  CheckoutSessionResponseSchema,
  PortalSessionResponseSchema,
  SubscriptionResponseSchema,
} from '../schemas/payments.js';

/**
 * Input schema for org-scoped procedures
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for checkout session creation
 */
const CreateCheckoutInput = z.object({
  organizationId: z.string().uuid(),
  data: CreateCheckoutSessionSchema,
});

/**
 * Input schema for portal session creation
 */
const CreatePortalInput = z.object({
  organizationId: z.string().uuid(),
  data: CreatePortalSessionSchema,
});

export const paymentsRouter = router({
  /**
   * Get subscription details
   * Equivalent to: GET /api/orgs/:organizationId/payments/subscription
   *
   * Returns subscription details including sensor limits and usage.
   * Returns null if no subscription exists.
   */
  getSubscription: orgProcedure
    .input(OrgInput)
    .output(SubscriptionResponseSchema.nullable())
    .query(async ({ ctx }) => {
      const subscription = await checkoutService.getSubscription(ctx.user.organizationId);

      return subscription;
    }),

  /**
   * Create Stripe checkout session
   * Equivalent to: POST /api/orgs/:organizationId/payments/checkout
   *
   * Creates a checkout session for subscription purchase.
   * Returns session ID and redirect URL.
   */
  createCheckoutSession: orgProcedure
    .input(CreateCheckoutInput)
    .output(CheckoutSessionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await checkoutService.createCheckoutSession(
          ctx.user.organizationId,
          ctx.user.id,
          input.data,
        );

        return session;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'StripeConfigError' || error.name === 'CheckoutError')
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Create Stripe billing portal session
   * Equivalent to: POST /api/orgs/:organizationId/payments/portal
   *
   * Creates a billing portal session for subscription management.
   * Returns redirect URL to Stripe's customer portal.
   */
  createPortalSession: orgProcedure
    .input(CreatePortalInput)
    .output(PortalSessionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await checkoutService.createPortalSession(
          ctx.user.organizationId,
          input.data,
        );

        return session;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'StripeConfigError' || error.name === 'PortalError')
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
