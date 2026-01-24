# Phase 16: SMS Notifications - Research

**Researched:** 2026-01-24
**Domain:** Telnyx SMS via BullMQ Worker Processing
**Confidence:** HIGH

## Summary

This phase implements SMS notification delivery through Telnyx using the BullMQ job queue infrastructure established in Phase 15. The existing codebase has a complete Telnyx SMS implementation in Supabase Edge Functions (`send-sms-alert`, `telnyx-webhook`) that serves as the reference pattern. The backend worker infrastructure (QueueService, SMS worker stub, job types) is already scaffolded and ready for implementation.

The primary work is migrating the Telnyx API integration from the Edge Function pattern to a BullMQ worker processor, adding the Telnyx Node.js SDK, and implementing proper error categorization for retry vs. non-retryable failures. The existing Edge Function handles rate limiting, E.164 validation, toll-free verification, webhook delivery status, and comprehensive error codes - all of which inform the worker implementation.

**Primary recommendation:** Use the Telnyx Node.js SDK v4.x with TypeScript types, implement error categorization using BullMQ's UnrecoverableError for permanent failures (opted-out, invalid number), and exponential backoff with jitter for transient failures.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telnyx | ^4.6.0 | Telnyx SMS API SDK | Official TypeScript SDK, auto-retry, type-safe responses |
| bullmq | ^5.67.0 | Job queue processing | Already installed in Phase 15, TypeScript-first |
| ioredis | ^5.9.2 | Redis connection | Already installed, required for BullMQ workers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 | Job data validation | Validate SMS job payloads before processing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Telnyx SDK | Direct fetch to REST API | SDK has built-in retry, types, error handling; fetch requires manual implementation |
| BullMQ exponential | Custom backoff | Custom only if carrier-specific delays needed |

**Installation:**
```bash
cd backend && npm install telnyx
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── workers/
│   └── processors/
│       └── sms-notification.processor.ts    # Main SMS worker processor
├── services/
│   └── telnyx.service.ts                    # Telnyx API wrapper service
├── jobs/
│   └── index.ts                             # Job types (already has SmsNotificationJobData)
└── config/
    └── telnyx.config.ts                     # Error code categorization
```

### Pattern 1: Telnyx Service Layer
**What:** Encapsulate Telnyx SDK initialization and SMS sending in a dedicated service
**When to use:** Always - separates API concerns from worker logic
**Example:**
```typescript
// Source: Telnyx Node.js SDK docs + existing Edge Function pattern
import Telnyx from 'telnyx';

export class TelnyxService {
  private client: Telnyx;

  constructor() {
    this.client = new Telnyx({
      apiKey: process.env.TELNYX_API_KEY!,
    });
  }

  async sendSms(params: {
    to: string;
    message: string;
    messagingProfileId?: string;
  }): Promise<{ messageId: string; status: string }> {
    const response = await this.client.messages.send({
      from: process.env.TELNYX_PHONE_NUMBER!,
      to: params.to,
      text: params.message,
      messaging_profile_id: params.messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID,
    });

    return {
      messageId: response.data.id,
      status: response.data.to[0]?.status || 'queued',
    };
  }
}
```

### Pattern 2: Error Categorization for Retries
**What:** Classify Telnyx errors as retryable (transient) vs unrecoverable (permanent)
**When to use:** In worker processor to determine retry behavior
**Example:**
```typescript
// Source: Telnyx Error Codes documentation + BullMQ UnrecoverableError docs
import { UnrecoverableError } from 'bullmq';

// Permanent failures - do not retry
const UNRECOVERABLE_CODES = new Set([
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

// Transient failures - retry with backoff
const RETRYABLE_CODES = new Set([
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

export function categorizeError(errorCode: string): 'unrecoverable' | 'retryable' | 'unknown' {
  if (UNRECOVERABLE_CODES.has(errorCode)) return 'unrecoverable';
  if (RETRYABLE_CODES.has(errorCode)) return 'retryable';
  return 'unknown'; // Default to retry for unknown errors
}
```

