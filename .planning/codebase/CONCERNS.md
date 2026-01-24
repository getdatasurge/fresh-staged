# Codebase Concerns

**Analysis Date:** 2026-01-23

## Tech Debt

**Type Safety Bypasses with `as any`:**
- Issue: 50+ instances of `as any` type casts scattered throughout the codebase, particularly in data transformation code
- Files:
  - `src/pages/UnitDetail.tsx` (lines 1093-1113) - Unit properties cast to any
  - `src/features/dashboard-layout/widgets/UnitsStatusGridWidget.tsx` (line 55)
  - `src/features/dashboard-layout/widgets/DeviceReadinessWidget.tsx` (line 34)
  - `src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts` (line 94)
  - `src/pages/ManualLog.tsx` (lines 76-77, 93-94)
  - `src/pages/Dashboard.tsx` (lines 146, 161)
  - `src/pages/Inspector.tsx` (lines 243, 247)
  - `src/pages/Alerts.tsx` (lines 163, 187, 190, 204)
  - `src/hooks/useNotificationPolicies.ts` (line 240)
  - `src/hooks/useAlertRulesHistory.ts` (line 103)
  - `src/components/settings/AlertRulesEditor.tsx` (line 155)
- Impact: Bypasses TypeScript safety, potential runtime errors, makes refactoring risky
- Fix approach: Add proper type definitions to Supabase types, use type guards, create properly typed query helpers

**Deprecated Code Still in Use:**
- Issue: Multiple deprecated functions and patterns still referenced
- Files:
  - `src/lib/orgScopedInvalidation.ts` - Entire file deprecated (lines 4-78)
  - `src/hooks/useOrgScope.ts` (line 81) - useOrganizationId deprecated
  - `src/hooks/useUserRole.ts` (line 11) - organizationId deprecated
  - `src/features/dashboard-layout/types.ts` (lines 105, 112) - sensorId field deprecated
- Impact: Inconsistent patterns, confusion for new developers, technical debt accumulation
- Fix approach: Remove deprecated code after migrating all consumers to new APIs

**TODO Comments Indicating Incomplete Features:**
- Issue: Several TODO markers indicating deferred functionality
- Files:
  - `src/features/dashboard-layout/components/TimelineControls.tsx` (line 261) - Custom comparison disabled
  - `src/features/dashboard-layout/hooks/useUnsavedChangesGuard.ts` (line 45) - useBlocker migration needed
  - `src/components/settings/SensorManager.tsx` (line 359) - Deprovision queue not implemented
  - `supabase/functions/_shared/ttnConfig.ts` (line 306) - Proper encryption disabled for debugging
  - `supabase/functions/manage-ttn-settings/index.ts` (line 581) - TTN webhook update not implemented
- Impact: Features incomplete, potential security implications (encryption disabled)
- Fix approach: Create issues for each TODO, prioritize security-related items

**Encryption Temporarily Disabled:**
- Issue: Key obfuscation/encryption disabled for debugging TTN key corruption
- Files:
  - `supabase/functions/_shared/ttnConfig.ts` (lines 273-317) - Using plain base64 instead of XOR encryption
- Impact: API keys stored with weaker protection than intended
- Fix approach: Debug and fix XOR corruption issues, re-enable proper encryption

## Known Bugs

**Status Label Mismatch:**
- Symptoms: Dev assertion fires when offlineSeverity is "none" but statusLabel shows "Offline"
- Files: `src/hooks/useUnitStatus.ts` (lines 189-196)
- Trigger: Specific combination of unit state values
- Workaround: Dev-only assertion, no production impact yet

**useBlocker Incompatibility:**
- Symptoms: In-app navigation blocking disabled, unsaved changes can be lost
- Files: `src/features/dashboard-layout/hooks/useUnsavedChangesGuard.ts` (lines 42-46)
- Trigger: Navigating away from page with unsaved dashboard changes
- Workaround: beforeunload handler works for browser close/refresh, but not in-app navigation

## Security Considerations

**Environment Variables Exposed to Client:**
- Risk: Supabase credentials exposed in client bundle (expected for publishable keys)
- Files:
  - `src/integrations/supabase/client.ts` (lines 5-6) - VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
  - `src/lib/ttn/diagnosticsBuilder.ts` (lines 93-94)
- Current mitigation: Using publishable keys only, RLS enforced on Supabase
- Recommendations: Audit that no secret keys are exposed, verify RLS coverage

**API Key Handling in Debug Logs:**
- Risk: Sensitive data could leak into debug logs
- Files:
  - `src/lib/debugLogger.ts` - Has SENSITIVE_PATTERNS regex to redact
  - `supabase/functions/ttn-provision-org/index.ts` (lines 1500-1545) - DEBUG logging of key operations
- Current mitigation: SENSITIVE_PATTERNS redaction, key prefix logging only
- Recommendations: Review all DEBUG log statements for sensitive data exposure

**Error Catching Without Proper Handling:**
- Risk: Silent failures masking issues
- Files: Multiple widgets and hooks with generic catch blocks:
  - `src/features/dashboard-layout/widgets/*.tsx` - Most widgets have `catch (err) { console.error(...) }`
  - `src/features/dashboard-layout/hooks/useDraftLayout.ts` (lines 83-87) - Fails silently
  - `src/features/dashboard-layout/utils/draftManager.ts` - Multiple silent returns on error
