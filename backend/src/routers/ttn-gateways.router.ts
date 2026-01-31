/**
 * TTN Gateways tRPC Router
 *
 * Provides type-safe procedures for TTN gateway management:
 * - list: List all gateways for organization
 * - get: Retrieve gateway details
 * - register: Register a new gateway (manager/admin/owner only)
 * - update: Modify gateway settings (manager/admin/owner only)
 * - deregister: Remove a gateway (manager/admin/owner only)
 * - refreshStatus: Update gateway status from TTN
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as ttnGatewayService from '../services/ttn-gateway.service.js';
import {
  TTNGatewayResponseSchema,
  TTNGatewaysListSchema,
  RegisterTTNGatewaySchema,
  UpdateTTNGatewaySchema,
} from '../schemas/ttn-gateways.js';

/**
 * Base input schema for organization-scoped gateway operations
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for gateway-specific operations
 */
const GatewayInput = z.object({
  organizationId: z.string().uuid(),
  gatewayId: z.string().min(1),
});

/**
 * Input schema for register with data payload
 */
const RegisterGatewayInput = z.object({
  organizationId: z.string().uuid(),
  data: RegisterTTNGatewaySchema,
});

/**
 * Input schema for update with data payload
 */
const UpdateGatewayInput = z.object({
  organizationId: z.string().uuid(),
  gatewayId: z.string().min(1),
  data: UpdateTTNGatewaySchema,
});

export const ttnGatewaysRouter = router({
  /**
   * List all TTN gateways for organization
   * Equivalent to: GET /api/orgs/:organizationId/ttn/gateways
   *
   * Returns all active gateways for the organization's TTN connection.
   */
  list: orgProcedure
    .input(OrgInput)
    .output(TTNGatewaysListSchema)
    .query(async ({ ctx }) => {
      const gateways = await ttnGatewayService.listTTNGateways(ctx.user.organizationId);
      return gateways;
    }),

  /**
   * Get gateway by ID
   * Equivalent to: GET /api/orgs/:organizationId/ttn/gateways/:gatewayId
   *
   * Returns full gateway record for authenticated members.
   */
  get: orgProcedure
    .input(GatewayInput)
    .output(TTNGatewayResponseSchema)
    .query(async ({ ctx, input }) => {
      const gateway = await ttnGatewayService.getTTNGateway(
        input.gatewayId,
        ctx.user.organizationId,
      );

      if (!gateway) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Gateway not found',
        });
      }

      return gateway;
    }),

  /**
   * Register a new TTN gateway
   * Equivalent to: POST /api/orgs/:organizationId/ttn/gateways
   *
   * Requires manager, admin, or owner role.
   * Registers gateway in TTN and creates local database record.
   */
  register: orgProcedure
    .input(RegisterGatewayInput)
    .output(TTNGatewayResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can register gateways
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can register gateways',
        });
      }

      try {
        const gateway = await ttnGatewayService.registerTTNGateway(
          ctx.user.organizationId,
          input.data,
        );
        return gateway;
      } catch (error) {
        // Handle TTN-specific errors as BAD_REQUEST
        if (
          error instanceof Error &&
          (error.name === 'TTNConfigError' || error.name === 'TTNRegistrationError')
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
   * Update an existing gateway
   * Equivalent to: PUT /api/orgs/:organizationId/ttn/gateways/:gatewayId
   *
   * Requires manager, admin, or owner role.
   */
  update: orgProcedure
    .input(UpdateGatewayInput)
    .output(TTNGatewayResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can update gateways
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can update gateways',
        });
      }

      const gateway = await ttnGatewayService.updateTTNGateway(
        input.gatewayId,
        ctx.user.organizationId,
        input.data,
      );

      if (!gateway) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Gateway not found',
        });
      }

      return gateway;
    }),

  /**
   * Deregister (delete) a gateway
   * Equivalent to: DELETE /api/orgs/:organizationId/ttn/gateways/:gatewayId
   *
   * Requires manager, admin, or owner role.
   * Removes gateway from TTN and soft deletes local record.
   */
  deregister: orgProcedure
    .input(GatewayInput)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      // Role check - only managers, admins, and owners can deregister gateways
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, admins, and owners can deregister gateways',
        });
      }

      const deleted = await ttnGatewayService.deregisterTTNGateway(
        input.gatewayId,
        ctx.user.organizationId,
      );

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Gateway not found',
        });
      }
    }),

  /**
   * Refresh gateway status from TTN
   * Equivalent to: POST /api/orgs/:organizationId/ttn/gateways/:gatewayId/status
   *
   * Fetches current status from TTN and updates local record.
   */
  refreshStatus: orgProcedure
    .input(GatewayInput)
    .output(TTNGatewayResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const gateway = await ttnGatewayService.updateGatewayStatus(
        input.gatewayId,
        ctx.user.organizationId,
      );

      if (!gateway) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Gateway not found',
        });
      }

      return gateway;
    }),
});
