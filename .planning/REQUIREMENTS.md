# Requirements: FreshTrack Pro v2.9

**Defined:** 2026-01-30
**Core Value:** Food safety data must flow reliably from sensors to alerts without interruption.

## v2.9 Requirements — Quality Assurance

Fix known skipped tests and restore test coverage across backend and frontend. Focus on un-skipping existing test stubs and expanding TTNCredentialsPanel coverage.

### Backend TTN Webhook Tests

- [ ] **TTN-01**: All 16 skipped tests in `ttn-webhooks.test.ts` are implemented and passing
- [ ] **TTN-02**: TTN webhook ingestion path (reading creation, alert triggers, device metadata) covered

### Backend Alert API Tests

- [ ] **ALERT-01**: All 11 skipped tests in `alerts.test.ts` are implemented and passing
- [ ] **ALERT-02**: Alert lifecycle (get, acknowledge, resolve) fully tested through API layer

### Backend Readings API Tests

- [ ] **READ-01**: All 8 skipped tests in `readings.test.ts` are implemented and passing
- [ ] **READ-02**: Reading ingestion, pagination, and time-based filtering tested

### Backend Sites Router Tests

- [ ] **SITE-01**: 2 skipped tests in `sites.router.test.ts` (admin/owner update) implemented and passing

### Frontend TTNCredentialsPanel Tests

- [ ] **FE-01**: TTNCredentialsPanel test coverage restored to ~21 tests (async data loading, mutations, error handling)
- [ ] **FE-02**: TTNCredentialsPanel deferred test scenarios implemented

### Frontend Widget Health Tests

- [ ] **FE-03**: `widgetHealthStates.test.ts` `describe.skip` removed and suite passes

### Test Suite Health

- [ ] **HEALTH-01**: `pnpm test` in backend exits 0 with zero skipped tests (or documented reason for any remaining skips)
- [ ] **HEALTH-02**: `pnpm test` in frontend exits 0 with zero skipped tests

## Out of Scope

| Feature | Reason |
|---------|--------|
| Coverage thresholds (80%+) | Fixing known failures, not chasing arbitrary numbers |
| E2E test expansion | Current 2 E2E files are sufficient for smoke testing |
| New test infrastructure | Using existing Vitest + Playwright setup |
| Performance testing | Separate concern, not test debt |
| Backend code changes | Tests should test existing behavior, not modify it |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TTN-01 | TBD | Pending |
| TTN-02 | TBD | Pending |
| ALERT-01 | TBD | Pending |
| ALERT-02 | TBD | Pending |
| READ-01 | TBD | Pending |
| READ-02 | TBD | Pending |
| SITE-01 | TBD | Pending |
| FE-01 | TBD | Pending |
| FE-02 | TBD | Pending |
| FE-03 | TBD | Pending |
| HEALTH-01 | TBD | Pending |
| HEALTH-02 | TBD | Pending |

**Coverage:**
- v2.9 requirements: 12 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 12

---
*Requirements defined: 2026-01-30*
*Last updated: 2026-01-30 after initial definition*
