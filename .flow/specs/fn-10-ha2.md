# fn-10-ha2 CI Pipeline Hardening

## Overview

Strengthen CI pipeline with security auditing, a11y enforcement, and build verification. Current CI runs typecheck, lint, and test for both frontend and backend but has no security audit, no a11y lint, and no bundle size tracking.

## Scope

- Add pnpm audit step to CI (fail on critical vulnerabilities)
- Add a11y lint enforcement to CI (after fn-6-28x)
- Add bundle size reporting (informational, not blocking)
- Add Gitleaks CI scan as backstop (after fn-7-bhy)
- Do NOT change deployment pipeline (separate from CI)
- Do NOT add Playwright E2E to CI (too heavy for current infra)

## Approach

1. Add `pnpm audit --audit-level=critical` job step after install
2. Ensure ESLint a11y rules are enforced in CI lint step (automatic after fn-6-28x)
3. Add Gitleaks GitHub Action to CI workflow
4. Add `npx vite-bundle-visualizer` or size-limit for bundle tracking
5. Add job summary annotations for audit/size results

## Quick commands

- `pnpm audit --audit-level=critical`
- `pnpm lint`
- `pnpm build`

## Acceptance

- [ ] CI fails on critical npm audit findings
- [ ] CI lint step enforces a11y rules (jsx-a11y)
- [ ] Gitleaks runs in CI as GitHub Action
- [ ] Bundle size reported in CI (informational)
- [ ] All existing CI checks continue to pass

## Dependencies

- fn-5-mw0 (Husky/lint-staged for local enforcement)
- fn-6-28x (a11y rules to enforce in CI)
- fn-7-bhy (Gitleaks config to run in CI)

## References

- Repo scout: CI at .github/workflows/ci.yml -- frontend + backend jobs
- Repo scout: No audit, no a11y lint, no secret scanning in CI
- Practice scout: Always run Gitleaks in CI as backstop (pre-commit can be bypassed)
- Practice scout: npm audit in CI, fail on critical
