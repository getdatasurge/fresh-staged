---
phase: 08-frontend-auth-cleanup
plan: 02
subsystem: frontend
tags: [stack-auth, react, authentication, migration]

requires:
  - phases: [01, 02, 03, 04, 05, 06, 07]
  - technologies: [Stack Auth SDK, React hooks]

provides:
  - deliverables:
    - 7 components migrated from Supabase to Stack Auth
    - Simple auth pattern replacements (signOut, getUser)
    - Consistent Stack Auth hook usage

affects:
  - future-phases: [08-03, 08-04, 08-05]
  - components: [platform, unit, reports, settings, debug, dashboard-layout]

tech-stack:
  added: []
  patterns:
    - "useStackApp() for auth actions (signOut)"
    - "useUser() for user identity and authentication checks"
    - "user.id for user identification"
    - "user.primaryEmail for email display"

key-files:
  created: []
  modified:
    - src/components/platform/PlatformLayout.tsx
    - src/components/unit/UnitSettingsSection.tsx
    - src/components/reports/ComplianceReportCard.tsx
    - src/components/settings/EmulatorResyncCard.tsx
    - src/components/debug/DebugTerminal.tsx
    - src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts
    - src/features/dashboard-layout/widgets/AnnotationsWidget.tsx

decisions:
  - decision: "Use useStackApp for auth actions, useUser for identity"
    rationale: "Follows Stack Auth SDK patterns - useStackApp for application-level actions, useUser for user-specific data"
    impact: "Consistent pattern across all migrated components"
    date: "2026-01-24"

  - decision: "Remove supabase auth imports only when no database operations remain"
    rationale: "Components may still use supabase.from() for database calls"
    impact: "Mixed import state is acceptable during migration"
    date: "2026-01-24"

  - decision: "Direct property access (user.id, user.primaryEmail) instead of destructuring"
    rationale: "Stack Auth user object is always present or null, simplifies null checks"
    impact: "More concise code, easier null handling"
    date: "2026-01-24"

metrics:
  duration: "5 minutes"
  completed: "2026-01-24"
  commits: 3
  files_modified: 7
  lines_changed: ~70
---

# Phase 08 Plan 02: Simple Auth Pattern Migration Summary

**One-liner:** Migrated 7 components with single auth calls from Supabase to Stack Auth using useStackApp and useUser hooks.

## Objectives Achieved

✅ Migrated PlatformLayout signOut functionality to Stack Auth
✅ Migrated UnitSettingsSection user identification to Stack Auth
✅ Migrated ComplianceReportCard authentication check to Stack Auth
✅ Migrated EmulatorResyncCard user operations to Stack Auth
✅ Migrated DebugTerminal email display to Stack Auth
✅ Migrated useEntityLayoutStorage to Stack Auth
✅ Migrated AnnotationsWidget note creation to Stack Auth
✅ All TypeScript checks passing
✅ Zero supabase.auth calls remaining in migrated files

## Tasks Completed

### Task 1: Migrate PlatformLayout and UnitSettingsSection
**Commit:** `9d83cd6`
**Files:**
- `src/components/platform/PlatformLayout.tsx`
- `src/components/unit/UnitSettingsSection.tsx`

**Changes:**
- PlatformLayout: `useStackApp()` for signOut action
- UnitSettingsSection: `useUser()` for user ID in settings history
- Removed supabase auth imports
- Simplified error handling for signOut

**Pattern established:**
```typescript
// PlatformLayout
const stackApp = useStackApp();
await stackApp.signOut();

// UnitSettingsSection
const user = useUser();
if (!user) throw new Error("Not authenticated");
const userId = user.id;
```

### Task 2: Migrate ComplianceReportCard, EmulatorResyncCard, DebugTerminal
**Commit:** `88fefda`
**Files:**
- `src/components/reports/ComplianceReportCard.tsx`
- `src/components/settings/EmulatorResyncCard.tsx`
- `src/components/debug/DebugTerminal.tsx`

**Changes:**
- ComplianceReportCard: Simple auth check before export
- EmulatorResyncCard: User ID for sync operations in both query and mutation
- DebugTerminal: Replaced useEffect/useState with direct `user.primaryEmail` access
- Removed all supabase.auth.getUser() calls

**Pattern established:**
```typescript
const user = useUser();

// Auth check
if (!user) {
  toast.error("Not authenticated");
  return;
}

// Email display
const userEmail = user?.primaryEmail ?? null;
```

