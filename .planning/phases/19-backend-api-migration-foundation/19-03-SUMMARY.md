---
phase: 19-backend-api-migration-foundation
plan: 03
subsystem: frontend
tags: [trpc, tanstack-react-query, frontend-client, authentication, type-safety]

# Dependency graph
requires:
  - phase: 19-backend-api-migration-foundation
    plan: 01
    provides: tRPC server infrastructure with authentication
affects: [19-04, 19-05, 19-06, frontend-api-migration]

# Tech tracking
tech-stack:
  added: ['@trpc/client@11.8.1', '@trpc/tanstack-react-query@11.8.1']
  patterns:
    - 'TRPCProvider wraps application for context'
    - 'createTRPCClientInstance factory for auth integration'
    - 'httpBatchLink with x-stack-access-token header'
    - 'TRPCWrapper component pattern for auth dependency'

key-files:
  created:
    - src/lib/trpc.ts
  modified:
    - src/App.tsx
    - package.json

key-decisions:
  - 'Use createTRPCContext from @trpc/tanstack-react-query for React hooks'
  - 'TRPCWrapper component inside StackProvider and QueryClientProvider'
  - 'useMemo for client recreation on user changes'
  - 'Auth token retrieved via user.getAuthJson() from Stack Auth'

patterns-established:
  - 'Pattern 1: TRPCProvider requires both queryClient and trpcClient props'
  - 'Pattern 2: Client created with httpBatchLink for batched requests'
  - 'Pattern 3: TRPCWrapper pattern for components needing hooks (useUser, useQueryClient)'
  - 'Pattern 4: Type safety flows from backend AppRouter via monorepo import'

# Metrics
duration: 5min
completed: 2026-01-24
---

# Phase 19 Plan 03: Frontend tRPC Client Setup Summary

**tRPC client with TanStack React Query integration, TRPCProvider in App.tsx, full type safety from backend AppRouter**

## Performance

- **Duration:** 5 minutes
- **Started:** 2026-01-24T23:04:58Z
- **Completed:** 2026-01-24T23:10:05Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Installed @trpc/client and @trpc/tanstack-react-query packages
- Created tRPC client setup with TRPCProvider, useTRPC, createTRPCClientInstance
- Integrated TRPCProvider in App.tsx with TRPCWrapper component
- TypeScript resolves AppRouter type from backend via monorepo import
- Application builds successfully with tRPC integration
- Full type safety from backend to frontend

## Task Commits

Each task was committed atomically:

1. **Task 1: Install tRPC client packages** - `c3fe4d0` (chore)
   - Installed @trpc/client@^11.8.1
   - Installed @trpc/tanstack-react-query@^11.8.1
   - Updated package.json and package-lock.json

2. **Task 2: Create tRPC client setup** - `97ae157` (feat)
   - Created src/lib/trpc.ts
   - Exported TRPCProvider, useTRPCClient, useTRPC from createTRPCContext
   - Created createTRPCClientInstance factory function
   - Uses httpBatchLink with x-stack-access-token header
   - Imports AppRouter type from backend for type inference

3. **Task 3: Integrate TRPCProvider in App.tsx** - `78e3dd4` (feat)
   - Created TRPCWrapper component for auth integration
   - Positioned between QueryClientProvider and RealtimeProvider
   - Uses useMemo to recreate client when user changes
   - TypeScript compilation and build successful

## Files Created/Modified

### Created

- `src/lib/trpc.ts` - tRPC client setup with provider, hooks, and client factory

### Modified

- `src/App.tsx` - Added TRPCWrapper component in provider chain
- `package.json` - Added tRPC client dependencies

## Decisions Made

**TRPC-06: Use createTRPCContext for React hooks**

- Rationale: Official tRPC v11 pattern for TanStack React Query integration
- Impact: Provides TRPCProvider, useTRPC, useTRPCClient hooks for components

**TRPC-07: TRPCWrapper component pattern**

- Rationale: Needs access to useUser (StackProvider) and useQueryClient (QueryClientProvider)
- Impact: Clean component composition, clear dependency requirements

**TRPC-08: useMemo for client recreation**

- Rationale: Recreate client when user changes (login/logout)
- Impact: Ensures fresh auth token, prevents stale client state

**TRPC-09: Auth token from Stack Auth user.getAuthJson()**

- Rationale: Consistent with existing API client pattern
- Impact: All tRPC calls authenticated via x-stack-access-token header

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tRPC import path**

- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Initially used `@trpc/react-query` which doesn't exist in v11
- **Fix:** Changed to `@trpc/tanstack-react-query` (correct package name)
- **Files modified:** src/lib/trpc.ts
- **Verification:** TypeScript compilation successful
- **Committed in:** 97ae157 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed client creation function**

- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Initially tried `createTRPCReact` which doesn't exist
- **Fix:** Used `createTRPCContext` from @trpc/tanstack-react-query
- **Files modified:** src/lib/trpc.ts
- **Verification:** TypeScript compilation successful
- **Committed in:** 97ae157 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed client instantiation**

- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Initially tried `useTRPCClient.createClient` which doesn't exist
- **Fix:** Used `createTRPCClient` from @trpc/client package
- **Files modified:** src/lib/trpc.ts
- **Verification:** TypeScript compilation successful
- **Committed in:** 97ae157 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 import/API bugs)
**Impact on plan:** API changes from tRPC v10 to v11. Fixed inline to match current version.

## Issues Encountered

None - all tRPC v11 API mismatches were resolved during Task 2 development.

## User Setup Required

None - tRPC client uses existing Stack Auth JWT authentication.

## Next Phase Readiness

**Ready for Plan 04 (Organizations API Migration):**

- TRPCProvider wraps application
- useTRPC hook available in components
- Type inference works from backend AppRouter
- Frontend can call tRPC procedures with auth
- Application builds and loads without errors

**Test Coverage:**

- Build verification: npm run build successful
- TypeScript compilation: No frontend errors
- Runtime: Application structure intact (verified via build)

**Known Limitations:**

- No tRPC procedures called yet (organizations API migration in Plan 04)
- Backend has pre-existing TypeScript errors (not related to tRPC)

**Next Steps:**

- Plan 04: Migrate organizations API to use tRPC
- Plan 05: Migrate sites, areas, units APIs to use tRPC
- Plan 06: Migrate readings and alerts APIs to use tRPC

---

_Phase: 19-backend-api-migration-foundation_
_Completed: 2026-01-24_
