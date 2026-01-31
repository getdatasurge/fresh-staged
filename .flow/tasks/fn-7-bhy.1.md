# fn-7-bhy.1 Add Gitleaks pre-commit hook + initial scan

## Description

Install Gitleaks as a pre-commit hook via Husky with graceful fallback if not installed. Run initial full-history scan to establish baseline of false positives.

## Acceptance

- [x] Gitleaks runs on pre-commit (blocks commits with detected secrets)
- [x] Full history scanned, baseline established with no real secrets
- [x] `.gitleaksignore` exists for known false positives

## Done summary

Added Gitleaks secret scanning as a pre-commit hook via Husky. The hook runs `gitleaks protect --staged --verbose` with graceful fallback if gitleaks is not installed. Created `.gitleaks.toml` config with path allowlists. Ran full-history scan: 94 findings, all verified false positives. Created categorized `.gitleaksignore` baseline.

## Evidence

- Commits: 2a2ac06
- Tests: 154/154 pass, gitleaks detect reports no leaks
- PRs:
