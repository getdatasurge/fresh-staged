/**
 * TTN Settings tRPC Router
 *
 * Provides type-safe procedures for TTN settings management:
 * - get: Retrieve TTN settings for organization
 * - update: Modify TTN settings (admin/owner only)
 * - test: Test TTN connection
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 *
 * NOTE: Actual TTN API integration (bootstrap, validation, webhook configuration)
 * will be implemented in future plans after this router structure is established.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import {
  TTNSettingsSchema,
  UpdateTTNSettingsSchema,
  TestConnectionInputSchema,
  TestConnectionResultSchema,
} from '../schemas/ttn-settings.js';
import * as ttnSettingsService from '../services/ttn-settings.service.js';

/**
 * Base input schema for organization-scoped operations
 * Required by orgProcedure middleware
 */
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Input schema for update with data payload
 */
const UpdateInput = z.object({
  organizationId: z.string().uuid(),
  data: UpdateTTNSettingsSchema,
});

export const ttnSettingsRouter = router({
  /**
   * Get TTN settings for organization
   * Equivalent to: GET action in manage-ttn-settings edge function
   *
   * Returns TTN settings or null if not configured.
   * Maps legacy provisioning status values (not_started -> idle, completed -> ready).
   */
  get: orgProcedure
    .input(OrgInput)
    .output(TTNSettingsSchema.nullable())
    .query(async ({ input }) => {
      const settings = await ttnSettingsService.getTTNSettings(input.organizationId);
      return settings;
    }),

  /**
   * Update TTN settings
   * Equivalent to: POST action in manage-ttn-settings edge function
   *
   * Requires admin or owner role.
   * Updates provided fields and sets last_updated_source to 'api'.
   */
  update: orgProcedure
    .input(UpdateInput)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { user } = ctx;

      // Admin/owner check - only administrators can update TTN settings
      if (!['admin', 'owner'].includes(user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can update TTN settings',
        });
      }

      await ttnSettingsService.updateTTNSettings(input.organizationId, input.data);

      return { success: true };
    }),

  /**
   * Test TTN connection
   * Equivalent to: test action in manage-ttn-settings edge function
   *
   * Verifies TTN settings are configured and tests connectivity.
   * Updates last_connection_test_at and last_connection_test_result.
   *
   * NOTE: Currently returns a mock success result.
   * Actual TTN API integration will be implemented in future plans.
   */
  test: orgProcedure
    .input(TestConnectionInputSchema)
    .output(TestConnectionResultSchema)
    .mutation(async ({ input }) => {
      // Verify TTN is configured
      const isConfigured = await ttnSettingsService.isTTNConfigured(input.organizationId);

      if (!isConfigured) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'TTN not configured for this organization',
        });
      }

      // Get settings for test result details
      const settings = await ttnSettingsService.getTTNSettings(input.organizationId);

      // TODO: Implement actual TTN API connection test
      // For now, return a mock success result
      const testResult = {
        success: true,
        testedAt: new Date().toISOString(),
        clusterTested: settings?.ttn_region || 'nam1',
        effectiveApplicationId: settings?.ttn_application_id || undefined,
        apiKeyLast4: settings?.api_key_last4 || undefined,
        request_id: crypto.randomUUID(),
      };

      // Update last test result in database
      await ttnSettingsService.updateTestResult(input.organizationId, testResult);

      return testResult;
    }),
});
