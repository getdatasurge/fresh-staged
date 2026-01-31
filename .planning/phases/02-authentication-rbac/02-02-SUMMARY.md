---
phase: 02-authentication-rbac
plan: 02
subsystem: auth
tags: [fastify, jwt, middleware, jose, auth-plugin]

# Dependency graph
requires:
  - phase: 02-01
    provides: JWT verification utility, AuthUser types, FastifyRequest augmentation
provides:
  - Fastify auth plugin with request.user decoration
  - requireAuth middleware for JWT validation
  - Bearer token authentication flow
  - 401 error responses with specific error messages
affects: [02-05, route-protection, api-security]

# Tech tracking
tech-stack:
  added: [fastify]
  patterns: [fastify-plugin decoration, preHandler hooks, Bearer token extraction]

key-files:
  created:
    - backend/src/plugins/auth.plugin.ts
    - backend/src/middleware/auth.ts
  modified:
    - backend/package.json (added fastify dependency)

key-decisions:
  - 'Use undefined for request.user decoration (not null) to match TypeScript augmentation'
  - 'Auth plugin decorates at startup, middleware populates on each request'
  - 'Middleware returns specific error messages based on jose error types'

patterns-established:
  - 'Fastify plugins use fp wrapper for proper encapsulation'
  - 'Middleware uses preHandler hook signature for route protection'
  - 'Error responses use consistent { error, message } format'

# Metrics
duration: 3min 7s
completed: 2026-01-23
---

# Phase 02 Plan 02: Auth Middleware Summary

**Fastify auth plugin with request decoration and requireAuth middleware for JWT Bearer token validation**

## Performance

- **Duration:** 3 minutes 7 seconds
- **Started:** 2026-01-23T15:56:22Z
- **Completed:** 2026-01-23T15:59:29Z
- **Tasks:** 3 (2 with commits, 1 completed via parallel execution)
- **Files modified:** 4

## Accomplishments

- Fastify dependency installed for backend framework
- Auth plugin decorates request.user at app startup for V8 optimization
- requireAuth middleware validates JWT tokens from Authorization header
- Middleware populates request.user with id, email, name from Stack Auth payload
- Returns 401 with specific error messages for missing/invalid/expired tokens

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth plugin with request decoration** - `888ac69` (feat)
2. **Task 2: Create requireAuth middleware** - `a1fc5a5` (feat)
3. **Task 3: Update middleware barrel export** - Completed via parallel Wave 2 execution (commits `6ec0a36` from 02-03 and `bbf3a71` from 02-04)

## Files Created/Modified

- `backend/src/plugins/auth.plugin.ts` - Fastify plugin that decorates request with user property at startup
- `backend/src/middleware/auth.ts` - requireAuth preHandler hook that validates Bearer tokens
- `backend/package.json` - Added fastify@5.7.1 dependency
- `backend/src/middleware/index.ts` - Barrel export includes requireAuth (updated by parallel plans)

## Decisions Made

**Use undefined for decoration value**

- Plan specified null, but TypeScript augmentation defines user?: AuthUser (meaning AuthUser | undefined)
- Changed to undefined for type consistency with FastifyRequest augmentation
- Maintains V8 object shape optimization as intended

**Specific error messages based on jose error types**

- JWTExpired: "Token expired"
- JWTClaimValidationFailed: "Invalid token claims"
- JWSSignatureVerificationFailed: "Invalid token signature"
- Default: "Invalid token"
- Enables client-side token refresh logic based on error type

**Middleware only populates basic user info**

- request.user contains id, email, name from JWT payload
- profileId, organizationId, and role populated by separate middleware (02-03, 02-04)
- Separation of concerns: auth validates identity, other middleware adds context

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing fastify dependency**

- **Found during:** Task 1 (Create auth plugin)
- **Issue:** TypeScript couldn't find 'fastify' module - package not installed
- **Fix:** Ran `pnpm add fastify` to install fastify@5.7.1 with built-in TypeScript types
- **Files modified:** backend/package.json, backend/pnpm-lock.yaml
- **Verification:** TypeScript compilation passed after installation
- **Committed in:** 888ac69 (Task 1 commit)

**2. [Rule 1 - Bug] Changed null to undefined for request decoration**

- **Found during:** Task 1 (Create auth plugin)
- **Issue:** TypeScript error - decorateRequest expects undefined, not null, because FastifyRequest augmentation defines user?: AuthUser
- **Fix:** Changed `fastify.decorateRequest('user', null)` to `fastify.decorateRequest('user', undefined)`
- **Files modified:** backend/src/plugins/auth.plugin.ts
- **Verification:** TypeScript compilation passed, matches type augmentation
- **Committed in:** 888ac69 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for compilation and type correctness. No scope creep.

## Issues Encountered

**Parallel Wave 2 execution and barrel export**

- Task 3 intended to update middleware/index.ts to export requireAuth
- Plans 02-03 and 02-04 (running in parallel) already updated the file
- Current index.ts includes all three Wave 2 exports (auth, rbac, org-context)
- Resolution: Verified requireAuth export exists with proper .js extension
- No additional commit needed - task objectives met via parallel execution

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for integration (02-05):**

- Auth plugin registers at app startup to decorate requests
- requireAuth middleware protects routes requiring authentication
- Middleware integrates with 02-03 (RBAC) and 02-04 (org-context) for complete auth stack

**Usage pattern:**

```typescript
// Register plugin at startup
await fastify.register(authPlugin);

// Protect routes with authentication
fastify.get(
  '/api/protected',
  {
    preHandler: [requireAuth],
  },
  async (request, reply) => {
    const userId = request.user.id; // Guaranteed to exist after requireAuth
    // ...
  },
);
```

**Blocker:** None

**Concerns:** None - auth middleware is foundation for RBAC and org-context layers

---

_Phase: 02-authentication-rbac_
_Completed: 2026-01-23_
