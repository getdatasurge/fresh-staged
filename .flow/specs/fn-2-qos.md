# fn-2-qos Backend API Tests

## Overview

Eliminate all 24 skipped backend API tests (alerts, readings, sites) -- delete 19 duplicates covered by passing tRPC/REST tests, fix 5 unique ingest tests with socket plugin mock.

## Scope

- Phase 53 of v2.9 Quality Assurance milestone
- Requirements: ALERT-01, ALERT-02, READ-01, READ-02, SITE-01
- Three plans: alerts, readings, sites
- Depends on fn-1-fy4 (Backend TTN Webhook Tests)

## Approach

1. Delete duplicate alerts REST test file (tRPC version has full coverage)
2. Fix readings ingest tests with socket plugin mock, remove query duplicates
3. Remove sites router duplicate update tests (REST version covers all)

## Quick commands

- `cd backend && pnpm test`
- `cd backend && pnpm test -- --run tests/services/readings.test.ts`

## Acceptance

- [ ] `alerts.test.ts` deleted (14 skipped were duplicates of 19 passing tRPC tests)
- [ ] Alert lifecycle tested via tRPC with role-based access (19 tests)
- [ ] `readings.test.ts` has 0 skipped tests (5 ingest fixed, 3 duplicates removed)
- [ ] Reading ingestion tested via REST (5 tests), pagination via tRPC (8 tests)
- [ ] `sites.router.test.ts` has 0 skipped tests (2 duplicates removed, REST covers all)

## References

- `.planning/phases/53-backend-api-tests/53-01-PLAN.md`
- `.planning/phases/53-backend-api-tests/53-02-PLAN.md`
- `.planning/phases/53-backend-api-tests/53-03-PLAN.md`
