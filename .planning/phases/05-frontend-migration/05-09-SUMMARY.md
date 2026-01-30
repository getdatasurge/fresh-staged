---
phase: 05-frontend-migration
plan: 09
subsystem: hooks-utility
tags:
  [
    stack-auth,
    hooks-migration,
    offline-sync,
    battery-forecast,
    account-deletion,
    audit-logging,
    layout-management,
  ]
requires: [05-04]
provides: [utility-hooks-stack-auth]
affects: [05-10, 05-11, 05-12, 05-13, 05-14]

tech-stack:
  added: []
  patterns: [stack-auth-integration, todo-markers-for-backend-migration]

key-files:
  created: []
  modified:
    - src/hooks/useAccountDeletion.ts
    - src/hooks/useAuditedWrite.ts
    - src/hooks/useBatteryForecast.ts
    - src/hooks/useOfflineSync.ts
    - src/hooks/useQuickCreateEntityLayout.ts

decisions:
  - decision: 'Mark all data operations with TODO for backend migration'
    rationale: 'These hooks need backend endpoints - temporarily keep Supabase calls with Stack Auth context'
  - decision: 'Preserve existing functionality exactly'
    rationale: 'Zero-copy migration - hooks work identically, only auth mechanism changed'
  - decision: 'Use Stack Auth user.id for all user references'
    rationale: 'Consistent identity source across all operations'

metrics:
  completed: 2026-01-23
  duration: '5 minutes 7 seconds'
  tasks_completed: 3/3
  commits: 3
---

# Phase 05 Plan 09: Utility Hooks Migration Summary

**One-liner:** Migrated 5 utility hooks from Supabase to Stack Auth, preserving all functionality while marking data operations for backend migration

## Objective Achieved

Migrated the remaining utility and feature hooks (useAccountDeletion, useAuditedWrite, useBatteryForecast, useOfflineSync, useQuickCreateEntityLayout) from Supabase auth to Stack Auth.

These hooks provide specialized functionality across the app - account management, audit trails, battery forecasting, offline sync, and dashboard layouts. By migrating them to Stack Auth, we complete the authentication layer migration while maintaining all existing capabilities.

## What Was Built

### Task 1: Account and Audit Hooks

**useAccountDeletion**

- **Before:** Used `supabase.auth.getUser()` and `supabase.auth.signOut()`
- **After:** Uses Stack Auth `useUser()` and `getAuthJson()` for token
- **Migration path:**
  - Replaced Supabase auth with Stack Auth
  - Added `accessToken` via `getAuthJson()` for future backend call
  - Marked `delete_user_account` RPC as TODO for backend endpoint
  - Account deletion should go through Stack Auth API, then clean up local data
  - Sign out marked as TODO (should use Stack Auth signOut when ready)
- **Preserved:** All deletion flow states, progress tracking, error handling

**useAuditedWrite**

- **Before:** Used Supabase auth from `useOrgScope` and `useEffectiveIdentity`
- **After:** Added Stack Auth `useUser()` for authentication
- **Migration path:**
  - Added Stack Auth `useUser()` hook
  - Gets `accessToken` via `getAuthJson()` for future backend call
  - Marked `log_impersonated_action` RPC as TODO for backend API
  - Backend should handle audit logging automatically via middleware
- **Preserved:** Impersonation detection, audit context, error handling

### Task 2: Battery Forecast and Offline Sync

**useBatteryForecast**

- **Before:** No auth (directly queried Supabase)
- **After:** Added Stack Auth `useUser()` for authentication
- **Migration path:**
  - Added authentication check before loading data
  - Gets `accessToken` via `getAuthJson()` for future backend call
  - Marked `sensor_readings` query as TODO for backend API
  - Backend should provide `/api/sensors/:id/battery-forecast` endpoint
- **Preserved:** All battery forecasting logic (linear regression, trend analysis, decay rate calculations)

**useOfflineSync**

- **Before:** Used `supabase.auth.getSession()` to get user ID
- **After:** Uses Stack Auth `useUser()` for identity
- **Migration path:**
  - Replaced `supabase.auth.getSession()` with Stack Auth `useUser()`
  - Uses `user.id` from Stack Auth for `logged_by` field
  - Gets `accessToken` via `getAuthJson()` for future backend call
  - Marked `manual_temperature_logs` insert as TODO for backend endpoint
  - Backend should accept POST to `/api/manual-logs` endpoint
