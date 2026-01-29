---
phase: 33-error-handling-ui-integration
plan: 02
subsystem: ui
tags: [react, error-handling, supabase-migration, toast]

# Dependency graph
requires:
  - phase: 33-01
    provides: isSupabaseMigrationError helper, handleError with migration detection
  - phase: 30-03
    provides: SupabaseMigrationError class in supabase-placeholder.ts
provides:
  - Migration-aware error handling in 6 UI components
  - Graceful degradation for supabase-placeholder operations
  - User-friendly "temporarily unavailable" messaging
affects: [33-03, error-handling, user-experience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Silent failure for background operations (notifications loading)
    - Toast feedback for user-initiated operations (form submit)
    - Feature-specific migration messages per operation type

key-files:
  created: []
  modified:
    - src/components/LogTempModal.tsx
    - src/components/NotificationDropdown.tsx
    - src/contexts/SuperAdminContext.tsx
    - src/components/debug/RBACDebugPanel.tsx
    - src/pages/Onboarding.tsx
    - src/components/admin/SensorSimulatorPanel.tsx

key-decisions:
  - "Background operations (notification loading) fail silently with console warning"
  - "User-initiated operations (form submit) show toast with feature-specific message"
  - "SuperAdminContext sets roleLoadError with migration-specific text"

patterns-established:
  - "Import isSupabaseMigrationError for migration error detection in catch blocks"
  - "Feature-specific messages: '[Feature] is being migrated' vs generic 'unavailable'"

# Metrics
duration: 6min
completed: 2026-01-29
---

# Phase 33 Plan 02: Error-Wrapped UI Components Summary

**Migration error handling wired to 6 UI components with graceful degradation and user-friendly "feature temporarily unavailable" messaging**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-29T08:20:00Z
- **Completed:** 2026-01-29T08:26:00Z
- **Tasks:** 2/2
- **Files modified:** 6

## Accomplishments
- LogTempModal shows migration toast on save failure, still saves offline as fallback
- NotificationDropdown handles migration errors silently for background loading
- SuperAdminContext shows "unavailable during migration" for role check errors
- RBACDebugPanel shows "RPC unavailable during migration" for debug RPC calls
- Onboarding shows feature-specific migration messages for each step
- SensorSimulatorPanel shows migration unavailable toast on simulator errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Update UI components with migration error handling** - `7734bc8` (feat)
2. **Task 2: Human verification checkpoint** - No commit (verification only)

## Files Created/Modified
- `src/components/LogTempModal.tsx` - Added handleError + isSupabaseMigrationError for migration-aware save
- `src/components/NotificationDropdown.tsx` - Silent migration error handling for background loading
- `src/contexts/SuperAdminContext.tsx` - Migration-specific error message for role check
- `src/components/debug/RBACDebugPanel.tsx` - Migration detection for debug RPC calls
- `src/pages/Onboarding.tsx` - Feature-specific migration messages for org/site/area/unit/gateway creation
- `src/components/admin/SensorSimulatorPanel.tsx` - Migration toast for simulator errors

## Decisions Made
- **Background vs user-initiated operations:** Background operations (like notification loading) fail silently with console.warn. User-initiated operations (like form submit) show toast feedback.
- **Feature-specific messages:** Each operation shows context-specific message (e.g., "Organization creation is being migrated") rather than generic "unavailable" to help users understand scope.
- **Offline fallback preserved:** LogTempModal still saves to offline storage after showing migration toast - graceful degradation maintained.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## User Verification
User tested on /settings page:
- No crashes observed
- `[supabase-placeholder] Supabase calls are disabled` message appeared in console
- App remained functional (navigation working, rerenders happening)
- tRPC connection errors due to backend not running (unrelated to migration handling)

## Next Phase Readiness
- Migration error handling complete for key UI components
- Ready for Plan 03: Per-feature error state with manual retry
- MigrationErrorBoundary from Plan 01 available for wrapping additional components

---
*Phase: 33-error-handling-ui-integration*
*Completed: 2026-01-29*
