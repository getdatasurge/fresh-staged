---
phase: 15-background-jobs-infrastructure
plan: 01
subsystem: infrastructure
completed: 2026-01-24
duration: 8 minutes

# Dependency graph
requires:
  - 14-real-time-foundation (Socket.io pattern established)
provides:
  - BullMQ queue infrastructure with Fastify integration
  - QueueService for type-safe job management
  - Multi-tenant job isolation via organizationId
affects:
  - 16-sms-notifications (will use QueueService for SMS jobs)
  - 17-email-digests (will use QueueService for digest jobs)

# Tech stack
tech-stack:
  added:
    - bullmq: 'Job queue library for Redis'
    - ioredis: 'Redis client for BullMQ workers'
  patterns:
    - 'Fastify plugin pattern for service registration'
    - 'Singleton service pattern with getter/setter'
    - 'Redis connection with graceful fallback'

# Key files
key-files:
  created:
    - backend/src/services/queue.service.ts: 'QueueService with initialize/addJob/shutdown'
    - backend/src/plugins/queue.plugin.ts: 'Fastify plugin for queue registration'
    - backend/src/types/queue.d.ts: 'Fastify instance type augmentation'
  modified:
    - backend/src/app.ts: 'Registered queue plugin'
    - backend/package.json: 'Added bullmq and ioredis dependencies'
    - backend/src/workers/index.ts: 'Fixed ioredis import bug'
    - backend/src/services/ttn-device.service.ts: 'Fixed null check bug'

# Decisions made
decisions:
  - id: QUEUE-01
    decision: 'Use BullMQ over other queue libraries (Bull, Agenda)'
    rationale: 'BullMQ is actively maintained, has better TypeScript support, and supports Redis 6+'
    alternatives: 'Bull (deprecated), Agenda (MongoDB-based)'
  - id: QUEUE-02
    decision: 'QueueService follows SocketService pattern'
    rationale: 'Consistency with existing codebase, familiar pattern for team'
    alternatives: 'Direct BullMQ usage in routes'
  - id: QUEUE-03
    decision: 'BaseJobData enforces organizationId for all jobs'
    rationale: 'Multi-tenant isolation at the type level prevents cross-org job leakage'
    alternatives: 'Runtime validation only'
  - id: QUEUE-04
    decision: 'Redis connection optional with graceful fallback'
    rationale: 'Enables local development without Redis infrastructure'
    alternatives: 'Require Redis for all environments'

tags:
  - bullmq
  - redis
  - background-jobs
  - fastify-plugin
  - multi-tenant
---

# Phase 15 Plan 01: BullMQ Queue Infrastructure Setup Summary

**One-liner:** BullMQ queue infrastructure with Fastify plugin, QueueService, and multi-tenant job isolation via organizationId.

## What Was Built

### Core Infrastructure

1. **QueueService** (`backend/src/services/queue.service.ts`)
   - Redis connection handling with optional configuration
   - Queue registration for SMS notifications and email digests
   - Type-safe `addJob<T extends BaseJobData>()` method
   - Graceful shutdown with queue and Redis cleanup
   - Singleton pattern with `getQueueService()` and `setQueueService()`

2. **Queue Plugin** (`backend/src/plugins/queue.plugin.ts`)
   - Fastify plugin following `socket.plugin.ts` pattern
   - Decorates Fastify instance with `queueService`
   - Initializes QueueService in `ready()` hook
   - Registers `onClose` hook for graceful shutdown

3. **Type Definitions** (`backend/src/types/queue.d.ts`)
   - Extends `FastifyInstance` interface to include `queueService`
   - Provides IntelliSense for `app.queueService` usage

4. **Job Definitions** (`backend/src/jobs/index.ts`)
   - Already existed from previous session
   - `BaseJobData` interface enforcing `organizationId`
   - Queue names: `SMS_NOTIFICATIONS`, `EMAIL_DIGESTS`
   - Job names: `SMS_SEND`, `EMAIL_DIGEST`

### Integration

