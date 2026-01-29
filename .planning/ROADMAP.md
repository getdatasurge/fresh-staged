# Roadmap: FreshTrack Pro v2.7

## Overview

Fix the tRPC runtime crash that prevents React from mounting in production. The deployment infrastructure works (14 containers, API healthy, SSL) but the SPA never renders due to incompatible tRPC proxy calls.

## Milestones

- ✅ **v1.0 MVP** - Phases 1-7 (shipped 2026-01-23)
- ✅ **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24)
- ✅ **v2.0 Real-Time & Billing** - Phases 14-21 (shipped 2026-01-25)
- ✅ **v2.1 Streamlined Deployment** - Phases 22-26 (shipped 2026-01-25)
- ✅ **v2.2 Technical Debt & Stabilization** - Phases 27-33 (shipped 2026-01-29)
- ✅ **v2.3 Deployment Orchestration** - Phases 34-37 (shipped 2026-01-29)
- ✅ **v2.4 Tech Debt Cleanup** - Phases 38-43 (shipped 2026-01-29)
- ✅ **v2.5 TTN Test Fixes** - Phase 44 (shipped 2026-01-29)
- ✅ **v2.6 Production Deployment** - Phase 45 (shipped 2026-01-29)
- 🚧 **v2.7 tRPC Client Fix** - Phases 46-48 (in progress)

## Phase Details

### v2.7 tRPC Client Fix (Current)

**Milestone Goal:** Fix tRPC runtime crash so React mounts and the production app renders.

---

### Phase 46: Dependency Cleanup
**Goal**: Remove phantom dependency, pin tRPC versions, align Zod
**Depends on**: Nothing (foundation for proxy fixes)
**Requirements**: DEP-01, DEP-02, DEP-03
**Success Criteria** (what must be TRUE):
  1. `@trpc/react-query` removed from package.json (no longer bundled)
  2. All tRPC packages pinned to exact version 11.9.0
  3. Frontend Zod upgraded to v4 matching backend
  4. `pnpm install` succeeds with no peer dependency warnings for tRPC
  5. `pnpm run build` succeeds
**Plans**: 1 plan

Plans:
- [x] 46-01-PLAN.md — Remove phantom dep, pin tRPC versions, upgrade Zod

---

### Phase 47: tRPC Proxy Call Migration
**Goal**: Fix all `.mutate()` and `.query()` calls on `useTRPC()` proxy to use correct v11 API
**Depends on**: Phase 46 (clean dependencies required first)
**Requirements**: TRPC-01, TRPC-02, TRPC-03, TRPC-04
**Success Criteria** (what must be TRUE):
  1. Zero `.mutate()` calls remain on `useTRPC()` proxy — all use `useTRPCClient()` instead
  2. Zero `.query()` calls remain on `useTRPC()` proxy — all use `useTRPCClient()` instead
  3. React mounts successfully (`#root` has children)
  4. All existing frontend tests pass
  5. `pnpm run build` produces working bundle
**Plans**: 3 plans

Plans:
- [ ] 47-01-PLAN.md — Fix .mutate()/.query() calls in hooks (useAlertRules, useAlertRulesHistory, useWidgetHealthMetrics, useSiteLocationMutation)
- [ ] 47-02-PLAN.md — Fix .mutate()/.query() calls in features (useEntityLayoutStorage, BillingTab)
- [ ] 47-03-PLAN.md — Fix .mutate()/.query() calls in pages/widgets (Inspector, PilotSetup, SiteAlertsSummaryWidget, AlertHistoryWidget) + full codebase verification

---

### Phase 48: Production Redeploy & Verification
**Goal**: Rebuild and redeploy frontend to production, verify app renders
**Depends on**: Phase 47 (all proxy calls fixed)
**Requirements**: PROD-01, PROD-02, PROD-03
**Success Criteria** (what must be TRUE):
  1. Frontend rebuilt with fixed tRPC calls
  2. Frontend container redeployed on 192.168.4.181
  3. App renders in browser (React mounts, page content visible)
  4. Playwright smoke tests pass with React rendering confirmed
  5. No `TypeError: e[i] is not a function` in browser console
**Plans**: 1 plan

Plans:
- [ ] 48-01-PLAN.md — Rebuild frontend, redeploy to VM, run Playwright verification

---

## v2.7 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 46. Dependency Cleanup | v2.7 | 1/1 | Complete | 2026-01-29 |
| 47. tRPC Proxy Call Migration | v2.7 | 0/3 | Not Started | - |
| 48. Production Redeploy & Verification | v2.7 | 0/1 | Not Started | - |

**v2.7 Total:** 1/5 plans complete (20%)

---

## Dependency Graph

```
Phase 46 (Dependency Cleanup)
    |
    v
Phase 47 (tRPC Proxy Call Migration)
    |
    v
Phase 48 (Production Redeploy & Verification)
```

All phases are sequential — each depends on the previous.

---
*Roadmap created: 2026-01-29*
*Last updated: 2026-01-29*
