---
phase: 08-frontend-auth-cleanup
plan: 03
subsystem: frontend-auth
tags: [stack-auth, migration, components, auth-consolidation]
requires: [08-01, 08-02]
provides: [complex-components-migrated, auth-subscriptions-removed]
affects: [08-04, 08-05, 08-06]
tech-stack:
  added: []
  patterns: [reactive-auth, consolidated-auth-hooks]
key-files:
  created: []
  modified:
    - src/components/settings/AlertRulesEditor.tsx
    - src/components/settings/TTNCredentialsPanel.tsx
    - src/components/NotificationDropdown.tsx
    - src/components/debug/RBACDebugPanel.tsx
    - src/components/site/SiteComplianceSettings.tsx
    - src/components/DashboardLayout.tsx
decisions:
  - id: auth-reactive-pattern
    choice: Use Stack Auth useUser() reactivity instead of subscriptions
    rationale: Stack Auth useUser() is reactive - no manual subscriptions needed
  - id: onAuthStateChange-removal
    choice: Remove all onAuthStateChange subscriptions
    rationale: Stack Auth updates automatically, manual listeners redundant
metrics:
  duration: 6m 51s
  completed: 2026-01-24
---

# Phase 8 Plan 03: Complex Component Auth Migration Summary

**One-liner:** Migrated 6 complex components with multiple auth calls (11 total) from Supabase to Stack Auth reactive patterns

## Overview

Successfully migrated 6 components containing complex auth patterns (2-4 auth calls each) from Supabase to Stack Auth. Removed authentication subscriptions in favor of Stack Auth's reactive useUser() hook. All database calls preserved unchanged.

## Tasks Completed

### Task 1: AlertRulesEditor and TTNCredentialsPanel

- **AlertRulesEditor.tsx**: 3 auth calls → useUser
  - `supabase.auth.getSession()` in handleSave → `user.id`
  - `supabase.auth.getSession()` in handleClearField → `user.id`
  - `supabase.auth.getSession()` in handleResetToDefault → `user.id`
- **TTNCredentialsPanel.tsx**: 4 auth calls → useUser
  - `supabase.auth.getUser()` in fetchCredentials → `user` check
  - `supabase.auth.getUser()` in handleRetryProvisioning → `user` check
  - `supabase.auth.getUser()` in handleStartFresh → `user` check
  - `supabase.auth.getUser()` in handleDeepClean → `user` check
  - Preserved 6 database calls (supabase.from, supabase.rpc)

**Commit:** c8ba3b5

### Task 2: NotificationDropdown, RBACDebugPanel, SiteComplianceSettings

- **NotificationDropdown.tsx**: 2 auth calls → useUser
  - `supabase.auth.getUser()` in loadOrgId → `user` check
  - `supabase.auth.getUser()` in loadNotifications → `user` check
- **RBACDebugPanel.tsx**: 1 auth call → useUser
  - `supabase.auth.getUser()` in fetchDebugInfo → `stackUser` usage
  - Renamed local `user` state to `userInfo` to avoid conflict
- **SiteComplianceSettings.tsx**: 1 auth call → useUser
  - `supabase.auth.getUser()` in handleSave → `user` check

**Commit:** 4d77ac2

### Task 3: DashboardLayout

- **DashboardLayout.tsx**: 3 auth calls → useUser, reactive pattern
  - Removed `onAuthStateChange` subscription entirely
  - Removed `Session` import (no longer needed)
  - `supabase.auth.getSession()` → replaced with `useUser()` reactivity
  - Auth state listener → Stack Auth automatic updates
  - `supabase.auth.signOut()` → `user.signOut()`
  - Simplified auth flow: useUser updates trigger navigation via useEffect

**Commit:** c2a2274

## Deviations from Plan

None - plan executed exactly as written.

## Technical Implementation

### Pattern: Supabase Auth → Stack Auth

**Before:**

```typescript
const {
  data: { session },
} = await supabase.auth.getSession();
const userId = session?.session?.user?.id;
```

**After:**

```typescript
const user = useUser();
if (!user) throw new Error('Not authenticated');
const userId = user.id;
```

### Pattern: Auth Subscriptions Removed

**Before:**

```typescript
useEffect(() => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    setSession(session);
    // handle auth change
  });
  return () => subscription.unsubscribe();
}, []);
```

**After:**

```typescript
// Stack Auth useUser() is reactive - no subscription needed
// The user object updates automatically on auth changes
useEffect(() => {
  if (!user) {
    navigate('/auth');
  }
}, [user, navigate]);
```

### Pattern: Sign Out Migration

**Before:**

```typescript
const { error } = await supabase.auth.signOut();
if (error) throw error;
```

**After:**

```typescript
if (user) {
  await user.signOut();
}
navigate('/');
```

## Files Modified

### Settings Components (2 files)

- `src/components/settings/AlertRulesEditor.tsx` - 3 auth calls
- `src/components/settings/TTNCredentialsPanel.tsx` - 4 auth calls

### UI Components (2 files)

- `src/components/NotificationDropdown.tsx` - 2 auth calls
- `src/components/debug/RBACDebugPanel.tsx` - 1 auth call

### Feature Components (2 files)

- `src/components/site/SiteComplianceSettings.tsx` - 1 auth call
- `src/components/DashboardLayout.tsx` - 3 auth calls + subscription removal

**Total:** 6 files, 11 auth calls migrated, 1 subscription removed

## Verification

All components compile without errors:

- ✅ Zero `supabase.auth` calls remain
- ✅ No auth state subscriptions (onAuthStateChange) remain
- ✅ Database calls preserved where needed
- ✅ TypeScript compilation passes
- ✅ Stack Auth reactive patterns used correctly

## Impact Analysis

### Immediate Benefits

- **Simpler auth state**: No manual subscription management
- **Automatic updates**: Auth state changes trigger re-renders automatically
- **Consolidated imports**: Single useUser() hook replaces multiple auth calls
- **Type safety**: Stack Auth provides better TypeScript types

### Migration Progress

- **Before this plan**: ~30 components with Supabase auth
- **After this plan**: 6 more components migrated
- **Remaining**: Tracked in Phase 8 backlog

## Next Phase Readiness

**Ready for 08-04** (final batch of complex components)

**Dependencies satisfied:**

- ✅ Reference pattern established (useEffectiveIdentity.ts)
- ✅ Complex auth patterns validated
- ✅ Subscription removal pattern proven

**No blockers identified.**

## Learnings

1. **Reactive vs Subscription**: Stack Auth's reactive useUser() eliminates need for manual auth subscriptions
2. **Variable naming**: Watch for conflicts when component already has `user` variable
3. **Database preservation**: Always verify database calls remain unchanged
4. **Sign out pattern**: user.signOut() is simpler than Supabase's error handling

## Commits

- c8ba3b5: feat(08-03): migrate AlertRulesEditor and TTNCredentialsPanel to Stack Auth
- 4d77ac2: feat(08-03): migrate NotificationDropdown, RBACDebugPanel, SiteComplianceSettings to Stack Auth
- c2a2274: feat(08-03): migrate DashboardLayout to Stack Auth reactive patterns

**Total commits:** 3
