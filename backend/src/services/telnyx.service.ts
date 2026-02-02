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
import { logger } from '../utils/logger.js';

const log = logger.child({ service: 'telnyx-service' });

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
 * - Graceful handling when not configured
 */
export class TelnyxService {
  private client: Telnyx | null = null;
  private enabled = false;

  /**
   * Initialize TelnyxService with environment configuration
   *
   * Configuration:
   * - TELNYX_API_KEY: Required API key for authentication
   * - TELNYX_PHONE_NUMBER: Required source phone number
   * - TELNYX_MESSAGING_PROFILE_ID: Optional messaging profile
   *
   * If TELNYX_API_KEY is not configured, service operates in disabled mode
   * and logs a warning. This allows API startup without SMS functionality.
   */
  constructor() {
    const apiKey = process.env.TELNYX_API_KEY;

    if (!apiKey) {
      log.warn(
        'TELNYX_API_KEY not configured - SMS sending disabled. Set environment variable for SMS functionality.',
      );
      this.enabled = false;
      return;
    }

    // Initialize Telnyx SDK
    // maxRetries: 0 - we handle retries via BullMQ
    // timeout: 30s - reasonable timeout for SMS send
    this.client = new Telnyx({
      apiKey,
      maxRetries: 0,
      timeout: 30000,
    });
    this.enabled = true;
  }

  /**
   * Check if TelnyxService is enabled and configured
   *
   * @returns true if TELNYX_API_KEY is configured and service is ready
   */
  isEnabled(): boolean {
    return this.enabled;
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
    // Check if service is enabled
    if (!this.enabled || !this.client) {
      throw new Error(
        '[TelnyxService] Service not configured - set TELNYX_API_KEY environment variable',
      );
    }

    const { to, message, messagingProfileId } = params;

    const fromNumber = process.env.TELNYX_PHONE_NUMBER;
    if (!fromNumber) {
      throw new Error(
        '[TelnyxService] TELNYX_PHONE_NUMBER not configured. ' +
          'Set environment variable with source phone number.',
      );
    }

    const profileId = messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID;

    log.info({ from: `${fromNumber.slice(0, 5)}***`, to: `${to.slice(0, 5)}***` }, 'Sending SMS');

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

    log.info({ messageId, status }, 'SMS sent successfully');

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