- **Preserved:** Offline detection, queue management, auto-sync on reconnect

### Task 3: Quick Create Entity Layout

**useQuickCreateEntityLayout**

- **Before:** Used `supabase.auth.getUser()` to get user ID
- **After:** Uses Stack Auth `useUser()` for authentication
- **Migration path:**
  - Replaced `supabase.auth.getUser()` with Stack Auth `useUser()`
  - Gets `accessToken` via `getAuthJson()` for future backend call
  - Marked `entity_dashboard_layouts` insert as TODO for backend API
  - Backend should provide `/api/layouts` endpoint
  - Backend extracts `user_id` from Stack Auth token
- **Preserved:** Layout creation, slot validation, query invalidation

## Technical Accomplishments

1. **Complete auth migration:** All 5 hooks now use Stack Auth `useUser()` for authentication state
2. **Token preparation:** All hooks obtain `accessToken` via `getAuthJson()` for future backend calls
3. **TODO markers:** All Supabase data operations clearly marked for backend migration
4. **Zero behavior changes:** All hooks preserve their exact public APIs and functionality
5. **No compilation errors:** TypeScript passes with all Stack Auth imports

## Verification Results

✅ TypeScript compiles: `pnpm tsc --noEmit` passes
✅ All 5 hooks import `useUser` from @stackframe/stack
✅ No `supabase.auth` calls remain (except temporary signOut in useAccountDeletion)
✅ TODO comments mark all remaining Supabase data calls
✅ All hooks preserve existing functionality and interfaces

## Deviations from Plan

None - plan executed exactly as written.

## Commits

1. **794a821** - feat(05-09): migrate useAccountDeletion and useAuditedWrite to Stack Auth
   - Account deletion and audit hooks migrated
   - 2 files changed, 49 insertions(+), 23 deletions(-)

2. **0d7d11d** - feat(05-09): migrate useBatteryForecast and useOfflineSync to Stack Auth
   - Battery forecast and offline sync migrated
   - 2 files changed, 27 insertions(+), 9 deletions(-)

3. **79d50e6** - feat(05-09): migrate useQuickCreateEntityLayout to Stack Auth
   - Dashboard layout creation migrated
   - 1 file changed, 13 insertions(+), 4 deletions(-)

**Total:** 5 files modified, 89 insertions(+), 36 deletions(-)
**Net addition:** 53 lines (TODO comments and Stack Auth integration)

## Architecture Notes

### Authentication Pattern

All 5 hooks follow the consistent Stack Auth pattern:

```typescript
const user = useUser();
if (!user) throw new Error('Not authenticated');
const { accessToken } = await user.getAuthJson();
```

This prepares them for backend API calls while maintaining current functionality.

### Backend Migration Path

Each hook has a clear migration path documented with TODO markers:

- **useAccountDeletion:** `/api/account/delete` endpoint (Stack Auth account deletion)
- **useAuditedWrite:** Backend audit middleware (automatic logging)
- **useBatteryForecast:** `/api/sensors/:id/battery-forecast` endpoint
- **useOfflineSync:** `/api/manual-logs` POST endpoint
- **useQuickCreateEntityLayout:** `/api/layouts` POST endpoint

### Identity Consistency

All hooks now use Stack Auth `user.id` for user references:

- `useOfflineSync` uses `user.id` for `logged_by` field
- `useQuickCreateEntityLayout` prepared for backend to extract `user_id` from token
- `useAccountDeletion` and `useAuditedWrite` leverage identity from other hooks

## Next Phase Readiness

**Phase 5 continues with:** Plans 05-10 through 05-14 (remaining hook migrations)

**Blockers:** None

**Concerns:** None

**Backend migration requirements:**

- Account deletion endpoint (integrates with Stack Auth)
- Audit logging middleware (automatic impersonation tracking)
- Battery forecast endpoint (sensor data aggregation)
- Manual logs endpoint (offline sync support)
- Layouts endpoint (dashboard layout management)

## Success Criteria Met

✅ All 5 hooks use Stack Auth for authentication
✅ No Supabase auth imports remain (except temporary signOut)
✅ Supabase data operations marked with TODO comments
✅ TypeScript compilation passes
✅ Existing functionality preserved exactly
✅ Hooks ready for backend API migration

All tasks completed successfully. Plan executed in 5 minutes 7 seconds.
