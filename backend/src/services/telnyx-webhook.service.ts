/**
 * TelnyxWebhookService - Handle SMS delivery status webhooks from Telnyx
 *
 * Processes delivery receipt events (DLRs) to update notification delivery status.
 *
 * Handled Events:
 * - message.sent: Message accepted by carrier network
 * - message.delivered: Message successfully delivered to recipient
 * - message.failed: Message delivery failed (permanent or temporary)
 *
 * Usage:
 * ```typescript
 * import { handleTelnyxWebhookEvent } from './telnyx-webhook.service.js';
 *
 * const event = JSON.parse(request.body);
 * await handleTelnyxWebhookEvent(event);
 * ```
 */

import { db } from '../db/client.js';
import { notificationDeliveries } from '../db/schema/notifications.js';
import { eq } from 'drizzle-orm';
import {
  type TelnyxWebhookEvent,
  type TelnyxDeliveryStatus,
  mapEventTypeToStatus,
} from '../schemas/telnyx-webhooks.js';
import { extractErrorCode, categorizeError } from '../config/telnyx.config.js';

/**
 * Custom error class for Telnyx webhook processing errors
 */
export class TelnyxWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelnyxWebhookError';
  }
}

/**
 * Result of processing a webhook event
 */
export interface WebhookProcessResult {
  /** Message ID from the event */
  messageId: string;
  /** Event type processed */
  eventType: string;
  /** Whether the delivery record was updated */
  updated: boolean;
  /** Reason if not updated */
  reason?: string;
}

/**
 * Handle message.sent event
 *
 * Updates delivery status to 'sent' with timestamp
 */
export async function handleMessageSent(
  messageId: string,
  sentAt?: string,
): Promise<WebhookProcessResult> {
  const timestamp = sentAt ? new Date(sentAt) : new Date();

  const result = await db
    .update(notificationDeliveries)
    .set({
      status: 'sent',
      sentAt: timestamp,
    })
    .where(eq(notificationDeliveries.externalId, messageId))
    .returning({ id: notificationDeliveries.id });

  if (result.length === 0) {
    console.log(`[TelnyxWebhook] No delivery found for messageId: ${messageId}`);
    return {
      messageId,
      eventType: 'message.sent',
      updated: false,
      reason: 'Delivery record not found',
    };
  }

  console.log(
    `[TelnyxWebhook] Updated delivery ${result[0].id} to 'sent' for messageId: ${messageId}`,
  );

  return {
    messageId,
    eventType: 'message.sent',
    updated: true,
  };
}

/**
 * Handle message.delivered event
 *
 * Updates delivery status to 'delivered' with timestamp
 */
export async function handleMessageDelivered(
  messageId: string,
  deliveredAt?: string,
): Promise<WebhookProcessResult> {
  const timestamp = deliveredAt ? new Date(deliveredAt) : new Date();

  const result = await db
    .update(notificationDeliveries)
    .set({
      status: 'delivered',
      deliveredAt: timestamp,
    })
    .where(eq(notificationDeliveries.externalId, messageId))
    .returning({ id: notificationDeliveries.id });

  if (result.length === 0) {
    console.log(`[TelnyxWebhook] No delivery found for messageId: ${messageId}`);
    return {
      messageId,
      eventType: 'message.delivered',
      updated: false,
      reason: 'Delivery record not found',
    };
  }

  console.log(
    `[TelnyxWebhook] Updated delivery ${result[0].id} to 'delivered' for messageId: ${messageId}`,
  );

  return {
    messageId,
    eventType: 'message.delivered',
    updated: true,
  };
}

/**
 * Handle message.failed event
 *
 * Updates delivery status to 'failed' with error details
 */
export async function handleMessageFailed(
  messageId: string,
  errors?: Array<{ code: string; title: string; detail?: string }>,
): Promise<WebhookProcessResult> {
  const timestamp = new Date();

  // Build error message from errors array
  let errorMessage = 'Message delivery failed';
  if (errors && errors.length > 0) {
    const firstError = errors[0];
    errorMessage = `[${firstError.code}] ${firstError.title}`;
    if (firstError.detail) {
      errorMessage += `: ${firstError.detail}`;
    }
  }

  const result = await db
    .update(notificationDeliveries)
    .set({
      status: 'failed',
      failedAt: timestamp,
      errorMessage,
    })
    .where(eq(notificationDeliveries.externalId, messageId))
    .returning({ id: notificationDeliveries.id });

  if (result.length === 0) {
    console.log(`[TelnyxWebhook] No delivery found for messageId: ${messageId}`);
    return {
      messageId,
      eventType: 'message.failed',
      updated: false,
      reason: 'Delivery record not found',
    };
  }

  // Log error category for monitoring
  if (errors && errors.length > 0) {
    const errorCode = errors[0].code;
    const category = categorizeError(errorCode);
    console.log(
      `[TelnyxWebhook] Delivery ${result[0].id} failed - ` +
        `Code: ${errorCode}, Category: ${category}, Message: ${errorMessage}`,
    );
  } else {
    console.log(
      `[TelnyxWebhook] Updated delivery ${result[0].id} to 'failed' for messageId: ${messageId}`,
    );
  }

  return {
    messageId,
    eventType: 'message.failed',
    updated: true,
  };
}

/**
 * Main webhook event handler
 *
 * Routes Telnyx events to appropriate handlers
 *
 * @param event - Parsed Telnyx webhook event
 * @returns Processing result
 * @throws TelnyxWebhookError on invalid events
 */
export async function handleTelnyxWebhookEvent(
  event: TelnyxWebhookEvent,
): Promise<WebhookProcessResult> {
  const eventType = event.data.event_type;
  const messageId = event.data.payload.id;

  if (!messageId) {
    throw new TelnyxWebhookError('Missing message ID in webhook payload');
  }

  console.log(`[TelnyxWebhook] Processing event: ${eventType} for messageId: ${messageId}`);

  switch (eventType) {
    case 'message.sent': {
      const sentAt = event.data.payload.sent_at || event.data.occurred_at;
      return handleMessageSent(messageId, sentAt);
    }

    case 'message.delivered': {
      const deliveredAt =
        event.data.payload.completed_at || event.data.payload.received_at || event.data.occurred_at;
      return handleMessageDelivered(messageId, deliveredAt);
    }

    case 'message.failed': {
      return handleMessageFailed(messageId, event.data.payload.errors);
    }

    default:
      // Unhandled event type - log and acknowledge
      console.log(`[TelnyxWebhook] Unhandled event type: ${eventType}`);
      return {
        messageId,
        eventType,
        updated: false,
        reason: 'Unhandled event type',
      };
  }
}
