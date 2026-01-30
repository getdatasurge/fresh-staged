# Codebase Concerns

**Analysis Date:** 2026-01-29

**Analysis Scope:**
- Files scanned: 742 source files
- TODO/FIXME found: 3,201 instances (excluding node_modules)
- Large files (>500 LOC): 30+ files
- TypeScript suppressions: 35 files with @ts-ignore/@ts-expect-error/any types
- Console statements: 231 instances across 87 files

## Tech Debt

### Supabase Edge Functions Still Present

**Issue:** 39 Supabase edge functions remain in codebase despite backend migration to tRPC completed in v2.0-v2.2

**Files:** `/home/swoop/swoop-claude-projects/fresh-staged/supabase/functions/` (54 TypeScript files)
- Key functions still deployed: `ttn-provision-org/index.ts` (2550 lines), `ttn-bootstrap/index.ts` (1411 lines), `manage-ttn-settings/index.ts` (1016 lines), `process-escalations/index.ts` (851 lines), `sensor-simulator/index.ts` (827 lines)
- Edge functions directory includes 39 deployed functions + `_shared` utilities

**Impact:**
- Infrastructure complexity - maintaining parallel Supabase Deno runtime alongside Fastify backend
- Deployment overhead - edge functions require separate deploy pipeline
- TTN provisioning still relies on edge function calls (intentionally kept per v2.2 decisions)
- SensorSimulatorPanel deliberately kept as admin testing tool

**Fix approach:**
- Phase 6 migration planned but not prioritized (per MILESTONES.md)
- Complete TTN SDK integration to eliminate remaining edge function dependencies
- Decommission Supabase Functions infrastructure after verification
- Archive edge function code for historical reference

### Incomplete Phase 6 Migration (Super Admin & RBAC)

**Issue:** Super Admin functionality disabled due to incomplete Stack Auth migration

**Files:**
- `src/contexts/SuperAdminContext.tsx:181-202` - "TODO Phase 6: Migrate RBAC RPC functions to work with Stack Auth"
- `src/hooks/useAuthAndOnboarding.ts:38` - "TODO: Phase 6 - Super Admin check needs to be migrated"
- `src/hooks/useUserRole.ts:179` - `organizationId: null, // TODO: Get from tRPC if available`

**Impact:**
- Super admin features non-functional (check always returns false)
- Platform admin pages accessible but with limited backend functionality
- RPC function `is_current_user_super_admin` uses Supabase `auth.uid()` which no longer works with Stack Auth sessions
- RBAC permission checks incomplete

**Fix approach:**
1. Migrate super admin check from Supabase RPC to tRPC procedure
2. Implement Stack Auth user ID mapping for RBAC queries
3. Update SuperAdminContext to use tRPC instead of Supabase client
4. Verify platform admin pages (`src/pages/platform/`) work end-to-end

### Account Deletion Temporarily Disabled

**Issue:** User account deletion feature unavailable post-migration

**Files:**
- `src/hooks/useAccountDeletion.ts:74-84` - "TODO: Migrate to new backend endpoint"
- Function shows error: "Account deletion requires backend migration after Supabase removal"

**Impact:**
- Users cannot self-delete accounts
- GDPR/data deletion compliance gap
- Workaround: Manual database cleanup by administrators

**Fix approach:**
1. Implement tRPC `users.deleteAccount` procedure
2. Coordinate with Stack Auth API for account deletion
3. Create cascading deletion logic for user's organization data
4. Add audit trail for account deletions
5. Re-enable frontend hook with new tRPC call

### Data Maintenance Features Stubbed Out

**Issue:** Admin data maintenance features show "migration in progress" toasts instead of functioning

**Files:** `src/pages/DataMaintenance.tsx:136-189`
- Line 136: "TODO: Add trpc.admin.findOrphanOrganizations endpoint"
- Line 153: "TODO: Add trpc.admin.listCleanupJobs endpoint"
- Line 164: "TODO: Add trpc.admin.softDeleteOrganization endpoint"
- Line 187: "TODO: Add trpc.admin.hardDeleteOrganization endpoint"

**Impact:**
- Cannot scan for orphaned organizations
- Cannot view cleanup job history
- Cannot perform soft/hard deletes via UI
- Admin maintenance requires direct database access

**Fix approach:**
1. Implement missing tRPC admin procedures
2. Add organization orphan detection query
3. Implement soft delete with `deleted_at` timestamp pattern
4. Add hard delete with transaction safety and foreign key cascades
5. Create cleanup jobs table for audit trail

### TTN Provisioning Temporarily Unavailable

