# fn-7-bhy.2 Configure Dependabot with grouped updates

## Description

Add `.github/dependabot.yml` with weekly grouped dependency updates for all ecosystems: npm (root + backend), GitHub Actions, and Docker.

## Acceptance

- [x] Dependabot configured with weekly grouped updates
- [x] npm ecosystem covers root (frontend) and backend workspaces
- [x] Production and dev dependencies grouped separately
- [x] GitHub Actions ecosystem configured with grouped updates
- [x] Docker ecosystem covers frontend and backend Dockerfiles
- [x] Dockerfile.worker limitation documented

## Done summary

Created `.github/dependabot.yml` with 5 ecosystem entries covering npm (root + backend), GitHub Actions, and Docker (frontend + backend). Production and dev dependencies grouped separately. Weekly schedule on Mondays at 06:00 ET. Conventional commit prefixes configured. Dockerfile.worker limitation documented.

## Evidence

- Commits: df2d1c2, a4e4fbc
- Tests: N/A - config only
- PRs:
