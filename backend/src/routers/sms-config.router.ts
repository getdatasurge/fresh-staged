/**
 * SMS Configuration tRPC Router
 *
 * Provides type-safe procedures for SMS alerting configuration:
 * - get: Retrieve organization's SMS configuration
 * - upsert: Create or update SMS configuration (admin/owner only)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as smsConfigService from '../services/sms-config.service.js';
import {
  SmsConfigCreateSchema,
  SmsConfigGetResponseSchema,
  SmsConfigResponseSchema,
} from '../schemas/sms-config.js';

/**
 * Input schema for org-scoped procedures
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for upsert with data payload
 */
const UpsertSmsConfigInput = z.object({
  organizationId: z.string().uuid(),
  data: SmsConfigCreateSchema,
});

export const smsConfigRouter = router({
  /**
   * Get SMS configuration
   * Equivalent to: GET /api/alerts/sms/config
   *
   * Returns current SMS configuration for the organization,
   * or configured: false message if not set up.
   */
  get: orgProcedure
    .input(OrgInput)
    .output(SmsConfigGetResponseSchema)
    .query(async ({ ctx }) => {
      const config = await smsConfigService.getSmsConfig(ctx.user.organizationId);

      if (!config) {
        return {
          configured: false as const,
          message: 'SMS configuration not set up. Use upsert to configure.',
        };
      }

      return config;
    }),

  /**
   * Create or update SMS configuration
   * Equivalent to: POST /api/alerts/sms/config
   *
   * Requires admin or owner role.
   * Creates new config if not exists, updates if exists.
   */
  upsert: orgProcedure
    .input(UpsertSmsConfigInput)
    .output(SmsConfigResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check - only admin or owner can configure SMS
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only organization admins or owners can configure SMS',
        });
      }

      try {
        const config = await smsConfigService.upsertSmsConfig(
          ctx.user.organizationId,
          input.data
        );

        return config;
      } catch (error) {
        if (error instanceof smsConfigService.SmsConfigError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
