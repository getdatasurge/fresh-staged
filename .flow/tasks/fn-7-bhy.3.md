# fn-7-bhy.3 Add pnpm audit step to CI pipeline

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

Added security audit job to CI pipeline (.github/workflows/ci.yml). The new job runs pnpm audit --audit-level=critical for both root (frontend) and backend workspaces, failing only on critical vulnerabilities.

## Evidence

- Commits: a62e16046eb8e28abb8e8629fab2f3b23bb4640a
- Tests: CI workflow validates pnpm audit --audit-level=critical for both workspaces
- PRs:
