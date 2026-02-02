# Roadmap: FreshTrack Pro

## Overview

Milestone v2.9 eliminates all skipped tests across backend and frontend, restoring full test coverage for TTN webhooks, API routes, and React components. Every `pnpm test` exits 0 with zero skipped tests.

## Milestones

- **v1.0 Self-Hosted MVP** - Phases 1-7 (shipped 2026-01-23)
- **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24)
- **v2.0 Real-Time & Billing** - Phases 14-21 (shipped 2026-01-25)
- **v2.1 Streamlined Deployment** - Phases 22-26 (shipped 2026-01-25)
- **v2.2 Technical Debt & Stabilization** - Phases 27-33 (shipped 2026-01-29)
- **v2.3 Deployment Orchestration** - Phases 34-37 (shipped 2026-01-29)
- **v2.4 Tech Debt Cleanup** - Phases 38-43 (shipped 2026-01-29)
- **v2.5 TTN Test Fixes** - Phase 44 (shipped 2026-01-29)
- **v2.6 Production Deployment** - Phase 45 (shipped 2026-01-29)
- **v2.7 tRPC Client Fix** - Phases 46-48 (shipped 2026-01-30)
- **v2.8 Production Polish** - Phases 49-51 (shipped 2026-01-30)

## Phase Details

### v2.9 Quality Assurance (Current)

**Milestone Goal:** Fix all skipped tests and restore full test coverage across backend and frontend. Zero skipped tests, zero test failures.

---

### Phase 52: Backend TTN Webhook Tests

**Goal**: Consolidate duplicate TTN webhook test files -- replace the broken api/ file (14 skipped tests) with the working routes/ file (32 passing tests), eliminating all skips with zero coverage loss
**Depends on**: Nothing (first phase of v2.9)
**Requirements**: TTN-01, TTN-02
**Success Criteria** (what must be TRUE):

1. All 14 previously-skipped tests eliminated (no `.skip` or `.todo` markers remain)
2. 32 TTN webhook tests pass covering the full ingestion path: authentication, payload validation, reading creation, alert triggers, device metadata, edge cases
3. Single canonical test file at `tests/api/ttn-webhooks.test.ts` with proper socket plugin mock
4. No regression in the broader backend test suite
   **Plans**: 1 plan

Plans:

- [ ] 52-01-PLAN.md -- Consolidate TTN webhook tests (replace broken api/ file with working routes/ file)

---

### Phase 53: Backend API Tests

**Goal**: All skipped backend API tests (alerts, readings, sites) implemented and passing, covering the full lifecycle of each domain through the API layer
**Depends on**: Phase 52
**Requirements**: ALERT-01, ALERT-02, READ-01, READ-02, SITE-01
**Success Criteria** (what must be TRUE):

1. All 11 previously-skipped tests in `alerts.test.ts` run and pass
2. Alert lifecycle (list, acknowledge, resolve) is tested through the API layer with correct status transitions
3. All 8 previously-skipped tests in `readings.test.ts` run and pass
4. Reading ingestion, pagination, and time-based filtering are tested with realistic data
5. Both skipped tests in `sites.router.test.ts` (admin update, owner update) run and pass
   **Plans**: TBD

Plans:

- [ ] 53-01-PLAN.md -- Implement alert API lifecycle tests
- [ ] 53-02-PLAN.md -- Implement readings API tests (ingestion, pagination, time filtering)
- [ ] 53-03-PLAN.md -- Implement sites router admin/owner update tests

---

### Phase 54: Frontend Test Restoration

**Goal**: Frontend test coverage restored for TTNCredentialsPanel and widget health states, with all deferred scenarios implemented
**Depends on**: Nothing (independent of backend phases)
**Requirements**: FE-01, FE-02, FE-03
**Success Criteria** (what must be TRUE):

1. TTNCredentialsPanel test suite has ~21 tests covering async data loading, mutations, and error handling
2. Deferred TTNCredentialsPanel scenarios (loading states, mutation success/failure, validation errors) are implemented and passing
3. `widgetHealthStates.test.ts` has `describe.skip` removed and all tests in the suite pass
4. Frontend `pnpm test` runs with zero skipped tests in these files
   **Plans**: TBD

Plans:

- [ ] 54-01-PLAN.md -- Restore TTNCredentialsPanel test coverage (~21 tests)
- [ ] 54-02-PLAN.md -- Remove widget health states skip and fix suite

---

### Phase 55: Test Suite Health Validation

**Goal**: Both backend and frontend test suites exit cleanly with zero skipped tests, confirming the milestone is complete
**Depends on**: Phase 52, Phase 53, Phase 54
**Requirements**: HEALTH-01, HEALTH-02
**Success Criteria** (what must be TRUE):

1. `pnpm test` in `backend/` exits 0 with zero skipped tests and zero failures
2. `pnpm test` in the frontend root exits 0 with zero skipped tests and zero failures
3. Any remaining skipped tests have a documented reason in the test file
   **Plans**: 1 plan

Plans:

- [ ] 55-01-PLAN.md -- Run full test suites and resolve any remaining failures

---

## v2.9 Progress

| Phase                            | Milestone | Plans Complete | Status      | Completed |
| -------------------------------- | --------- | -------------- | ----------- | --------- |
| 52. Backend TTN Webhook Tests    | v2.9      | 0/1            | Planned     | -         |
| 53. Backend API Tests            | v2.9      | 0/3            | Not started | -         |
| 54. Frontend Test Restoration    | v2.9      | 0/2            | Not started | -         |
| 55. Test Suite Health Validation | v2.9      | 0/1            | Not started | -         |

## Dependency Graph

```
Phase 52 (TTN Webhooks) ──┐
                          ├──> Phase 55 (Validation)
Phase 53 (API Tests) ─────┤
                          │
Phase 54 (Frontend) ──────┘

Note: Phases 52-53 are sequential (shared backend test infra).
      Phase 54 is independent (can run parallel with 52-53).
      Phase 55 depends on all three completing.
```

---

_Roadmap created: 2026-01-30_
_Milestone: v2.9 Quality Assurance -- 4 phases, 7 plans_
