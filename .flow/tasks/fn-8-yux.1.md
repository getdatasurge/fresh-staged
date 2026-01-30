# fn-8-yux.1 Consolidate toast systems (remove Radix, keep Sonner)

## Description

Remove the Radix Toast system and consolidate all toast notifications to use Sonner only. This involves:

- Converting all `useToast()` hook calls to direct `import { toast } from 'sonner'`
- Replacing `toast({ title: '...', variant: 'destructive' })` with `toast.error('...')`
- Replacing `toast({ title: '...' })` with `toast.success('...')`
- Removing the Radix `<Toaster />` mount from App.tsx
- Updating test mocks from `useToast` to `sonner`

## Acceptance

- [x] Single toast system (Sonner only) -- Radix Toaster removed from App.tsx
- [x] All `useToast` hook imports replaced with `import { toast } from 'sonner'`
- [x] All `const { toast } = useToast()` destructuring removed
- [x] All toast calls converted to Sonner API (toast.success, toast.error, toast)
- [x] Test mocks updated for sonner
- [x] All tests pass (154/154), build succeeds

## Done summary

## Summary

Consolidated dual toast system (Radix + Sonner) into Sonner only across 22 source files.

### Changes

- Removed Radix `<Toaster />` component mount and import from App.tsx
- Converted 10 page files from `useToast()` hook to `import { toast } from 'sonner'`
- Converted 8 component/hook files from `useToast()` to Sonner API
- Converted 2 context files (DebugContext, SuperAdminContext)
- Converted 2 hook files (useAccountDeletion, useImpersonateAndNavigate)
- Updated test mock in page-a11y.test.tsx from `useToast` to `sonner`

### API Migration Pattern

- `toast({ title: '...', variant: 'destructive' })` → `toast.error('...')`
- `toast({ title: '...', description: '...' })` → `toast.success('...', { description: '...' })`
- `toast({ title: '...' })` → `toast.success('...')`
- Removed all `const { toast } = useToast()` destructuring
- Removed `toast` from useCallback/useEffect dependency arrays

### Verification

- Build: vite build succeeds
- Tests: 154/154 passed (11 test files)
- No remaining `useToast` imports in active source files

## Evidence

- Commits:
- Tests: command, status, total, passed, failed, files
- PRs:
