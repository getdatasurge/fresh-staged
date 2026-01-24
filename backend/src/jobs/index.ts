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
  phoneNumber: string;
  message: string;
  alertId?: string;
}

// Email digest job data (Phase 17)
export interface EmailDigestJobData extends BaseJobData {
  userId: string;
  period: 'daily' | 'weekly';
  startDate: string;
  endDate: string;
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
