# Phase 17: Email Digests - Research

**Researched:** 2026-01-24
**Domain:** BullMQ Job Schedulers with Timezone-Aware Cron Patterns
**Confidence:** HIGH

## Summary

Phase 17 builds on the comprehensive infrastructure already implemented in Phases 15-16. The codebase contains complete, working implementations for: EmailService (Resend integration), email digest processor, React Email templates (daily/weekly), DigestBuilderService for alert aggregation, and digest scheduler management utilities. The BullMQ job queue infrastructure, worker setup, and job type definitions are all in place.

The remaining work focuses on enhancing user preference management (adding configurable daily digest time, site filtering), ensuring the scheduler sync is called when preferences change, and potentially enhancing the digest content to group alerts by site then unit as specified in the CONTEXT.md decisions. The existing DigestBuilderService queries alerts but presents them in a flat list - the grouping requirement from user decisions needs implementation.

The profiles table already has `digestDaily`, `digestWeekly`, `emailEnabled`, and `timezone` fields. The CONTEXT.md specifies user-configurable daily timing (user picks preferred time) rather than the current hardcoded 9 AM. This requires adding a `digestDailyTime` field to profiles and updating the scheduler sync to use it.

**Primary recommendation:** Extend the existing infrastructure with minimal changes: add `digestDailyTime` field to profiles schema, add site filtering via a `digestSiteIds` JSON array column, implement site/unit grouping in DigestBuilderService, and ensure profile update endpoints call `syncUserDigestSchedulers`.

## Standard Stack

The established libraries/tools for this domain (all already installed):

### Core

| Library                 | Version | Purpose                             | Why Standard                                                           |
| ----------------------- | ------- | ----------------------------------- | ---------------------------------------------------------------------- |
| bullmq                  | ^5.67.0 | Job schedulers with repeatable jobs | Already installed, supports timezone-aware cron via upsertJobScheduler |
| @react-email/components | ^0.0.34 | Email template components           | Already installed, templates exist                                     |
| @react-email/render     | ^1.0.5  | React to HTML rendering             | Already installed, used by processors                                  |
| resend                  | ^4.2.0  | Email sending API                   | Already installed, EmailService implemented                            |
| ioredis                 | ^5.9.2  | Redis client for BullMQ             | Already installed, workers configured                                  |

### Supporting

| Library     | Version | Purpose            | When to Use                             |
| ----------- | ------- | ------------------ | --------------------------------------- |
| drizzle-orm | ^0.38.0 | Database queries   | Already used by DigestBuilderService    |
| zod         | ^4.3.6  | Request validation | Already installed, validate preferences |

### Alternatives Considered

| Instead of                | Could Use               | Tradeoff                                                              |
| ------------------------- | ----------------------- | --------------------------------------------------------------------- |
| BullMQ upsertJobScheduler | Node-cron + manual jobs | BullMQ scheduler is Redis-backed, survives restarts, handles timezone |
| React Email               | MJML                    | React Email already in use, consistent patterns                       |
| JSON column for siteIds   | Junction table          | JSON simpler for array of UUIDs, fast enough for digest preferences   |

**Installation:**

```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure (Existing)

```
backend/src/
├── services/
│   ├── email.service.ts           # EXISTS - Resend wrapper
│   ├── digest-builder.service.ts  # EXISTS - Alert aggregation (needs grouping)
│   └── queue.service.ts           # EXISTS - BullMQ queue management
├── workers/
│   ├── index.ts                   # EXISTS - Worker entry point
│   └── processors/
│       └── email-digest.processor.ts  # EXISTS - Digest job processor
├── jobs/
│   ├── index.ts                   # EXISTS - Job types including EmailDigestJobData
│   └── schedulers/
│       └── digest-schedulers.ts   # EXISTS - syncUserDigestSchedulers
├── emails/
│   ├── daily-digest.tsx           # EXISTS - Daily template
│   ├── weekly-digest.tsx          # EXISTS - Weekly template
│   └── components/
│       └── alert-row.tsx          # EXISTS - Alert row component
├── plugins/
│   ├── email.plugin.ts            # EXISTS - Fastify integration
│   └── queue.plugin.ts            # EXISTS - BullMQ + Bull Board
└── db/schema/
    └── users.ts                   # EXISTS - needs digestDailyTime, digestSiteIds
```

### Pattern 1: BullMQ Job Scheduler with Timezone and Custom Time

**What:** Use upsertJobScheduler for per-user scheduled jobs with timezone-aware cron
**When to use:** Creating/updating user digest schedules
**Example:**

```typescript
// Source: Existing digest-schedulers.ts (verified in codebase)
// Extended for user-configurable time

