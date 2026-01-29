# Requirements: FreshTrack Pro v2.4

**Defined:** 2026-01-29
**Core Value:** Food safety data must flow reliably from sensors to alerts without interruption.

## v2.4 Requirements — Tech Debt Cleanup

Complete Supabase removal and test infrastructure fixes. 35 files migrated, 60 tests fixed.

### Test Infrastructure

- [ ] **TEST-01**: All 38 frontend tests pass with proper tRPC mocking
- [ ] **TEST-02**: All 22 backend queue.service tests pass with proper Redis/BullMQ mocking
- [ ] **TEST-03**: Test infrastructure supports tRPC queryOptions pattern mocking

### Dashboard Widget Migration

- [ ] **WIDGET-01**: UnitComparisonWidget uses tRPC instead of supabase
- [ ] **WIDGET-02**: AnnotationsWidget uses tRPC instead of supabase
- [ ] **WIDGET-03**: SiteActivityGraphWidget uses tRPC instead of supabase
- [ ] **WIDGET-04**: SensorSignalTrendWidget uses tRPC instead of supabase
- [ ] **WIDGET-05**: UnitComplianceScoreWidget uses tRPC instead of supabase
- [ ] **WIDGET-06**: UnitsStatusGridWidget uses tRPC instead of supabase
- [ ] **WIDGET-07**: EventTimelineWidget uses tRPC instead of supabase
- [ ] **WIDGET-08**: DowntimeTrackerWidget uses tRPC instead of supabase
- [ ] **WIDGET-09**: ManualLogStatusWidget uses tRPC instead of supabase

### Settings Components Migration

- [ ] **SETTINGS-01**: EmulatorSyncHistory uses tRPC instead of supabase
- [ ] **SETTINGS-02**: NotificationSettingsCard uses tRPC instead of supabase
- [ ] **SETTINGS-03**: WebhookStatusCard uses tRPC instead of supabase
- [ ] **SETTINGS-04**: AlertRulesScopedEditor uses tRPC instead of supabase
- [ ] **SETTINGS-05**: EmulatorResyncCard uses tRPC instead of supabase
- [ ] **SETTINGS-06**: SmsAlertHistory uses tRPC instead of supabase
- [ ] **SETTINGS-07**: TTNProvisioningLogs uses tRPC instead of supabase

### Pages Migration

- [ ] **PAGE-01**: Inspector page uses tRPC instead of supabase
- [ ] **PAGE-02**: OrganizationDashboard uses tRPC instead of supabase
- [ ] **PAGE-03**: ManualLog page uses tRPC instead of supabase
- [ ] **PAGE-04**: Reports page uses tRPC instead of supabase
- [ ] **PAGE-05**: Onboarding page uses tRPC instead of supabase
- [ ] **PAGE-06**: TTNCleanup page uses tRPC instead of supabase
- [ ] **PAGE-07**: HealthDashboard uses tRPC instead of supabase

### Admin/Debug Components Migration

- [ ] **ADMIN-01**: SensorSimulatorPanel uses tRPC instead of supabase
- [ ] **ADMIN-02**: RBACDebugPanel uses tRPC instead of supabase
- [ ] **ADMIN-03**: UnitDebugBanner uses tRPC instead of supabase
- [ ] **ADMIN-04**: GlobalUserSearch uses tRPC instead of supabase

### Other Components Migration

- [ ] **COMP-01**: LogTempModal uses tRPC instead of supabase
- [ ] **COMP-02**: NotificationDropdown uses tRPC instead of supabase
- [ ] **COMP-03**: UnitSettingsSection uses tRPC instead of supabase
- [ ] **COMP-04**: InvoiceHistory uses tRPC instead of supabase

### Cleanup

- [ ] **CLEAN-01**: supabase-placeholder.ts deleted (all imports removed)
- [ ] **CLEAN-02**: Error handling utilities updated for tRPC error patterns
- [ ] **CLEAN-03**: All tests pass (frontend: 145+, backend: 1050+)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New features | Tech debt cleanup only, no new functionality |
| UI redesign | Migration preserves existing UI behavior |
| Performance optimization | Focus on correctness, not optimization |
| Additional test coverage | Fix existing tests only, new coverage in future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 38 | Pending |
| TEST-02 | Phase 38 | Pending |
| TEST-03 | Phase 38 | Pending |
| WIDGET-01 | Phase 39 | Pending |
| WIDGET-02 | Phase 39 | Pending |
| WIDGET-03 | Phase 39 | Pending |
| WIDGET-04 | Phase 39 | Pending |
| WIDGET-05 | Phase 39 | Pending |
| WIDGET-06 | Phase 39 | Pending |
| WIDGET-07 | Phase 39 | Pending |
| WIDGET-08 | Phase 39 | Pending |
| WIDGET-09 | Phase 39 | Pending |
| SETTINGS-01 | Phase 40 | Pending |
| SETTINGS-02 | Phase 40 | Pending |
| SETTINGS-03 | Phase 40 | Pending |
| SETTINGS-04 | Phase 40 | Pending |
| SETTINGS-05 | Phase 40 | Pending |
| SETTINGS-06 | Phase 40 | Pending |
| SETTINGS-07 | Phase 40 | Pending |
| PAGE-01 | Phase 41 | Pending |
| PAGE-02 | Phase 41 | Pending |
| PAGE-03 | Phase 41 | Pending |
| PAGE-04 | Phase 41 | Pending |
| PAGE-05 | Phase 41 | Pending |
| PAGE-06 | Phase 41 | Pending |
| PAGE-07 | Phase 41 | Pending |
| ADMIN-01 | Phase 42 | Pending |
| ADMIN-02 | Phase 42 | Pending |
| ADMIN-03 | Phase 42 | Pending |
| ADMIN-04 | Phase 42 | Pending |
| COMP-01 | Phase 42 | Pending |
| COMP-02 | Phase 42 | Pending |
| COMP-03 | Phase 42 | Pending |
| COMP-04 | Phase 42 | Pending |
| CLEAN-01 | Phase 43 | Pending |
| CLEAN-02 | Phase 43 | Pending |
| CLEAN-03 | Phase 43 | Pending |

**Coverage:**
- v2.4 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-29*
*Last updated: 2026-01-29 after initial definition*