### Pattern 3: Worker Processor with Error Handling
**What:** BullMQ processor that handles SMS sending with proper error categorization
**When to use:** As the main worker processor function
**Example:**
```typescript
// Source: BullMQ Workers docs + Telnyx error handling pattern
import { Job, UnrecoverableError } from 'bullmq';
import type { SmsNotificationJobData } from '../jobs/index.js';
import { TelnyxService } from '../services/telnyx.service.js';
import { categorizeError } from '../config/telnyx.config.js';

const telnyxService = new TelnyxService();

export async function processSmsNotification(
  job: Job<SmsNotificationJobData>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { phoneNumber, message, organizationId, alertId } = job.data;

  console.log(`[SMS Worker] Processing job ${job.id} for org ${organizationId}`);

  try {
    const result = await telnyxService.sendSms({
      to: phoneNumber,
      message,
    });

    console.log(`[SMS Worker] Sent message ${result.messageId} to ${phoneNumber}`);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error: unknown) {
    const errorCode = extractErrorCode(error);
    const category = categorizeError(errorCode);

    if (category === 'unrecoverable') {
      // Throw UnrecoverableError to skip remaining retries
      throw new UnrecoverableError(
        `Permanent failure: ${errorCode} - ${extractErrorMessage(error)}`
      );
    }

    // Retryable errors - throw normal error to trigger retry
    throw error;
  }
}
```

### Anti-Patterns to Avoid
- **Hardcoding phone numbers:** Always use E.164 format validation before queuing
- **Ignoring error codes:** Retrying unrecoverable errors wastes resources and may cause account issues
- **No job deduplication:** Multiple alerts can trigger duplicate SMS - use alertId for idempotency
- **Storing sensitive data in jobs:** Keep message content but not API keys in job data
- **Blocking Redis operations without maxRetriesPerRequest: null:** Worker will fail

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone validation | Custom regex | E.164 regex from existing Edge Function | Edge cases with country codes |
| Retry with backoff | Custom timers | BullMQ exponential backoff | Handles edge cases, jitter support |
| Error categorization | If/else chains | Categorized error code sets | Maintainable, documented by Telnyx |
| Rate limiting | Custom counters | BullMQ job options + limiter | Built-in, Redis-backed |
| Webhook signature | Manual crypto | Telnyx SDK verifyWebhook | Security-critical, SDK handles edge cases |

**Key insight:** The existing Edge Function (`send-sms-alert`) already solved E.164 validation, error code mapping, rate limiting, and toll-free verification. Port these patterns rather than reinventing.

## Common Pitfalls

### Pitfall 1: Not Using maxRetriesPerRequest: null for Workers
**What goes wrong:** BullMQ workers fail with "max number of retries" Redis errors
**Why it happens:** BullMQ uses blocking Redis operations (BRPOPLPUSH) that need unlimited retries
**How to avoid:** Already implemented in Phase 15 worker entry point - verify it remains
**Warning signs:** Worker crashes after Redis connection hiccup

### Pitfall 2: Retrying Opted-Out Numbers
**What goes wrong:** Continued SMS attempts to numbers that sent STOP
**Why it happens:** Not checking error code 40300 before retrying
**How to avoid:** Throw UnrecoverableError for opted-out recipients
**Warning signs:** Same number appearing in failed jobs repeatedly

### Pitfall 3: Missing Exponential Backoff Jitter
**What goes wrong:** All retried jobs hit Telnyx API at same intervals
**Why it happens:** Default exponential backoff without jitter causes thundering herd
**How to avoid:** Add jitter option to backoff configuration
**Warning signs:** Telnyx rate limit errors after incident recovery

### Pitfall 4: Not Handling Toll-Free Verification Status
**What goes wrong:** SMS delivery blocked or degraded without warning
**Why it happens:** Toll-free verification pending/rejected affects deliverability
**How to avoid:** Log verification warnings but don't block sending (per existing Edge Function pattern)
**Warning signs:** Sudden delivery failures with 40008 errors

### Pitfall 5: Hardcoding Messaging Profile ID
**What goes wrong:** Wrong routing, messages blocked
**Why it happens:** Different profiles for different number types
**How to avoid:** Use environment variable TELNYX_MESSAGING_PROFILE_ID
**Warning signs:** Error 40013 (source number not associated with profile)

## Code Examples

Verified patterns from official sources and existing codebase:

