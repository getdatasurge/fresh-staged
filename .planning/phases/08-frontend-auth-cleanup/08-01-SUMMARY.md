---
phase: 08
plan: 01
subsystem: auth
tags: [stack-auth, react-hooks, frontend, auth-migration]
requires: []
provides:
  - Stack Auth token retrieval in useBranding
  - Stack Auth token retrieval in useNavTree
  - Stack Auth token retrieval in useSoftDelete (3 functions)
  - Stack Auth signOut in useAccountDeletion
affects: [08-02, 08-03]
tech-stack:
  added: []
  patterns:
    - Hook wrapper pattern for auth-dependent functions
key-files:
  created: []
  modified:
    - src/hooks/useBranding.ts
    - src/hooks/useNavTree.ts
    - src/hooks/useSoftDelete.ts
    - src/hooks/useAccountDeletion.ts
    - src/pages/AreaDetail.tsx
    - src/pages/SiteDetail.tsx
    - src/pages/UnitDetail.tsx
key-decisions:
  - decision: "Use hook wrapper pattern for useSoftDelete functions"
    rationale: "Exported functions used across multiple components needed auth context - hook wrapper provides clean API"
    impact: "Consuming components import and call useSoftDelete() hook"
metrics:
  duration: 5 min
  completed: 2026-01-24
---

# Phase 08 Plan 01: Auth Hook Migration Summary

**One-liner:** Migrated 4 hooks from supabase.auth.getSession() to Stack Auth useUser().getAuthJson() pattern

## Accomplishments

### Tasks Completed

1. **Migrated useBranding and useNavTree** (Task 1)
   - Replaced `supabase.auth.getSession()` with `useUser().getAuthJson()`
   - Removed supabase import from useBranding.ts
   - Added user null checks in queryFn
   - Updated enabled conditions to include `!!user` check
   - Both hooks now use Stack Auth for token retrieval

2. **Migrated useSoftDelete and useAccountDeletion** (Task 2)
   - Refactored softDeleteUnit/Area/Site to accept accessToken parameter
   - Created useSoftDelete() hook wrapper to provide auth context
   - Replaced `supabase.auth.signOut()` with `stackApp.signOut()` in useAccountDeletion
   - Updated 3 consuming components (AreaDetail, SiteDetail, UnitDetail)
   - All delete operations now use Stack Auth tokens

### Files Created/Modified

**Modified (7 files):**
- `src/hooks/useBranding.ts` - Stack Auth token retrieval
- `src/hooks/useNavTree.ts` - Stack Auth token retrieval (2 queries)
- `src/hooks/useSoftDelete.ts` - Hook wrapper + token parameter refactor
- `src/hooks/useAccountDeletion.ts` - Stack Auth signOut
- `src/pages/AreaDetail.tsx` - Use useSoftDelete hook
- `src/pages/SiteDetail.tsx` - Use useSoftDelete hook
- `src/pages/UnitDetail.tsx` - Use useSoftDelete hook

### Technical Implementation

**Pattern established:**
```typescript
// Hook level
const user = useUser();

// In queryFn or async function
if (!user) return null; // or throw
const { accessToken } = await user.getAuthJson();

// Use accessToken with API calls
await api.method(params, accessToken);
```

**Hook wrapper pattern (useSoftDelete):**
- Functions refactored to accept `accessToken` parameter
- Hook wrapper provides auth context automatically
- Clean API for consuming components

## Commits

- `9582657` - refactor(08-01): migrate useBranding and useNavTree to Stack Auth
- `8dbc2af` - refactor(08-01): migrate useSoftDelete and useAccountDeletion to Stack Auth

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

**1. Hook wrapper pattern for useSoftDelete**
- **Context:** softDelete functions are exported and used across multiple components
- **Decision:** Create useSoftDelete() hook that returns functions with auth context pre-bound
- **Rationale:** Cleaner than passing user/token to every component, maintains encapsulation
- **Impact:** Components call `const { softDeleteArea } = useSoftDelete()` instead of direct import

## Issues Encountered

None - all hooks migrated successfully, TypeScript compilation passes.

## Next Phase Readiness

**Blockers:** None

**Ready for 08-02:** Yes - 4 hooks migrated, pattern established for remaining ~26 hooks

**Dependencies resolved:**
- Stack Auth useUser() pattern validated
- Hook wrapper pattern established for exported functions
- All consuming components updated

## Performance

- **Duration:** 5 minutes
- **Tasks:** 2/2 completed
- **Files modified:** 7
- **Commits:** 2 (1 per task)

## Next Steps

Execute plan 08-02 to continue frontend auth cleanup with remaining hooks.
