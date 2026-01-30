# fn-1-fy4 Backend TTN Webhook Tests

## Overview

Consolidate duplicate TTN webhook test files -- replace the broken api/ file (14 skipped tests) with the working routes/ file (32 passing tests), eliminating all skips with zero coverage loss.

## Scope

- Phase 52 of v2.9 Quality Assurance milestone
- Requirements: TTN-01, TTN-02
- Single plan: consolidate TTN webhook tests

## Approach

Replace broken `tests/api/ttn-webhooks.test.ts` with working `tests/routes/ttn-webhooks.test.ts`, keeping the canonical path and socket plugin mock pattern.

## Quick commands

- `cd backend && pnpm test -- --run tests/api/ttn-webhooks.test.ts`
- `cd backend && pnpm test`

## Acceptance

- [ ] All 14 previously-skipped tests eliminated (no `.skip` or `.todo` markers)
- [ ] 32 TTN webhook tests pass (auth, payload validation, reading creation, alert triggers, device metadata, edge cases)
- [ ] Single canonical test file at `tests/api/ttn-webhooks.test.ts` with socket plugin mock
- [ ] No regression in broader backend test suite

## References

- `.planning/phases/52-backend-ttn-webhook-tests/52-01-PLAN.md`
- `.planning/phases/52-backend-ttn-webhook-tests/52-01-SUMMARY.md`
