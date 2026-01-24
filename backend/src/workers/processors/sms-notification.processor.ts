/**
 * SMS notification processor
 *
 * Sends SMS notifications via Telnyx with proper error handling:
 * - Unrecoverable errors (opted-out, invalid number) skip retries
 * - Retryable errors trigger BullMQ exponential backoff
 * - Updates notification_deliveries record on completion/failure
 */

import { Job, UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { SmsNotificationJobData } from '../../jobs/index.js';
import { getTelnyxService } from '../../services/telnyx.service.js';
import {
  categorizeError,
  extractErrorCode,
  extractErrorMessage,
  validateE164,
} from '../../config/telnyx.config.js';
import { db } from '../../db/client.js';
import { notificationDeliveries } from '../../db/schema/notifications.js';

export interface SmsProcessorResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

export async function processSmsNotification(
  job: Job<SmsNotificationJobData>
): Promise<SmsProcessorResult> {
  const { phoneNumber, message, organizationId, alertId, deliveryId } = job.data;

  console.log(`[SMS Processor] Processing job ${job.id} for org ${organizationId}`);
  console.log(`[SMS Processor] Phone: ${phoneNumber.slice(0, 5)}***${phoneNumber.slice(-2)}`);
  console.log(`[SMS Processor] Attempt ${job.attemptsMade + 1}/${job.opts.attempts || 5}`);

  // Validate E.164 format before attempting send
  if (!validateE164(phoneNumber)) {
    const error = `Invalid phone number format: ${phoneNumber}. Must be E.164 format.`;
    console.error(`[SMS Processor] ${error}`);

    // Update delivery record if exists
    if (deliveryId) {
      await updateDeliveryFailed(deliveryId, error);
    }

    // Invalid format is unrecoverable
    throw new UnrecoverableError(error);
  }

  // Get TelnyxService instance
  const telnyxService = getTelnyxService();
  if (!telnyxService) {
    throw new Error('TelnyxService not initialized');
  }

  try {
    const result = await telnyxService.sendSms({
      to: phoneNumber,
      message,
    });

    console.log(`[SMS Processor] Sent message ${result.messageId} to ${phoneNumber.slice(0, 5)}***`);
    console.log(`[SMS Processor] Status: ${result.status}`);

    // Update delivery record on success
    if (deliveryId) {
      await updateDeliverySent(deliveryId, result.messageId);
    }

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error: unknown) {
    const errorCode = extractErrorCode(error);
    const errorMessage = extractErrorMessage(error);
    const category = categorizeError(errorCode);

    console.error(`[SMS Processor] Send failed: ${errorCode} - ${errorMessage}`);
    console.log(`[SMS Processor] Error category: ${category}`);

    if (category === 'unrecoverable') {
      console.log(`[SMS Processor] Permanent failure - will not retry`);

      // Update delivery record with failure
      if (deliveryId) {
        await updateDeliveryFailed(deliveryId, `${errorCode}: ${errorMessage}`);
      }

      // Throw UnrecoverableError to skip remaining retries
      throw new UnrecoverableError(
        `Permanent SMS failure: ${errorCode} - ${errorMessage}`
      );
    }

    // For retryable or unknown errors, update retry count and throw
    if (deliveryId) {
      await updateDeliveryRetry(deliveryId, job.attemptsMade + 1);
    }

    // Throw normal error to trigger BullMQ retry with backoff
    throw new Error(`SMS send failed (retryable): ${errorCode} - ${errorMessage}`);
  }
}

// Helper functions for updating notification_deliveries

async function updateDeliverySent(deliveryId: string, externalId: string): Promise<void> {
  try {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'sent',
        externalId,
        sentAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
  } catch (err) {
    console.error(`[SMS Processor] Failed to update delivery record: ${err}`);
    // Don't throw - delivery update failure shouldn't fail the job
  }
}

async function updateDeliveryFailed(deliveryId: string, errorMessage: string): Promise<void> {
  try {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'failed',
        errorMessage,
        failedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
  } catch (err) {
    console.error(`[SMS Processor] Failed to update delivery record: ${err}`);
  }
}

async function updateDeliveryRetry(deliveryId: string, retryCount: number): Promise<void> {
  try {
    await db
      .update(notificationDeliveries)
      .set({
        retryCount: String(retryCount),
        lastRetryAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
  } catch (err) {
    console.error(`[SMS Processor] Failed to update delivery record: ${err}`);
  }
}
