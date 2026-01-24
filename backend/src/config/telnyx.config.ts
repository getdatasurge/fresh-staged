/**
 * Telnyx SMS error categorization and validation helpers
 *
 * Provides:
 * - Error code categorization for retry behavior
 * - E.164 phone number validation
 * - Error extraction utilities for Telnyx SDK errors
 *
 * Error Categories:
 * - UNRECOVERABLE: Permanent failures that should NOT be retried
 *   (opted-out, invalid number, blocked, etc.)
 * - RETRYABLE: Transient failures that may succeed on retry
 *   (rate limits, temporary unavailability, etc.)
 *
 * Usage with BullMQ:
 * ```typescript
 * import { categorizeError, extractErrorCode } from './telnyx.config.js';
 * import { UnrecoverableError } from 'bullmq';
 *
 * try {
 *   await telnyxService.sendSms({ to, message });
 * } catch (error) {
 *   const code = extractErrorCode(error);
 *   if (categorizeError(code) === 'unrecoverable') {
 *     throw new UnrecoverableError(`Permanent failure: ${code}`);
 *   }
 *   throw error; // Will trigger retry
 * }
 * ```
 */

/**
 * Permanent failure error codes - do NOT retry these
 *
 * Source: Telnyx Messaging Error Codes documentation
 * https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes
 */
export const UNRECOVERABLE_CODES = new Set([
  '10001', // Inactive phone number
  '10002', // Invalid phone number
  '20012', // Account inactive
  '20013', // Account blocked
  '40001', // Not routable (landline)
  '40003', // Blocked as spam - permanent
  '40008', // Undeliverable
  '40009', // Invalid message body
  '40012', // Invalid destination number
  '40300', // Opted out (STOP)
  '40301', // Do-not-contact list
]);

/**
 * Transient failure error codes - retry with backoff
 *
 * Source: Telnyx Messaging Error Codes documentation
 * https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes
 */
export const RETRYABLE_CODES = new Set([
  '10007', // Unexpected error
  '10011', // Too many requests (rate limit)
  '40002', // Blocked as spam - temporary
  '40004', // Rejected by destination (may succeed later)
  '40005', // Message expired during transmission
  '40006', // Recipient server unavailable
  '40014', // Message expired in queue
  '40018', // AT&T rate limit
  '50000', // Internal Telnyx error
  '50001', // Service temporarily unavailable
]);

/**
 * Error category result type
 */
export type ErrorCategory = 'unrecoverable' | 'retryable' | 'unknown';

/**
 * Categorize a Telnyx error code for retry behavior
 *
 * @param errorCode - Telnyx error code string
 * @returns 'unrecoverable' | 'retryable' | 'unknown'
 *
 * @example
 * const category = categorizeError('40300'); // 'unrecoverable' (opted-out)
 * const category = categorizeError('10011'); // 'retryable' (rate limit)
 * const category = categorizeError('99999'); // 'unknown' (default to retry)
 */
export function categorizeError(errorCode: string): ErrorCategory {
  if (UNRECOVERABLE_CODES.has(errorCode)) return 'unrecoverable';
  if (RETRYABLE_CODES.has(errorCode)) return 'retryable';
  return 'unknown'; // Default to retry for unknown errors
}

/**
 * E.164 phone number format regex
 * Format: +[country code][subscriber number]
 * - Must start with +
 * - Country code: 1-3 digits (cannot start with 0)
 * - Total length: 2-15 digits after +
 *
 * Examples:
 * - +15551234567 (US)
 * - +442071234567 (UK)
 * - +819012345678 (Japan)
 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Validate phone number is in E.164 format
 *
 * @param phone - Phone number string to validate
 * @returns true if valid E.164 format
 *
 * @example
 * validateE164('+15551234567'); // true
 * validateE164('5551234567');   // false (missing +)
 * validateE164('+05551234567'); // false (starts with 0)
 */
export function validateE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}

/**
 * Extract error code from Telnyx SDK error
 *
 * Telnyx SDK error structures:
 * - error.code (direct)
 * - error.data.errors[0].code (API response format)
 *
 * @param error - Error object from Telnyx SDK
 * @returns Error code string, or empty string if not found
 *
 * @example
 * try {
 *   await client.messages.send(...);
 * } catch (error) {
 *   const code = extractErrorCode(error); // e.g., '40300'
 * }
 */
export function extractErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;

    // Direct code property
    if (typeof e.code === 'string') {
      return e.code;
    }

    // Nested in data.errors array (API response format)
    if (e.data && typeof e.data === 'object') {
      const data = e.data as Record<string, unknown>;
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const firstError = data.errors[0] as Record<string, unknown> | undefined;
        if (firstError && typeof firstError.code === 'string') {
          return firstError.code;
        }
      }
    }
  }

  return '';
}

/**
 * Extract error message from Telnyx SDK error
 *
 * @param error - Error object from Telnyx SDK
 * @returns Error message string
 *
 * @example
 * try {
 *   await client.messages.send(...);
 * } catch (error) {
 *   const msg = extractErrorMessage(error); // e.g., 'Number opted out'
 * }
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
