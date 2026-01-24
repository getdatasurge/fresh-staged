# Background Job Processing Research: BullMQ for FreshTrack Pro v2.0

**Project:** FreshTrack Pro - IoT Temperature Monitoring Platform
**Researched:** 2026-01-24
**Confidence:** HIGH
**Stack:** Fastify + BullMQ + Redis + PostgreSQL + Drizzle ORM

---

## Executive Summary

BullMQ is the recommended job queue solution for FreshTrack Pro v2.0's background job processing needs. It provides reliable, Redis-backed job queuing with first-class TypeScript support, advanced scheduling capabilities, and proven production scalability. For SMS notifications via Telnyx and scheduled email digests, BullMQ offers delayed jobs, cron-based scheduling, robust retry mechanisms with exponential backoff, and flexible worker deployment patterns.

**Key Finding:** BullMQ's separation of queue producers (API server) and consumers (workers) aligns perfectly with FreshTrack's planned Docker architecture, enabling independent scaling of API and worker containers.

---

## Table of Contents

1. [BullMQ Core Concepts](#bullmq-core-concepts)
2. [Fastify Integration Patterns](#fastify-integration-patterns)
3. [Job Types for FreshTrack](#job-types-for-freshtrack)
4. [Retry Strategies & Error Handling](#retry-strategies--error-handling)
5. [Telnyx SMS Integration](#telnyx-sms-integration)
6. [Email Digest Scheduling](#email-digest-scheduling)
7. [Worker Deployment & Scaling](#worker-deployment--scaling)
8. [Production Best Practices](#production-best-practices)
9. [Implementation Roadmap](#implementation-roadmap)

---

## BullMQ Core Concepts

### Architecture

BullMQ is a Redis-backed job queue system with three primary components:

1. **Queue** - Accepts jobs and stores them in Redis
2. **Worker** - Processes jobs from the queue
3. **Job** - Unit of work with data payload and options

```typescript
// Queue (runs in API server)
import { Queue } from 'bullmq';

const notificationQueue = new Queue('notifications', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

// Add a job
await notificationQueue.add('send-sms', {
  phoneNumber: '+15551234567',
  message: 'Temperature alert!',
  alertId: 'alert-123',
});
```

```typescript
// Worker (runs in separate process/container)
import { Worker } from 'bullmq';

const worker = new Worker('notifications', async (job) => {
  console.log(`Processing: ${job.name}`);

  if (job.name === 'send-sms') {
    await sendSmsViaTelnyx(job.data);
  }

  return { success: true };
}, {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});
```

**Source:** [BullMQ Documentation](https://docs.bullmq.io) (HIGH confidence)

### Redis Connection Management

BullMQ uses `ioredis` under the hood. For production, use connection pooling:

```typescript
import IORedis from 'ioredis';

// Shared connection for all queues/workers
const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

const queue = new Queue('my-queue', { connection });
const worker = new Worker('my-queue', processor, { connection });
```

**Important:** Set `maxRetriesPerRequest: null` to prevent connection issues during long-running jobs.

---

## Fastify Integration Patterns

### Pattern 1: Plugin-Based Integration (Recommended)

Use the `fastify-queue` plugin for file-based queue/worker discovery:

```bash
npm install fastify-queue bullmq ioredis
```

```typescript
// src/plugins/queues.ts
import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';

interface QueuePluginOptions {
  connection: {
    host: string;
    port: number;
  };
}

const queuesPlugin: FastifyPluginAsync<QueuePluginOptions> = async (fastify, opts) => {
  // Create queues
  const notificationQueue = new Queue('notifications', { connection: opts.connection });
  const emailQueue = new Queue('emails', { connection: opts.connection });

  // Register queues on Fastify instance
  fastify.decorate('queues', {
    notifications: notificationQueue,
    emails: emailQueue,
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await notificationQueue.close();
    await emailQueue.close();
  });
};

export default fp(queuesPlugin, { name: 'queues' });
```

```typescript
// src/app.ts
import Fastify from 'fastify';
import queuesPlugin from './plugins/queues';

const fastify = Fastify();

await fastify.register(queuesPlugin, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Use in routes
fastify.post('/alerts/:id/notify', async (request, reply) => {
  await fastify.queues.notifications.add('send-sms', {
    alertId: request.params.id,
  });

  return { status: 'queued' };
});
```

**TypeScript types:**

```typescript
// src/types/fastify.d.ts
import { Queue } from 'bullmq';

declare module 'fastify' {
  interface FastifyInstance {
    queues: {
      notifications: Queue;
      emails: Queue;
    };
  }
}
```

**Sources:**
- [fastify-queue on GitHub](https://github.com/JonasHiltl/fastify-queue)
- [fastify-queue on npm](https://www.npmjs.com/package/fastify-queue)
- [Railway BullMQ Template](https://github.com/railwayapp-templates/fastify-bullmq)

### Pattern 2: Direct Queue Management

For simpler setups, instantiate queues directly in the application:

```typescript
// src/config/queues.ts
import { Queue } from 'bullmq';
import { redisConnection } from './redis';

export const queues = {
  notifications: new Queue('notifications', { connection: redisConnection }),
  emails: new Queue('emails', { connection: redisConnection }),
  reports: new Queue('reports', { connection: redisConnection }),
};

// Cleanup on process exit
process.on('SIGTERM', async () => {
  await Promise.all(Object.values(queues).map(q => q.close()));
});
```

---

## Job Types for FreshTrack

### 1. Immediate Jobs (SMS Alerts)

For critical temperature alerts that need near-instant delivery:

```typescript
// Add job immediately
await fastify.queues.notifications.add(
  'send-sms-alert',
  {
    phoneNumber: contact.phone,
    message: `ALERT: ${unit.name} temp is ${reading.temperature}°F`,
    alertId: alert.id,
    organizationId: org.id,
  },
  {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100, // Keep last 100 for audit
    removeOnFail: 500,     // Keep last 500 failures for debugging
  }
);
```

### 2. Delayed Jobs (Escalation Reminders)

For alerts that need follow-up if not acknowledged:

```typescript
// Send reminder SMS if alert not acknowledged in 15 minutes
await fastify.queues.notifications.add(
  'send-escalation-reminder',
  {
    alertId: alert.id,
    escalationLevel: 2,
  },
  {
    delay: 15 * 60 * 1000, // 15 minutes in milliseconds
    attempts: 3,
  }
);
```

### 3. Scheduled Jobs (Email Digests)

For daily/weekly summary emails using cron patterns:

```typescript
// Daily digest at 7:00 AM in user's timezone
await fastify.queues.emails.upsertJobScheduler(
  'daily-digest-est',
  {
    pattern: '0 0 7 * * *', // Cron: 7 AM daily
  },
  {
    name: 'generate-daily-digest',
    data: {
      timezone: 'America/New_York',
      reportType: 'daily',
    },
    opts: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
    },
  }
);

// Weekly compliance report every Monday at 9 AM
await fastify.queues.emails.upsertJobScheduler(
  'weekly-compliance-report',
  {
    pattern: '0 0 9 * * 1', // Cron: 9 AM Mondays
  },
  {
    name: 'generate-compliance-report',
    data: {
      reportType: 'weekly-compliance',
    },
  }
);
```

**Cron Pattern Reference:**
- `0 0 7 * * *` - Daily at 7:00 AM
- `0 0 9 * * 1-5` - Weekdays at 9:00 AM
- `0 0 18 * * 5` - Fridays at 6:00 PM
- `0 0 9 1 * *` - First day of each month at 9:00 AM

**Source:** [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)

### 4. Prioritized Jobs

For handling multiple alert severities:

```typescript
// Critical alerts (priority 1 = highest)
await queue.add('send-sms', criticalAlertData, { priority: 1 });

// Warning alerts (priority 5)
await queue.add('send-sms', warningAlertData, { priority: 5 });

// Info notifications (priority 10 = lowest)
await queue.add('send-sms', infoData, { priority: 10 });
```

**Lower numbers = higher priority.** Workers process high-priority jobs first.

---

## Retry Strategies & Error Handling

### Built-in Retry Strategies

#### 1. Fixed Backoff

Retry with constant delay between attempts:

```typescript
await queue.add('send-sms', data, {
  attempts: 5,
  backoff: {
    type: 'fixed',
    delay: 3000, // Wait 3 seconds between each retry
  },
});
```

**Use case:** API rate limits with known recovery time.

#### 2. Exponential Backoff (Recommended)

Progressively increase delay: 1s, 2s, 4s, 8s, 16s...

```typescript
await queue.add('send-email', data, {
  attempts: 8,
  backoff: {
    type: 'exponential',
    delay: 1000,  // Base delay: 1 second
    jitter: 0.5,  // Add 0-50% random variance to prevent thundering herd
  },
});
```

**Formula:** `delay = 2^(attemptsMade - 1) * baseDelay`

**Use case:** Transient network failures, temporary service outages.

**Source:** [BullMQ Retry Documentation](https://context7.com/taskforcesh/bullmq/llms.txt) (HIGH confidence)

### Custom Backoff Strategy

For error-specific retry logic:

```typescript
const worker = new Worker(
  'notifications',
  async (job) => {
    // Job processor logic
    const result = await sendNotification(job.data);
    return result;
  },
  {
    connection: redisConnection,
    settings: {
      backoffStrategy: (attemptsMade, type, err, job) => {
        // Telnyx rate limit (429) - wait 60 seconds
        if (err?.message.includes('rate limit') || err?.message.includes('429')) {
          return 60000;
        }

        // Temporary network timeout - linear backoff
        if (err?.message.includes('timeout') || err?.message.includes('ETIMEDOUT')) {
          return attemptsMade * 5000;
        }

        // Fatal errors - stop retrying
        if (err?.message.includes('invalid phone number') ||
            err?.message.includes('40310')) {
          return -1; // -1 = don't retry
        }

        // Default exponential backoff
        return Math.pow(2, attemptsMade - 1) * 1000;
      },
    },
  }
);
```

**Then use custom backoff in jobs:**

```typescript
await queue.add('send-sms', data, {
  attempts: 5,
  backoff: { type: 'custom' }, // Uses worker's backoffStrategy
});
```

### Error Handling Patterns

#### 1. Categorize Errors

```typescript
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalError';
  }
}

// In worker processor
async function processSms(job: Job) {
  try {
    const result = await sendTelnyxSms(job.data);
    return result;
  } catch (error) {
    // Check Telnyx error codes
    if (error.code === '40310') {
      // Invalid phone number - don't retry
      throw new FatalError(`Invalid phone: ${error.message}`);
    }

    if (error.code === '50001') {
      // Service temporarily unavailable - retry
      throw new RetryableError('Telnyx service unavailable');
    }

    // Unknown error - let BullMQ retry
    throw error;
  }
}
```

#### 2. Failed Job Handlers

```typescript
worker.on('failed', async (job, error) => {
  console.error(`Job ${job?.id} failed:`, {
    name: job?.name,
    attemptsMade: job?.attemptsMade,
    maxAttempts: job?.opts.attempts,
    error: error.message,
  });

  // Log to database for monitoring
  await db.insert(jobFailures).values({
    jobId: job?.id,
    queueName: job?.queueName,
    errorMessage: error.message,
    errorStack: error.stack,
    data: job?.data,
    failedAt: new Date(),
  });

  // Alert ops team for critical failures
  if (job?.attemptsMade === job?.opts.attempts) {
    await sendOpsAlert({
      subject: `Job permanently failed: ${job.name}`,
      jobId: job.id,
      error: error.message,
    });
  }
});
```

#### 3. Manual Retry

For investigating and retrying specific failed jobs:

```typescript
import { Job } from 'bullmq';

// Retry a failed job
const job = await Job.fromId(queue, 'failed-job-id');
await job.retry('failed');

// Retry a completed job (re-run)
await job.retry('completed');
```

**Source:** [BullMQ Retrying Jobs](https://docs.bullmq.io/guide/jobs/retrying-job) (HIGH confidence)

---

## Telnyx SMS Integration

### Current Supabase Implementation

FreshTrack currently uses Telnyx for SMS via Supabase Edge Functions. The existing implementation provides excellent patterns to migrate:

**Key configurations (from `send-sms-alert/index.ts`):**
- **Messaging Profile:** `frost guard` (ID: `40019baa-aa62-463c-b254-463c66f4b2d3`)
- **Phone Number:** `+18889890560` (Toll-Free)
- **Verification ID:** `99ac127c-6dae-57ee-afc4-32949ac9124e`
- **Rate Limiting:** 1 SMS per user per alert type per 15 minutes
- **E.164 Validation:** Required for all phone numbers

### BullMQ Worker Implementation

```typescript
// src/jobs/processors/send-sms.ts
import { Job } from 'bullmq';
import fetch from 'node-fetch';

interface SendSmsData {
  phoneNumber: string;
  message: string;
  alertId: string;
  organizationId: string;
  alertType: string;
}

export async function processSendSms(job: Job<SendSmsData>) {
  const { phoneNumber, message, alertId, organizationId, alertType } = job.data;

  // E.164 validation
  const E164_REGEX = /^\+[1-9]\d{1,14}$/;
  if (!E164_REGEX.test(phoneNumber)) {
    throw new Error(`Invalid phone number format: ${phoneNumber}`);
  }

  // Build Telnyx payload
  const payload = {
    from: process.env.TELNYX_PHONE_NUMBER,
    to: phoneNumber,
    text: message,
    messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
    webhook_url: `${process.env.API_BASE_URL}/webhooks/telnyx`,
    webhook_failover_url: `${process.env.API_BASE_URL}/webhooks/telnyx`,
  };

  // Send via Telnyx API
  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  // Handle Telnyx errors
  if (!response.ok || data.errors?.length) {
    const error = data.errors?.[0];
    const errorCode = error?.code || '';

    // Map error codes (from existing implementation)
    const FATAL_ERRORS = ['40310', '40311', '40001', '40300']; // Invalid/opted-out numbers
    const RETRYABLE_ERRORS = ['50000', '50001', '40400']; // Service issues

    if (FATAL_ERRORS.includes(errorCode)) {
      // Don't retry - log and fail permanently
      await logSmsFailure(job.data, error, 'fatal');
      throw new Error(`Fatal SMS error ${errorCode}: ${error.title}`);
    }

    if (RETRYABLE_ERRORS.includes(errorCode)) {
      // Retryable - throw to trigger backoff
      throw new Error(`Retryable SMS error ${errorCode}: ${error.title}`);
    }

    // Unknown error - retry with caution
    throw new Error(`SMS error ${errorCode}: ${error.title || 'Unknown error'}`);
  }

  const messageId = data.data?.id;

  // Log successful send to database
  await logSmsSuccess({
    alertId,
    organizationId,
    phoneNumber,
    message,
    providerMessageId: messageId,
    status: 'sent',
  });

  // Update job with message ID for tracking
  await job.updateProgress(100);

  return {
    success: true,
    messageId,
    timestamp: new Date().toISOString(),
  };
}

// Helper: Log SMS to sms_alert_log table
async function logSmsSuccess(data: any) {
  await db.insert(smsAlertLog).values({
    organizationId: data.organizationId,
    alertId: data.alertId,
    phoneNumber: data.phoneNumber,
    message: data.message,
    status: 'sent',
    providerMessageId: data.providerMessageId,
    sentAt: new Date(),
  });
}

async function logSmsFailure(data: any, error: any, severity: string) {
  await db.insert(smsAlertLog).values({
    organizationId: data.organizationId,
    alertId: data.alertId,
    phoneNumber: data.phoneNumber,
    message: data.message,
    status: 'failed',
    errorMessage: `${error.code}: ${error.title}`,
    sentAt: new Date(),
  });
}
```

### Telnyx Error Codes (from existing implementation)

| Code | Meaning | Action |
|------|---------|--------|
| `10009` | Authentication failed | Fatal - check API key |
| `40001` | Landline destination | Fatal - invalid number type |
| `40300` | Number opted out | Fatal - user replied STOP |
| `40310` | Invalid phone number | Fatal - validation error |
| `40311` | Not SMS-capable | Fatal - landline or VoIP |
| `40400` | Temporarily unreachable | Retry with backoff |
| `50000` | Internal Telnyx error | Retry with backoff |
| `50001` | Service unavailable | Retry with backoff |

**Source:** Existing FreshTrack implementation (`supabase/functions/send-sms-alert/index.ts`)

### Rate Limiting Pattern

Implement rate limiting in the job processor:

```typescript
// Check rate limit before sending
async function checkRateLimit(userId: string, alertType: string): Promise<boolean> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const recentSms = await db
    .select()
    .from(smsAlertLog)
    .where(and(
      eq(smsAlertLog.userId, userId),
      eq(smsAlertLog.alertType, alertType),
      eq(smsAlertLog.status, 'sent'),
      gte(smsAlertLog.sentAt, fifteenMinutesAgo)
    ))
    .limit(1);

  return recentSms.length > 0;
}

// In processor
if (await checkRateLimit(job.data.userId, job.data.alertType)) {
  // Mark as rate-limited, don't retry
  await logSmsFailure(job.data, { code: 'RATE_LIMITED' }, 'info');
  return { success: false, reason: 'rate_limited' };
}
```

**Sources:**
- [Telnyx Messaging Error Codes](https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes)
- [Telnyx SMS Compliance 2026](https://telnyx.com/resources/sms-compliance)

---

## Email Digest Scheduling

### Digest Types for FreshTrack

1. **Daily Temperature Summary** - 7 AM user's timezone
2. **Weekly Compliance Report** - Monday 9 AM
3. **Monthly Analytics Digest** - 1st of month, 8 AM

### Job Scheduler Pattern

```typescript
// src/jobs/schedulers/email-digests.ts
import { Queue } from 'bullmq';

export async function setupEmailDigests(emailQueue: Queue) {
  // Daily digest for each timezone (common US timezones)
  const timezones = [
    { name: 'America/New_York', offset: 'EST/EDT' },
    { name: 'America/Chicago', offset: 'CST/CDT' },
    { name: 'America/Denver', offset: 'MST/MDT' },
    { name: 'America/Los_Angeles', offset: 'PST/PDT' },
  ];

  for (const tz of timezones) {
    await emailQueue.upsertJobScheduler(
      `daily-digest-${tz.offset}`,
      {
        pattern: '0 0 7 * * *', // 7 AM in that timezone
      },
      {
        name: 'generate-daily-digest',
        data: {
          timezone: tz.name,
          reportType: 'daily-summary',
        },
        opts: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 5000 },
        },
      }
    );
  }

  // Weekly compliance report (Mondays at 9 AM EST)
  await emailQueue.upsertJobScheduler(
    'weekly-compliance-report',
    {
      pattern: '0 0 9 * * 1', // Monday 9 AM
    },
    {
      name: 'generate-compliance-report',
      data: {
        reportType: 'weekly-compliance',
        timezone: 'America/New_York',
      },
    }
  );

  // Monthly analytics (1st of month at 8 AM)
  await emailQueue.upsertJobScheduler(
    'monthly-analytics',
    {
      pattern: '0 0 8 1 * *', // 1st day at 8 AM
    },
    {
      name: 'generate-monthly-analytics',
      data: {
        reportType: 'monthly-analytics',
      },
    }
  );
}
```

### Email Digest Processor

```typescript
// src/jobs/processors/generate-digest.ts
import { Job } from 'bullmq';

interface DigestData {
  timezone: string;
  reportType: 'daily-summary' | 'weekly-compliance' | 'monthly-analytics';
}

export async function processEmailDigest(job: Job<DigestData>) {
  const { timezone, reportType } = job.data;

  // 1. Get all organizations that want this digest type
  const orgs = await getOrgsForDigest(reportType, timezone);

  await job.updateProgress(10);

  // 2. For each organization, generate digest content
  for (const [index, org] of orgs.entries()) {
    const digestData = await generateDigestForOrg(org, reportType);

    // 3. Queue individual email jobs (one per recipient)
    const recipients = await getDigestRecipients(org.id, reportType);

    for (const recipient of recipients) {
      await emailQueue.add('send-digest-email', {
        to: recipient.email,
        organizationId: org.id,
        digestType: reportType,
        content: digestData,
        timezone,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }

    // Update progress
    const progress = 10 + (index / orgs.length) * 90;
    await job.updateProgress(progress);
  }

  return {
    success: true,
    organizationsProcessed: orgs.length,
    timestamp: new Date().toISOString(),
  };
}

async function generateDigestForOrg(org: any, reportType: string) {
  switch (reportType) {
    case 'daily-summary':
      return await generateDailySummary(org);
    case 'weekly-compliance':
      return await generateWeeklyCompliance(org);
    case 'monthly-analytics':
      return await generateMonthlyAnalytics(org);
  }
}

async function generateDailySummary(org: any) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // Get temperature readings, alerts, units for yesterday
  const readings = await getReadingsForDateRange(org.id, yesterday, new Date());
  const alerts = await getAlertsForDateRange(org.id, yesterday, new Date());
  const units = await getUnitsForOrg(org.id);

  return {
    subject: `Daily Temperature Summary - ${org.name}`,
    totalReadings: readings.length,
    totalAlerts: alerts.length,
    unitsMonitored: units.length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    // ... more summary data
  };
}
```

**Sources:**
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)
- [Implementing Job Scheduler into Newsletter Application](https://blog.taskforce.sh/implementing-a-job-scheduler-into-a-newsletter-application/)
- [Better Stack: Job Scheduling in Node.js with BullMQ](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/)

### Managing Schedulers

```typescript
// List all active schedulers
const schedulers = await emailQueue.getJobSchedulers();
console.log('Active schedulers:', schedulers.map(s => s.id));

// Get specific scheduler
const scheduler = await emailQueue.getJobScheduler('daily-digest-EST');
console.log('Next run:', scheduler?.next);

// Remove a scheduler
await emailQueue.removeJobScheduler('old-scheduler-id');

// Update scheduler (just call upsertJobScheduler again with same ID)
await emailQueue.upsertJobScheduler(
  'daily-digest-EST',
  { pattern: '0 0 8 * * *' }, // Changed to 8 AM
  { name: 'generate-daily-digest', data: { timezone: 'America/New_York' } }
);
```

---

## Worker Deployment & Scaling

### Architecture: Separate API and Workers

**Recommended Production Setup:**

```
┌─────────────────┐      ┌─────────────────┐
│   API Server    │      │  Redis (Queue)  │
│   (Fastify)     │─────▶│   + Pub/Sub     │
│                 │      │                 │
│ - Queues jobs   │      │  - Stores jobs  │
│ - Handles HTTP  │      │  - Coordinates  │
└─────────────────┘      └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
         ┌──────────────────┐      ┌──────────────────┐
         │  Worker Pool 1   │      │  Worker Pool 2   │
         │  (Notifications) │      │  (Email Digests) │
         │                  │      │                  │
         │  - Processes SMS │      │  - Generates     │
         │  - Sends emails  │      │    reports       │
         │  - Concurrency:5 │      │  - Concurrency:2 │
         └──────────────────┘      └──────────────────┘
```

**Key principle:** API server only enqueues jobs. Workers run as separate processes/containers.

### Docker Compose Setup

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  api:
    build:
      context: ../backend
      dockerfile: ../docker/Dockerfile.api
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - redis
      - postgres

  worker-notifications:
    build:
      context: ../backend
      dockerfile: ../docker/Dockerfile.worker
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - WORKER_QUEUE=notifications
      - WORKER_CONCURRENCY=5
      - TELNYX_API_KEY=${TELNYX_API_KEY}
      - TELNYX_PHONE_NUMBER=${TELNYX_PHONE_NUMBER}
    depends_on:
      - redis
    restart: unless-stopped

  worker-emails:
    build:
      context: ../backend
      dockerfile: ../docker/Dockerfile.worker
    environment:
      - REDIS_HOST=redis
      - WORKER_QUEUE=emails
      - WORKER_CONCURRENCY=2
      - EMAIL_API_KEY=${EMAIL_API_KEY}
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis-data:
```

### Worker Entry Point

```typescript
// src/workers/index.ts
import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { processSendSms } from '../jobs/processors/send-sms';
import { processEmailDigest } from '../jobs/processors/generate-digest';

const QUEUE_NAME = process.env.WORKER_QUEUE || 'notifications';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');

console.log(`Starting worker for queue: ${QUEUE_NAME} (concurrency: ${CONCURRENCY})`);

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[${QUEUE_NAME}] Processing job: ${job.name} (${job.id})`);

    // Route to appropriate processor
    switch (job.name) {
      case 'send-sms-alert':
        return await processSendSms(job);
      case 'send-digest-email':
        return await processSendEmail(job);
      case 'generate-daily-digest':
        return await processEmailDigest(job);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    limiter: {
      max: 100,      // Max 100 jobs
      duration: 1000, // Per second
    },
  }
);

// Event handlers
worker.on('completed', (job) => {
  console.log(`[${QUEUE_NAME}] Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`[${QUEUE_NAME}] Job ${job?.id} failed:`, error.message);
});

worker.on('error', (error) => {
  console.error(`[${QUEUE_NAME}] Worker error:`, error);
});

// Graceful shutdown
async function shutdown() {
  console.log(`[${QUEUE_NAME}] Shutting down worker...`);
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[${QUEUE_NAME}] Worker started successfully`);
```

**Dockerfile for Workers:**

```dockerfile
# docker/Dockerfile.worker
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["node", "dist/workers/index.js"]
```

### Concurrency & Rate Limiting

#### Worker-Level Concurrency

```typescript
const worker = new Worker('queue', processor, {
  concurrency: 10, // Process up to 10 jobs simultaneously in this worker
});
```

**Recommendation for FreshTrack:**
- **SMS notifications:** Concurrency 5-10 (Telnyx can handle high throughput)
- **Email digests:** Concurrency 2-5 (slower generation, DB-intensive)

#### Global Concurrency (across all workers)

```typescript
// Limit total concurrent jobs across ALL workers
await queue.setGlobalConcurrency(20);

// Example: Even with 5 workers each with concurrency 10,
// only 20 jobs will run globally at any time
```

**Use case:** Protect downstream services (e.g., database, external APIs) from overload.

#### Rate Limiting

```typescript
const worker = new Worker('api-requests', processor, {
  limiter: {
    max: 100,       // Maximum 100 jobs
    duration: 60000, // Per 60 seconds (1 minute)
  },
});
```

**For Telnyx SMS:** Consider rate limits based on your Telnyx plan (typically 100-1000+ messages/second for production accounts).

### Scaling Patterns

#### Horizontal Scaling

Run multiple worker instances:

```bash
# Scale up notification workers to 3 instances
docker-compose up -d --scale worker-notifications=3
```

Each worker connects to the same Redis queue and processes jobs in parallel.

#### Kubernetes Deployment

```yaml
# k8s/worker-notifications-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bullmq-notifications-workers
spec:
  replicas: 5  # 5 worker pods
  selector:
    matchLabels:
      app: worker-notifications
  template:
    metadata:
      labels:
        app: worker-notifications
    spec:
      containers:
        - name: worker
          image: freshtrack-worker:latest
          env:
            - name: WORKER_QUEUE
              value: "notifications"
            - name: WORKER_CONCURRENCY
              value: "5"
            - name: REDIS_HOST
              value: "redis-service"
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
```

**Result:** 5 pods × 5 concurrency = 25 jobs processed simultaneously.

**Sources:**
- [BullMQ Production Guide](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ Docker/Kubernetes Discussion](https://github.com/taskforcesh/bullmq/discussions/665)
- [How to Set Up Scalable Queue Workers on AWS](https://dev.to/bhaskar_sawant/how-to-set-up-scalable-queue-workers-on-aws-using-elasticache-ecs-and-bullmq-3g2j)

---

## Production Best Practices

### 1. Redis Persistence

Enable AOF (Append Only File) for job durability:

```bash
# redis.conf
appendonly yes
appendfsync everysec  # Flush to disk every second
```

**Trade-off:** Performance vs. durability. `everysec` is a good balance for job queues.

### 2. Graceful Shutdown

```typescript
let isShuttingDown = false;

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('Received shutdown signal. Closing worker...');

  // Close worker (waits for active jobs to complete)
  await worker.close();

  console.log('Worker closed successfully');
  process.exit(0);
}

// Listen for both SIGTERM (Docker/K8s) and SIGINT (Ctrl+C)
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

**Important:** In Kubernetes, set `terminationGracePeriodSeconds` to allow jobs to finish:

```yaml
spec:
  terminationGracePeriodSeconds: 60  # Wait up to 60s for jobs to complete
```

### 3. Job Cleanup

Prevent Redis from filling up with old completed/failed jobs:

```typescript
const queue = new Queue('notifications', {
  defaultJobOptions: {
    removeOnComplete: 100,  // Keep last 100 completed jobs
    removeOnFail: 500,      // Keep last 500 failed jobs for debugging
  },
});
```

**Periodic cleanup:**

```typescript
// Clean up old jobs daily (run as cron job or scheduled job)
await queue.clean(24 * 3600 * 1000, 1000, 'completed'); // Completed > 24h
await queue.clean(7 * 24 * 3600 * 1000, 1000, 'failed'); // Failed > 7 days
```

### 4. Monitoring & Observability

```typescript
// Worker metrics
worker.on('completed', (job) => {
  metrics.jobCompleted.inc({ queue: job.queueName, name: job.name });
});

worker.on('failed', (job, error) => {
  metrics.jobFailed.inc({ queue: job?.queueName, name: job?.name });
});

worker.on('progress', (job, progress) => {
  metrics.jobProgress.set({ jobId: job.id }, progress);
});

// Queue metrics (poll periodically)
setInterval(async () => {
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');

  metrics.queueWaiting.set({ queue: 'notifications' }, counts.waiting);
  metrics.queueActive.set({ queue: 'notifications' }, counts.active);
  metrics.queueFailed.set({ queue: 'notifications' }, counts.failed);
}, 10000); // Every 10 seconds
```

**Recommended tools:**
- **Bull Board** - Web UI for monitoring queues (Dashboard: https://railway.com/deploy/0s3-xR)
- **Prometheus + Grafana** - Metrics and alerting
- **Datadog/New Relic** - APM with BullMQ integration

### 5. Security

```typescript
// Validate job data
const jobSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
  message: z.string().max(1600),
  alertId: z.string().uuid(),
});

export async function processSendSms(job: Job) {
  // Validate against schema
  const validData = jobSchema.parse(job.data);

  // Sanitize user input
  const sanitizedMessage = sanitize(validData.message);

  // Fetch secrets at runtime (don't store in job data)
  const apiKey = await getSecret('TELNYX_API_KEY');

  // ... process job
}
```

**Don't store in job data:**
- API keys
- Database passwords
- User credentials
- PII (minimize what you store)

### 6. Error Tracking

Integrate with error tracking services:

```typescript
import * as Sentry from '@sentry/node';

worker.on('failed', (job, error) => {
  Sentry.captureException(error, {
    tags: {
      queue: job?.queueName,
      jobName: job?.name,
      jobId: job?.id,
    },
    extra: {
      jobData: job?.data,
      attemptsMade: job?.attemptsMade,
    },
  });
});
```

### 7. Dead Letter Queue (DLQ)

For jobs that fail permanently:

```typescript
worker.on('failed', async (job, error) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    // Move to dead letter queue for manual review
    await deadLetterQueue.add('failed-job', {
      originalQueue: job.queueName,
      originalJob: job.name,
      data: job.data,
      error: error.message,
      failedAt: new Date(),
    }, {
      removeOnComplete: false, // Keep forever
    });
  }
});
```

**Sources:**
- [BullMQ Production Guide](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ for Beginners (Medium)](https://hadoan.medium.com/bullmq-for-beginners-a-friendly-practical-guide-with-typescript-examples-eb8064bef1c4)

---

## Implementation Roadmap

### Phase 1: Core Setup (Week 1)

**Goals:**
- Install dependencies
- Set up Redis connection
- Create queue plugin for Fastify
- Implement basic worker structure

**Tasks:**
1. Install packages: `npm install bullmq ioredis @types/ioredis`
2. Create `src/config/redis.ts` - shared Redis connection
3. Create `src/plugins/queues.ts` - Fastify plugin for queues
4. Create `src/workers/index.ts` - worker entry point
5. Update Docker Compose with Redis service
6. Add worker container to Docker Compose

**Deliverable:** API can enqueue jobs, workers can process them.

### Phase 2: SMS Notifications (Week 2)

**Goals:**
- Migrate SMS sending from Edge Functions to BullMQ workers
- Implement retry logic with Telnyx error handling
- Add rate limiting

**Tasks:**
1. Create `src/jobs/processors/send-sms.ts` processor
2. Port Telnyx logic from `send-sms-alert/index.ts`
3. Implement error mapping and retry strategy
4. Add rate limiting check in processor
5. Create API route: `POST /alerts/:id/notify` → enqueue SMS job
6. Update `sms_alert_log` schema in Drizzle
7. Test with real Telnyx account

**Deliverable:** SMS alerts sent via BullMQ with full error handling.

### Phase 3: Email Digests (Week 3)

**Goals:**
- Implement scheduled email digests
- Create digest generation logic
- Set up cron-based schedulers

**Tasks:**
1. Create `src/jobs/processors/generate-digest.ts`
2. Implement daily/weekly/monthly digest generation
3. Set up job schedulers in `src/jobs/schedulers/email-digests.ts`
4. Create `send-email` processor
5. Integrate email service (e.g., SendGrid, Mailgun, AWS SES)
6. Add user preferences for digest frequency
7. Test scheduled execution

**Deliverable:** Automated email digests on schedule.

### Phase 4: Monitoring & Production (Week 4)

**Goals:**
- Add monitoring dashboard
- Implement metrics
- Production deployment

**Tasks:**
1. Set up Bull Board for queue monitoring
2. Add Prometheus metrics for job processing
3. Implement graceful shutdown
4. Configure Redis persistence (AOF)
5. Set up alerting for failed jobs
6. Load testing with realistic job volumes
7. Deploy to staging environment

**Deliverable:** Production-ready job processing system with monitoring.

### Optional Enhancements

**Priority 2 (Future):**
- Job prioritization for critical alerts
- Advanced rate limiting per organization
- Job metrics dashboard for customers
- Webhook retry mechanism for Telnyx delivery status
- Multi-region Redis (if scaling globally)

---

## Code Examples Repository

### Complete Worker Setup

```typescript
// src/workers/notification-worker.ts
import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { db } from '../db/client';
import { smsAlertLog } from '../db/schema';

const QUEUE_NAME = 'notifications';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');

interface SmsJob {
  phoneNumber: string;
  message: string;
  alertId: string;
  organizationId: string;
}

async function processSmsJob(job: Job<SmsJob>) {
  const { phoneNumber, message, alertId, organizationId } = job.data;

  // Send SMS via Telnyx
  const response = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.TELNYX_PHONE_NUMBER,
      to: phoneNumber,
      text: message,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Telnyx error: ${data.errors?.[0]?.title}`);
  }

  // Log to database
  await db.insert(smsAlertLog).values({
    alertId,
    organizationId,
    phoneNumber,
    message,
    status: 'sent',
    providerMessageId: data.data.id,
  });

  return { success: true, messageId: data.data.id };
}

// Create worker
const connection = createRedisConnection();

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === 'send-sms') {
      return await processSmsJob(job);
    }
    throw new Error(`Unknown job: ${job.name}`);
  },
  {
    connection,
    concurrency: CONCURRENCY,
    limiter: { max: 100, duration: 1000 },
    settings: {
      backoffStrategy: (attemptsMade, type, err) => {
        if (err?.message.includes('rate limit')) return 60000;
        if (err?.message.includes('invalid')) return -1;
        return Math.pow(2, attemptsMade) * 1000;
      },
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});

console.log(`Worker started: ${QUEUE_NAME} (concurrency: ${CONCURRENCY})`);
```

---

## Summary: Key Takeaways

### BullMQ Advantages for FreshTrack

1. **TypeScript-First** - Excellent type safety and developer experience
2. **Redis-Backed** - Already using Redis for caching, reuse infrastructure
3. **Proven Scale** - Used by thousands of production applications
4. **Rich Features** - Delayed jobs, cron scheduling, priorities, rate limiting
5. **Active Development** - Modern API (v5.16.0+), well-maintained

### Recommended Architecture

- **API Server:** Enqueue jobs only (Fastify + queues plugin)
- **Workers:** Separate containers/processes (Docker Compose or K8s)
- **Redis:** Single instance with AOF persistence
- **Monitoring:** Bull Board + Prometheus metrics

### Critical Implementation Points

1. **Telnyx Error Handling:** Map error codes to fatal vs. retryable
2. **Rate Limiting:** 15-minute window per user/alert type
3. **Graceful Shutdown:** Essential for Docker/K8s deployments
4. **Job Cleanup:** Prevent Redis memory bloat
5. **Monitoring:** Track queue depth, failed jobs, processing time

### Next Steps

1. Start with Phase 1: Core setup and simple worker
2. Migrate SMS notifications first (higher priority)
3. Add email digests in Phase 3
4. Monitor and optimize based on production metrics

---

## Sources & References

### High Confidence (Official Documentation)

- [BullMQ Official Documentation](https://docs.bullmq.io) - Queue setup, workers, job types
- [BullMQ Context7 Library](https://context7.com/taskforcesh/bullmq/llms.txt) - Code examples, retry strategies
- [BullMQ GitHub Repository](https://github.com/taskforcesh/bullmq) - Source code, issues, discussions

### Medium Confidence (Community Resources)

- [fastify-queue Plugin](https://github.com/JonasHiltl/fastify-queue) - Fastify integration pattern
- [Railway BullMQ Template](https://github.com/railwayapp-templates/fastify-bullmq) - Docker deployment example
- [Better Stack: BullMQ Scheduled Tasks](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/) - Job scheduling guide
- [How to Build Job Queue with BullMQ](https://oneuptime.com/blog/post/2026-01-06-nodejs-job-queue-bullmq-redis/view) - 2026 tutorial

### Telnyx Integration

- [Telnyx Messaging Error Codes](https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes) - Error handling reference
- [Telnyx SMS Compliance 2026](https://telnyx.com/resources/sms-compliance) - Regulatory requirements
- [Telnyx Node.js SDK](https://www.npmjs.com/package/telnyx) - Official package (attempt to fetch blocked, using existing code)

### FreshTrack Existing Implementation

- `supabase/functions/send-sms-alert/index.ts` - Current SMS implementation with Telnyx
- `docs/engineering/SMS_NOTIFICATIONS.md` - SMS system documentation
- `docs/TARGET_ARCHITECTURE.md` - v2.0 architecture specification

---

**Document Version:** 1.0
**Last Updated:** 2026-01-24
**Confidence Assessment:** HIGH (90%+)
- BullMQ patterns verified via official docs and Context7
- Telnyx integration derived from production code
- Docker deployment validated via community templates
- Email scheduling confirmed with official BullMQ scheduler API

**Research Complete.** Ready for implementation planning.
