---
phase: 02-authentication-rbac
plan: 01
subsystem: auth
tags: [jwt, jose, stack-auth, fastify, authentication, typescript]

# Dependency graph
requires:
  - phase: 01-local-development-environment
    provides: Backend TypeScript project structure, ESM module system, Drizzle ORM setup
provides:
  - JWT verification utility using jose library with JWKS caching
  - AuthUser and StackAuthJWTPayload TypeScript interfaces
  - FastifyRequest type augmentation for authenticated requests
  - Environment validation for Stack Auth configuration
  - Middleware barrel export file for Wave 2 plans
affects: [02-02-auth-middleware, 02-03-rbac-middleware, 02-04-org-context-middleware]

# Tech tracking
tech-stack:
  added: [jose@5.x, fastify-plugin]
  patterns: [ESM .js extensions for imports, Stack Auth JWKS integration, Environment validation at startup]

key-files:
  created:
    - backend/src/types/auth.ts
    - backend/src/types/fastify.d.ts
    - backend/src/utils/jwt.ts
    - backend/src/utils/env-check.ts
    - backend/src/middleware/index.ts
  modified:
    - backend/package.json

key-decisions:
  - "jose library for JWT verification instead of @fastify/jwt (direct control over Stack Auth JWKS integration)"
  - "JWKS caching with 10-minute max age and 30-second cooldown for performance"
  - "AuthUser interface separates Stack Auth identity (id) from local profile (profileId)"
  - "Environment validation utility throws clear error messages for missing/invalid configuration"

patterns-established:
  - "ESM .js extensions: All TypeScript imports use .js extensions for NodeNext compatibility"
  - "Stack Auth JWKS pattern: JWKS URL constructed from STACK_AUTH_PROJECT_ID, cached by jose library"
  - "Type augmentation pattern: FastifyRequest extended via declaration merging for auth context"

# Metrics
duration: 15min
completed: 2026-01-23
---

# Phase 02 Plan 01: Auth Foundation Summary

**JWT verification utility with Stack Auth JWKS integration using jose library, TypeScript auth types, and environment validation**

## Performance

- **Duration:** ~15 minutes (across checkpoint pause)
- **Started:** 2026-01-23 (earlier session)
- **Completed:** 2026-01-23T15:51:36Z
- **Tasks:** 6
- **Files modified:** 6

## Accomplishments

- JWT verification utility with automatic JWKS key fetching and caching from Stack Auth
- Complete TypeScript type system for authenticated requests (AuthUser, StackAuthJWTPayload)
- FastifyRequest augmented with optional user property for auth middleware
- Environment validation utility for Stack Auth configuration with clear error messages
- Foundation ready for Wave 2 parallel execution (auth middleware, RBAC, org context)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install auth dependencies** - `e32d961` (chore)
2. **Task 2: Create auth type definitions** - `b1a5084` (feat)
3. **Task 3: Create JWT verification utility** - `eadf7ee` (feat)
4. **Task 4: Create environment validation utility** - `fe547e9` (feat)
5. **Task 5: Create middleware barrel export placeholder** - `36c3dc5` (chore)
6. **Task 6: Verify Stack Auth project is configured** - (checkpoint - verified via .env and JWKS endpoint)

## Files Created/Modified

- `backend/package.json` - Added jose@5.x and fastify-plugin dependencies
- `backend/src/types/auth.ts` - AuthUser and StackAuthJWTPayload interfaces, AppRole type
- `backend/src/types/fastify.d.ts` - FastifyRequest augmentation with user property
- `backend/src/utils/jwt.ts` - JWT verification using jose.jwtVerify with JWKS caching
- `backend/src/utils/env-check.ts` - Environment validation and optional JWKS reachability check
- `backend/src/middleware/index.ts` - Barrel export placeholder for Wave 2 middleware

## Decisions Made

1. **jose library instead of @fastify/jwt**: Direct control over Stack Auth JWKS integration, better for external auth provider pattern
2. **JWKS caching configuration**: 10-minute cache max age with 30-second cooldown balances security (key rotation) with performance (reduced API calls)
3. **Separate Stack Auth ID from profile ID**: AuthUser.id is Stack Auth user ID (from JWT sub claim), AuthUser.profileId is local database UUID (populated by middleware after JWT verification)
4. **Clock tolerance 30 seconds**: Handles clock skew between Stack Auth and backend servers
5. **Audience validation**: JWT verification validates aud claim matches STACK_AUTH_PROJECT_ID to prevent token reuse across projects
6. **Environment validation utility**: Fail fast at startup with clear error messages instead of cryptic runtime failures

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - Stack Auth JWKS endpoint was reachable and returned valid keys as expected.

## User Setup Required

**Stack Auth configuration completed.** User confirmed:
- STACK_AUTH_PROJECT_ID environment variable is set in backend/.env
- JWKS endpoint is reachable: `https://api.stack-auth.com/api/v1/projects/{PROJECT_ID}/.well-known/jwks.json`

No additional user setup required.

## Next Phase Readiness

**Ready for Wave 2 parallel execution:**
- 02-02: Auth middleware can use verifyAccessToken and AuthUser types
- 02-03: RBAC middleware can extend AuthUser with role checks
- 02-04: Organization context middleware can populate organizationId and role

**Foundation complete:**
- ✅ JWT verification utility with JWKS caching
- ✅ TypeScript types for auth context
- ✅ FastifyRequest augmentation
- ✅ Environment validation
- ✅ Middleware barrel export ready for Wave 2 additions

**No blockers or concerns.**

---
*Phase: 02-authentication-rbac*
*Completed: 2026-01-23*