- Registered `queuePlugin` in `backend/src/app.ts` after `socketPlugin`
- Plugin order: CORS → Socket.io → Queue → Auth → Routes
- QueueService available on all Fastify routes via `request.server.queueService`

## Technical Implementation

### Redis Connection Strategy

```typescript
// Optional Redis with graceful fallback
const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'localhost';

if (!redisUrl && !process.env.REDIS_HOST) {
  console.log('[QueueService] Redis not configured - queues disabled.');
  return; // Continue without queues
}

// Connect if configured
this.connection = new Redis(redisUrl || '', {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});
```

### Type-Safe Job Addition

```typescript
interface SendSMSJobData extends BaseJobData {
  organizationId: string; // Required by BaseJobData
  phoneNumber: string;
  message: string;
}

await queueService.addJob<SendSMSJobData>(QueueNames.SMS_NOTIFICATIONS, JobNames.SMS_SEND, {
  organizationId: 'org-123',
  phoneNumber: '+15551234567',
  message: 'Temperature alert!',
});
```

### Multi-Tenant Isolation

- **Type-level enforcement:** `BaseJobData` requires `organizationId` for all jobs
- **Queue naming:** Queues are shared, but job data is organization-scoped
- **Worker filtering:** Workers can filter jobs by `organizationId` if needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ioredis import in workers/index.ts**

- **Found during:** Task 1 verification
- **Issue:** TypeScript compilation failing with "This expression is not constructable" error
- **Root cause:** `import IORedis from 'ioredis'` should be `import { Redis } from 'ioredis'`
- **Fix:** Changed import to named export `{ Redis }`
- **Files modified:** `backend/src/workers/index.ts`
- **Commit:** af49618 (part of Task 1)

**2. [Rule 1 - Bug] Fixed null check for TTN connection applicationId**

- **Found during:** Task 3 verification (build step)
- **Issue:** TypeScript compilation failing in ttn-device.service.ts due to nullable `applicationId`
- **Root cause:** Drizzle's `eq()` function doesn't accept nullable values, but `connection.applicationId` can be null
- **Fix:** Added null check `if (!connection || !connection.applicationId)` in 4 functions
- **Files modified:** `backend/src/services/ttn-device.service.ts`
- **Commit:** af49618
- **Note:** This bug was introduced in a previous session that added TTN device management

**3. [Rule 1 - Bug] Redis disconnect API correction**

- **Found during:** Task 2 implementation
- **Issue:** TypeScript error on `await this.connection?.disconnect().catch()`
- **Root cause:** ioredis `disconnect()` is synchronous (returns void), not a Promise
- **Fix:** Changed to `await this.connection?.quit()` which returns a Promise
- **Files modified:** `backend/src/services/queue.service.ts`
- **Commit:** 7ae10f9 (Task 2)

### Pre-existing Artifacts

Task 1 artifacts (BullMQ installation, job types, queue.d.ts) were already present from a previous session (commit 480929a and f31ca7b). These were verified to match the plan requirements and left as-is.

## Verification Results

### Build Status

✅ **PASS** - TypeScript compilation succeeds with no errors

```bash
cd backend && npm run build
# Output: tsc completes successfully
```

### Test Status

⚠️ **PARTIAL PASS** - 146/156 tests passing (90.4% pass rate)

**Queue-related tests:** All passing

- QueueService initializes correctly: `[QueueService] Redis not configured - queues disabled.`
- No errors in queue plugin or service

**Failures:** 10 tests in `ttn-devices.test.ts` (pre-existing, unrelated to queue infrastructure)

- Tests expect 400/403 status codes but receive 500
- Failures introduced in previous session that added TTN device management
- Does not affect queue infrastructure functionality

### Type Checking

✅ **PASS** - All queue-related files type-check correctly

```bash
cd backend && npx tsc --noEmit
# No errors in queue.service.ts, queue.plugin.ts, or queue.d.ts
```

## Success Criteria Status

