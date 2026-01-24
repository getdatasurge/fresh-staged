/**
 * TelnyxService for SMS delivery via Telnyx API
 *
 * Wraps the Telnyx SDK with a typed interface for SMS sending.
 * Handles environment configuration and response parsing.
 *
 * Features:
 * - Environment-based configuration (TELNYX_API_KEY, TELNYX_PHONE_NUMBER)
 * - Typed SMS send method with messageId/status response
 * - Singleton pattern for shared instance
 * - No internal retries (BullMQ handles retries)
 *
 * Usage:
 * ```typescript
 * const telnyxService = getTelnyxService();
 * if (telnyxService) {
 *   const result = await telnyxService.sendSms({
 *     to: '+15551234567',
 *     message: 'Temperature alert!',
 *   });
 *   console.log('Sent:', result.messageId);
 * }
 * ```
 */

import { Telnyx } from 'telnyx';

/**
 * Parameters for sending an SMS
 */
export interface SendSmsParams {
  /** Destination phone number in E.164 format */
  to: string;
  /** Message text content */
  message: string;
  /** Optional messaging profile ID override */
  messagingProfileId?: string;
}

/**
 * Result of sending an SMS
 */
export interface SendSmsResult {
  /** Telnyx message ID for tracking */
  messageId: string;
  /** Current message status (typically 'queued' on send) */
  status: string;
}

/**
 * TelnyxService class for SMS delivery
 *
 * Handles:
 * - Telnyx SDK initialization with API key
 * - SMS sending with typed parameters
 * - Response parsing for message ID and status
 */
export class TelnyxService {
  private client: Telnyx;

  /**
   * Initialize TelnyxService with environment configuration
   *
   * Configuration:
   * - TELNYX_API_KEY: Required API key for authentication
   * - TELNYX_PHONE_NUMBER: Required source phone number
   * - TELNYX_MESSAGING_PROFILE_ID: Optional messaging profile
   *
   * @throws Error if TELNYX_API_KEY is not configured
   */
  constructor() {
    const apiKey = process.env.TELNYX_API_KEY;

    if (!apiKey) {
      throw new Error(
        '[TelnyxService] TELNYX_API_KEY not configured. ' +
        'Set environment variable for SMS functionality.'
      );
    }

    // Initialize Telnyx SDK
    // maxRetries: 0 - we handle retries via BullMQ
    // timeout: 30s - reasonable timeout for SMS send
    this.client = new Telnyx({
      apiKey,
      maxRetries: 0,
      timeout: 30000,
    });
  }

  /**
   * Send an SMS message via Telnyx
   *
   * @param params - SMS parameters (to, message, optional messagingProfileId)
   * @returns Promise with messageId and status
   * @throws Error on API failure (caller should handle for retry logic)
   *
   * @example
   * const result = await telnyxService.sendSms({
   *   to: '+15551234567',
   *   message: 'Temperature exceeded threshold!',
   * });
   * console.log('Sent:', result.messageId, 'Status:', result.status);
   */
  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    const { to, message, messagingProfileId } = params;

    const fromNumber = process.env.TELNYX_PHONE_NUMBER;
    if (!fromNumber) {
      throw new Error(
        '[TelnyxService] TELNYX_PHONE_NUMBER not configured. ' +
        'Set environment variable with source phone number.'
      );
    }

    const profileId = messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID;

    console.log(
      `[TelnyxService] Sending SMS from ${fromNumber.slice(0, 5)}*** ` +
      `to ${to.slice(0, 5)}***`
    );

    // Build request payload
    const payload: {
      from: string;
      to: string;
      text: string;
      messaging_profile_id?: string;
    } = {
      from: fromNumber,
      to,
      text: message,
    };

    if (profileId) {
      payload.messaging_profile_id = profileId;
    }

    // Send via Telnyx SDK
    const response = await this.client.messages.send(payload);

    // Extract message ID and status from response
    // Response structure: { data: { id, to: [{ status }], ... } }
    const data = response.data;
    const messageId = data?.id || '';

    // Status is in the 'to' array for each recipient
    const status = data?.to?.[0]?.status || 'queued';

    console.log(
      `[TelnyxService] SMS sent successfully. ` +
      `MessageId: ${messageId}, Status: ${status}`
    );

    return {
      messageId,
      status,
    };
  }
}

/**
 * Singleton TelnyxService instance
 * Set during application initialization
 */
let instance: TelnyxService | null = null;

/**
 * Set the singleton TelnyxService instance
 *
 * @param service - TelnyxService instance to set as singleton
 */
export function setTelnyxService(service: TelnyxService): void {
  instance = service;
}

/**
 * Get the singleton TelnyxService instance
 *
 * @returns TelnyxService instance or null if not initialized
 */
export function getTelnyxService(): TelnyxService | null {
  return instance;
}
