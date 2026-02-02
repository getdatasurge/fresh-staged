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

// Meter reporting job data (Phase 18)
export interface MeterReportJobData extends BaseJobData {
  /** Event name: 'active_sensors' for gauge, 'temperature_readings' for counter */
  eventName: 'active_sensors' | 'temperature_readings';
  /** Usage value to report (whole number) */
  value: number;
  /** Optional timestamp for historical reporting (unix seconds) */
  timestamp?: number;
}

// Partition creation job data (REC-002)
export interface PartitionCreateJobData extends BaseJobData {
  /** Number of months to create ahead (default: 3) */
  bufferMonths: number;
}

// Partition retention job data (REC-002)
export interface PartitionRetentionJobData extends BaseJobData {
  /** Number of months to retain (default: 24) */
  retentionMonths: number;
}

// Queue name constants (prevents typos)
export const QueueNames = {
  SMS_NOTIFICATIONS: 'sms-notifications',
  EMAIL_DIGESTS: 'email-digests',
  METER_REPORTING: 'meter-reporting',
  PARTITION_MANAGEMENT: 'partition-management',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

// Job name constants
export const JobNames = {
  SMS_SEND: 'sms:send',
  EMAIL_DIGEST: 'email:digest',
  METER_REPORT: 'meter:report',
  SENSOR_COUNT_SCHEDULER: 'meter:sensor-count-scheduler',
  PARTITION_CREATE: 'partition:create',
  PARTITION_RETENTION: 'partition:retention',
} as const;

export type JobName = (typeof JobNames)[keyof typeof JobNames];

// Type helpers for strongly-typed job handling
export type SmsNotificationJob = Job<SmsNotificationJobData>;
export type EmailDigestJob = Job<EmailDigestJobData>;
export type MeterReportJob = Job<MeterReportJobData>;
export type PartitionCreateJob = Job<PartitionCreateJobData>;
export type PartitionRetentionJob = Job<PartitionRetentionJobData>;

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
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
    delay: 2000,
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
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Meter reporting job options
 *
 * Configuration:
 * - 5 attempts for reliability (Stripe meter events are idempotent)
 * - 5s initial delay with exponential backoff
 * - Longer retention for billing debugging
 */
export const meterReportJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 200,
  removeOnFail: 1000,
};

/**
 * Partition creation job options (REC-002)
 *
 * Configuration:
 * - 3 attempts (automated partition creation should be reliable)
 * - 5s initial delay with exponential backoff
 * - Standard retention
 *
 * Creates future partitions to maintain 3-month buffer
 * Runs weekly via cron schedule
 */
export const partitionCreateJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 50,
  removeOnFail: 200,
};

/**
 * Partition retention job options (REC-002)
 *
 * Configuration:
 * - 2 attempts (destructive operation, fewer retries)
 * - 10s initial delay with exponential backoff
 * - Longer retention for audit trail
 *
 * Drops partitions older than retention policy (24 months)
 * Runs monthly via cron schedule
 */
export const partitionRetentionJobOptions: JobsOptions = {
  attempts: 2,
  backoff: {
    type: 'exponential',
    delay: 10000,
  },
  removeOnComplete: 50,
  removeOnFail: 200,
};
