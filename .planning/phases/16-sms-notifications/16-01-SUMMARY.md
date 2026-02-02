---
phase: 16-sms-notifications
plan: 01
subsystem: notifications
tags: [telnyx, sms, bullmq, error-handling]
dependency-graph:
  requires: [15-background-jobs-infrastructure]
  provides: [telnyx-service, error-categorization, sms-job-options]
  affects: [16-02, 16-03]
tech-stack:
  added: [telnyx@5.11.0]
  patterns: [singleton-service, error-categorization, exponential-backoff]
key-files:
  created:
    - backend/src/services/telnyx.service.ts
    - backend/src/config/telnyx.config.ts
  modified:
    - backend/package.json
    - backend/src/jobs/index.ts
decisions:
  - id: SMS-01
    decision: 'Use Telnyx SDK v5.11.0 with maxRetries: 0'
    rationale: 'BullMQ handles retries, SDK auto-retry would conflict'
  - id: SMS-02
    decision: '11 unrecoverable + 10 retryable error codes from Telnyx docs'
    rationale: 'Proper categorization prevents wasted retries on permanent failures'
  - id: SMS-03
    decision: 'Standard exponential backoff without jitter'
    rationale: "BullMQ doesn't natively support jitter; can add custom backoff if needed"
metrics:
  duration: 5m 22s
  completed: 2026-01-24
---

# Phase 16 Plan 01: Telnyx Service Foundation Summary

**One-liner:** Telnyx SDK integration with error categorization for SMS delivery via BullMQ workers

## What Was Built

1. **TelnyxService** (`backend/src/services/telnyx.service.ts`)
   - Wraps Telnyx SDK v5.11.0 with typed interface
   - `sendSms({ to, message, messagingProfileId? })` method
   - Singleton pattern matching QueueService pattern
   - Environment-based configuration (TELNYX_API_KEY, TELNYX_PHONE_NUMBER)
   - maxRetries: 0 to let BullMQ handle retries

2. **Error Categorization Config** (`backend/src/config/telnyx.config.ts`)
   - UNRECOVERABLE_CODES (11 codes): opted-out, invalid number, blocked, etc.
   - RETRYABLE_CODES (10 codes): rate limits, temporary failures, etc.
   - `categorizeError(code)` for retry behavior decisions
   - `validateE164(phone)` for phone number format validation
   - `extractErrorCode(error)` and `extractErrorMessage(error)` helpers

3. **SMS Job Options** (`backend/src/jobs/index.ts`)
   - `smsJobOptions` with 5 attempts (vs default 3)
   - 2s initial delay, exponential backoff (2s, 4s, 8s, 16s, 32s)
   - Extended SmsNotificationJobData with deliveryId, userId, alertType fields

## Commits

| Hash    | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| 7dc2afc | feat(16-01): install Telnyx SDK and create TelnyxService           |
| 90d4c46 | feat(16-01): add error categorization config and E.164 validation  |
| 2fcb1a3 | feat(16-01): add SMS-specific job options with exponential backoff |

## Decisions Made

| ID     | Decision                                    | Rationale                                                                |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------ |
| SMS-01 | Use Telnyx SDK v5.11.0 with maxRetries: 0   | BullMQ handles retries, SDK auto-retry would conflict                    |
| SMS-02 | 11 unrecoverable + 10 retryable error codes | Proper categorization prevents wasted retries on permanent failures      |
| SMS-03 | Standard exponential backoff without jitter | BullMQ doesn't natively support jitter; can add custom backoff if needed |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] `npm ls telnyx` shows telnyx@5.11.0 installed
- [x] `npx tsc --noEmit` compiles without errors
- [x] TelnyxService exports importable (TelnyxService, setTelnyxService, getTelnyxService)
- [x] Telnyx config exports importable (categorizeError, validateE164, extractErrorCode, extractErrorMessage, UNRECOVERABLE_CODES, RETRYABLE_CODES)
- [x] smsJobOptions exported with attempts: 5, backoff.type: 'exponential'

## Next Phase Readiness

### Blockers

None

### Prerequisites for 16-02 (SMS Notification Processor)

- [x] TelnyxService available for injection
- [x] Error categorization ready for UnrecoverableError handling
- [x] smsJobOptions ready for worker configuration
- [ ] Telnyx environment variables configured (user setup)

### User Setup Required (before 16-02 testing)

```bash
# .env variables needed
TELNYX_API_KEY=key_...        # From Telnyx Dashboard -> API Keys
TELNYX_PHONE_NUMBER=+1...     # From Telnyx Dashboard -> Numbers (E.164 format)
TELNYX_MESSAGING_PROFILE_ID=... # From Telnyx Dashboard -> Messaging -> Profiles
```