- Current mitigation: Error logging in most cases
- Recommendations: Implement structured error boundaries, user-facing error states

## Performance Bottlenecks

**Large Component Files:**
- Problem: Several page components exceed 500+ lines, indicating too many responsibilities
- Files:
  - `src/pages/Settings.tsx` - 1373 lines
  - `src/pages/UnitDetail.tsx` - 1267 lines
  - `src/components/settings/SensorManager.tsx` - 1187 lines
  - `src/pages/Onboarding.tsx` - 1097 lines
  - `src/components/settings/TTNCredentialsPanel.tsx` - 981 lines
  - `src/pages/Inspector.tsx` - 832 lines
  - `src/hooks/useSoftDelete.ts` - 842 lines
- Cause: Accumulated feature additions without refactoring
- Improvement path: Extract sub-components, create custom hooks, separate concerns

**Console Logging in Production:**
- Problem: 304 console.log/error/warn calls across 103 files
- Files: Distributed throughout `src/` - see count above
- Cause: Debug statements left in place
- Improvement path: Use debugLogger consistently, remove console.* calls or gate behind DEV flag

**Supabase Queries in Page Components:**
- Problem: Direct supabase calls in page components instead of hooks
- Files:
  - `src/pages/DataMaintenance.tsx` - 3 direct calls
  - `src/pages/platform/PlatformDeveloperTools.tsx` - 8 direct calls
  - `src/pages/Onboarding.tsx` - 4 direct calls
- Cause: Quick implementations without query hook extraction
- Improvement path: Extract to custom hooks with React Query for caching/deduplication

## Fragile Areas

**Dashboard Layout System:**
- Files: `src/features/dashboard-layout/` (entire directory)
- Why fragile: Complex state management across multiple hooks (useLayoutManager, useDraftLayout, useEntityLayoutStorage, useWidgetState), widget registry system, layout validation
- Safe modification: Run existing tests in `__tests__/`, add integration tests for layout save/load
- Test coverage: Has 3 test files, but no E2E tests for full flow

**TTN Integration:**
- Files:
  - `supabase/functions/ttn-provision-org/index.ts` - 2000+ lines
  - `supabase/functions/_shared/ttnConfig.ts`
  - `src/hooks/useTTNSetupWizard.ts`
  - `src/components/settings/TTNCredentialsPanel.tsx`
- Why fragile: Complex multi-step provisioning flow, encryption/decryption edge cases, external API dependencies
- Safe modification: Test in dev TTN environment first, verify key round-trip
- Test coverage: Has `ttnPermissions.test.ts` but limited coverage for provisioning flow

**Soft Delete Cascade Logic:**
- Files: `src/hooks/useSoftDelete.ts` (842 lines)
- Why fragile: Handles cascade deletion for multiple entity types with complex relationship queries
- Safe modification: Test each entity type deletion, verify cascade behavior
- Test coverage: No test file found

## Scaling Limits

**LocalStorage for Drafts:**
- Current capacity: ~5MB per origin (browser limit)
- Limit: Will fail silently when localStorage is full
- Files: `src/features/dashboard-layout/utils/draftManager.ts`
- Scaling path: Implement server-side draft storage, IndexedDB fallback

**Widget Registry Static Definition:**
- Current capacity: ~50 widget types defined
- Limit: All widgets loaded upfront, increasing bundle size
- Files: `src/features/dashboard-layout/registry/widgetRegistry.ts` (1017 lines)
- Scaling path: Lazy load widget components, code-split by feature

## Dependencies at Risk

**Generated Supabase Types:**
- Risk: 3775-line auto-generated types file needs regeneration on schema changes
- Files: `src/integrations/supabase/types.ts`
- Impact: Type mismatches if not regenerated after database migrations
- Migration plan: Add CI check to verify types match schema

## Missing Critical Features

**E2E Testing:**
- Problem: No end-to-end tests found
- Blocks: Confidence in deployment, regression prevention
- Current state: Only unit/integration tests in `__tests__/` directories

**Navigation Blocking:**
- Problem: useBlocker not working due to BrowserRouter (not Data Router)
- Files: `src/features/dashboard-layout/hooks/useUnsavedChangesGuard.ts`
- Blocks: Unsaved changes warning on in-app navigation

## Test Coverage Gaps

**Page Components:**
- What's not tested: All page components in `src/pages/`
- Files: Settings.tsx, UnitDetail.tsx, Dashboard.tsx, etc.
- Risk: UI regressions, state management bugs
- Priority: High - these are primary user interfaces

**Soft Delete Operations:**
- What's not tested: Entity deletion and cascade behavior
- Files: `src/hooks/useSoftDelete.ts`
- Risk: Data integrity issues, orphaned records
- Priority: High - data loss implications

**TTN Provisioning Flow:**
- What's not tested: Full provisioning workflow from wizard to TTN API
- Files: `supabase/functions/ttn-provision-org/`, `src/hooks/useTTNSetupWizard.ts`
- Risk: Device provisioning failures in production
- Priority: Medium - requires mock TTN server for testing

**Custom Hooks:**
- What's not tested: Most hooks in `src/hooks/` lack test files
- Files: useLoraSensors, useGateways, useAlertRules, useNotificationPolicies, etc.
- Risk: Query caching issues, state management bugs
- Priority: Medium - business logic lives here

---

*Concerns audit: 2026-01-23*
