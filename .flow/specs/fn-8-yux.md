# fn-8-yux Design System Cleanup

## Overview

Consolidate duplicate UI patterns and clean up legacy naming. Two toast systems are active simultaneously (Sonner + Radix Toast). Error boundary is named "MigrationErrorBoundary" but is actually a generic error boundary. Dark mode toggle uses raw classList manipulation.

## Scope

- Consolidate dual toast systems (Sonner + Radix Toast) into Sonner only
- Rename MigrationErrorBoundary to AppErrorBoundary (generic name)
- Rename MigrationErrorFallback to ErrorFallback
- Update all imports referencing renamed components
- Do NOT change design tokens or CSS custom properties (already well-structured)
- Do NOT change ThemeToggle implementation (works fine, just document pattern)

## Approach

1. Audit all toast() call sites -- determine which use Sonner vs Radix
2. Migrate any Radix Toast usage to Sonner API
3. Remove Radix Toaster mount from App.tsx, remove radix toast component if unused
4. Rename MigrationErrorBoundary -> AppErrorBoundary with find-and-replace
5. Rename MigrationErrorFallback -> ErrorFallback with find-and-replace
6. Update errorHandler.ts: rename isMigrationError -> isAppError (or keep if semantically correct)
7. Verify all tests pass after renames

## Quick commands

- `pnpm test`
- `pnpm lint`
- `pnpm build`

## Acceptance

- [ ] Single toast system (Sonner only) -- Radix Toaster removed from App.tsx
- [ ] AppErrorBoundary replaces MigrationErrorBoundary everywhere
- [ ] ErrorFallback replaces MigrationErrorFallback everywhere
- [ ] All imports updated, no dead references
- [ ] All tests pass, build succeeds

## References

- Repo scout: Dual toast at App.tsx:104-105 (Sonner + Radix Toast mounted)
- Repo scout: MigrationErrorBoundary at src/components/errors/ is generic despite name
- Repo scout: Sonner is primary toast system, Radix is legacy holdover
- Repo scout: errorHandler.ts has isMigrationError() which may need rename assessment
