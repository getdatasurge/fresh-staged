# fn-10-ha2.1 Add pnpm audit + Gitleaks to CI workflow

## Description

Add pnpm audit (fail on critical vulnerabilities) and Gitleaks secret scanning as CI jobs in the GitHub Actions workflow.

## Acceptance

- [x] CI fails on critical npm audit findings (pnpm audit --audit-level=critical for frontend + backend)
- [x] Gitleaks runs in CI as GitHub Action (gitleaks/gitleaks-action@v2)

## Done summary

## Summary

Added Gitleaks secret scanning job to CI workflow (.github/workflows/ci.yml). The security audit job with `pnpm audit --audit-level=critical` was already present for both frontend and backend. CI now includes:

- **Security Audit job**: `pnpm audit --audit-level=critical` for frontend and backend
- **Gitleaks job**: `gitleaks/gitleaks-action@v2` with full history scan (fetch-depth: 0)

Both jobs run in parallel with existing frontend and backend jobs.

## Evidence

- Commits: aca9ffe feat(ci): add Gitleaks secret scanning to CI workflow
- Tests: CI workflow YAML validated - security audit + gitleaks jobs present
- PRs:
