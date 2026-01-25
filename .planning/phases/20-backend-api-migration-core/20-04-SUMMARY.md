---
phase: 20-backend-api-migration-core
plan: 04
subsystem: testing
tags: [trpc, e2e, vitest, fastify, integration-testing]

# Dependency graph
requires:
  - phase: 20-backend-api-migration-core
    provides: All 6 tRPC routers (organizations, sites, areas, units, readings, alerts)
provides:
  - Comprehensive E2E tests for all tRPC domain routers (45 tests)
  - HTTP-level integration tests via Fastify app.inject()
  - Role-based access verification for all routers
  - Error code verification (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)
affects: [20-backend-api-migration-core, 21-frontend-api-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E testing via app.inject() for HTTP simulation"
    - "Service mocking with vi.mock() for isolated tests"
    - "Mock JWT verification for authenticated requests"
    - "Router registration smoke test pattern"

key-files:
  created: []
  modified:
    - backend/tests/trpc/e2e.test.ts (1266 lines, 45 tests)

key-decisions:
  - "Mock JWT verification returns {payload, userId} matching verifyAccessToken signature"
  - "Valid UUID v4 format required: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx (M=1-5, N=8-b)"
  - "Mock services must return schema-compliant data (sortOrder, unitType, etc.)"
  - "Smoke test verifies all 6 routers registered by checking for non-404 responses"

patterns-established:
  - "E2E mock pattern: vi.mock() for jwt + user service + domain services"
  - "Mock data pattern: Full schema-compliant objects matching Zod schemas"
  - "Auth token pattern: 'valid-admin-token', 'valid-staff-token', 'valid-viewer-token'"
  - "Role-based test pattern: Set mockGetUserRoleInOrg per test for role verification"

# Metrics
duration: 8min
completed: 2026-01-25
---

# Phase 20 Plan 04: tRPC E2E Integration Tests Summary

**One-liner:** Comprehensive E2E tests for all 6 tRPC domain routers via HTTP with role-based access verification

## What was done

1. **Extended e2e.test.ts with Sites and Areas E2E tests**
   - 7 tests for sites router (list, get, create, update, delete, FORBIDDEN, NOT_FOUND)
   - 8 tests for areas router (list, get, create, update, delete, FORBIDDEN, NOT_FOUND x2)
   - Valid UUID v4 format fixed for all test IDs

2. **Added Units, Readings, and Alerts E2E tests**
   - 7 tests for units router (list, get, create, update, delete, FORBIDDEN, NOT_FOUND)
   - 4 tests for readings router (list, latest, null latest, NOT_FOUND)
   - 7 tests for alerts router (list, get, acknowledge, resolve, FORBIDDEN, NOT_FOUND, CONFLICT)
   - Mock data objects updated to match Zod schemas (sortOrder, unitType, alertType, etc.)

3. **Added router registration smoke test**
   - Verifies all 6 domain routers are properly mounted
   - Tests health endpoint accessibility without authentication

## Test Coverage

| Router | Tests | Coverage |
|--------|-------|----------|
| Health/Infrastructure | 10 | Auth, batching, errors, types, HTTP methods |
| Organizations | 2 | (from existing tests) |
| Sites | 7 | CRUD + FORBIDDEN + NOT_FOUND |
| Areas | 8 | CRUD + FORBIDDEN + NOT_FOUND x2 |
| Units | 7 | CRUD + FORBIDDEN + NOT_FOUND |
| Readings | 4 | list, latest, null, NOT_FOUND |
| Alerts | 7 | list, get, acknowledge, resolve, FORBIDDEN, NOT_FOUND, CONFLICT |
| Smoke Test | 2 | Router registration + health |
| **Total** | **45** | All routers verified |

## Error Codes Verified

- **UNAUTHORIZED (401)**: Authentication required, invalid token
- **FORBIDDEN (403)**: Viewer can't create/update, staff can't create units
- **NOT_FOUND (404)**: Non-existent site/area/unit/alert
- **CONFLICT (409)**: Already acknowledged alert

## Deviations from Plan

None - plan executed exactly as written.

## Commits

1. `1ed263c` - test(20-04): add E2E tests for sites and areas routers
2. `dd7ac3a` - test(20-04): add E2E tests for units, readings, alerts routers
3. `2c72b2c` - test(20-04): add router registration smoke test

## Verification Results

```
npm test --prefix backend -- --run e2e.test.ts

45 tests passed
Test duration: ~100ms
File size: 1266 lines (well above 150 minimum)
```

## Next Phase Readiness

Plan 20-04 completes the E2E testing for all tRPC domain routers. The backend API migration core phase can proceed to:
- Plan 20-05: Devices & Profiles tRPC Routers (if planned)
- Frontend API migration integration

### Outstanding Known Issues

- TTN device tests (15 tests) continue to fail with 500 errors - pre-existing issue, not related to this plan
