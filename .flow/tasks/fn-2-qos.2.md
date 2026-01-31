# fn-2-qos.2 Fix readings ingest tests + remove query duplicates

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

Fixed 5 readings ingest tests with socket plugin mock, removed 3 duplicate query tests. Fixed invalid UUID in TEST_READING_ID causing Zod serialization failure.

## Evidence

- Commits: phase-53-02
- Tests: cd backend && pnpm test -- --run tests/services/readings.test.ts
- PRs:
