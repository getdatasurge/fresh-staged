# fn-8-yux.2 Rename MigrationErrorBoundary to AppErrorBoundary

## Description

TBD

## Acceptance

- [ ] TBD

## Done summary

## Summary

Rename MigrationErrorBoundary to AppErrorBoundary was already completed in commit 27cb783:

- Renamed `MigrationErrorBoundary` → `AppErrorBoundary` (component + file)
- Renamed `MigrationErrorFallback` → `ErrorFallback` (component + file)
- Renamed `isMigrationError` → `isAppError` in errorHandler.ts
- Renamed `getMigrationErrorMessage` → `getAppErrorMessage` in errorHandler.ts
- Updated all imports in DashboardLayout.tsx and test mocks
- Removed old Migration-prefixed files

Verified: zero references to old names remain in `src/`. No TypeScript errors in affected files.

## Evidence

- Commits: 27cb783
- Tests: tsc --build --noEmit: no errors in affected files (AppErrorBoundary.tsx, ErrorFallback.tsx, errorHandler.ts, DashboardLayout.tsx)
- PRs:
