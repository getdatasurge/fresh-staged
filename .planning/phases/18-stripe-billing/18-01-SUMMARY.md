---
phase: 18-stripe-billing
plan: 01
subsystem: billing
tags: [stripe, bullmq, drizzle, postgres, idempotency, webhooks]

# Dependency graph
requires:
  - phase: 15-background-jobs-infrastructure
    provides: BullMQ job registry pattern and queue service
provides:
  - stripeEvents table for webhook idempotency
  - MeterReportJobData interface for usage metering
  - METER_REPORTING queue and job name constants
affects: [18-02 webhook endpoint, 18-03 meter service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Stripe event idempotency via unique eventId index
    - Meter job types with eventName literal union

key-files:
  created:
    - backend/src/db/schema/billing.ts
    - backend/drizzle/0004_stripe_events.sql
  modified:
    - backend/src/db/schema/index.ts
    - backend/src/jobs/index.ts
    - backend/drizzle/meta/_journal.json

key-decisions:
  - "Write migration SQL manually due to drizzle-kit ESM module resolution issues"
  - "Meter event names use literal union type for compile-time safety"
  - "5 attempts with 5s backoff for meter reporting (Stripe idempotent)"

patterns-established:
  - "billing.ts schema file for Stripe-related tables"
  - "Meter reporting job data with eventName, value, timestamp"

# Metrics
duration: 4min
completed: 2026-01-24
---

# Phase 18 Plan 01: Billing Foundation Summary

**Stripe webhook idempotency table and meter reporting job types for usage-based billing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-24T18:21:15Z
- **Completed:** 2026-01-24T18:25:02Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created stripeEvents table with unique eventId index for webhook deduplication
- Added migration file for stripe_events table with proper comments
- Added MeterReportJobData interface with eventName, value, timestamp fields
- Added METER_REPORTING queue and METER_REPORT job name constants

## Task Commits

Each task was committed atomically:

1. **Task 1: Create stripeEvents table schema and migration** - `6cf5f43` (feat)
2. **Task 2: Add meter reporting job types to jobs registry** - `4e4ce06` (feat)

## Files Created/Modified
- `backend/src/db/schema/billing.ts` - stripeEvents table for webhook idempotency
- `backend/src/db/schema/index.ts` - Re-export billing schema
- `backend/drizzle/0004_stripe_events.sql` - Migration for stripe_events table
- `backend/drizzle/meta/_journal.json` - Updated with migration entries
- `backend/src/jobs/index.ts` - MeterReportJobData, queue/job constants, options

## Decisions Made

1. **Write migration SQL manually** - drizzle-kit has ESM module resolution issues with .js imports in schema files. Manual migration matches existing pattern (0003_digest_preferences.sql was also manual).

2. **Meter event names as literal union** - Using `'active_sensors' | 'temperature_readings'` provides compile-time safety and documents the exact meter types Stripe expects.

3. **5 attempts with 5s initial backoff for meter reporting** - Stripe meter events are idempotent, so more retries are safe. Longer initial delay prevents hammering Stripe API on transient failures.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**drizzle-kit ESM resolution** - The `pnpm db:generate` command fails with "Cannot find module './enums.js'" due to drizzle-kit's CommonJS loader not understanding the .js extension in ESM imports. This is a pre-existing issue (previous migrations were also written manually). Wrote migration SQL file directly following established pattern.

## User Setup Required

None - no external service configuration required. Migration will be applied during deployment.

## Next Phase Readiness

- stripeEvents table ready for Plan 02 (webhook endpoint) to use for idempotency
- MeterReportJobData ready for Plan 03 (meter service) to queue usage reports
- No blockers for Plan 02

---
*Phase: 18-stripe-billing*
*Completed: 2026-01-24*
