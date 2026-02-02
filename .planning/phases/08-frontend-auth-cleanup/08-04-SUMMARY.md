---
phase: 08-frontend-auth-cleanup
plan: 04
subsystem: frontend-pages
tags: [react, stack-auth, migration, authentication]

requires:
  - 08-01-PLAN.md # useEffectiveIdentity pattern established
  - 08-02-PLAN.md # Dashboard layout components migrated
  - 08-03-PLAN.md # Component migration patterns established

provides:
  - 6 pages migrated from Supabase to Stack Auth
  - Simple auth pattern migrations (1-2 auth calls per page)
  - Zero Supabase auth calls in migrated pages

affects:
  - 08-05-PLAN.md # Remaining pages with complex auth patterns

tech-stack:
  added: []
  patterns:
    - Stack Auth useUser() for session/user ID retrieval
    - Database calls preserved during auth migration

key-files:
  created: []
  modified:
    - src/pages/Alerts.tsx
    - src/pages/RecentlyDeleted.tsx
    - src/pages/TTNCleanup.tsx
    - src/pages/PilotSetup.tsx
    - src/pages/AreaDetail.tsx
    - src/pages/Inspector.tsx

decisions: []

metrics:
  duration: 6m 11s
  completed: 2026-01-24
---

# Phase 08 Plan 04: Simple Pages Auth Migration Summary

**One-liner:** Migrated 6 pages with simple auth patterns (1-2 calls) from Supabase to Stack Auth

## What Was Built

Migrated 6 pages from Supabase auth to Stack Auth:

### Task 1: Alerts, RecentlyDeleted, TTNCleanup

- **Alerts.tsx** (2 auth calls → useUser):
  - Replaced session state management with `useUser()`
  - Replaced auth calls in acknowledge and resolve handlers
  - Removed Session type import
  - Database calls preserved (alerts, units, manual logs)

- **RecentlyDeleted.tsx** (1 auth call → useUser):
  - Replaced `loadUserId()` function with `useUser()`
  - Updated restore and delete handlers to use `user.id`
  - Database calls preserved (sites, areas, units, devices, sensors)

- **TTNCleanup.tsx** (1 auth call → useUser):
  - Replaced `getUser()` in React Query with `useUser()`
  - Updated query key to include user ID
  - Database calls preserved (profiles, TTN jobs)

### Task 2: PilotSetup, AreaDetail, Inspector

- **PilotSetup.tsx** (1 auth call → useUser):
  - Replaced `getSession()` in feedback submission
  - Updated to use `user.id` directly
  - Database calls preserved (sites, units, user_roles, pilot_feedback)

- **AreaDetail.tsx** (1 auth call → useUser):
  - Replaced `getSession()` state with `useUser()`
  - Updated soft delete handler
  - Database calls preserved (areas, units)

- **Inspector.tsx** (2 auth calls → useUser):
  - Replaced `getSession()` in initialization
  - Replaced `getUser()` in export handler
  - Database calls preserved (inspector_sessions, organizations, sites, units, readings, alerts)

## Migration Patterns Applied

### Pattern 1: Session State Replacement

```typescript
// BEFORE
const [session, setSession] = useState<Session | null>(null);
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });
}, []);

// AFTER
const user = useUser();
```

### Pattern 2: User ID Retrieval

```typescript
// BEFORE
const {
  data: { user },
} = await supabase.auth.getUser();
const userId = user.id;

// AFTER
const user = useUser();
const userId = user?.id;
```

### Pattern 3: Query Integration

```typescript
// BEFORE
const { data: profile } = useQuery({
  queryKey: ['user-profile'],
  queryFn: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    // fetch profile
  },
});

// AFTER
const user = useUser();
const { data: profile } = useQuery({
  queryKey: ['user-profile', user?.id],
  queryFn: async () => {
    if (!user) return null;
    // fetch profile
  },
  enabled: !!user,
});
```

## Verification Results

✅ All 6 pages compile without errors
✅ Zero `supabase.auth` calls remain in migrated files
✅ Stack Auth `useUser()` properly implemented
✅ All database calls preserved (no data access changes)

Verification commands:

```bash
grep -c "supabase.auth" src/pages/{Alerts,RecentlyDeleted,TTNCleanup,PilotSetup,AreaDetail,Inspector}.tsx
# All returned: 0

pnpm tsc --noEmit
# Passed with no errors
```

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### Files Modified

1. **src/pages/Alerts.tsx** (810 lines)
   - Removed: Session state, onAuthStateChange listener
   - Added: useUser import and hook
   - Changed: 5 instances of session/user references

2. **src/pages/RecentlyDeleted.tsx** (432 lines)
   - Removed: loadUserId function, userId state
   - Added: useUser import and hook
   - Changed: 3 instances of userId references

3. **src/pages/TTNCleanup.tsx** (304 lines)
   - Changed: Query function to use useUser
   - Updated: Query key and enabled condition
   - Changed: 1 auth call

4. **src/pages/PilotSetup.tsx** (397 lines)
   - Removed: getSession call in feedback handler
   - Added: useUser import and hook
   - Changed: 1 auth call

5. **src/pages/AreaDetail.tsx** (568 lines)
   - Removed: Session state and type import
   - Added: useUser import and hook
   - Changed: 1 auth call in delete handler

6. **src/pages/Inspector.tsx** (833 lines)
   - Removed: 2 getSession/getUser calls
   - Added: useUser import and hook
   - Changed: Initialization and export handlers

### Database Operations Preserved

All pages maintain their existing database calls:

- Supabase queries (from, select, insert, update, delete)
- RPC calls (create_unit_for_area)
- Edge function invocations (export-temperature-logs)
- Realtime subscriptions (none in these pages)

## Next Phase Readiness

### For 08-05 (Complex Pages Migration)

✅ Simple auth pattern established and proven
✅ Query integration pattern demonstrated
✅ TypeScript compilation confirmed
⚠️ Complex pages will need token handling (getAuthJson)

### Remaining Work

After this plan, estimated remaining pages:

- ~24 pages still using Supabase auth (from tech debt FE-03)
- Next plan will handle pages with complex auth patterns
- Subsequent plans will handle remaining simple pages

## Testing Notes

**Manual testing recommended:**

1. Alerts page - verify acknowledge and resolve actions
2. RecentlyDeleted page - verify restore and delete
3. TTNCleanup page - verify scan and cleanup operations
4. PilotSetup page - verify feedback submission
5. AreaDetail page - verify unit creation and area deletion
6. Inspector page - verify filtering and CSV export

All pages should work identically to before migration.

## Performance Impact

No performance changes expected:

- useUser() is synchronous after initial load
- No additional network requests
- Same database query patterns

## Commits

- `b4d6665` feat(08-04): migrate Alerts, RecentlyDeleted, TTNCleanup to Stack Auth
- `8b7fecc` feat(08-04): migrate PilotSetup, AreaDetail, Inspector to Stack Auth

Total: 2 commits, 6 files changed, 81 insertions(+), 109 deletions(-)
