# fn-3-j7y.1 Restore TTNCredentialsPanel test coverage (26 tests)

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

Restored TTNCredentialsPanel test coverage to 26 tests. Replaced vi.mock with mockUseTRPC + createQueryOptionsMock pattern. Mock SecretField for decoupling. All async loading, mutation, and error handling scenarios covered.

## Evidence

- Commits: phase-54-01
- Tests: pnpm test -- --run src/components/ttn/TTNCredentialsPanel.test.tsx
- PRs:
