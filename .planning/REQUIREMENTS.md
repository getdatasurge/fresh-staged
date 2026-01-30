# Requirements: FreshTrack Pro v2.9

**Defined:** 2026-01-30
**Core Value:** Food safety data must flow reliably from sensors to alerts without interruption.

## v2.9 Requirements — Quality Assurance

Fix known skipped tests and restore test coverage across backend and frontend. Focus on un-skipping existing test stubs and expanding TTNCredentialsPanel coverage.

### Backend TTN Webhook Tests

- [x] **TTN-01**: All 14 skipped tests in `ttn-webhooks.test.ts` are eliminated and passing
- [x] **TTN-02**: TTN webhook ingestion path (reading creation, alert triggers, device metadata) covered

### Backend Alert API Tests

- [x] **ALERT-01**: All 14 skipped tests in `alerts.test.ts` are eliminated (file deleted — all duplicated by 19 passing tRPC tests)
- [x] **ALERT-02**: Alert lifecycle (get, acknowledge, resolve) fully tested through API layer (tRPC)

### Backend Readings API Tests

- [x] **READ-01**: All 8 skipped tests in `readings.test.ts` are eliminated (5 fixed, 3 duplicates removed)
- [x] **READ-02**: Reading ingestion, pagination, and time-based filtering tested

### Backend Sites Router Tests

- [x] **SITE-01**: 2 skipped tests in `sites.router.test.ts` (admin/owner update) eliminated (duplicates removed)

### Frontend TTNCredentialsPanel Tests

- [x] **FE-01**: TTNCredentialsPanel test coverage restored to ~21 tests (actual: 26 tests covering async data loading, mutations, error handling)
- [x] **FE-02**: TTNCredentialsPanel deferred test scenarios implemented (5 describe groups: rendering, data loading, credential display, mutations, error handling)

### Frontend Widget Health Tests

- [x] **FE-03**: `widgetHealthStates.test.ts` `describe.skip` removed and suite passes (12 deprecated tests deleted, 21 remaining pass)

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
| TTN-01 | Phase 52 | Complete |
| TTN-02 | Phase 52 | Complete |
| ALERT-01 | Phase 53 | Complete |
| ALERT-02 | Phase 53 | Complete |
| READ-01 | Phase 53 | Complete |
| READ-02 | Phase 53 | Complete |
| SITE-01 | Phase 53 | Complete |
| FE-01 | Phase 54 | Complete |
| FE-02 | Phase 54 | Complete |
| FE-03 | Phase 54 | Complete |
| HEALTH-01 | Phase 55 | Pending |
| HEALTH-02 | Phase 55 | Pending |

**Coverage:**
- v2.9 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-01-30*
*Last updated: 2026-01-30 -- Traceability updated with phase assignments*