### Task 3: Migrate dashboard-layout hooks and widgets
**Commit:** `77e2b2b`
**Files:**
- `src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts`
- `src/features/dashboard-layout/widgets/AnnotationsWidget.tsx`

**Changes:**
- useEntityLayoutStorage: Hook-level `useUser()` for layout operations
- AnnotationsWidget: `user.id` for annotation authorship
- Maintained database operation patterns (supabase.from)

**Pattern established:**
```typescript
// Hook pattern
export function useEntityLayoutStorage(...) {
  const user = useUser();

  const { data } = useQuery({
    queryFn: async () => {
      if (!user || !entityId) return [];
      // Use user.id for database operations
    }
  });
}
```

## Verification Results

✅ TypeScript compilation: **PASS** (no errors)
✅ Supabase auth calls: **0** (verified with grep)
✅ Stack Auth imports: **7/7** (all files have proper imports)
✅ Pattern consistency: **PASS** (useStackApp for actions, useUser for identity)

## Technical Details

### Migration Pattern Applied

**Before (Supabase):**
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return;
const userId = user.id;
```

**After (Stack Auth):**
```typescript
const user = useUser(); // at component level
if (!user) return;
const userId = user.id;
```

### Auth Action Pattern

**Before (Supabase):**
```typescript
const { error } = await supabase.auth.signOut();
if (error) { /* handle */ }
```

**After (Stack Auth):**
```typescript
const stackApp = useStackApp();
await stackApp.signOut();
```

### Import Changes

**Removed:**
```typescript
import { supabase } from "@/integrations/supabase/client";
// Only when no database operations remain
```

**Added:**
```typescript
import { useUser } from "@stackframe/react";
// or
import { useStackApp } from "@stackframe/react";
```

## Component Categories Migrated

1. **Platform Admin** (1 file)
   - PlatformLayout: Sign-out functionality

2. **Settings** (2 files)
   - UnitSettingsSection: User ID for history tracking
   - EmulatorResyncCard: User sync operations

3. **Reports** (1 file)
   - ComplianceReportCard: Authentication check

4. **Debug Tools** (1 file)
   - DebugTerminal: User email display

5. **Dashboard Layout** (2 files)
   - useEntityLayoutStorage: Layout persistence
   - AnnotationsWidget: Note authorship

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all migrations completed without errors or blockers.

## Next Phase Readiness

**Phase 08 Plan 03** is ready to proceed with the next batch of component migrations.

**Remaining auth migrations:**
- ~23 components still using Supabase auth (tracked in phase audit)
- Patterns established in 08-02 apply to remaining migrations

**No blockers identified.**

## Lessons Learned

1. **Simple replacements are straightforward:** Components with single auth calls migrate easily
2. **useUser() at component level is cleaner:** No need for async getUser() calls
3. **Email access simplified:** `user.primaryEmail` more direct than session queries
4. **Mixed imports acceptable:** Keeping supabase client for database operations is fine
5. **TypeScript validates migration:** No type errors indicates proper Stack Auth usage

## Files Changed

| File | Type | Auth Pattern | LOC Changed |
|------|------|--------------|-------------|
| PlatformLayout.tsx | Component | useStackApp (signOut) | ~10 |
| UnitSettingsSection.tsx | Component | useUser (userId) | ~8 |
| ComplianceReportCard.tsx | Component | useUser (authCheck) | ~6 |
| EmulatorResyncCard.tsx | Component | useUser (userId) | ~10 |
| DebugTerminal.tsx | Component | useUser (email) | ~8 |
| useEntityLayoutStorage.ts | Hook | useUser (userId) | ~6 |
| AnnotationsWidget.tsx | Widget | useUser (userId) | ~4 |

**Total:** 7 files, ~52 lines changed

## Commits

1. `9d83cd6` - feat(08-02): migrate PlatformLayout and UnitSettingsSection to Stack Auth
2. `88fefda` - feat(08-02): migrate ComplianceReportCard, EmulatorResyncCard, DebugTerminal to Stack Auth
3. `77e2b2b` - feat(08-02): migrate dashboard-layout hooks and widgets to Stack Auth

---

**Migration Status:** ✅ COMPLETE
**Next Plan:** 08-03 (continue frontend auth cleanup)
**Tech Debt:** None introduced
