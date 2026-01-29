# Roadmap: FreshTrack Pro v2.4

## Overview

Complete the Supabase-to-tRPC migration by fixing 60 failing tests and migrating 35 frontend files. The test infrastructure must be fixed first to establish proper tRPC mocking patterns, then systematic migration of widgets, settings, pages, and components, concluding with cleanup of deprecated code.

## Milestones

- ✅ **v1.0 MVP** - Phases 1-7 (shipped 2026-01-23)
- ✅ **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24)
- ✅ **v2.0 Real-Time & Billing** - Phases 14-21 (shipped 2026-01-25)
- ✅ **v2.1 Streamlined Deployment** - Phases 22-26 (shipped 2026-01-25)
- ✅ **v2.2 Technical Debt & Stabilization** - Phases 27-33 (shipped 2026-01-29)
- ✅ **v2.3 Deployment Orchestration** - Phases 34-37 (shipped 2026-01-29)
- 🚧 **v2.4 Tech Debt Cleanup** - Phases 38-43 (in progress)

## Phases

- [x] **Phase 38: Test Infrastructure** - Fix tRPC and BullMQ test mocking
- [x] **Phase 39: Dashboard Widget Migration** - Migrate 9 widgets to tRPC
- [ ] **Phase 40: Settings Components Migration** - Migrate 7 settings components to tRPC
- [ ] **Phase 41: Pages Migration** - Migrate 7 pages to tRPC
- [ ] **Phase 42: Admin/Debug + Other Components** - Migrate 8 remaining components to tRPC
- [ ] **Phase 43: Cleanup & Verification** - Delete supabase-placeholder, verify all tests pass

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
- [ ] 40-01-PLAN.md — Read-only lists: SmsAlertHistory, TTNProvisioningLogs, EmulatorSyncHistory
- [ ] 40-02-PLAN.md — Medium complexity: WebhookStatusCard, AlertRulesScopedEditor
- [ ] 40-03-PLAN.md — CRUD operations: NotificationSettingsCard, EmulatorResyncCard

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
**Plans**: TBD

Plans:
- [ ] 41-01: TBD (pages batch 1)
- [ ] 41-02: TBD (pages batch 2)

---

### Phase 42: Admin/Debug + Other Components Migration
**Goal**: All 8 remaining components (4 admin/debug + 4 other) fetch data through tRPC
**Depends on**: Phase 38 (need working test patterns)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, COMP-01, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. All 4 admin/debug components render with data from tRPC endpoints
  2. All 4 other components render with data from tRPC endpoints
  3. No component imports from supabase-placeholder.ts
  4. Component tests pass using established tRPC mock patterns
**Plans**: TBD

Plans:
- [ ] 42-01: TBD (admin/debug components)
- [ ] 42-02: TBD (other components)

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
**Plans**: TBD

Plans:
- [ ] 43-01: TBD (cleanup and final verification)

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 38. Test Infrastructure | v2.4 | 3/3 | Complete | 2026-01-29 |
| 39. Dashboard Widget Migration | v2.4 | 3/3 | Complete | 2026-01-29 |
| 40. Settings Components Migration | v2.4 | 0/3 | Not started | - |
| 41. Pages Migration | v2.4 | 0/2 | Not started | - |
| 42. Admin/Debug + Other Components | v2.4 | 0/2 | Not started | - |
| 43. Cleanup & Verification | v2.4 | 0/1 | Not started | - |

**v2.4 Total:** 6/14 plans complete (43%)

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
*Roadmap created: 2026-01-29*
*Last updated: 2026-01-29*