export async function syncUserDigestSchedulers(
  userId: string,
  organizationId: string,
  preferences: {
    dailyEnabled: boolean;
    weeklyEnabled: boolean;
    timezone: string;
    dailyTime?: string; // "HH:MM" format, defaults to "09:00"
  },
): Promise<void> {
  const queueService = getQueueService();
  if (!queueService || !queueService.isRedisEnabled()) {
    console.log('[DigestSchedulers] Queue service not available - skipping');
    return;
  }

  const queue = queueService.getQueue(QueueNames.EMAIL_DIGESTS);
  if (!queue) return;

  const { dailyEnabled, weeklyEnabled, timezone, dailyTime = '09:00' } = preferences;

  // Parse user's preferred time
  const [hour, minute] = dailyTime.split(':').map(Number);

  if (dailyEnabled) {
    await queue.upsertJobScheduler(
      `digest-daily-${userId}`,
      {
        pattern: `${minute} ${hour} * * *`, // User's chosen time daily
        tz: timezone,
      },
      {
        name: JobNames.EMAIL_DIGEST,
        data: { organizationId, userId, period: 'daily' } as EmailDigestJobData,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    );
  } else {
    await queue.removeJobScheduler(`digest-daily-${userId}`);
  }

  // Weekly: Monday at user's preferred time
  if (weeklyEnabled) {
    await queue.upsertJobScheduler(
      `digest-weekly-${userId}`,
      {
        pattern: `${minute} ${hour} * * 1`, // Monday at user's time
        tz: timezone,
      },
      {
        name: JobNames.EMAIL_DIGEST,
        data: { organizationId, userId, period: 'weekly' } as EmailDigestJobData,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    );
  } else {
    await queue.removeJobScheduler(`digest-weekly-${userId}`);
  }
}
```

### Pattern 2: Digest Data Grouped by Site then Unit

**What:** Structure alert data hierarchically for email template
**When to use:** DigestBuilderService.buildDigestData return type
**Example:**

```typescript
// Enhanced digest data structure for site -> unit grouping
export interface GroupedDigestData {
  sites: Array<{
    siteId: string;
    siteName: string;
    units: Array<{
      unitId: string;
      unitName: string;
      alerts: DigestAlert[];
    }>;
  }>;
  summary: DigestSummary;
  organizationName: string;
  period: 'daily' | 'weekly';
  startDate: Date;
  endDate: Date;
}

// In DigestBuilderService
async buildGroupedDigestData(
  userId: string,
  organizationId: string,
  period: 'daily' | 'weekly',
  startDate: Date,
  endDate: Date,
  siteIds?: string[] // Optional site filtering
): Promise<GroupedDigestData> {
  // Query alerts with site/unit joins
  let query = db
    .select({
      id: alerts.id,
      severity: alerts.severity,
      message: alerts.message,
      triggeredAt: alerts.triggeredAt,
      status: alerts.status,
      unitId: units.id,
      unitName: units.name,
      siteId: sites.id,
      siteName: sites.name,
    })
    .from(alerts)
    .innerJoin(units, eq(alerts.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(
      and(
        eq(sites.organizationId, organizationId),
        gte(alerts.triggeredAt, startDate),
        lte(alerts.triggeredAt, endDate),
        // Optional site filtering
        siteIds?.length ? inArray(sites.id, siteIds) : undefined
      )
    )
    .orderBy(sites.name, units.name, desc(alerts.triggeredAt))
    .limit(50);

  // Group results by site then unit
  // ... grouping logic
}
```

### Pattern 3: Profile Schema Extension

**What:** Add digestDailyTime and digestSiteIds to profiles table
**When to use:** Migration for user preferences
**Example:**

```typescript
// In db/schema/users.ts profiles table
export const profiles = pgTable('profiles', {
  // ... existing fields
  digestDaily: boolean('digest_daily').notNull().default(false),
  digestWeekly: boolean('digest_weekly').notNull().default(false),
  digestDailyTime: varchar('digest_daily_time', { length: 5 }).notNull().default('09:00'), // "HH:MM" format
  digestSiteIds: text('digest_site_ids'), // JSON array of site UUIDs, null = all sites
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  // ...
});
```

### Pattern 4: One-Click Unsubscribe Token

**What:** Generate secure token for email unsubscribe links
**When to use:** Building unsubscribeUrl in processor
**Example:**

```typescript
// Simple approach: signed JWT with short expiry
import { SignJWT, jwtVerify } from 'jose';

const UNSUBSCRIBE_SECRET = new TextEncoder().encode(
  process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET,
);

export async function generateUnsubscribeToken(
  userId: string,
  type: 'daily' | 'weekly' | 'all',
): Promise<string> {
  return new SignJWT({ userId, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d') // Token valid for 30 days
    .sign(UNSUBSCRIBE_SECRET);
}

export async function verifyUnsubscribeToken(
  token: string,
): Promise<{ userId: string; type: string } | null> {
  try {
    const { payload } = await jwtVerify(token, UNSUBSCRIBE_SECRET);
    return payload as { userId: string; type: string };
  } catch {
    return null;
  }
}

// In processor
const unsubscribeToken = await generateUnsubscribeToken(userId, period);
const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}`;
```

### Anti-Patterns to Avoid

- **Computing date ranges in scheduler creation:** Already avoided - the existing processor calculates startDate/endDate at execution time, which is correct
- **Hardcoded schedule times:** Current code uses 9 AM - needs to use user preference
- **Sending empty digests:** Already handled - processor skips if alerts.length === 0
- **Not calling scheduler sync on preference changes:** Must ensure profile update endpoints trigger syncUserDigestSchedulers
- **Storing sensitive data in job payloads:** Job data only contains userId, organizationId, period - correct pattern

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                   | Don't Build                    | Use Instead                                | Why                                        |
| ------------------------- | ------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Timezone-aware scheduling | Date manipulation + setTimeout | BullMQ upsertJobScheduler with tz option   | Handles DST transitions, survives restarts |
| Email templates           | String concatenation           | React Email components                     | Type-safe, reusable components, responsive |
| HTML to plain text        | Custom stripping               | React Email render() with plainText option | Handles edge cases, proper formatting      |
| Cron pattern generation   | Manual string building         | Standard cron syntax                       | BullMQ validates patterns, well-documented |
| Alert grouping            | Multiple queries               | SQL GROUP BY with drizzle                  | Single query, efficient                    |
| Unsubscribe tokens        | Custom token format            | JWT with expiry                            | Standard, secure, verifiable               |

**Key insight:** The codebase already has 90% of the implementation. The work is configuration and wiring, not new architecture.

## Common Pitfalls

### Pitfall 1: Scheduler Not Updated When Preferences Change

**What goes wrong:** User changes digest settings but old schedule continues
**Why it happens:** Profile update endpoint doesn't call syncUserDigestSchedulers
**How to avoid:** Add scheduler sync call in profile update route handler
**Warning signs:** Jobs running at old times, disabled digests still sending
**Fix:**

```typescript
// In profile update handler
await db.update(profiles).set(updatedData).where(eq(profiles.userId, userId));

// Sync schedulers after preference change
if (
  'digestDaily' in updatedData ||
  'digestWeekly' in updatedData ||
  'timezone' in updatedData ||
  'digestDailyTime' in updatedData
) {
  await syncUserDigestSchedulers(userId, organizationId, {
    dailyEnabled: profile.digestDaily,
    weeklyEnabled: profile.digestWeekly,
    timezone: profile.timezone,
    dailyTime: profile.digestDailyTime,
  });
}
```

### Pitfall 2: Timezone Changes Not Reflected in Scheduler

**What goes wrong:** User changes timezone, digest still sends at old time
**Why it happens:** upsertJobScheduler uses old tz value from Redis
**How to avoid:** Always upsert (not just create) scheduler on preference change
**Warning signs:** Digest arrives at wrong local time after timezone change
**Fix:** The existing upsertJobScheduler pattern handles this correctly - just ensure it's called on timezone changes

### Pitfall 3: Missing Site Filter in Digest Query

**What goes wrong:** User selects specific sites but receives alerts from all sites
**Why it happens:** DigestBuilderService ignores siteIds parameter
**How to avoid:** Add site filtering to alert query
**Warning signs:** Digest contains alerts from sites user didn't select

### Pitfall 4: Unsubscribe Link Not Working

**What goes wrong:** Users click unsubscribe, nothing happens
**Why it happens:** Missing unsubscribe endpoint, invalid token, token expired
**How to avoid:** Implement /unsubscribe endpoint, use reasonable token expiry (30 days)
**Warning signs:** Complaints about unsubscribe not working, spam reports

### Pitfall 5: Plain Text Fallback Missing

**What goes wrong:** Email appears blank in text-only clients
**Why it happens:** Only HTML rendered, no plain text version
**How to avoid:** Use @react-email/render plainText option
**Warning signs:** Emails appear empty on older email clients
**Fix:**

```typescript
import { render } from '@react-email/render';

const html = await render(Template(props));
const text = await render(Template(props), { plainText: true });

await emailService.sendDigest({
  to: user.email,
  subject: '...',
  html,
  text, // Add plain text version
});
```

### Pitfall 6: DST Transition Handling

**What goes wrong:** Digest sends at wrong time during DST change
**Why it happens:** Naive timezone handling doesn't account for offset changes
**How to avoid:** BullMQ's tz option handles this correctly with IANA timezone names
**Warning signs:** Schedule off by 1 hour twice per year
**Prevention:** Always use IANA timezone names (America/New_York), not offsets (UTC-5)

## Code Examples

Verified patterns from existing codebase:

### Existing EmailService Usage

```typescript
// Source: backend/src/services/email.service.ts (verified)
const emailService = getEmailService();
if (!emailService || !emailService.isEnabled()) {
  return { success: false, reason: 'email_service_disabled' };
}

const result = await emailService.sendDigest({
  to: user.email,
  subject: `Your ${period} alert digest - ${summary.total} alerts`,
  html,
});
```

### Existing Scheduler Pattern

```typescript
// Source: backend/src/jobs/schedulers/digest-schedulers.ts (verified)
await queue.upsertJobScheduler(
  `digest-daily-${userId}`,
  {
    pattern: '0 9 * * *', // 9 AM daily
    tz: timezone,
  },
  {
    name: JobNames.EMAIL_DIGEST,
    data: { organizationId, userId, period: 'daily' } as EmailDigestJobData,
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  },
);
```

### Existing Digest Processor Skip Logic

```typescript
// Source: backend/src/workers/processors/email-digest.processor.ts (verified)
// Skip if no alerts (don't send empty digests)
if (digestData.alerts.length === 0) {
  console.log(`[Email Digest] No alerts for user ${userId} - skipping send`);
  return { success: true, reason: 'no_content' };
}
```

### Existing Profile Preferences Check

```typescript
// Source: backend/src/workers/processors/email-digest.processor.ts (verified)
// Check if emails enabled globally
if (!user.emailEnabled) {
  return { success: false, reason: 'user_disabled_emails' };
}

// Check if specific digest type enabled
if (period === 'daily' && !user.digestDaily) {
  return { success: false, reason: 'daily_digest_disabled' };
}
```

## State of the Art

| Old Approach          | Current Approach          | When Changed  | Impact                                   |
| --------------------- | ------------------------- | ------------- | ---------------------------------------- |
| Bull repeatableJobs   | BullMQ upsertJobScheduler | BullMQ 4.0+   | Per-job scheduler with update capability |
| HTML string templates | React Email components    | 2023          | Type-safe, responsive, maintainable      |
| Moment.js timezones   | IANA tz in cron patterns  | BullMQ native | No extra dependency                      |
| Fixed schedule times  | User-configurable times   | Best practice | User control, better engagement          |

**Deprecated/outdated:**

- Bull (v4): Use BullMQ for new features like upsertJobScheduler
- moment-timezone: IANA timezone names work natively with BullMQ

## Open Questions

Things that couldn't be fully resolved:

1. **Site Selection UI Complexity**
   - What we know: Need to store selected site IDs in profile
   - What's unclear: How many sites typical user has, whether to use checkbox list or multi-select
   - Recommendation: Store as JSON array in profile, let frontend decide UI pattern

2. **Digest Email Limits**
   - What we know: Current limit is 50 alerts, display limit is 10 in template
   - What's unclear: Whether these limits are appropriate for weekly digest (7x daily data)
   - Recommendation: Keep limits, weekly just covers longer period not more data

3. **Resend Plain Text API**
   - What we know: EmailService.sendDigest currently only sends html
   - What's unclear: Whether Resend SDK supports text field alongside html
   - Recommendation: Test Resend API with both html and text fields

4. **Unsubscribe Token Storage**
   - What we know: JWT approach doesn't require storage
   - What's unclear: Whether to add unsubscribe audit log for compliance
   - Recommendation: Start with stateless JWT, add audit if compliance requires

## Sources

### Primary (HIGH confidence)

- Codebase: backend/src/services/email.service.ts - Complete Resend integration
- Codebase: backend/src/workers/processors/email-digest.processor.ts - Working processor
- Codebase: backend/src/jobs/schedulers/digest-schedulers.ts - Scheduler sync utilities
- Codebase: backend/src/emails/daily-digest.tsx - React Email template
- Codebase: backend/src/db/schema/users.ts - Profile schema with digest fields

### Secondary (MEDIUM confidence)

- Phase 15 Research: BullMQ upsertJobScheduler patterns and timezone handling
- Phase 16 Research: BullMQ worker patterns, error handling

### Tertiary (LOW confidence)

- React Email plainText option - needs verification via testing

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - Patterns verified in existing codebase, minimal changes needed
- Pitfalls: HIGH - Based on existing implementation and Phase 15-16 research
- Scheduler patterns: HIGH - upsertJobScheduler verified in existing code

**Research date:** 2026-01-24
**Valid until:** 2026-03-24 (60 days - stable infrastructure)
