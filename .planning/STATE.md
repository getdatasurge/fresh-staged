# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** Food safety data must flow reliably from sensors to alerts without interruption.
**Current focus:** v2.7 tRPC Client Fix — unblock production app render

## Current Position

Milestone: v2.7 tRPC Client Fix
Phase: 47 of 48 - tRPC Proxy Call Migration
Plan: 2/3 complete (47-01, 47-02 done; 47-03 remaining)
Status: In progress
Last activity: 2026-01-29 — Completed 47-01-PLAN.md (hook tRPC proxy call migration)

Progress: ████████░░ 80%

## Milestones Shipped

| Version | Name | Phases | Plans | Shipped |
|---------|------|--------|-------|---------|
| v1.0 | Self-Hosted MVP | 1-7 | 47 | 2026-01-23 |
| v1.1 | Production Ready | 8-13 | 31 | 2026-01-24 |
| v2.0 | Real-Time & Billing | 14-21 | 40 | 2026-01-25 |
| v2.1 | Streamlined Deployment | 22-26 | 9 | 2026-01-25 |
| v2.2 | Technical Debt & Stabilization | 27-33 | 27 | 2026-01-29 |
| v2.3 | Deployment Orchestration | 34-37 | 11 | 2026-01-29 |
| v2.4 | Tech Debt Cleanup | 38-43 | 16 | 2026-01-29 |
| v2.5 | TTN Test Fixes | 44 | 1 | 2026-01-29 |
| v2.6 | Production Deployment | 45 | 3 | 2026-01-29 |

**Total shipped:** 9 milestones, 45 phases, 187 plans

## v2.7 Progress

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 46 | Dependency Cleanup | DEP-01, DEP-02, DEP-03 | Complete |
| 47 | tRPC Proxy Call Migration | TRPC-01 to TRPC-04 | In Progress (2/3 plans: 47-01, 47-02 done) |
| 48 | Production Redeploy & Verification | PROD-01 to PROD-03 | Not Started |

**v2.7 scope:** 10 requirements, 3 phases, 5 plans — **4/5 plans complete (80%)**

## Root Cause Reference

**Bug:** `TypeError: e[i] is not a function` — React fails to mount

**Primary cause:** 30+ call sites use `.mutate()`/`.query()` on `useTRPC()` proxy, which only supports `.mutationOptions()`/`.queryOptions()` in `@trpc/tanstack-react-query` v11. The proxy's `contextMap` doesn't contain `"mutate"` or `"query"` keys.

**Contributing factors:**
1. Phantom `@trpc/react-query` dependency bundled (not imported)
2. tRPC version mismatch (server 11.9.0, client 11.8.1)
3. Zod major version mismatch (frontend v3, backend v4)

**Affected files (`.mutate()`):** useAlertRules.ts, useAlertRulesHistory.ts, useWidgetHealthMetrics.ts, useSiteLocationMutation.ts, eventLogger.ts, useEntityLayoutStorage.ts, BillingTab.tsx, Inspector.tsx
**Affected files (`.query()`):** useWidgetHealthMetrics.ts, useEntityLayoutStorage.ts, SiteAlertsSummaryWidget.tsx, AlertHistoryWidget.tsx, BillingTab.tsx, Inspector.tsx, PilotSetup.tsx

## Accumulated Context

### Decisions

- IP-based deployment (192.168.4.181), no domain
- Self-signed SSL via Caddy auto-TLS
- Docker compose: base `docker-compose.yml` + overlay `compose.production.yaml`
- Env vars in `.env.production` (must export before docker compose commands)
- Playwright E2E tests for deployment validation
- Fix pattern: `.mutate()`/`.query()` → `useTRPCClient()` (vanilla client supports these methods)

### Blockers/Concerns

- ServiceWorker registration fails due to self-signed cert (non-blocking)

## Session Continuity

Last session: 2026-01-29
Stopped at: Completed 47-01-PLAN.md (hook tRPC proxy call migration)
Resume file: None
Next action: Execute 47-03-PLAN.md (remaining page/component file migrations)
