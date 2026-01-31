import { z } from 'zod';

// --- Telnyx Webhook Event Types ---

/**
 * Telnyx message event types we handle
 *
 * Reference: https://developers.telnyx.com/docs/messaging/getting-started-with-messaging#message-webhooks
 */
export const TelnyxEventTypeSchema = z.enum([
  'message.sent',
  'message.delivered',
  'message.failed',
]);

export type TelnyxEventType = z.infer<typeof TelnyxEventTypeSchema>;

// --- Payload Schemas ---

/**
 * Common message payload fields from Telnyx
 */
export const TelnyxMessagePayloadSchema = z.object({
  /** Unique message identifier (matches externalId in notification_deliveries) */
  id: z.string(),
  /** Message direction (always 'outbound' for our use case) */
  direction: z.enum(['outbound', 'inbound']).optional(),
  /** From phone number in E.164 format */
  from: z
    .object({
      phone_number: z.string(),
      carrier: z.string().optional(),
    })
    .optional(),
  /** To phone number in E.164 format */
  to: z
    .array(
      z.object({
        phone_number: z.string(),
        status: z.string().optional(),
        carrier: z.string().optional(),
      }),
    )
    .optional(),
  /** Message type (SMS, MMS) */
  type: z.string().optional(),
  /** Message text (for inbound) */
  text: z.string().optional(),
  /** Error codes if failed */
  errors: z
    .array(
      z.object({
        code: z.string(),
        title: z.string(),
        detail: z.string().optional(),
      }),
    )
    .optional(),
  /** Timestamp when message was completed */
  completed_at: z.string().optional(),
  /** Timestamp when message was sent */
  sent_at: z.string().optional(),
  /** Timestamp when message was received/delivered */
  received_at: z.string().optional(),
});

export type TelnyxMessagePayload = z.infer<typeof TelnyxMessagePayloadSchema>;

/**
 * Telnyx webhook event structure
 */
export const TelnyxWebhookEventSchema = z.object({
  data: z.object({
    /** Event type (e.g., message.sent, message.delivered, message.failed) */
    event_type: z.string(),
    /** Unique event ID */
    id: z.string(),
    /** Timestamp of the event */
    occurred_at: z.string(),
    /** Event record type */
    record_type: z.literal('event').optional(),
    /** The message payload */
    payload: TelnyxMessagePayloadSchema,
  }),
  meta: z
    .object({
      /** Attempt number for webhook delivery */
      attempt: z.number().optional(),
      /** Timestamp of webhook delivery attempt */
      delivered_to: z.string().optional(),
    })
    .optional(),
});

export type TelnyxWebhookEvent = z.infer<typeof TelnyxWebhookEventSchema>;

// --- Response Schemas ---

/**
 * Webhook acknowledgment response
 */
export const TelnyxWebhookResponseSchema = z.object({
  received: z.boolean(),
});

export type TelnyxWebhookResponse = z.infer<typeof TelnyxWebhookResponseSchema>;

// --- Type Exports ---

export type TelnyxDeliveryStatus = 'sent' | 'delivered' | 'failed';

/**
 * Map Telnyx event type to notification delivery status
 */
export function mapEventTypeToStatus(eventType: string): TelnyxDeliveryStatus | null {
  switch (eventType) {
    case 'message.sent':
      return 'sent';
    case 'message.delivered':
      return 'delivered';
    case 'message.failed':
      return 'failed';
    default:
      return null;
  }
}
