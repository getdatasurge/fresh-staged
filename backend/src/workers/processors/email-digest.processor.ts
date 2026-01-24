/**
 * Email digest processor
 *
 * Processes scheduled email digest jobs by:
 * - Checking user preferences (emailEnabled, digestDaily/Weekly)
 * - Building digest data via DigestBuilderService
 * - Rendering React Email templates
 * - Sending via EmailService/Resend
 *
 * Key behaviors:
 * - Date range calculated at execution time (not scheduler creation)
 * - Empty digests are skipped without error
 * - Both emailEnabled and specific digest preference must be true
 */

import type { Job } from 'bullmq';
import { render } from '@react-email/render';
import type { EmailDigestJobData } from '../../jobs/index.js';
import { getEmailService } from '../../services/email.service.js';
import { DigestBuilderService } from '../../services/digest-builder.service.js';
import { DailyDigest } from '../../emails/daily-digest.js';
import { WeeklyDigest } from '../../emails/weekly-digest.js';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema/users.js';
import { eq } from 'drizzle-orm';
import { generateUnsubscribeToken } from '../../utils/unsubscribe-token.js';

// Singleton digest builder for reuse across jobs
const digestBuilder = new DigestBuilderService();

/**
 * Result of email digest processing
 */
export interface ProcessEmailDigestResult {
  success: boolean;
  messageId?: string;
  reason?: string;
}

/**
 * Process an email digest job
 *
 * @param job - BullMQ job containing EmailDigestJobData
 * @returns Processing result with success status and optional messageId
 */
export async function processEmailDigest(
  job: Job<EmailDigestJobData>
): Promise<ProcessEmailDigestResult> {
  const { userId, organizationId, period } = job.data;
  console.log(`[Email Digest] Processing ${period} digest for user ${userId}`);

  // Get user profile
  const [user] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!user) {
    console.warn(`[Email Digest] User ${userId} not found - skipping`);
    return { success: false, reason: 'user_not_found' };
  }

  // Check if emails enabled globally
  if (!user.emailEnabled) {
    console.log(`[Email Digest] User ${userId} has emails disabled - skipping`);
    return { success: false, reason: 'user_disabled_emails' };
  }

  // Check if specific digest type enabled
  if (period === 'daily' && !user.digestDaily) {
    console.log(`[Email Digest] User ${userId} has daily digest disabled - skipping`);
    return { success: false, reason: 'daily_digest_disabled' };
  }
  if (period === 'weekly' && !user.digestWeekly) {
    console.log(`[Email Digest] User ${userId} has weekly digest disabled - skipping`);
    return { success: false, reason: 'weekly_digest_disabled' };
  }

  // Calculate date range at execution time
  const endDate = new Date();
  const startDate = new Date();
  if (period === 'daily') {
    startDate.setDate(startDate.getDate() - 1);
  } else {
    startDate.setDate(startDate.getDate() - 7);
  }

  // Parse site IDs from user preferences (stored as JSON text)
  let siteIds: string[] | null = null;
  if (user.digestSiteIds) {
    try {
      siteIds = JSON.parse(user.digestSiteIds);
    } catch {
      console.warn(`[Email Digest] Failed to parse digestSiteIds for user ${userId}`);
    }
  }

  // Build grouped digest data with site filtering
  const digestData = await digestBuilder.buildGroupedDigestData(
    userId,
    organizationId,
    period,
    startDate,
    endDate,
    siteIds
  );

  // Skip if no alerts (don't send empty digests)
  if (digestData.sites.length === 0) {
    console.log(`[Email Digest] No alerts for user ${userId} in period - skipping send`);
    return { success: true, reason: 'no_content' };
  }

  // Build URLs for email links
  const baseUrl = process.env.APP_URL || 'https://app.freshtrack.app';
  const dashboardUrl = `${baseUrl}/alerts`;

  // Generate secure unsubscribe URL with JWT token
  const unsubscribeToken = await generateUnsubscribeToken(userId, period);
  const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}`;

  // Render appropriate template
  const Template = period === 'daily' ? DailyDigest : WeeklyDigest;
  const templateProps = {
    userName: user.fullName || 'User',
    digest: digestData,
    unsubscribeUrl,
    dashboardUrl,
  };

  // Render HTML and plain text versions
  const html = await render(Template(templateProps));
  const text = await render(Template(templateProps), { plainText: true });

  // Get EmailService
  const emailService = getEmailService();
  if (!emailService || !emailService.isEnabled()) {
    console.warn('[Email Digest] EmailService not available - skipping send');
    return { success: false, reason: 'email_service_disabled' };
  }

  // Send via EmailService with both HTML and plain text
  const result = await emailService.sendDigest({
    to: user.email,
    subject: `Your ${period} alert digest - ${digestData.summary.total} alert${digestData.summary.total !== 1 ? 's' : ''}`,
    html,
    text,
  });

  if (!result) {
    return { success: false, reason: 'email_service_returned_null' };
  }

  console.log(
    `[Email Digest] Sent ${period} digest to ${user.email} - messageId: ${result.messageId}`
  );
  return { success: true, messageId: result.messageId };
}
