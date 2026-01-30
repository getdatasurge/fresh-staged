# Roadmap: FreshTrack Pro v2.8

## Overview

Fix known production issues discovered during v2.7 deployment verification: useSuperAdmin context error, ServiceWorker uncaught rejection, and WebSocket reconnection flicker.

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-01-23)
- ✅ **v1.1 Production Ready** — Phases 8-13 (shipped 2026-01-24)
- ✅ **v2.0 Real-Time & Billing** — Phases 14-21 (shipped 2026-01-25)
- ✅ **v2.1 Streamlined Deployment** — Phases 22-26 (shipped 2026-01-25)
- ✅ **v2.2 Technical Debt & Stabilization** — Phases 27-33 (shipped 2026-01-29)
- ✅ **v2.3 Deployment Orchestration** — Phases 34-37 (shipped 2026-01-29)
- ✅ **v2.4 Tech Debt Cleanup** — Phases 38-43 (shipped 2026-01-29)
- ✅ **v2.5 TTN Test Fixes** — Phase 44 (shipped 2026-01-29)
- ✅ **v2.6 Production Deployment** — Phase 45 (shipped 2026-01-29)
- ✅ **v2.7 tRPC Client Fix** — Phases 46-48 (shipped 2026-01-30)
- ✅ **v2.8 Production Polish** — Phases 49-51 (shipped 2026-01-30)

## Phase Details

### v2.8 Production Polish (Current)

**Milestone Goal:** Fix known production issues — useSuperAdmin context error, ServiceWorker registration failure, WebSocket reconnection flicker.

---

### Phase 49: SuperAdmin Context Fix
**Goal**: Prevent useSuperAdmin from throwing during initial render or when called outside provider
**Depends on**: Nothing (independent fix)
**Requirements**: SA-01, SA-02
**Success Criteria** (what must be TRUE):
  1. `useSuperAdmin` returns a safe default instead of throwing when context is unavailable
  2. No `useSuperAdmin must be used within a SuperAdminProvider` error in browser console
  3. Components using `useEffectiveIdentity` render without errors on initial page load
  4. Existing SuperAdmin functionality (impersonation, platform admin) still works correctly
  5. `pnpm run build` succeeds
**Plans**: 1 plan

Plans:
- [x] 49-01-PLAN.md — Fix useSuperAdmin context error with safe hook variant or error boundary

---

### Phase 50: ServiceWorker Registration Fix
**Goal**: Gracefully handle ServiceWorker registration failure on self-signed SSL certs
**Depends on**: Nothing (independent fix)
**Requirements**: SW-01, SW-02
**Success Criteria** (what must be TRUE):
  1. No uncaught promise rejection from ServiceWorker registration in browser console
  2. ServiceWorker registration either succeeds (valid SSL) or fails silently with info log
  3. App loads and functions identically with or without ServiceWorker
  4. PWA install prompt still works when SSL is valid (future domain setup)
  5. `pnpm run build` succeeds
**Plans**: 1 plan

Plans:
- [x] 50-01-PLAN.md — Add error handling to ServiceWorker registration using virtual:pwa-register/react hook

---

### Phase 51: WebSocket Reconnection Stability
**Goal**: Eliminate Socket.io reconnection flicker caused by JWT token refresh
**Depends on**: Nothing (independent fix)
**Requirements**: WS-01, WS-02, WS-03
**Success Criteria** (what must be TRUE):
  1. Socket.io connection persists through JWT token refresh (no disconnect/reconnect cycle)
  2. Socket.io uses WebSocket transport only (no polling fallback/upgrade)
  3. No visible "connecting" → "connected" flicker during normal app usage
  4. Socket.io still reconnects correctly after actual network disconnection
  5. Real-time updates (sensor data, alerts) continue working
**Plans**: 1 plan

Plans:
- [x] 51-01-PLAN.md — Stabilize useEffect dependency, force WebSocket transport, refresh token on reconnect

---

## v2.8 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 49. SuperAdmin Context Fix | v2.8 | 1/1 | Complete | 2026-01-30 |
| 50. ServiceWorker Registration Fix | v2.8 | 1/1 | Complete | 2026-01-30 |
| 51. WebSocket Reconnection Stability | v2.8 | 1/1 | Complete | 2026-01-30 |

**v2.8 Total:** 3/3 plans complete (100%)

---

## Dependency Graph

```
Phase 49 (SuperAdmin Context Fix)     ─┐
Phase 50 (ServiceWorker Registration)  ─┤─ All independent, can run in any order
Phase 51 (WebSocket Stability)         ─┘
```

All phases are independent — no dependencies between them.

---
*Roadmap created: 2026-01-30*
*Last updated: 2026-01-30 — Phase 49 complete*
