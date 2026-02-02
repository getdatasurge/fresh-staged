---
phase: 30-system-hardening
plan: 01
subsystem: api
tags: [fastify, helmet, security-headers, csp, dos-protection]

# Dependency graph
requires:
  - phase: 28-supabase-removal
    provides: Backend API with Fastify 5
provides:
  - '@fastify/helmet security headers middleware'
  - 'JSON body size limiting (1MB)'
  - 'Request timeout protection (30s)'
  - 'CSP directives for React SPA + Stack Auth'
affects: [deployment, frontend-csp, reverse-proxy-config]

# Tech tracking
tech-stack:
  added: ['@fastify/helmet@13.0.2']
  patterns: ['Security headers via helmet middleware', 'Body limits at Fastify constructor level']

key-files:
  created: []
  modified: ['backend/package.json', 'backend/src/app.ts']

key-decisions:
  - "CSP allows 'unsafe-inline' for scripts/styles (required for React SPA hydration)"
  - 'HSTS disabled - handled by reverse proxy (Caddy/nginx) in production'
  - '1MB body limit balances payload flexibility with DoS protection'
  - '30s request timeout prevents indefinite connection hangs'

patterns-established:
  - 'Helmet registered after CORS to avoid CORS preflight interference'
  - 'Security config at Fastify constructor level (bodyLimit, requestTimeout)'

# Metrics
duration: 5min
completed: 2026-01-28
---

# Phase 30 Plan 01: Backend Hardening Summary

**Helmet security headers, 1MB body limit, and 30s request timeout added to Fastify backend**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-28T00:00:00Z
- **Completed:** 2026-01-28T00:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Installed @fastify/helmet for comprehensive HTTP security headers
- Configured Content-Security-Policy allowing Stack Auth, TTN, and WebSocket connections
- Set 1MB JSON body limit to prevent DoS from oversized payloads
- Set 30-second request timeout to prevent indefinite connection hangs

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @fastify/helmet security headers plugin** - `2bd03a0` (chore)
2. **Task 2: Configure helmet, body limits, and request timeout in app.ts** - `df211b5` (feat)

## Files Created/Modified

- `backend/package.json` - Added @fastify/helmet dependency
- `backend/package-lock.json` - Updated lockfile with helmet and dependencies
- `backend/src/app.ts` - Helmet registration, bodyLimit, requestTimeout configuration

## Decisions Made

- CSP allows `'unsafe-inline'` for scripts/styles - required for React SPA hydration
- CSP connectSrc includes Stack Auth API, TTN wildcard, and WebSocket protocols
- HSTS disabled at application level - reverse proxy (Caddy/nginx) handles this in production
- Helmet registered after CORS to avoid interference with CORS preflight responses

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial `npm install` created packages but node_modules needed a second `npm install` to populate - resolved by running install again

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend hardening foundation complete
- Security headers automatically added to all responses
- Ready for further hardening (audit, performance tuning) in subsequent plans

---

_Phase: 30-system-hardening_
_Completed: 2026-01-28_
