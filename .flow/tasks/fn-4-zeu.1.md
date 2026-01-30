# fn-4-zeu.1 Fix vi.resetAllMocks bug + validate both suites green

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

Fixed vi.resetAllMocks bug in reading-ingestion.service.test.ts by changing to vi.clearAllMocks(). This preserves mock implementations set by vi.mock() factory while still clearing call counts between tests. Both backend (56 files, 1256 tests) and frontend (10 files, 150 tests) suites pass with zero failures and zero skipped tests.

## Evidence

- Commits: 2070f162e7da83fe0cd3e74c4545cc98cabdaeca
- Tests: backend vitest run: 56 files 1256 tests passed, frontend vitest run: 10 files 150 tests passed, grep skip patterns: zero matches
- PRs:
