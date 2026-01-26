# Codebase Concerns

**Analysis Date:** 2026-01-26

## Tech Debt

**TTN key obfuscation bypasses encryption:**
- Issue: `obfuscateKey` uses plain base64 instead of XOR encryption for stored TTN API keys
- Why: Temporary workaround to diagnose key corruption
- Impact: Keys are protected only by base64 encoding, weaker than intended
- Fix approach: Re-enable XOR encryption, add a migration for stored keys, and add round-trip tests in `supabase/functions/_shared/ttnConfig.ts`
- Files: `supabase/functions/_shared/ttnConfig.ts`

**Settings page still depends on Supabase functions:**
- Issue: Supabase function invocations remain for TTN config, SMS, and cleanup flows
- Why: tRPC migration is incomplete for settings tooling
- Impact: Mixed data paths (tRPC + Supabase) increase maintenance risk and complicate backend swap
- Fix approach: Move these calls behind tRPC endpoints and remove direct `supabase.functions.invoke` usage
- Files: `src/pages/Settings.tsx`

**Alert evaluator lacks restoring → OK automation:**
- Issue: Restoring state does not transition to OK automatically after good readings
- Why: TODO left for multi-reading confirmation logic
- Impact: Units can remain in restoring until manual resolution or a scheduled job
- Fix approach: Implement multi-reading confirmation in `alert-evaluator` and add regression tests
- Files: `backend/src/services/alert-evaluator.service.ts`

## Known Bugs

**In-app unsaved changes prompt disabled:**
- Symptoms: No navigation block when leaving with dirty state (browser refresh/close still warns)
- Trigger: In-app navigation while `isDirty` is true
- Workaround: Rely on beforeunload prompt for refresh/close
- Root cause: `useBlocker` requires a Data Router, but the app uses BrowserRouter
- Blocked by: Migrating routing to `createBrowserRouter` in `src/App.tsx`
- Files: `src/features/dashboard-layout/hooks/useUnsavedChangesGuard.ts`, `src/App.tsx`

**Status label mismatch assertion:**
- Symptoms: Dev-only log when `offlineSeverity` is "none" but label is "Offline"
- Trigger: Specific combinations of unit state inputs
- Workaround: None (dev-only assertion)
- Root cause: Not identified; relies on computed `offlineSeverity`
- Files: `src/hooks/useUnitStatus.ts`

## Security Considerations

**TTN API key details logged during provisioning:**
- Risk: Debug logs expose key prefixes and full response structure
- Current mitigation: Logs only prefixes/metadata, not full keys
- Recommendations: Gate debug logs behind a server-side feature flag and scrub sensitive fields
- Files: `supabase/functions/ttn-provision-org/index.ts`

**TTN permissions debug logs include raw auth_info:**
- Risk: Raw auth_info may include sensitive identifiers and rights details
- Current mitigation: Output is truncated to 1500 chars
- Recommendations: Disable raw response logging in production and redact sensitive fields
- Files: `supabase/functions/_shared/ttnPermissions.ts`

**TTN key storage uses base64 encoding:**
- Risk: Base64-only obfuscation is reversible and not encryption
- Current mitigation: None beyond base64 encoding
- Recommendations: Restore encryption and rotate stored keys
- Files: `supabase/functions/_shared/ttnConfig.ts`

## Performance Bottlenecks

Not detected

## Fragile Areas

**TTN provisioning flow:**
- Why fragile: Large multi-step flow with external TTN API dependencies and key handling
- Common failures: API key capture issues, TTN API errors, obfuscation round-trip mismatches
- Safe modification: Test in a TTN sandbox, validate key round-trip, keep rollback plan
- Test coverage: Limited to shared permissions tests; no end-to-end provisioning tests
- Files: `supabase/functions/ttn-provision-org/index.ts`, `supabase/functions/_shared/ttnConfig.ts`, `supabase/functions/_shared/ttnPermissions.test.ts`

## Scaling Limits

**Dashboard layout drafts stored in localStorage:**
- Current capacity: Browser localStorage limits (~5MB per origin)
- Limit: Draft saves may fail silently when storage is full
- Symptoms at limit: Layout drafts not persisted or overwritten
- Scaling path: Move drafts to server-side storage or IndexedDB
- Files: `src/features/dashboard-layout/utils/draftManager.ts`

## Dependencies at Risk

Not detected

## Missing Critical Features

**Super admin checks disabled after Stack Auth migration:**
- Problem: `isSuperAdmin` defaults to false, skipping backend role verification
- Current workaround: None (feature effectively disabled)
- Blocks: Platform admin functionality that depends on verified super admin state
- Implementation complexity: Medium (new backend endpoint + auth wiring)
- Files: `src/contexts/SuperAdminContext.tsx`, `src/hooks/useAuthAndOnboarding.ts`

**Impersonation server-side validation:**
- Problem: Impersonation state relies on client context without server validation
- Current workaround: Client-side context only
- Blocks: Reliable audit/expiry enforcement for impersonation sessions
- Implementation complexity: Medium (backend validation + session checks)
- Files: `src/hooks/useEffectiveIdentity.ts`

## Test Coverage Gaps

**TTN provisioning and settings functions:**
- What's not tested: Provisioning flow and TTN settings management functions
- Risk: Breaks in TTN API integration or key handling go unnoticed
- Priority: High
- Difficulty to test: Requires TTN API mocks or test environment
- Files: `supabase/functions/ttn-provision-org/index.ts`, `supabase/functions/manage-ttn-settings/index.ts`

**Alert evaluator transitions:**
- What's not tested: Restoring/OK state transitions in alert evaluator
- Risk: Units stick in restoring or resolve incorrectly
- Priority: Medium
- Difficulty to test: Requires fixtures for unit state and alert transitions
- Files: `backend/src/services/alert-evaluator.service.ts`

---

*Concerns audit: 2026-01-26*
*Update as issues are fixed or new ones discovered*
