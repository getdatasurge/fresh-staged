# Roadmap: FreshTrack Pro v2.6

## Overview

Deploy FreshTrack Pro to a self-hosted VM with full production configuration. Fresh start deployment (no data migration needed).

## Milestones

- ✅ **v1.0 MVP** - Phases 1-7 (shipped 2026-01-23)
- ✅ **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24)
- ✅ **v2.0 Real-Time & Billing** - Phases 14-21 (shipped 2026-01-25)
- ✅ **v2.1 Streamlined Deployment** - Phases 22-26 (shipped 2026-01-25)
- ✅ **v2.2 Technical Debt & Stabilization** - Phases 27-33 (shipped 2026-01-29)
- ✅ **v2.3 Deployment Orchestration** - Phases 34-37 (shipped 2026-01-29)
- ✅ **v2.4 Tech Debt Cleanup** - Phases 38-43 (shipped 2026-01-29)
- ✅ **v2.5 TTN Test Fixes** - Phase 44 (shipped 2026-01-29)
- 🚧 **v2.6 Production Deployment** - Phase 45 (in progress)

## Phases

### v2.4 Tech Debt Cleanup (Complete)
- [x] **Phase 38: Test Infrastructure** - Fix tRPC and BullMQ test mocking
- [x] **Phase 39: Dashboard Widget Migration** - Migrate 9 widgets to tRPC
- [x] **Phase 40: Settings Components Migration** - Migrate 7 settings components to tRPC
- [x] **Phase 41: Pages Migration** - Migrate 7 pages to tRPC
- [x] **Phase 42: Admin/Debug + Other Components** - Migrate 8 remaining components to tRPC
- [x] **Phase 43: Cleanup & Verification** - Delete supabase-placeholder, verify all tests pass

### v2.5 TTN Test Fixes (Complete)
- [x] **Phase 44: TTN Bootstrap Fix** - Fix bootstrap endpoint error handling and all 15 failing tests

## Phase Details

### v2.4 Tech Debt Cleanup (In Progress)

**Milestone Goal:** Complete Supabase removal and fix all 60 failing tests

---

### Phase 38: Test Infrastructure
**Goal**: Establish working test infrastructure with proper tRPC and BullMQ mocking patterns
**Depends on**: Nothing (foundation for all migrations)
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. All 38 frontend tests pass without `trpc.X.Y.queryOptions is not a function` errors
  2. All 22 backend queue.service tests pass with properly mocked BullMQ/Redis
  3. tRPC test utilities support both `queryOptions()` and direct procedure calls
  4. Mock patterns are documented for use in subsequent migration phases
**Plans**: 3 plans

Plans:
- [x] 38-01-PLAN.md — Frontend tRPC queryOptions mock utility and useSites.test.tsx fix
- [x] 38-02-PLAN.md — Backend BullMQ mock and queue.service.test.ts fix
- [x] 38-03-PLAN.md — Fix remaining frontend tests (useAlerts, TTNCredentialsPanel)

---

### Phase 39: Dashboard Widget Migration
**Goal**: All 9 dashboard widgets fetch data through tRPC instead of supabase
**Depends on**: Phase 38 (need working test patterns)
**Requirements**: WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-04, WIDGET-05, WIDGET-06, WIDGET-07, WIDGET-08, WIDGET-09
**Success Criteria** (what must be TRUE):
  1. All 9 dashboard widgets render with data from tRPC endpoints
  2. No widget imports from supabase-placeholder.ts
  3. Widget tests pass using established tRPC mock patterns
  4. Dashboard page loads without errors showing all widgets
**Plans**: 3 plans

Plans:
- [x] 39-01-PLAN.md — Simple widgets: ManualLogStatusWidget, UnitsStatusGridWidget, SensorSignalTrendWidget
- [x] 39-02-PLAN.md — Medium widgets: UnitComparisonWidget, UnitComplianceScoreWidget, SiteActivityGraphWidget, DowntimeTrackerWidget
- [x] 39-03-PLAN.md — Complex widgets: AnnotationsWidget, EventTimelineWidget (with new backend procedures)

---

### Phase 40: Settings Components Migration
**Goal**: All 7 settings components fetch data through tRPC instead of supabase
**Depends on**: Phase 38 (need working test patterns)
**Requirements**: SETTINGS-01, SETTINGS-02, SETTINGS-03, SETTINGS-04, SETTINGS-05, SETTINGS-06, SETTINGS-07
**Success Criteria** (what must be TRUE):
  1. All 7 settings components render with data from tRPC endpoints
  2. No settings component imports from supabase-placeholder.ts
  3. Settings component tests pass using established tRPC mock patterns
**Plans**: 3 plans

Plans:
- [x] 40-01-PLAN.md — Read-only lists: SmsAlertHistory, TTNProvisioningLogs, EmulatorSyncHistory
- [x] 40-02-PLAN.md — Medium complexity: WebhookStatusCard, AlertRulesScopedEditor
- [x] 40-03-PLAN.md — CRUD operations: NotificationSettingsCard, EmulatorResyncCard

---

### Phase 41: Pages Migration
**Goal**: All 7 pages fetch data through tRPC instead of supabase
**Depends on**: Phase 38 (need working test patterns)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06, PAGE-07
**Success Criteria** (what must be TRUE):
  1. All 7 pages render with data from tRPC endpoints
  2. No page imports from supabase-placeholder.ts
  3. Page tests pass using established tRPC mock patterns
  4. Navigation between migrated pages works without errors
**Plans**: 3 plans

Plans:
- [x] 41-01-PLAN.md — Simple pages: HealthDashboard, TTNCleanup, Reports
- [x] 41-02-PLAN.md — Medium pages: ManualLog, OrganizationDashboard
- [x] 41-03-PLAN.md — Complex pages: Inspector, Onboarding (with new backend routers)

---

### Phase 42: Admin/Debug + Other Components Migration
**Goal**: All remaining components (admin/debug + general) fetch data through tRPC
**Depends on**: Phase 38 (need working test patterns)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, COMP-01, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. All admin/debug components (SuperAdminContext, SensorSimulatorPanel, RBACDebugPanel, UnitDebugBanner) use tRPC or hooks
  2. All general components (NotificationDropdown, LogTempModal, GlobalUserSearch, UnitSettingsSection, InvoiceHistory) use tRPC
  3. Error handling utilities (MigrationErrorBoundary, MigrationErrorFallback, errorHandler.ts) cleaned up
  4. No component imports from supabase-placeholder.ts
**Plans**: 3 plans

Plans:
- [x] 42-01-PLAN.md — Admin/debug: SuperAdminContext, SensorSimulatorPanel, RBACDebugPanel, UnitDebugBanner
- [x] 42-02-PLAN.md — General components: NotificationDropdown, LogTempModal, GlobalUserSearch
- [x] 42-03-PLAN.md — Remaining: UnitSettingsSection, InvoiceHistory, error handling utilities cleanup

---

### Phase 43: Cleanup & Verification
**Goal**: Remove supabase-placeholder.ts and verify complete migration
**Depends on**: Phases 39, 40, 41, 42 (all migrations complete)
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03
**Success Criteria** (what must be TRUE):
  1. supabase-placeholder.ts is deleted from the codebase
  2. Zero imports of supabase-placeholder exist in any file
  3. All frontend tests pass (145+ tests)
  4. All backend tests pass (1050+ tests)
**Plans**: 1 plan

Plans:
- [x] 43-01-PLAN.md — Delete supabase-placeholder.ts, remove test mocks, verify all tests pass

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 38. Test Infrastructure | v2.4 | 3/3 | Complete | 2026-01-29 |
| 39. Dashboard Widget Migration | v2.4 | 3/3 | Complete | 2026-01-29 |
| 40. Settings Components Migration | v2.4 | 3/3 | Complete | 2026-01-29 |
| 41. Pages Migration | v2.4 | 3/3 | Complete | 2026-01-29 |
| 42. Admin/Debug + Other Components | v2.4 | 3/3 | Complete | 2026-01-29 |
| 43. Cleanup & Verification | v2.4 | 1/1 | Complete | 2026-01-29 |

**v2.4 Total:** 16/16 plans complete (100%)

---

## Dependency Graph

```
Phase 38 (Test Infrastructure)
    |
    +---> Phase 39 (Widgets)
    |
    +---> Phase 40 (Settings)
    |
    +---> Phase 41 (Pages)
    |
    +---> Phase 42 (Admin + Other)
              |
              v
        Phase 43 (Cleanup)
           [requires 39-42 all complete]
```

Note: Phases 39-42 can execute in parallel after Phase 38 completes. Phase 43 must be last.

---

### v2.5 TTN Test Fixes (Current)

**Milestone Goal:** Fix 15 pre-existing test failures in TTN bootstrap endpoint

---

### Phase 44: TTN Bootstrap Fix
**Goal**: Fix TTN device bootstrap endpoint to return correct HTTP status codes and pass all tests
**Depends on**: Nothing (isolated fix)
**Requirements**: TTN-01, TTN-02, TTN-03
**Success Criteria** (what must be TRUE):
  1. Bootstrap endpoint returns 400 for invalid requests (not 500)
  2. Bootstrap endpoint returns 401 for unauthenticated requests (not 500)
  3. Bootstrap endpoint returns 403 for unauthorized requests (not 500)
  4. Bootstrap endpoint returns 201 for successful device creation
  5. All 45 tests in ttn-devices.test.ts pass (currently 30/45)
**Plans**: 1 plan

Plans:
- [x] 44-01-PLAN.md — Mock subscription middleware in TTN device tests

---

## v2.5 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 44. TTN Bootstrap Fix | v2.5 | 1/1 | Complete | 2026-01-29 |

---

### v2.6 Production Deployment (Current)

**Milestone Goal:** Deploy FreshTrack Pro to a self-hosted Ubuntu VM

---

### Phase 45: Self-Hosted VM Deployment
**Goal**: Deploy FreshTrack Pro to production on a self-hosted Ubuntu VM
**Depends on**: v2.5 complete (all tests passing)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. VM provisioned with Ubuntu 22.04/24.04 LTS, 4+ vCPU, 8+ GB RAM
  2. Domain configured with DNS pointing to VM IP
  3. SSL certificate obtained and auto-renewing via Let's Encrypt
  4. All services running (backend, worker, frontend, PostgreSQL, Redis, MinIO)
  5. External services configured (Stack Auth, Stripe webhooks, TTN webhooks)
  6. Health checks passing, monitoring dashboard accessible
  7. First user can sign up, create organization, and see dashboard
**Plans**: 3 plans

Plans:
- [ ] 45-01-PLAN.md — Prerequisites checklist and validation (VM info, credentials)
- [ ] 45-02-PLAN.md — Execute deployment to VM (run deploy-orchestrated.sh)
- [ ] 45-03-PLAN.md — Post-deployment validation and smoke testing

---

## v2.6 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 45. Self-Hosted VM Deployment | v2.6 | 0/3 | Not Started | - |

---
*Roadmap created: 2026-01-29*
*Last updated: 2026-01-29*
