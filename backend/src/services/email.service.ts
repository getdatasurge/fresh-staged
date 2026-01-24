/**
 * EmailService for digest email delivery via Resend API
 *
 * Wraps the Resend SDK with a typed interface for digest email sending.
 * Handles environment configuration and response parsing.
 *
 * Features:
 * - Environment-based configuration (RESEND_API_KEY, EMAIL_FROM_ADDRESS)
 * - Typed sendDigest method with messageId response
 * - Singleton pattern for shared instance
 * - Graceful fallback when not configured (disabled mode)
 * - No internal retries (BullMQ handles retries)
 *
 * Usage:
 * ```typescript
 * const emailService = getEmailService();
 * if (emailService?.isEnabled()) {
 *   const result = await emailService.sendDigest({
 *     to: 'user@example.com',
 *     subject: 'Daily Temperature Digest',
 *     html: '<html>...</html>',
 *   });
 *   console.log('Sent:', result?.messageId);
 * }
 * ```
 */

import { Resend } from 'resend';

/**
 * Parameters for sending a digest email
 */
export interface SendDigestParams {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** HTML email body content */
  html: string;
  /** Plain text email body (optional, recommended for deliverability) */
  text?: string;
}

/**
 * Result of sending a digest email
 */
export interface SendDigestResult {
  /** Resend message ID for tracking */
  messageId: string;
}

/**
 * EmailService class for digest email delivery
 *
 * Handles:
 * - Resend SDK initialization with API key
 * - Email sending with typed parameters
 * - Response parsing for message ID
 * - Graceful handling when not configured
 */
export class EmailService {
  private client: Resend | null = null;
  private enabled = false;
  private fromAddress: string;

  /**
   * Initialize EmailService with environment configuration
   *
   * Configuration:
   * - RESEND_API_KEY: Required API key for authentication
   * - EMAIL_FROM_ADDRESS: Optional sender email (default: 'noreply@freshtrack.app')
   *
   * If RESEND_API_KEY is not configured, service operates in disabled mode
   * and logs a warning. This allows API startup without email functionality.
   */
  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@freshtrack.app';

    if (!apiKey) {
      console.warn(
        '[EmailService] RESEND_API_KEY not configured - email sending disabled. ' +
        'Set environment variable for email functionality.'
      );
      this.enabled = false;
      return;
    }

    // Initialize Resend SDK
    this.client = new Resend(apiKey);
    this.enabled = true;
  }

  /**
   * Check if EmailService is enabled and configured
   *
   * @returns true if RESEND_API_KEY is configured and service is ready
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send a digest email via Resend
   *
   * @param params - Email parameters (to, subject, html)
   * @returns Promise with messageId, or null if service is disabled
   * @throws Error on API failure (caller should handle for retry logic)
   *
   * @example
   * const result = await emailService.sendDigest({
   *   to: 'user@example.com',
   *   subject: 'Daily Digest: 3 Alerts',
   *   html: '<html><body>...</body></html>',
   * });
   * if (result) {
   *   console.log('Sent:', result.messageId);
   * }
   */
  async sendDigest(params: SendDigestParams): Promise<SendDigestResult | null> {
    // Check if service is enabled
    if (!this.enabled || !this.client) {
      console.warn(
        '[EmailService] Service not configured - skipping email send. ' +
        'Set RESEND_API_KEY environment variable to enable.'
      );
      return null;
    }

    const { to, subject, html, text } = params;

    console.log(
      `[EmailService] Sending digest email from ${this.fromAddress} to ${to}`
    );

    // Send via Resend SDK
    const { data, error } = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
      text, // Include plain text version if provided
      tags: [
        {
          name: 'type',
          value: 'digest',
        },
      ],
    });

    if (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw new Error(`[EmailService] Resend API error: ${error.message}`);
    }

    if (!data?.id) {
      throw new Error('[EmailService] No message ID returned from Resend API');
    }

    console.log(
      `[EmailService] Email sent successfully. MessageId: ${data.id}`
    );

    return {
      messageId: data.id,
    };
  }
}

/**
 * Singleton EmailService instance
 * Set during application initialization
 */
let instance: EmailService | null = null;

/**
 * Set the singleton EmailService instance
 *
 * @param service - EmailService instance to set as singleton
 */
export function setEmailService(service: EmailService): void {
  instance = service;
}

/**
 * Get the singleton EmailService instance
 *
 * @returns EmailService instance or null if not initialized
 */
export function getEmailService(): EmailService | null {
  return instance;
}
