# fn-3-j7y Frontend Test Restoration

## Overview

Restore frontend test coverage for TTNCredentialsPanel and widget health states, implementing all deferred scenarios.

## Scope

- Phase 54 of v2.9 Quality Assurance milestone
- Requirements: FE-01, FE-02, FE-03
- Two plans: TTNCredentialsPanel tests, widget health states
- Independent of backend phases (can run in parallel)

## Approach

1. Replace `vi.mock('@tanstack/react-query')` with `mockUseTRPC` + `createQueryOptionsMock` pattern
2. Mock SecretField for decoupling; check `mutation mock.calls[0][0]` due to TanStack context arg
3. Remove `describe.skip` from widget health states, delete deprecated stub tests

## Quick commands

- `pnpm test -- --run src/components/ttn/TTNCredentialsPanel.test.tsx`
- `pnpm test -- --run src/components/widgets/widgetHealthStates.test.ts`
- `pnpm test`

## Acceptance

- [ ] TTNCredentialsPanel test suite: ~26 tests (async loading, mutations, error handling)
- [ ] Deferred scenarios implemented and passing (loading states, mutation success/failure, validation)
- [ ] `widgetHealthStates.test.ts` has no `describe.skip`, all tests pass
- [ ] Frontend `pnpm test` runs with zero skipped tests in these files

## References

- `.planning/phases/54-frontend-test-restoration/54-01-PLAN.md`
- `.planning/phases/54-frontend-test-restoration/54-02-PLAN.md`