**Issue:** TTN device/gateway provisioning disabled during Supabase removal

**Files:**
- `src/hooks/useTTNOperations.ts:55-63` - "TODO: Provisioning will be reintroduced via backend TTN services"
- Shows toast: "TTN provisioning is temporarily unavailable while Supabase is removed"

**Impact:**
- Cannot provision new IoT devices through UI
- New organization onboarding blocked for LoRaWAN customers
- Manual TTN configuration required as workaround
- Provisioning edge functions exist but frontend hooks disabled

**Fix approach:**
1. Complete backend TTN SDK integration (@ttn-lw/grpc-web-api-client)
2. Create BullMQ jobs for provisioning workflow
3. Implement tRPC procedures wrapping TTN SDK calls
4. Re-enable frontend hooks with new backend integration
5. Migrate existing edge function logic to backend services

### TypeScript Type Safety Gaps

**Issue:** 35 files use TypeScript suppressions indicating type safety compromises

**Files with @ts-ignore/@ts-expect-error/any types:**
- `src/hooks/useRealtimeAlerts.tsx` (3 instances)
- `src/hooks/useAlertRules.ts` (2 instances)
- `src/pages/ManualLog.tsx` (4 instances)
- `src/pages/DataMaintenance.tsx` (4 instances)
- `src/components/unit/UnitSettingsSection.tsx` (3 instances)
- Plus 30 more files with suppressions

**Impact:**
- Runtime type errors not caught at compile time
- IDE autocomplete less helpful
- Refactoring more risky (type errors masked)
- Reduced confidence in data flow correctness

**Fix approach:**
1. Audit each suppression for necessity
2. Define proper interfaces for data shapes
3. Use Zod schemas for runtime validation + type inference
4. Leverage tRPC's type safety for API boundaries
5. Remove suppressions incrementally with test coverage

## Known Bugs

### Temporarily Disabled Custom Timeline Comparison

**Issue:** Timeline comparison feature disabled in dashboard

**Files:** `src/features/dashboard-layout/components/TimelineControls.tsx:261` - `disabled // TODO: Implement custom comparison`

**Symptoms:** Compare button non-functional in dashboard timeline controls

**Trigger:** User attempts to compare different time periods in widget data

**Workaround:** Manual time range adjustment without comparison view

### Unsafe Key Obfuscation

**Issue:** TTN API key encryption intentionally disabled due to XOR corruption bugs

**Files:** `supabase/functions/_shared/ttnConfig.ts:304-315`
- Comment: "TODO: Re-enable proper encryption after flow is stable"
- Currently uses plain base64 with `b64:` prefix instead of XOR encryption

**Symptoms:** API keys stored with weak obfuscation (base64 only)

**Trigger:** All TTN API key storage/retrieval operations

**Workaround:** Temporarily using base64 encoding until encryption bug resolved

**Risk:** API keys less secure in database (base64 is easily reversible)

## Security Considerations

### XSS Prevention Basic Only

**Issue:** Limited XSS sanitization with basic string sanitization

**Files:** `src/lib/validation.ts:118` - `// Sanitize string for safe display (basic XSS prevention)`

**Risk:** User input not comprehensively sanitized before display

**Current mitigation:** React's default JSX escaping + basic validation function

**Recommendations:**
- Use DOMPurify for HTML content sanitization
- Validate and sanitize all user inputs at API boundary
- Content Security Policy headers in production deployment
- Regular security audits of user-generated content display paths

### LocalStorage Usage for Sensitive Data

**Issue:** 73 localStorage/sessionStorage accesses across 12 files

**Files:**
- `src/contexts/SuperAdminContext.tsx` (18 instances)
- `src/features/dashboard-layout/utils/draftManager.ts` (15 instances)
- `src/features/dashboard-layout/hooks/useLayoutManager.ts` (10 instances)
- `src/contexts/DebugContext.tsx` (4 instances)
- `src/lib/debugLogger.ts` (9 instances)

**Risk:**
- localStorage accessible to XSS attacks
- No encryption for stored data
- Persists across sessions

**Current mitigation:**
- No authentication tokens stored in localStorage (Stack Auth handles securely)
- Mostly UI state (dashboard layouts, debug settings, sidebar expansion)

**Recommendations:**
- Audit all localStorage keys for sensitivity
- Move authentication state to httpOnly cookies
- Encrypt sensitive preferences if needed
- Regular localStorage cleanup on logout

### Console Logging in Production

**Issue:** 231 console.log/warn/error statements across 87 files

**Files:** Widespread across `src/providers/`, `src/hooks/`, `src/pages/`, `src/lib/`, `src/components/`, `src/features/`

