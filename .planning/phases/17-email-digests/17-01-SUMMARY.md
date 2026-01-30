---
phase: 17-email-digests
plan: 01
subsystem: database
tags: [drizzle, postgres, bullmq, scheduler, preferences, api]

# Dependency graph
requires:
  - phase: 15-background-jobs-infrastructure
    provides: BullMQ queue service and job scheduler utilities
provides:
  - digestDailyTime and digestSiteIds profile columns
  - User-configurable scheduler timing via dailyTime parameter
  - Extended preferences API for new digest fields
affects: [17-02, 17-03, email-templates, digest-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - JSON text column for array storage (digestSiteIds)
    - HH:MM time string for cron generation

key-files:
  created:
    - backend/drizzle/0003_digest_preferences.sql
  modified:
    - backend/src/db/schema/users.ts
    - backend/src/jobs/schedulers/digest-schedulers.ts
    - backend/src/routes/preferences.ts

key-decisions:
  - 'Store digestSiteIds as JSON text for simplicity (vs junction table)'
  - 'HH:MM format for digestDailyTime (5 chars, 24-hour)'
  - "Weekly digest uses same dailyTime as daily (Monday at user's time)"

patterns-established:
  - 'Time preference as varchar(5) HH:MM format with regex validation'
  - 'JSON.stringify/parse for array columns in API layer'

# Metrics
duration: 4min
completed: 2026-01-24
---

# Phase 17 Plan 01: Digest Preferences Summary

**User-configurable daily digest time and site filtering via profile schema extension with scheduler integration**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-24T17:02:03Z
- **Completed:** 2026-01-24T17:06:35Z
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- Added digestDailyTime column (varchar(5), default '09:00') to profiles table
- Added digestSiteIds column (text, nullable) for JSON array of site UUIDs
- Updated scheduler to use user's preferred time instead of hardcoded 9 AM
- Extended preferences API to accept, validate, and return new fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Add digest preference columns to profile schema** - `89a6ddd` (feat)
2. **Task 2: Update scheduler to use user's daily time** - `dd72f6f` (feat)
3. **Task 3: Update preferences API to handle new fields** - `e8ddb66` (feat)

## Files Created/Modified

- `backend/drizzle/0003_digest_preferences.sql` - Migration adding new columns
- `backend/src/db/schema/users.ts` - Profile schema with digestDailyTime, digestSiteIds
- `backend/src/jobs/schedulers/digest-schedulers.ts` - Scheduler using dailyTime parameter
- `backend/src/routes/preferences.ts` - API handling new fields with JSON serialization

## Decisions Made

- **JSON text for digestSiteIds:** Simpler than junction table for storing array of UUIDs; fast enough for preferences
- **5-char varchar for time:** "HH:MM" format is compact and human-readable; validated via regex
- **Weekly uses daily time:** Both digests use user's preferred time (weekly on Monday at that time)
- **Regex validation for HH:MM:** `/^([01]\d|2[0-3]):[0-5]\d$/` ensures valid 24-hour format

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Profile schema ready for digest builder to query digestSiteIds for site filtering
- Scheduler correctly uses user's preferred time
- Ready for Plan 02 (DigestBuilderService grouping) and Plan 03 (email template updates)

---

_Phase: 17-email-digests_
_Completed: 2026-01-24_
