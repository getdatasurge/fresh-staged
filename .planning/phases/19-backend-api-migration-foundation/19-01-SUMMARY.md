---
phase: 19-backend-api-migration-foundation
plan: 01
subsystem: api
tags: [trpc, fastify, jwt, authentication, middleware]

# Dependency graph
requires:
  - phase: 18-stripe-billing
    provides: Fastify app structure with plugins
provides:
  - tRPC server infrastructure with authentication middleware
  - Context creation with JWT extraction
  - Protected and organization-scoped procedures
  - Base for all domain router migrations
affects: [19-02, 19-03, 19-04, 19-05, 19-06, API migration phases]

# Tech tracking
tech-stack:
  added: ['@trpc/server@11.8.1', '@trpc/server/adapters/fastify']
  patterns:
    - 'tRPC router factory pattern'
    - 'Middleware-based authentication for tRPC'
    - 'Organization-scoped procedure middleware'
    - 'Context creation from Fastify request'

key-files:
  created:
    - backend/src/trpc/index.ts
    - backend/src/trpc/context.ts
    - backend/src/trpc/procedures.ts
    - backend/src/trpc/router.ts
    - backend/tests/trpc/context.test.ts
  modified:
    - backend/src/app.ts
    - backend/package.json

key-decisions:
  - 'Use tRPC v11 with Fastify adapter for type-safe API layer'
  - 'Reuse existing JWT verification from Stack Auth integration'
  - 'Create protectedProcedure and orgProcedure middleware patterns'
  - 'Support both x-stack-access-token and Authorization Bearer headers'

patterns-established:
  - 'Pattern 1: tRPC context creation extracts JWT from headers (same as REST middleware)'
  - 'Pattern 2: protectedProcedure narrows user type to non-null AuthUser'
  - 'Pattern 3: orgProcedure validates organization membership and attaches context'
  - 'Pattern 4: Empty app router pattern - domain routers added in subsequent plans'

# Metrics
duration: 6min
completed: 2026-01-24
---

# Phase 19 Plan 01: tRPC Infrastructure Foundation Summary

**tRPC v11 server with Fastify adapter, JWT-based authentication middleware, and organization-scoped procedures reusing Stack Auth verification**

## Performance

- **Duration:** 6 minutes
- **Started:** 2026-01-24T22:55:13Z
- **Completed:** 2026-01-24T23:01:03Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Installed tRPC server v11.8.1 and Fastify adapter
- Created tRPC infrastructure (context, procedures, router)
- Implemented protectedProcedure and orgProcedure middleware
- Added health check procedure for verification
- Created comprehensive context tests (6 test cases)
- Registered tRPC plugin at /trpc endpoint

## Task Commits

Each task was committed atomically:

1. **Task 1: Install tRPC server package and create infrastructure files** - `9880325` (feat)
   - Installed @trpc/server@^11.8.1
   - Created tRPC instance with context type
   - Created context creation with JWT extraction
   - Created protectedProcedure and orgProcedure middleware
   - Created empty app router

2. **Task 2: Register tRPC plugin with Fastify** - `b0416f0` (feat)
   - Added fastifyTRPCPlugin imports
   - Registered plugin at /trpc prefix
   - Added maxParamLength: 5000 for batched requests
   - Configured error logging

3. **Task 3: Add health check procedure and verify end-to-end** - `cddf9a3` (feat)
   - Added health check procedure to app router
   - Created comprehensive context tests
   - Verified JWT extraction from both header formats

## Files Created/Modified

### Created

- `backend/src/trpc/index.ts` - tRPC instance initialization with t, router, publicProcedure exports
- `backend/src/trpc/context.ts` - Context creation from Fastify request with JWT extraction
- `backend/src/trpc/procedures.ts` - protectedProcedure and orgProcedure middleware
- `backend/src/trpc/router.ts` - Root app router with health check procedure
- `backend/tests/trpc/context.test.ts` - Context creation tests (6 test cases)

### Modified

- `backend/src/app.ts` - Registered tRPC plugin, added maxParamLength config
- `backend/package.json` - Added @trpc/server dependency

## Decisions Made

**TRPC-01: Use tRPC v11 with Fastify adapter**

- Rationale: Type-safe API layer with automatic client generation, native Fastify integration
- Impact: All domain routers will use this infrastructure

**TRPC-02: Reuse existing JWT verification from Stack Auth**

- Rationale: Context creation uses same verifyAccessToken as REST middleware
- Impact: Consistent authentication across REST and tRPC endpoints

**TRPC-03: Support both auth header formats**

- Rationale: x-stack-access-token (custom) and Authorization Bearer (standard)
- Impact: Frontend can use either format, maintains compatibility

**TRPC-04: Organization middleware validates membership**

- Rationale: orgProcedure checks user role and creates/retrieves profile
- Impact: All org-scoped procedures get organizationId, role, profileId in context

**TRPC-05: Type narrowing via middleware composition**

- Rationale: protectedProcedure narrows user to non-null, orgProcedure extends this
- Impact: TypeScript knows user is authenticated in protected procedures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type narrowing in orgProcedure**

- **Found during:** Task 1 (procedures.ts compilation)
- **Issue:** TypeScript couldn't infer ctx.user is non-null in hasOrgAccess middleware
- **Fix:** Added explicit type assertion `const user = ctx.user as AuthUser` with comment explaining protectedProcedure guarantees this
- **Files modified:** backend/src/trpc/procedures.ts
- **Verification:** TypeScript compilation succeeds, type safety maintained
- **Committed in:** 9880325 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 type bug)
**Impact on plan:** Type narrowing fix necessary for compilation. No scope creep.

## Issues Encountered

None - plan executed smoothly with TypeScript compilation as primary verification.

## User Setup Required

None - no external service configuration required. tRPC uses existing Stack Auth JWT verification.

## Next Phase Readiness

**Ready for Plan 02 (Organizations Router):**

- tRPC infrastructure complete and tested
- protectedProcedure and orgProcedure middleware working
- Health check procedure verifies endpoint registration
- Context correctly extracts JWT from headers

**Test Coverage:**

- Context creation: 6 test cases covering both header formats and error cases
- Full test suite: 707 passing tests (1 pre-existing failure in TTN devices)

**Known Limitations:**

- Server startup requires STACK_AUTH_PROJECT_ID environment variable (pre-existing requirement)
- Empty router returns 404 for non-existent procedures (expected until domain routers added)

**Next Steps:**

- Plan 02: Add organizations router with list/create/update procedures
- Plan 03: Add sites, areas, units routers
- Plan 04: Add readings and alerts routers

---

_Phase: 19-backend-api-migration-foundation_
_Completed: 2026-01-24_