**Risk:**
- Sensitive data leakage to browser console
- Performance overhead in production
- Information disclosure to attackers

**Current mitigation:** Debug mode toggles some logging

**Recommendations:**
1. Replace direct console calls with structured logging library
2. Implement log level filtering (DEBUG/INFO/WARN/ERROR)
3. Strip console statements in production builds (Vite plugin)
4. Add PII detection to prevent sensitive data logging
5. Use performance markers instead of console.time

## Performance Bottlenecks

### Large Component Files

**Issue:** 30+ files exceed 500 lines, indicating high complexity

**Large files (>500 LOC):**
- `supabase/functions/ttn-provision-org/index.ts` (2550 lines) - Complex provisioning state machine
- `src/pages/Settings.tsx` (1422 lines) - Monolithic settings page with 12+ tabs
- `supabase/functions/ttn-bootstrap/index.ts` (1411 lines) - Bootstrap orchestration
- `backend/tests/trpc/e2e.test.ts` (1324 lines) - E2E test suite
- `src/components/settings/SensorManager.tsx` (1189 lines) - Complex sensor CRUD with TTN integration
- `src/pages/Onboarding.tsx` (1153 lines) - Multi-step wizard
- `src/features/dashboard-layout/registry/widgetRegistry.ts` (1017 lines) - Widget definitions
- `src/pages/UnitDetail.tsx` (901 lines) - Detailed unit view with nested components

**Problem:**
- Hard to reason about and maintain
- Difficult to test in isolation
- Long load times (especially Settings.tsx)
- Merge conflicts more likely

**Improvement path:**
1. Extract Settings.tsx tabs into separate route components
2. Split SensorManager into sub-components (list, form, diagnostics)
3. Modularize ttn-provision-org into separate step handlers
4. Break down Onboarding into smaller wizard step components
5. Use code splitting for large admin/settings pages

### No Database Query Optimization Patterns

**Issue:** No evidence of query optimization strategies in frontend data hooks

**Problem:**
- Potential N+1 query patterns when fetching nested relations
- No pagination visible in large list queries
- Missing query result memoization in complex computations

**Current state:**
- TanStack Query handles caching
- tRPC provides type-safe queries
- No explicit query performance monitoring

**Improvement path:**
1. Add pagination to large datasets (sensors, readings, alerts)
2. Implement infinite scroll for long lists
3. Use tRPC batch requests for related data fetching
4. Add database query performance logging in backend
5. Profile slow API endpoints with Fastify hooks

### IndexedDB Complexity for Offline Storage

**Issue:** Custom IndexedDB implementation for offline manual logs

**Files:** `src/lib/offlineStorage.ts` (140+ lines of IndexedDB transaction code)

**Problem:**
- Manual transaction management error-prone
- No TypeScript safety for stored objects
- Promise-based API difficult to debug

**Current state:**
- Works for manual temperature log offline storage
- Used by `src/hooks/useOfflineSync.ts`
- No reported bugs but maintenance burden

**Improvement path:**
1. Consider migrating to Dexie.js (TypeScript-friendly IndexedDB wrapper)
2. Add comprehensive error handling tests
3. Implement automatic retry for failed sync operations
4. Add storage quota monitoring
5. Provide user feedback on offline storage limits

## Fragile Areas

### Dashboard Layout System

**Files:**
- `src/features/dashboard-layout/hooks/useLayoutManager.ts` (764 lines)
- `src/features/dashboard-layout/hooks/useWidgetState.ts` (764 lines)
- `src/features/dashboard-layout/utils/draftManager.ts` (Contains complex localStorage interaction)

**Why fragile:**
- Complex state management with drafts, published layouts, and default layouts
- Multi-layered persistence (sessionStorage + database)
- Widget validation across different data sources
- No comprehensive test coverage for layout persistence edge cases

**Safe modification:**
1. Always test layout creation, save, discard, and publish flows
2. Verify draft recovery after page refresh
3. Test with multiple users editing same entity layouts
4. Check layout migration when widget registry changes

**Test coverage:** No unit tests found for layout managers

### TTN Integration Layer

**Files:**
- `supabase/functions/_shared/ttnConfig.ts` (776 lines) - API key management, slug generation
- `supabase/functions/_shared/ttnPermissions.ts` - Rights validation
- `backend/src/services/ttn.service.ts` (691 lines) - Backend TTN service
- `backend/src/services/ttn-device.service.ts` (798 lines) - Device lifecycle
- `src/components/settings/TTNCredentialsPanel.tsx` (952 lines) - Complex UI
- `src/hooks/useTTNSetupWizard.ts` - Multi-step provisioning

**Why fragile:**
- External API dependency (The Things Network)
- Complex multi-step provisioning workflow (7 steps with rollback)
- Hybrid key model (main user API key + org API key)
- Cryptographic key obfuscation (currently weakened)
- Region locking to NAM1 only
- Webhook secret management

**Safe modification:**
1. Never modify provisioning steps without E2E testing
2. Always verify webhook delivery after changes
3. Test with real TTN organization (sandbox mode insufficient)
4. Preserve idempotency of provisioning operations
5. Maintain audit trail in ttn_provisioning_logs

**Test coverage:** `backend/tests/trpc/ttn-settings.router.test.ts` (807 lines), `backend/tests/api/ttn-devices.test.ts` (889 lines)

### Real-Time WebSocket Provider

**Files:**
- `src/providers/RealtimeProvider.tsx` - Socket.io client connection
- Backend: Socket.io server with Redis adapter

**Why fragile:**
- Persistent WebSocket connection management
- JWT authentication on socket handshake
- Organization room subscription logic
- Reconnection handling
- Memory leaks possible if cleanup not done correctly

**Safe modification:**
1. Test connection lifecycle (connect → join rooms → disconnect)
2. Verify authentication token refresh
3. Check memory usage during long sessions
4. Test reconnection after network interruption
5. Validate multi-tab behavior (multiple connections)

**Test coverage:** E2E validation in v2.0 but no isolated unit tests

### Soft Delete Pattern Implementation

**Files:**
- `src/hooks/useSoftDelete.ts` - Frontend soft delete logic
- Multiple database tables with `deleted_at` columns
- Foreign key cascades configured

**Why fragile:**
- Queries must filter `deleted_at IS NULL` consistently
- Restore operations complex (cascading undelete)
- Audit trail integrity depends on careful timestamp management
- Hard delete requires understanding all foreign key relationships

