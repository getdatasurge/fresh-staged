/**
 * TTN Settings tRPC Router
 *
 * Provides type-safe procedures for TTN settings management:
 * - get: Retrieve TTN settings for organization
 * - update: Modify TTN settings (admin/owner only)
 * - test: Test TTN connection
 * - getCredentials: Retrieve decrypted TTN credentials (admin/owner/manager)
 * - getStatus: Retrieve provisioning status
 * - provision: Retry failed provisioning (admin/owner)
 * - startFresh: Deprovision and re-provision (admin/owner)
 * - deepClean: Delete all TTN resources (admin/owner)
 *
 * All procedures use orgProcedure which enforces authentication and org membership.
 *
 * NOTE: Integrated with backend services (TtnSettingsService, TtnProvisioningService, TtnWebhookService)
 */

import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { organizations, ttnConnections } from '../db/schema/tenancy.js';
import {
  DeepCleanResponseSchema,
  ProvisionResponseSchema,
  StartFreshResponseSchema,
  TestConnectionInputSchema,
  TestConnectionResultSchema,
  TTNCredentialsResponseSchema,
  TTNSettingsSchema,
  TTNStatusResponseSchema,
  UpdateTTNSettingsSchema,
  type SecretStatus,
} from '../schemas/ttn-settings.js';
import * as ttnSettingsService from '../services/ttn-settings.service.js';
import { TtnCrypto } from '../services/ttn/crypto.js';
import { TtnProvisioningService } from '../services/ttn/provisioning.js';
import { TtnSettingsService } from '../services/ttn/settings.js';
import { TtnWebhookService } from '../services/ttn/webhook.js';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';

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
   * Get full TTN credentials for developer panel
   * Equivalent to: get_credentials action in manage-ttn-settings edge function
   *
   * Returns decrypted credentials with status tracking for each secret.
   * Allows manager role for read-only access.
   */
  getCredentials: orgProcedure
    .input(OrgInput)
    .output(TTNCredentialsResponseSchema)
    .query(async ({ input, ctx }) => {
      const { user } = ctx;

      // Manager, admin, or owner can view credentials
      if (!['admin', 'owner', 'manager'].includes(user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers, administrators, or owners can view TTN credentials',
        });
      }

      // Get organization name
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.organizationId),
        columns: { name: true },
      });

      // Get TTN connection settings
      const conn = await db.query.ttnConnections.findFirst({
        where: eq(ttnConnections.organizationId, input.organizationId),
      });

      // Return empty credentials if no connection configured
      if (!conn) {
        return {
          organization_name: org?.name ?? 'Unknown',
          organization_id: input.organizationId,
          ttn_application_id: null,
          ttn_region: null,
          org_api_secret: null,
          org_api_secret_last4: null,
          org_api_secret_status: 'empty' as SecretStatus,
          app_api_secret: null,
          app_api_secret_last4: null,
          app_api_secret_status: 'empty' as SecretStatus,
          webhook_secret: null,
          webhook_secret_last4: null,
          webhook_secret_status: 'empty' as SecretStatus,
          webhook_url: null,
          provisioning_status: 'idle',
          provisioning_step: null,
          provisioning_step_details: null,
          provisioning_error: null,
          provisioning_attempt_count: 0,
          last_http_status: null,
          last_http_body: null,
          app_rights_check_status: null,
          last_ttn_correlation_id: null,
          last_ttn_error_name: null,
          credentials_last_rotated_at: null,
        };
      }

      const salt = process.env.TTN_ENCRYPTION_SALT || 'default-salt';

      // Helper to safely decrypt with status tracking
      const safeDecrypt = (
        encrypted: string | null,
      ): { value: string | null; status: SecretStatus } => {
        if (!encrypted) return { value: null, status: 'empty' };
        try {
          const decrypted = TtnCrypto.deobfuscateKey(encrypted, salt);
          return { value: decrypted, status: 'decrypted' };
        } catch (err) {
          console.error('[getCredentials] Decryption failed:', err);
          return { value: null, status: 'failed' };
        }
      };

      // Decrypt secrets
      const orgApiResult = safeDecrypt(conn.ttnOrgApiKeyEncrypted);
      const appApiResult = safeDecrypt(conn.ttnApiKeyEncrypted);
      const webhookResult = safeDecrypt(conn.ttnWebhookSecretEncrypted);

      // Map legacy status values
      let provisioningStatus = conn.provisioningStatus ?? 'idle';
      if (provisioningStatus === 'not_started') provisioningStatus = 'idle';
      if (provisioningStatus === 'completed') provisioningStatus = 'ready';

      // Parse step details JSON
      let stepDetails: Record<string, unknown> | null = null;
      if (conn.provisioningStepDetails) {
        try {
          stepDetails = JSON.parse(conn.provisioningStepDetails);
        } catch {
          stepDetails = null;
        }
      }

      return {
        organization_name: org?.name ?? 'Unknown',
        organization_id: input.organizationId,
        ttn_application_id: conn.ttnApplicationId ?? conn.applicationId ?? null,
        ttn_region: conn.ttnRegion ?? null,
        org_api_secret: orgApiResult.value,
        org_api_secret_last4: conn.ttnOrgApiKeyLast4 ?? null,
        org_api_secret_status: orgApiResult.status,
        app_api_secret: appApiResult.value,
        app_api_secret_last4: conn.ttnApiKeyLast4 ?? null,
        app_api_secret_status: appApiResult.status,
        webhook_secret: webhookResult.value,
        webhook_secret_last4: conn.ttnWebhookSecretLast4 ?? null,
        webhook_secret_status: webhookResult.status,
        webhook_url: conn.ttnWebhookUrl ?? null,
        provisioning_status: provisioningStatus,
        provisioning_step: conn.provisioningStep ?? null,
        provisioning_step_details: stepDetails,
        provisioning_error: conn.provisioningError ?? null,
        provisioning_attempt_count: conn.provisioningAttemptCount ?? 0,
        last_http_status: conn.lastHttpStatus ?? null,
        last_http_body: conn.lastHttpBody ?? null,
        app_rights_check_status: conn.appRightsCheckStatus ?? null,
        last_ttn_correlation_id: conn.lastTtnCorrelationId ?? null,
        last_ttn_error_name: conn.lastTtnErrorName ?? null,
        credentials_last_rotated_at: conn.credentialsLastRotatedAt?.toISOString() ?? null,
      };
    }),

  /**
   * Get TTN provisioning status
   * Equivalent to: status action in ttn-provision-org edge function
   *
   * Returns current provisioning state without sensitive credentials.
   */
  getStatus: orgProcedure
    .input(OrgInput)
    .output(TTNStatusResponseSchema)
    .query(async ({ input }) => {
      const conn = await db.query.ttnConnections.findFirst({
        where: eq(ttnConnections.organizationId, input.organizationId),
        columns: {
          provisioningStatus: true,
          provisioningStep: true,
          provisioningStepDetails: true,
          provisioningError: true,
          provisioningAttemptCount: true,
        },
      });

      if (!conn) {
        return {
          provisioning_status: 'idle',
          provisioning_step: null,
          provisioning_step_details: null,
          provisioning_error: null,
          provisioning_attempt_count: 0,
        };
      }

      // Map legacy status values
      let provisioningStatus = conn.provisioningStatus ?? 'idle';
      if (provisioningStatus === 'not_started') provisioningStatus = 'idle';
      if (provisioningStatus === 'completed') provisioningStatus = 'ready';

      // Parse step details JSON
      let stepDetails: Record<string, unknown> | null = null;
      if (conn.provisioningStepDetails) {
        try {
          stepDetails = JSON.parse(conn.provisioningStepDetails);
        } catch {
          stepDetails = null;
        }
      }

      return {
        provisioning_status: provisioningStatus,
        provisioning_step: conn.provisioningStep ?? null,
        provisioning_step_details: stepDetails,
        provisioning_error: conn.provisioningError ?? null,
        provisioning_attempt_count: conn.provisioningAttemptCount ?? 0,
      };
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
   * Validate API Key without saving
   */
  validateApiKey: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        apiKey: z.string(),
        applicationId: z.string(),
        cluster: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await TtnProvisioningService.validateConfiguration(
        input.apiKey,
        input.applicationId,
        input.cluster,
      );

      return {
        ok: result.valid,
        valid: result.valid,
        error: result.error ? { message: result.error, code: 'VALIDATION_FAILED' } : undefined,
        permissions: result.permissions,
        // Mock request_id for compatibility with frontend expectations
        request_id: crypto.randomUUID(),
      };
    }),

  /**
   * Bootstrap configuration (save key & configure webhook)
   */
  saveAndConfigure: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        apiKey: z.string(),
        applicationId: z.string(),
        cluster: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Admin/owner check
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can configure TTN',
        });
      }

      const result = await TtnProvisioningService.provisionOrganization(
        input.organizationId,
        input.apiKey,
        input.applicationId,
        input.cluster,
      );
      return { ok: result.success, ...result };
    }),

  /**
   * Update Webhook definition
   */
  updateWebhook: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        url: z.string().url(),
        events: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can configure webhooks',
        });
      }
      const result = await TtnWebhookService.updateWebhook(
        input.organizationId,
        input.url,
        input.events,
      );
      return { ok: result.ok };
    }),

  /**
   * Regenerate webhook secret
   */
  regenerateWebhookSecret: orgProcedure
    .input(OrgInput)
    .output(z.object({ ok: z.boolean(), secretLast4: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can regenerate webhook secrets',
        });
      }
      const result = await TtnWebhookService.regenerateWebhookSecret(input.organizationId);
      return result;
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

      // Execute real connection test
      const testResult = await TtnSettingsService.testConnection(
        input.organizationId,
        input.deviceId,
      );

      // Update last test result in database
      await ttnSettingsService.updateTestResult(input.organizationId, testResult);

      return testResult;
    }),

  /**
   * Retry failed provisioning
   * Equivalent to: retry action in ttn-provision-org edge function
   *
   * Only available when provisioning_status is 'failed'.
   * Returns use_start_fresh=true if the application is unowned.
   */
  provision: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        action: z.enum(['retry']),
      }),
    )
    .output(ProvisionResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Admin/owner only
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can retry provisioning',
        });
      }

      const result = await TtnProvisioningService.retryProvisioning(input.organizationId);

      return result;
    }),

  /**
   * Start fresh - deprovision and prepare for re-provisioning
   * Equivalent to: start_fresh action in ttn-provision-org edge function
   *
   * Deletes existing TTN application and clears all credentials.
   * After this, use the provisioning wizard to set up a new TTN application.
   */
  startFresh: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        region: z.string().default('nam1'),
      }),
    )
    .output(StartFreshResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Admin/owner only
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can start fresh provisioning',
        });
      }

      const result = await TtnProvisioningService.startFresh(input.organizationId, input.region);

      return result;
    }),

  /**
   * Deep clean - delete ALL TTN resources
   * Equivalent to: deep_clean action in ttn-provision-org edge function
   *
   * This is the nuclear option. Deletes:
   * - All devices from TTN application
   * - The TTN application itself
   * - Clears all credentials in database
   *
   * Use this when provisioning is stuck or corrupted.
   */
  deepClean: orgProcedure
    .input(OrgInput)
    .output(DeepCleanResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Admin/owner only
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can perform deep clean',
        });
      }

      const result = await TtnProvisioningService.deepClean(input.organizationId);

      return result;
    }),

  /**
   * List TTN provisioning logs
   * Returns recent provisioning activity for the organization
   */
  listProvisioningLogs: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }),
    )
    .output(
      z.array(
        z.object({
          id: z.string().uuid(),
          createdAt: z.date(),
          step: z.string(),
          status: z.string(),
          message: z.string().nullable(),
          payload: z.record(z.string(), z.unknown()).nullable(),
          durationMs: z.number().nullable(),
          requestId: z.string().nullable(),
          ttnHttpStatus: z.number().nullable(),
          ttnResponseBody: z.string().nullable(),
          errorCategory: z.string().nullable(),
          ttnEndpoint: z.string().nullable(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      // Query ttn_provisioning_logs table directly via raw SQL
      const logs = await db.execute(sql`
				SELECT
					id,
					created_at,
					step,
					status,
					message,
					payload,
					duration_ms,
					request_id,
					ttn_http_status,
					ttn_response_body,
					error_category,
					ttn_endpoint
				FROM ttn_provisioning_logs
				WHERE organization_id = ${ctx.user.organizationId}
				ORDER BY created_at DESC
				LIMIT ${input.limit}
			`);

      return logs.rows.map((log: any) => ({
        id: log.id,
        createdAt: new Date(log.created_at),
        step: log.step,
        status: log.status,
        message: log.message,
        payload: log.payload,
        durationMs: log.duration_ms ? Number(log.duration_ms) : null,
        requestId: log.request_id,
        ttnHttpStatus: log.ttn_http_status ? Number(log.ttn_http_status) : null,
        ttnResponseBody: log.ttn_response_body,
        errorCategory: log.error_category,
        ttnEndpoint: log.ttn_endpoint,
      }));
    }),
});
