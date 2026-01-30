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

Consolidated dual toast system (Radix + Sonner) into Sonner only across 22 files:

- **App.tsx**: Removed Radix `<Toaster />` mount and import
- **10 page files**: ManualLog, UnitDetail, Alerts, Reports, Sites, SiteDetail, AreaDetail, Onboarding, DataMaintenance, Areas
- **8 component/hook files**: DashboardLayout, LogTempModal, DebugTerminal, ErrorExplanationModal, PlatformGuard, PlatformLayout, SupportDiagnosticsPanel, UnitSettingsSection
- **2 context files**: DebugContext, SuperAdminContext
- **2 hook files**: useAccountDeletion, useImpersonateAndNavigate
- **1 test file**: page-a11y.test.tsx (mock updated)

## Evidence

- Commits: pending
- Tests: 154 passed (11 test files), 0 failures
- Build: vite build succeeds (3.15 MB bundle)
