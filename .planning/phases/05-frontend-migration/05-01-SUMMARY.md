---
phase: 05-frontend-migration
plan: 01
subsystem: api
tags: [ky, http-client, typescript, api-types, stack-auth]

# Dependency graph
requires:
  - phase: 04-sensor-data-alert-system
    provides: Backend API with Zod schemas for all entities
provides:
  - Ky HTTP client with retry logic and error handling
  - TypeScript types matching backend Zod schemas (orgs, sites, areas, units, readings, alerts)
  - Authentication token injection pattern via createAuthenticatedClient
affects: [06-frontend-hooks, 07-frontend-ui]

# Tech tracking
tech-stack:
  added: [ky@1.14.2]
  patterns: [token-injection-factory, discriminated-union-errors, retry-with-backoff]

key-files:
  created:
    - src/lib/api-client.ts
    - src/lib/api-types.ts
  modified: []

key-decisions:
  - "Use Ky HTTP client for lightweight fetch wrapper with built-in retry"
  - "Manually define TypeScript types matching backend Zod schemas (no codegen for simplicity)"
  - "Factory function pattern for token injection (not hooks in client)"
  - "Discriminated union for ApiError types (network, validation, auth, server)"
  - "Log errors to console AND throw for component handling"

patterns-established:
  - "Token injection: createAuthenticatedClient(token) extends base client with auth header"
  - "Error visibility: Console logging + thrown errors for DOM display"
  - "Retry strategy: 3 attempts on transient errors (408, 429, 5xx) with exponential backoff"

# Metrics
duration: 2min 10sec
completed: 2026-01-23
---

# Phase 05-01: API Client Infrastructure Summary

**Ky HTTP client with Stack Auth token injection and TypeScript types matching backend Zod schemas**

## Performance

- **Duration:** 2 minutes 10 seconds
- **Started:** 2026-01-23T19:33:42Z
- **Completed:** 2026-01-23T19:35:52Z
- **Tasks:** 3
- **Files created:** 2

## Accomplishments

- Installed Ky@1.14.2 as lightweight fetch-based HTTP client with built-in retry logic
- Created comprehensive TypeScript types for all backend entities (organizations, sites, areas, units, readings, alerts)
- Implemented base API client with 30s timeout, 3-attempt retry, and error logging to console
- Factory function for authenticated client that injects Stack Auth token via header
- Error handling that logs to console AND throws for component-level display

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Ky HTTP client** - `ef34c01` (chore)
2. **Task 2: Create API types from backend schemas** - `9b1df53` (feat)
3. **Task 3: Create Ky API client with auth interceptor** - `7539b7f` (feat)

## Files Created/Modified

- `src/lib/api-client.ts` - Base Ky client with retry logic, error handling, and createAuthenticatedClient factory
- `src/lib/api-types.ts` - TypeScript types matching backend Zod schemas for type-safe API communication

## Decisions Made

**Use Ky over Axios:** Chose Ky for lighter bundle size (157KB vs 800KB), modern fetch-based API, and excellent TypeScript support. Built-in retry logic with exponential backoff eliminates need for manual implementation.

**Manual type definition over codegen:** Decided to manually define TypeScript types matching backend Zod schemas rather than using zod-to-ts tooling. Simpler approach, avoids build complexity, and backend already exports types via `z.infer`.

**Token injection via factory function:** createAuthenticatedClient(token) pattern instead of hooks-in-client. This keeps the API client itself non-React, allowing token to be passed from component hooks (useUser) where it's needed.

**Discriminated union for errors:** ApiError uses discriminated union with `type` field (network | validation | auth | server) for better TypeScript narrowing in error handling.

**Console + throw error pattern:** All errors logged to console for debugging AND thrown to caller for component-level error display. Ensures errors visible in both browser dev tools AND the DOM.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - Ky installation and TypeScript types created without issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 05-02 (API endpoint functions):**
- Base HTTP client available for all API calls
- TypeScript types defined for request/response contracts
- Authentication pattern established via createAuthenticatedClient

**Foundation established:**
- Retry logic handles transient network errors automatically
- Error logging provides visibility in console and enables DOM error display
- Type safety ensures frontend-backend contract alignment

**No blockers.** Ready to implement domain-specific API functions (organizations, sites, areas, units, readings, alerts).

---
*Phase: 05-frontend-migration*
*Completed: 2026-01-23*
