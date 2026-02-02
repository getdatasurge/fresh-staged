/**
 * Telnyx tRPC Router
 *
 * Provides procedures for Telnyx SMS configuration:
 * - verificationStatus: Get toll-free verification status
 * - configureWebhook: Configure Telnyx webhook endpoint
 * - verifyPublicAsset: Verify a public URL is accessible (for opt-in images)
 */

import { Telnyx } from 'telnyx';
import type { TfVerificationStatus } from 'telnyx/resources/messaging-tollfree/verification/requests.js';
import { z } from 'zod';
import { router, publicProcedure } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ service: 'telnyx-router' });

/**
 * Create a Telnyx client if API key is configured
 * Returns null if TELNYX_API_KEY is not set
 */
function getTelnyxClient(): Telnyx | null {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) return null;
  return new Telnyx({ apiKey, maxRetries: 0, timeout: 30000 });
}

/**
 * Map Telnyx verification status to our simplified enum
 */
function mapVerificationStatus(
  telnyxStatus: TfVerificationStatus | undefined,
): 'approved' | 'pending' | 'rejected' | 'unknown' {
  if (!telnyxStatus) return 'unknown';
  // Telnyx statuses: 'Verified' | 'Rejected' | 'Waiting For Vendor' | 'Waiting For Customer' | 'Waiting For Telnyx' | 'In Progress'
  switch (telnyxStatus) {
    case 'Verified':
      return 'approved';
    case 'Rejected':
      return 'rejected';
    case 'Waiting For Vendor':
    case 'Waiting For Customer':
    case 'Waiting For Telnyx':
    case 'In Progress':
      return 'pending';
    default:
      return 'unknown';
  }
}

export const telnyxRouter = router({
  /**
   * Get toll-free verification status
   * Equivalent to: telnyx-verification-status edge function
   *
   * Returns current toll-free number verification status from Telnyx API.
   */
  verificationStatus: publicProcedure
    .output(
      z.object({
        status: z.enum(['approved', 'pending', 'rejected', 'unknown']),
        verificationId: z.string().nullable(),
        phoneNumber: z.string().nullable(),
        details: z.string().nullable(),
        lastChecked: z.string().nullable(),
      }),
    )
    .query(async () => {
      const client = getTelnyxClient();
      if (!client) {
        return {
          status: 'unknown' as const,
          verificationId: null,
          phoneNumber: null,
          details: 'Telnyx API key not configured',
          lastChecked: new Date().toISOString(),
        };
      }

      const phoneNumber = process.env.TELNYX_PHONE_NUMBER;
      if (!phoneNumber) {
        return {
          status: 'unknown' as const,
          verificationId: null,
          phoneNumber: null,
          details: 'Telnyx phone number not configured',
          lastChecked: new Date().toISOString(),
        };
      }

      try {
        // List toll-free verifications filtered by phone number
        const response = await client.messagingTollfree.verification.requests.list({
          phone_number: phoneNumber,
          page: 1,
          page_size: 1,
        });

        // Get the first (most recent) verification for this phone number
        const verifications: Array<{
          id?: string;
          verificationStatus?: TfVerificationStatus;
          phoneNumbers?: Array<{ phoneNumber: string }>;
          reason?: string;
        }> = [];
        for await (const v of response) {
          verifications.push(v);
          break; // Only need the first one
        }

        const verification = verifications[0];
        if (!verification) {
          return {
            status: 'unknown' as const,
            verificationId: null,
            phoneNumber,
            details: 'No verification found for this number',
            lastChecked: new Date().toISOString(),
          };
        }

        return {
          status: mapVerificationStatus(verification.verificationStatus),
          verificationId: verification.id || null,
          phoneNumber: verification.phoneNumbers?.[0]?.phoneNumber || phoneNumber,
          details: verification.reason || null,
          lastChecked: new Date().toISOString(),
        };
      } catch (error) {
        log.error({ err: error }, 'Verification status API error');
        return {
          status: 'unknown' as const,
          verificationId: null,
          phoneNumber,
          details: error instanceof Error ? error.message : 'Failed to fetch verification status',
          lastChecked: new Date().toISOString(),
        };
      }
    }),

  /**
   * Configure Telnyx webhook endpoint
   * Equivalent to: telnyx-configure-webhook edge function
   *
   * Sets up or updates the webhook URL in Telnyx for SMS delivery notifications.
   */
  configureWebhook: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        webhookUrl: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx }) => {
      // Admin/owner check
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        return {
          success: false,
          error: 'Only administrators can configure webhooks',
        };
      }

      const client = getTelnyxClient();
      if (!client) {
        return {
          success: false,
          error: 'Telnyx API key not configured',
        };
      }

      const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
      if (!profileId) {
        return {
          success: false,
          error: 'Telnyx messaging profile ID not configured',
        };
      }

      try {
        // Build webhook URL from API_URL or FRONTEND_URL
        const apiUrl = process.env.API_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
        const webhookUrl = `${apiUrl}/webhooks/telnyx`;

        // Update the messaging profile with webhook URL
        await client.messagingProfiles.update(profileId, {
          webhook_url: webhookUrl,
          webhook_api_version: '2',
        });

        log.info({ webhookUrl }, 'Webhook configured');

        return {
          success: true,
          webhookUrl,
        };
      } catch (error) {
        log.error({ err: error }, 'Configure webhook API error');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to configure webhook',
        };
      }
    }),

  /**
   * Verify a public URL is accessible
   * Equivalent to: verify-public-asset edge function
   *
   * Checks if a URL is publicly accessible (for opt-in images).
   * Used to verify Telnyx toll-free verification images are reachable.
   */
  verifyPublicAsset: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
      }),
    )
    .output(
      z.object({
        accessible: z.boolean(),
        status: z.number().nullable(),
        statusText: z.string().nullable(),
        contentType: z.string().nullable(),
        contentLength: z.number().nullable(),
        isImage: z.boolean(),
        checkedAt: z.string(),
        error: z.string().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(input.url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type') || '';
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

        return {
          accessible: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType,
          contentLength,
          isImage: contentType.startsWith('image/'),
          checkedAt: new Date().toISOString(),
          error: null,
        };
      } catch (err) {
        return {
          accessible: false,
          status: null,
          statusText: null,
          contentType: null,
          contentLength: null,
          isImage: false,
          checkedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Failed to verify URL',
        };
      }
    }),
});
