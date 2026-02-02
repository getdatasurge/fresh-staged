---
phase: 30-system-hardening
plan: 03
subsystem: api
tags: [supabase, error-handling, migration, typescript]

# Dependency graph
requires:
  - phase: 28-supabase-removal
    provides: supabase-placeholder.ts stub for graceful degradation
provides:
  - SupabaseMigrationError typed error class
  - isSupabaseMigrationError helper for UI error detection
  - __unavailable marker for feature identification
affects: [ui-error-handling, feature-availability-display]

# Tech tracking
tech-stack:
  added: []
  patterns: [typed-error-classes, feature-unavailability-markers]

key-files:
  created: []
  modified: [src/lib/supabase-placeholder.ts]

key-decisions:
  - 'Use TypeScript class for error with isSupabaseMigration flag for cross-module detection'
  - 'Include function name in both error message and __unavailable property for UI flexibility'

patterns-established:
  - 'SupabaseMigrationError: Use for any migration-related unavailable features'
  - 'isSupabaseMigrationError helper: Check for migration errors across module boundaries'

# Metrics
duration: 1min
completed: 2026-01-29
---

# Phase 30 Plan 03: Supabase Placeholder Structured Errors Summary

**SupabaseMigrationError class and helper for UI-friendly feature unavailability messages**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-29T03:24:08Z
- **Completed:** 2026-01-29T03:25:35Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added SupabaseMigrationError typed error class for clear error identification
- Added isSupabaseMigrationError helper that works across module boundaries
- Updated functions.invoke to return structured error with function name
- Updated rpc to return structured error with \_\_unavailable marker

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance supabase-placeholder with structured error responses** - `6cae7ba` (feat)

## Files Created/Modified

- `src/lib/supabase-placeholder.ts` - Enhanced with SupabaseMigrationError class, isSupabaseMigrationError helper, and structured error responses in functions.invoke and rpc

## Decisions Made

- Used a TypeScript class extending Error with `isSupabaseMigration` flag for reliable cross-module error detection (instanceof can fail across module boundaries)
- Included function name in both error.message and \_\_unavailable property to give UI components flexibility in how to display unavailability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Placeholder now provides structured errors for UI consumption
- UI components can use isSupabaseMigrationError to detect migration-related failures
- Feature names are available via error.featureName or \_\_unavailable property

---

_Phase: 30-system-hardening_
_Completed: 2026-01-29_