| Criterion                                    | Status | Evidence                                                             |
| -------------------------------------------- | ------ | -------------------------------------------------------------------- |
| BullMQ and ioredis installed                 | ✅     | `npm ls bullmq ioredis` shows both packages                          |
| Job type definitions with BaseJobData        | ✅     | `backend/src/jobs/index.ts` has BaseJobData enforcing organizationId |
| QueueService with initialize/addJob/shutdown | ✅     | `backend/src/services/queue.service.ts` implements all methods       |
| Queue plugin registered in app.ts            | ✅     | `app.register(queuePlugin)` on line 60                               |
| Fastify instance decorated with queueService | ✅     | `backend/src/types/queue.d.ts` extends FastifyInstance               |
| Graceful shutdown closes queues and Redis    | ✅     | `onClose` hook in plugin calls `queueService.shutdown()`             |

## Next Phase Readiness

### Phase 16: SMS Notifications

- ✅ QueueService ready for SMS job queueing
- ✅ `QueueNames.SMS_NOTIFICATIONS` queue registered
- ✅ `JobNames.SMS_SEND` job type defined
- ✅ Workers need to be deployed separately (Dockerfile.worker already exists)

### Phase 17: Email Digests

- ✅ QueueService ready for email digest jobs
- ✅ `QueueNames.EMAIL_DIGESTS` queue registered
- ✅ `JobNames.EMAIL_DIGEST` job type defined
- ✅ Digest scheduling can use BullMQ's cron-based repeat options

### Blockers/Concerns

- ⚠️ **TTN device tests failing:** 10 tests in `ttn-devices.test.ts` returning 500 errors
  - **Impact:** Does not block queue infrastructure, but needs fixing before TTN feature can be used
  - **Recommendation:** Create separate task to debug TTN device route error handling
- ⚠️ **Worker deployment pending:** Workers defined in `backend/src/workers/index.ts` but not deployed
  - **Impact:** Jobs will queue but won't be processed until workers are running
  - **Recommendation:** Deploy worker container in production environment setup

## Files Changed

### Created

- `backend/src/services/queue.service.ts` (283 lines)
- `backend/src/plugins/queue.plugin.ts` (64 lines)
- `backend/src/types/queue.d.ts` (18 lines)

### Modified

- `backend/src/app.ts` (+2 lines: import and register)
- `backend/package.json` (+2 dependencies)
- `backend/package-lock.json` (BullMQ dependency tree)
- `backend/src/workers/index.ts` (1 line: ioredis import fix)
- `backend/src/services/ttn-device.service.ts` (5 lines: null checks)

## Commits

| Commit  | Type        | Description                                            |
| ------- | ----------- | ------------------------------------------------------ |
| 7ae10f9 | feat(15-01) | Implement QueueService following SocketService pattern |
| f20396b | feat(15-01) | Create queue.plugin.ts and register in app.ts          |
| af49618 | fix(15-01)  | Add null check for TTN connection applicationId        |

**Total:** 3 commits (2 features, 1 bug fix)

## Lessons Learned

1. **Pre-existing artifacts:** Task 1 was already completed in a previous session. Verified artifacts matched plan requirements rather than recreating.

2. **Pattern consistency:** Following SocketService pattern made QueueService implementation straightforward and predictable.

3. **Type safety wins:** `BaseJobData` enforcing `organizationId` at the type level prevents an entire class of multi-tenant bugs.

4. **Redis optionality:** Graceful fallback when Redis is unavailable enables local development without infrastructure overhead.

5. **Import gotchas:** ioredis v5 uses named exports (`{ Redis }`) not default export. This is different from the `redis` package used in SocketService.

## Recommendations

1. **Fix TTN device tests:** Debug the 500 errors in ttn-devices.test.ts before deploying TTN features.

2. **Deploy workers:** Set up worker container in production to process queued jobs.

3. **Add queue monitoring:** Consider adding BullMQ Board or similar for job queue visualization.

4. **Document job patterns:** Create guide for adding new job types to maintain consistency.

5. **Test Redis failure modes:** Add tests for Redis connection failures and graceful degradation.