### Telnyx SDK Initialization
```typescript
// Source: Telnyx Node.js SDK README
import Telnyx from 'telnyx';

// SDK automatically retries connection errors, 408, 409, 429, 5xx
const client = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY!,
  // Default maxRetries is 2 - we handle our own via BullMQ
  maxRetries: 0,
  // Default timeout is 60s
  timeout: 30000,
});
```

### BullMQ Worker with Typed Job Data
```typescript
// Source: BullMQ Workers documentation
import { Worker, Job } from 'bullmq';
import type { SmsNotificationJobData } from '../jobs/index.js';

const worker = new Worker<SmsNotificationJobData, { success: boolean }>(
  QueueNames.SMS_NOTIFICATIONS,
  async (job: Job<SmsNotificationJobData>) => {
    return processSmsNotification(job);
  },
  {
    connection, // Must have maxRetriesPerRequest: null
    concurrency: 5,
  }
);
```

### Job Options with Exponential Backoff and Jitter
```typescript
// Source: BullMQ Retrying Failed Jobs + existing jobs/index.ts
export const smsJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s initial, then 4s, 8s, 16s, 32s
    jitter: 0.2, // +/- 20% randomization to prevent thundering herd
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};
```

### E.164 Phone Number Validation
```typescript
// Source: Existing send-sms-alert Edge Function
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export function validateE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}
```

### Notification Delivery Database Update
```typescript
// Source: Existing notification_deliveries schema
import { db } from '../db/client.js';
import { notificationDeliveries } from '../db/schema/notifications.js';

await db.update(notificationDeliveries)
  .set({
    status: 'sent',
    externalId: messageId,
    sentAt: new Date(),
  })
  .where(eq(notificationDeliveries.id, deliveryId));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct REST API calls | Telnyx SDK v4 with TypeScript | 2024 | Full type safety, auto-retry |
| Bull v3 | BullMQ v5 | 2023 | Better TypeScript, flows, groups |
| Custom backoff | BullMQ exponential with jitter | Native | Prevents thundering herd |

**Deprecated/outdated:**
- Telnyx SDK v1/v2: Replaced by v4.x with Stainless-generated TypeScript
- Bull (without MQ): BullMQ is the maintained successor

## Open Questions

Things that couldn't be fully resolved:

1. **Telnyx SDK Error Type Structure**
   - What we know: SDK throws errors with code/title/detail from API response
   - What's unclear: Exact TypeScript type for error objects (not documented)
   - Recommendation: Use try/catch with type guard for error code extraction

2. **Toll-Free Verification Check Frequency**
   - What we know: Existing Edge Function checks on every send
   - What's unclear: Whether this adds latency or should be cached
   - Recommendation: Keep existing pattern initially, optimize if needed

3. **Rate Limit Per Organization**
   - What we know: Telnyx has global and per-profile rate limits
   - What's unclear: Whether to implement org-level rate limiting in BullMQ
   - Recommendation: Use BullMQ limiter if needed, start without

## Sources

### Primary (HIGH confidence)
- Telnyx Node.js SDK GitHub: https://github.com/team-telnyx/telnyx-node - Installation, TypeScript support, error handling
- BullMQ Official Docs: https://docs.bullmq.io/guide/workers - Worker configuration, concurrency
- BullMQ Retry Docs: https://docs.bullmq.io/guide/retrying-failing-jobs - Exponential backoff, jitter, UnrecoverableError
- Telnyx Error Codes: https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes - Error categorization

### Secondary (MEDIUM confidence)
- Existing Edge Function: `supabase/functions/send-sms-alert/index.ts` - E.164 validation, error mapping, rate limiting
- Existing Webhook Handler: `supabase/functions/telnyx-webhook/index.ts` - Status handling, signature verification
- Existing SMS Docs: `docs/engineering/SMS_NOTIFICATIONS.md` - System architecture, message lifecycle

### Tertiary (LOW confidence)
- WebSearch for Telnyx SDK v4 specifics - Some details unverified with official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Telnyx SDK officially documented, BullMQ proven in codebase
- Architecture: HIGH - Patterns derived from existing Edge Functions and BullMQ docs
- Pitfalls: HIGH - Documented in Telnyx error codes and BullMQ production guide

**Research date:** 2026-01-24
**Valid until:** 60 days (Telnyx SDK stable, BullMQ stable)