**Safe modification:**
1. Use useSoftDelete hook consistently (don't bypass)
2. Always test restore functionality after delete changes
3. Verify cascade behavior with test data
4. Check that list queries filter deleted records
5. Ensure admin "Recently Deleted" page works

**Test coverage:** No dedicated soft delete tests found

## Scaling Limits

### Manual Temperature Logs Table

**Current capacity:** No pagination in manual log entry form

**Limit:** Browser memory exhaustion with 1000+ pending offline logs

**Impact:** Mobile users entering many offline logs could experience slowdowns

**Scaling path:**
1. Add pagination to offline log list
2. Implement automatic sync batching (10 logs per batch)
3. Add progress indicator for large sync operations
4. Set maximum offline log storage limit (100-500 logs)
5. Warn user when approaching storage quota

### Dashboard Widget Rendering

**Current capacity:** React-Grid-Layout handles ~50 widgets before performance degradation

**Limit:** Complex widgets with live data updates cause re-render thrashing

**Impact:** Large custom dashboards (20+ widgets) may feel sluggish

**Scaling path:**
1. Implement widget virtualization (render only visible widgets)
2. Debounce widget data refresh (current: per-widget refresh)
3. Add "performance mode" that reduces update frequency
4. Limit maximum widgets per dashboard (e.g., 30)
5. Use React.memo more aggressively on widget components

### Sensor Readings Ingestion

**Current capacity:** Bulk ingestion endpoint handles 1000 readings per request

**Limit:** PostgreSQL write performance with 100,000+ readings/day

**Scaling path:**
1. Implement reading data aggregation (hourly rollups)
2. Archive old readings to separate cold storage table
3. Add database partitioning by time range
4. Use TimescaleDB for time-series optimization
5. Implement backpressure on ingestion endpoint

## Dependencies at Risk

### React Router v6 BrowserRouter Limitation

**Package:** `react-router-dom@^6.30.1`

**Risk:** useBlocker API disabled because App.tsx uses legacy BrowserRouter instead of createBrowserRouter

**Impact:**
- Unsaved changes guard not working in dashboard layout editor
- "TODO: Migrate App.tsx to createBrowserRouter to re-enable useBlocker" in `src/features/dashboard-layout/hooks/useUnsavedChangesGuard.ts:45`

**Migration plan:**
1. Refactor App.tsx to use createBrowserRouter
2. Update all route definitions to data router format
3. Re-enable useBlocker in unsaved changes guard
4. Test navigation blocking with unsaved draft layouts

### Deprecated Hooks Pattern

**Files containing deprecation warnings:**
- `src/hooks/useOrganization.ts:19` - "Or use the deprecated organizationsApi wrapper"
- `src/hooks/useOrgScope.ts:81` - "@deprecated Prefer useOrgScope() for new code"
- `src/hooks/useSetPrimarySensor.ts:2` - "TODO: Full migration to new backend"

**Risk:** Gradual migration pattern leaves mix of old/new patterns

**Migration plan:**
1. Grep for deprecated hook usage across codebase
2. Create migration script to update import statements
3. Add ESLint rule to prevent deprecated hook usage
4. Remove deprecated exports after full migration
5. Update documentation to show correct patterns

## Missing Critical Features

### Test Suite Incomplete

**Gap:** Frontend unit tests severely lacking

**Problem:**
- Only 10 frontend test files found (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx)
- Backend has 216 test files (good coverage)
- Critical UI flows untested (onboarding, TTN setup, billing)
- Dashboard layout system has no unit tests

**Blocks:**
- Confident refactoring of large components
- Safe dependency upgrades
- Performance optimizations
- Behavioral regression detection

**Priority:** High - risk of shipping bugs in complex UI flows

### Unsaved Changes Guard Non-Functional

**Gap:** Dashboard layout editor lacks working unsaved changes warning

**Files:** `src/features/dashboard-layout/hooks/useUnsavedChangesGuard.ts:45` - "TODO: Migrate App.tsx to createBrowserRouter to re-enable useBlocker"

**Blocks:**
- Accidental loss of unsaved draft layouts
- User frustration when work is lost
- Expected browser behavior (navigation blocking)

**Priority:** Medium - workaround exists (manual save reminders)

### API Documentation Missing

**Gap:** No OpenAPI/Swagger documentation for backend API

**Problem:**
- tRPC provides type safety but no human-readable API docs
- External integrations difficult (webhooks, partner APIs)
- No API versioning strategy documented
- Postman/Insomnia collections missing

**Blocks:**
- Third-party integrations
- Mobile app development
- API client generation for other languages

**Priority:** Low - internal TypeScript clients work well

## Test Coverage Gaps

### Dashboard Layout Persistence

**Untested area:** Draft layout recovery after browser crash

**What's not tested:**
- `src/features/dashboard-layout/utils/draftManager.ts` - localStorage draft management
- `src/features/dashboard-layout/hooks/useDraftLayout.ts` - draft lifecycle
- `src/features/dashboard-layout/hooks/useLayoutManager.ts` - layout state machine

**Risk:**
- Users lose work if localStorage corrupted
- Draft conflicts if multiple tabs open
- Layout migration failures undetected

**Priority:** High - core UX feature with complex state

### TTN Provisioning Workflow

**Untested area:** Complete provisioning flow with real TTN API

**Files:** Entire `supabase/functions/ttn-provision-org/index.ts` (2550 lines) lacks E2E test with actual TTN

**What's not tested:**
- Rollback behavior on mid-flow failures
- Webhook delivery verification
- API key rights validation edge cases
- Collision-safe slug generation under load

**Risk:**
- New organizations fail to provision
- Partial provisioning leaves system in bad state
- Webhook failures undetected until production

**Priority:** High - business critical flow

### Real-Time Data Streaming

**Untested area:** WebSocket connection lifecycle and room management

**Files:**
- `src/providers/RealtimeProvider.tsx` - client connection
- Backend Socket.io server - room subscriptions

**What's not tested:**
- Reconnection after network failure
- Authentication token expiration handling
- Memory leaks from unclosed subscriptions
- Multi-tab behavior (multiple connections per user)
- Message delivery guarantees

**Risk:**
- Memory leaks in long-running sessions
- Missed real-time updates after reconnect
- Authentication failures not handled gracefully

**Priority:** Medium - E2E validation done but no unit tests

### Soft Delete & Cascade Behavior

**Untested area:** Soft delete cascades and restore operations

**Files:** `src/hooks/useSoftDelete.ts` + database foreign key cascades

**What's not tested:**
- Cascading soft delete (org → sites → areas → units)
- Restore operation correctness
- Query filtering consistency (deleted_at IS NULL)
- Hard delete after soft delete period

**Risk:**
- Data not properly hidden after soft delete
- Restore operations incomplete
- Foreign key violations on hard delete

**Priority:** Medium - correctness critical for data integrity

### Billing & Metering

**Untested area:** Stripe usage reporting and subscription enforcement

**What's not tested:**
- Sensor count metering accuracy
- Reading volume aggregation
- Subscription status enforcement middleware
- Webhook idempotency under retries

**Risk:**
- Under/over-billing customers
- Subscription limits not enforced
- Duplicate webhook processing

**Priority:** High - financial impact

---

*Concerns audit: 2026-01-29*
