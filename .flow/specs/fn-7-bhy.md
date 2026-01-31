# fn-7-bhy Security Scaffolding

## Overview

Add secret scanning and dependency auditing. Currently NO gitleaks, NO dependabot/renovate, NO npm audit in CI, NO pre-commit security hooks. .gitignore covers .env and security files but no automated enforcement.

## Scope

- Add Gitleaks for pre-commit secret scanning
- Add Dependabot or Renovate for automated dependency updates
- Add npm/pnpm audit step to CI pipeline
- Add .gitleaksignore for known false positives
- Do NOT change existing @fastify/helmet security headers (already configured)
- Do NOT add CSP (separate concern, requires careful SPA testing)

## Approach

1. Install Gitleaks, add as pre-commit hook via Husky (depends on fn-5-mw0)
2. Run initial Gitleaks scan on full history, create baseline
3. Add `.github/dependabot.yml` with grouped updates for npm (weekly, grouped by type)
4. Add `pnpm audit --audit-level=critical` step to CI workflow
5. Document security scanning in project docs

## Quick commands

- `gitleaks detect --source . --verbose`
- `pnpm audit`

## Acceptance

- [ ] Gitleaks runs on pre-commit (blocks commits with detected secrets)
- [ ] Full history scanned, baseline established with no real secrets
- [ ] Dependabot configured with weekly grouped updates
- [ ] CI pipeline includes pnpm audit step
- [ ] `.gitleaksignore` exists for known false positives

## References

- Repo scout: No secret scanning, no dependabot, no audit in CI
- Practice scout: Gitleaks is most popular, also run in CI as backstop since hooks can be bypassed
- Existing .gitignore covers: .env, .security-key, logs/security/
- Depends on fn-5-mw0 (Husky must be set up first for pre-commit hooks)
