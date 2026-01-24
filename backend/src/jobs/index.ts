/**
 * Job registry and type definitions
 *
 * This file defines all background job types and queue names
 * for the FrostGuard background job infrastructure.
 */

import type { Job, JobsOptions } from 'bullmq';

// Base interface enforcing organization scope for multi-tenant isolation
export interface BaseJobData {
  organizationId: string;
}

// SMS notification job data (Phase 16)
export interface SmsNotificationJobData extends BaseJobData {
  /** Destination phone number in E.164 format */
  phoneNumber: string;
  /** Message content to send */
  message: string;
  /** Associated alert ID for tracking */
  alertId?: string;
  /** Delivery tracking ID from notification_deliveries table */
  deliveryId?: string;
  /** User ID for rate limiting context */
  userId?: string;
  /** Alert type for rate limiting (critical, warning, info) */
  alertType?: string;
}

// Email digest job data (Phase 17)
// Note: startDate and endDate are calculated at execution time by the processor
// This allows scheduler creation without pre-computing dates
export interface EmailDigestJobData extends BaseJobData {
  userId: string;
  period: 'daily' | 'weekly';
}

// Queue name constants (prevents typos)
export const QueueNames = {
  SMS_NOTIFICATIONS: 'sms-notifications',
  EMAIL_DIGESTS: 'email-digests',
} as const;

export type QueueName = typeof QueueNames[keyof typeof QueueNames];

// Job name constants
export const JobNames = {
  SMS_SEND: 'sms:send',
  EMAIL_DIGEST: 'email:digest',
} as const;

export type JobName = typeof JobNames[keyof typeof JobNames];

// Type helpers for strongly-typed job handling
export type SmsNotificationJob = Job<SmsNotificationJobData>;
export type EmailDigestJob = Job<EmailDigestJobData>;

// Default job options
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1 second initial delay
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 500,     // Keep last 500 failed jobs for debugging
};

/**
 * SMS notification job options with custom backoff for Telnyx
 *
 * Configuration:
 * - 5 attempts (vs default 3) for higher delivery reliability
 * - 2s initial delay with exponential backoff (2s, 4s, 8s, 16s, 32s)
 * - Longer history retention for SMS debugging
 *
 * Note: BullMQ does not natively support jitter in backoff options.
 * Standard exponential backoff is used. If jitter is critical for
 * thundering herd prevention, implement custom backoff in processor.
 */
export const smsJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s initial, then 4s, 8s, 16s, 32s
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Email digest job options
 *
 * Configuration:
 * - 3 attempts for reliability
 * - 2s initial delay with exponential backoff (2s, 4s, 8s)
 * - Standard history retention
 *
 * Email digests are less time-sensitive than SMS,
 * so fewer attempts with longer delays are acceptable.
 */
export const emailDigestJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s initial
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};
