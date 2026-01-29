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
import { desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
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

  /**
   * List SMS alert history
   * Returns recent SMS alerts sent for the organization
   */
  listAlertHistory: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional().default(20),
    }))
    .output(z.array(z.object({
      id: z.string().uuid(),
      phoneNumber: z.string(),
      fromNumber: z.string().nullable(),
      alertType: z.string(),
      message: z.string(),
      status: z.string(),
      createdAt: z.date(),
      errorMessage: z.string().nullable(),
      providerMessageId: z.string().nullable(),
      deliveryUpdatedAt: z.date().nullable(),
    })))
    .query(async ({ ctx, input }) => {
      // Query sms_alert_log table directly via raw SQL since it's not in Drizzle schema
      const logs = await db.execute(sql`
        SELECT
          id,
          phone_number,
          from_number,
          alert_type,
          message,
          status,
          created_at,
          error_message,
          provider_message_id,
          delivery_updated_at
        FROM sms_alert_log
        WHERE organization_id = ${ctx.user.organizationId}
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `);

      return logs.rows.map((log: any) => ({
        id: log.id,
        phoneNumber: log.phone_number,
        fromNumber: log.from_number,
        alertType: log.alert_type,
        message: log.message,
        status: log.status,
        createdAt: new Date(log.created_at),
        errorMessage: log.error_message,
        providerMessageId: log.provider_message_id,
        deliveryUpdatedAt: log.delivery_updated_at ? new Date(log.delivery_updated_at) : null,
      }));
    }),
});
