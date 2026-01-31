# FrostGuard Technical Debt Report

**Audit Date:** 2026-01-30
**Audited By:** 7-domain multi-agent review (Security, Code Quality, Performance, Architecture, Frontend/UX, Test Quality, DevOps/CI)

## Summary

| Severity  | Count   | Status                                       |
| --------- | ------- | -------------------------------------------- |
| Critical  | 25      | 3 fixed (SQL injection, admin auth, secrets) |
| High      | 42      | Open                                         |
| Medium    | 63      | Open                                         |
| Low       | 46      | Open                                         |
| **Total** | **176** |                                              |

## Table of Contents

- [Critical Findings](#critical-findings-25)
- [High Findings](#high-findings-42)
- [Medium Findings](#medium-findings-63)
- [Low Findings](#low-findings-46)
- [Priority Roadmap](#priority-roadmap)

---

## Critical Findings (25)

### Security (3 Critical)

| ID      | Description                                                                                                                         | Location                                                                                                                           | Fix                                                                       | Effort | Status                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| C-SEC-1 | SQL Injection via sql.raw() — notification_channels array values interpolated directly into sql.raw()                               | `backend/src/services/escalation-contacts.service.ts:81-83,193-197`, `backend/src/services/notification-policy.service.ts:288,300` | Use parameterized queries, constrain Zod schema to enum                   | Medium | FIXED                                     |
| C-SEC-2 | Secrets Committed to Git — .env, .env.production, backend/.env contain real JWT_SECRET, DB passwords, Stack Auth keys               | `.env`, `.env.production`, `backend/.env`                                                                                          | Rotate all secrets, git rm --cached, add to .gitignore, purge git history | Medium | FIXED (config only, user must run git rm) |
| C-SEC-3 | Admin Routes Missing Role Auth — protectedProcedure (auth-only), no admin role check. Any authenticated user gets cross-tenant data | `backend/src/routers/admin.router.ts:58-464`, `backend/src/routes/admin.ts:24`                                                     | Create platformAdminProcedure checking platformRoles table                | Medium | FIXED                                     |

### Architecture (3 Critical)

| ID       | Description                                                                                          | Location                                                                                         | Fix                                                        | Effort | Status |
| -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------ | ------ |
| C-ARCH-1 | Admin Routes BOLA — Same as C-SEC-3. All admin procedures expose cross-tenant data                   | `backend/src/routers/admin.router.ts`                                                            | See C-SEC-3                                                | Medium | FIXED  |
| C-ARCH-2 | WebSocket Room Hijack — subscribe:site/subscribe:unit don't validate site/unit belongs to user's org | `backend/src/plugins/socket.plugin.ts:112-130`, `backend/src/services/socket.service.ts:148-178` | Add DB lookup to verify ownership before socket.join(room) | Medium | Open   |
| C-ARCH-3 | Dashboard Layout No Org Scoping — queries by entityId+userId only, no organizationId filter          | `backend/src/routers/dashboard-layout.router.ts:75-106`                                          | Switch to orgProcedure                                     | Small  | Open   |

### Performance (4 Critical)

| ID       | Description                                                                             | Location                                           | Fix                                                                                          | Effort | Status |
| -------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ------ |
| C-PERF-1 | Missing DB Indexes on Alerts — alerts table lacks composite indexes for common queries  | alerts table schema                                | CREATE INDEX on (unit_id, triggered_at DESC), (status, severity)                             | Small  | Open   |
| C-PERF-2 | Missing Index on units.lastReadingAt — used for offline detection and dashboard sorting | units table schema                                 | CREATE INDEX units_last_reading_at_idx ON units(last_reading_at DESC) WHERE is_active = true | Small  | Open   |
| C-PERF-3 | Main Bundle >1MB — single 3,156KB JS chunk                                              | `src/App.tsx` (all imports static)                 | Route-level code splitting with React.lazy                                                   | Large  | Open   |
| C-PERF-4 | Unbounded SELECT — accepts limit up to 1000 but no max enforcement                      | `backend/src/services/readings.service.ts:152-182` | Hard cap Math.min(limit, 1000)                                                               | Small  | Open   |

### Code Quality (2 Critical)

| ID     | Description                                                                                          | Location                           | Fix                          | Effort | Status |
| ------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------- | ------ | ------ |
| C-CQ-1 | Unsafe JSON.parse — Multiple files use JSON.parse(dbAlert.metadata) without try/catch                | Multiple backend services          | Create safeJsonParse utility | Small  | Open   |
| C-CQ-2 | Hardcoded Fake Telemetry — battery_level:100, signal_strength:-50 in food safety compliance platform | `src/pages/UnitDetail.tsx:360-361` | Pull real data or show "N/A" | Small  | Open   |

### Frontend/UX (3 Critical)

| ID     | Description                                                                        | Location              | Fix                                               | Effort | Status |
| ------ | ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------- | ------ | ------ |
| C-FE-1 | PWA Manifest Missing — Referenced in index.html but file doesn't exist             | `index.html`          | Create manifest.webmanifest with proper icons     | Small  | Open   |
| C-FE-2 | No React Hook Form Usage — Dependencies installed but zero pages use useForm       | All form pages        | Migrate forms to React Hook Form + Zod            | Large  | Open   |
| C-FE-3 | Missing Form Autocomplete — Zero autoComplete attributes, breaks password managers | All forms with inputs | Add autoComplete attributes per WCAG 2.1 AA 1.3.5 | Small  | Open   |

### Test Quality (5 Critical)

| ID       | Description                                                            | Location                                | Fix                                                        | Effort | Status |
| -------- | ---------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- | ------ | ------ |
| C-TEST-1 | Component Test Desert — 98.7% of components untested (157/159)         | `src/components/`                       | Add Vitest + Testing Library tests for critical components | Large  | Open   |
| C-TEST-2 | Page Components Untested — All 35 pages have zero tests                | `src/pages/`                            | Add integration tests for critical user flows              | Large  | Open   |
| C-TEST-3 | Real-time Socket.io Untested — Critical alert delivery path            | `src/providers/RealtimeProvider.tsx`    | Add Socket.io mock tests                                   | Medium | Open   |
| C-TEST-4 | Payment Webhook Security Untested — Stripe signature verification      | `backend/src/routes/stripe-webhooks.ts` | Add Stripe webhook signature verification tests            | Medium | Open   |
| C-TEST-5 | Auth Middleware Edge Cases — Missing token expiry, malformed JWT tests | `backend/src/middleware/auth.ts`        | Add edge case unit tests                                   | Small  | Open   |

### DevOps/CI (5 Critical)

| ID      | Description                                                                         | Location                           | Fix                                                | Effort | Status |
| ------- | ----------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- | ------ | ------ |
| C-OPS-1 | No HTTPS/TLS — Production Docker Compose has no reverse proxy or TLS termination    | `docker/compose.prod.yaml`         | Add Traefik/Caddy reverse proxy with Let's Encrypt | Medium | Open   |
| C-OPS-2 | Secrets in GitHub Actions — passes token via echo to docker login                   | `.github/workflows/deploy.yml:129` | Use docker/login-action with secrets               | Small  | Open   |
| C-OPS-3 | No Database Backup — No pg_dump automation                                          | `docker/compose.prod.yaml`         | Add pg_dump cron job with S3/volume backup         | Medium | Open   |
| C-OPS-4 | Missing Env Validation — Services start with empty passwords                        | `docker/compose.prod.yaml`         | Add entrypoint validation script                   | Small  | Open   |
| C-OPS-5 | No Secrets Rotation — JWT_SECRET, DB passwords, API keys have no rotation mechanism | Infrastructure                     | Implement rotation schedule with Infisical/Vault   | Large  | Open   |

---

## High Findings (42)

### Security (5 High)

| ID      | Description                                                            | Location                                                | Fix                                        | Effort |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ | ------ |
| H-SEC-1 | Telnyx Webhook No Auth — Zero authentication                           | `backend/src/routes/telnyx-webhooks.ts:22-30`           | Implement ED25519 signature verification   | Medium |
| H-SEC-2 | Redis No Auth — No --requirepass                                       | `docker-compose.yml:55`, `docker/compose.prod.yaml:110` | Add --requirepass ${REDIS_PASSWORD}        | Small  |
| H-SEC-3 | PgBouncer Hardcoded Password                                           | `docker/compose.prod.yaml:74`                           | Use env var ${PGBOUNCER_EXPORTER_PASSWORD} | Small  |
| H-SEC-4 | Vulnerable Dependencies — fast-xml-parser HIGH CVE, elliptic MODERATE  | `package.json`                                          | Update dependencies, audit fix             | Small  |
| H-SEC-5 | Bull Board No Admin Check — Any authenticated user can view job queues | `backend/src/plugins/queue.plugin.ts:131-141`           | Add admin role check                       | Small  |

### Architecture (5 High)

| ID       | Description                                                                    | Location                                      | Fix                              | Effort |
| -------- | ------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------- | ------ |
| H-ARCH-1 | Dual REST + tRPC API — Separate auth enforcement paths                         | `backend/src/app.ts:177-228`                  | Deprecate REST for frontend      | Large  |
| H-ARCH-2 | Dead Supabase Error Codes — checks PGRST301, 42501 codes that never match tRPC | `src/lib/errorHandler.ts:11-15`               | Remove dead code                 | Small  |
| H-ARCH-3 | Socket Auth Hardcodes Primary Org — No multi-org WebSocket support             | `backend/src/middleware/socket-auth.ts:66-68` | Support multi-org in socket auth | Medium |
| H-ARCH-4 | 17,700+ Lines Dead Code — 30+ dead Supabase edge functions                     | `supabase/functions/`                         | Delete entire directory          | Small  |
| H-ARCH-5 | Bull Board Auth — Same as H-SEC-5                                              | `backend/src/plugins/queue.plugin.ts`         | See H-SEC-5                      | Small  |

### Performance (7 High)

| ID       | Description                                                                       | Location                                         | Fix                                 | Effort |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- | ------ |
| H-PERF-1 | No Virtualization — renders all units without react-virtual                       | `src/pages/Dashboard.tsx:348-409`                | Add @tanstack/react-virtual         | Medium |
| H-PERF-2 | Missing React.memo — Unit cards re-render on every parent update                  | Unit card components                             | Wrap with React.memo                | Small  |
| H-PERF-3 | Expensive useMemo — recalculates computeUnitStatus for every unit on every render | `src/pages/Dashboard.tsx:58-77`                  | Optimize memoization                | Small  |
| H-PERF-4 | Socket.io No Exponential Backoff                                                  | `src/providers/RealtimeProvider.tsx:67-80`       | Add exponential backoff with jitter | Small  |
| H-PERF-5 | Missing Pagination — allows unbounded alert queries                               | `backend/src/routers/alerts.router.ts:121-147`   | Add cursor-based pagination         | Medium |
| H-PERF-6 | N+1 Query Pattern                                                                 | `backend/src/routers/readings.router.ts:204-234` | Use JOIN or batch query             | Medium |
| H-PERF-7 | DashboardLayout Not Memoized                                                      | Dashboard layout components                      | Add React.memo/useMemo              | Small  |

### Code Quality (7 High)

| ID     | Description                                                                         | Location                                 | Fix                                          | Effort |
| ------ | ----------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- | ------ |
| H-CQ-1 | 24 `as any` casts                                                                   | UnitDetail, Alerts, Dashboard, hooks     | Update interfaces to match tRPC output types | Medium |
| H-CQ-2 | `null as any` return                                                                | `src/hooks/useAlertRules.ts:98`          | Return type AlertRulesRow or null            | Small  |
| H-CQ-3 | Unstable useEffect deps — Query objects in dependency array                         | `src/pages/UnitDetail.tsx:248-272`       | Extract stable primitives                    | Small  |
| H-CQ-4 | Files >800 lines — Settings.tsx (1320), Onboarding.tsx (1109), UnitDetail.tsx (950) | Multiple pages                           | Extract sub-components                       | Large  |
| H-CQ-5 | Import after interfaces                                                             | `src/pages/UnitDetail.tsx:100`           | Move imports to top                          | Small  |
| H-CQ-6 | 16+ non-null assertions                                                             | `src/pages/UnitDetail.tsx` various lines | Add proper null checks                       | Medium |
| H-CQ-7 | useAuditedWrite bypasses tRPC                                                       | `src/hooks/useAuditedWrite.ts:86-88`     | Route through tRPC mutation                  | Medium |

### Frontend/UX (7 High)

| ID     | Description                                                             | Location                       | Fix                                            | Effort |
| ------ | ----------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------- | ------ |
| H-FE-1 | Insufficient ARIA Labels — Only 5 instances across 36 pages             | Multiple pages                 | Add aria-label to interactive elements         | Medium |
| H-FE-2 | Limited Keyboard Navigation — Only 1 onKeyDown handler                  | Entire codebase                | Add keyboard handlers for interactive elements | Large  |
| H-FE-3 | No Focus Management — Zero .focus() calls for modals                    | Modal/dialog components        | Implement focus trap and restore               | Medium |
| H-FE-4 | Inconsistent Loading States — Only 2 pages use Skeleton                 | Multiple pages                 | Add Skeleton components consistently           | Medium |
| H-FE-5 | Missing Empty States — Many tables render blank when empty              | Table components               | Add EmptyState component                       | Medium |
| H-FE-6 | Button Touch Target Too Small — Default h-10 (40px) below 44px WCAG min | `src/components/ui/button.tsx` | Increase to min-h-11 (44px)                    | Small  |
| H-FE-7 | No Breadcrumb Usage — HierarchyBreadcrumb only used in UnitDetail       | Navigation components          | Add breadcrumbs to all drill-down pages        | Medium |

### Test Quality (4 High)

| ID       | Description                                               | Location               | Fix                                  | Effort |
| -------- | --------------------------------------------------------- | ---------------------- | ------------------------------------ | ------ |
| H-TEST-1 | Job Processors — Only 1/5 tested                          | `backend/src/jobs/`    | Add tests for remaining 4 processors | Medium |
| H-TEST-2 | tRPC Routers — 13/28 missing tests                        | `backend/src/routers/` | Add router integration tests         | Large  |
| H-TEST-3 | RBAC Isolation — Cross-org data leak tests missing        | Backend tests          | Add multi-tenant isolation tests     | Medium |
| H-TEST-4 | E2E Coverage — Only 2 smoke tests, no user workflow tests | `e2e/`                 | Add critical path E2E tests          | Large  |

### DevOps/CI (7 High)

| ID      | Description                                                        | Location                   | Fix                                   | Effort |
| ------- | ------------------------------------------------------------------ | -------------------------- | ------------------------------------- | ------ |
| H-OPS-1 | Hardcoded Dev Credentials                                          | `docker-compose.yml:12-14` | Use env vars with defaults            | Small  |
| H-OPS-2 | No Container Resource Limits                                       | Dev docker-compose         | Add memory/CPU limits                 | Small  |
| H-OPS-3 | No Log Aggregation — No size limits on Docker logs                 | Docker configs             | Add log rotation and max-size         | Small  |
| H-OPS-4 | Dependency Scan Doesn't Fail — CI doesn't exit 1 on critical vulns | CI workflows               | Add --audit-level=critical flag       | Small  |
| H-OPS-5 | No Docker Image Scanning — No Trivy in CI                          | CI workflows               | Add Trivy scanning step               | Medium |
| H-OPS-6 | PgBouncer Disabled — Connection pooling not working in prod        | `docker/compose.prod.yaml` | Enable and configure PgBouncer        | Medium |
| H-OPS-7 | Rate Limiting Uncertain — Config not verified                      | `backend/src/app.ts`       | Verify and document rate limit config | Small  |

---

## Medium Findings (63)

### Security (6 Medium)

| ID      | Description                        | Location                         | Effort |
| ------- | ---------------------------------- | -------------------------------- | ------ |
| M-SEC-1 | CSP unsafe-inline                  | `backend/src/app.ts:95`          | Medium |
| M-SEC-2 | WebSocket CORS wildcard wss://\*   | `backend/src/app.ts:103-104`     | Small  |
| M-SEC-3 | Rate limit key includes User-Agent | `backend/src/app.ts:121-122`     | Small  |
| M-SEC-4 | dangerouslySetInnerHTML            | `src/components/ui/chart.tsx:73` | Small  |
| M-SEC-5 | HSTS disabled                      | `backend/src/app.ts:109`         | Small  |
| M-SEC-6 | MinIO public bucket                | `docker-compose.yml:102`         | Small  |

### Code Quality (9 Medium)

| ID     | Description                                     | Location                                                           | Effort |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------ | ------ |
| M-CQ-1 | 60+ console.log in production                   | Multiple files                                                     | Medium |
| M-CQ-2 | eslint-disable exhaustive-deps                  | `src/hooks/useOfflineSync.ts:52`                                   | Small  |
| M-CQ-3 | Duplicate data transformation                   | Dashboard, Alerts, UnitDetail                                      | Medium |
| M-CQ-4 | SuperAdminContext 701 lines                     | `src/contexts/SuperAdminContext.tsx`                               | Medium |
| M-CQ-5 | useWidgetHealthMetrics silently swallows errors | Widget health hook                                                 | Small  |
| M-CQ-6 | queryClient at module scope                     | `src/App.tsx:60-69`                                                | Small  |
| M-CQ-7 | 20+ untracked TODOs                             | Multiple files                                                     | Medium |
| M-CQ-8 | IndexedDB as any                                | `src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts:80` | Small  |
| M-CQ-9 | event_data typed as any                         | `src/pages/UnitDetail.tsx:87`                                      | Small  |

### Performance (12 Medium)

| ID        | Description                                  | Location                   | Effort |
| --------- | -------------------------------------------- | -------------------------- | ------ |
| M-PERF-1  | Settings bundle 285KB                        | Settings page imports      | Medium |
| M-PERF-2  | Charts bundle 397KB                          | Chart library imports      | Medium |
| M-PERF-3  | Missing useCallback in event handlers        | Multiple components        | Small  |
| M-PERF-4  | Socket flooding — no throttle on events      | RealtimeProvider           | Small  |
| M-PERF-5  | Lucide icons 67KB — importing full icon set  | Icon imports               | Small  |
| M-PERF-6  | Missing covering index on readings table     | Backend DB schema          | Small  |
| M-PERF-7  | UnitDetail polling vs realtime redundancy    | `src/pages/UnitDetail.tsx` | Medium |
| M-PERF-8  | Multiple queries vs batch in dashboard       | Dashboard data loading     | Medium |
| M-PERF-9  | No stale-while-revalidate headers            | Backend API responses      | Small  |
| M-PERF-10 | Missing compression middleware               | Backend Fastify config     | Small  |
| M-PERF-11 | Large component re-renders on context change | Context consumers          | Medium |
| M-PERF-12 | No HTTP/2 push for critical assets           | Production config          | Medium |

### Architecture (8 Medium)

| ID       | Description                                                | Location                                 | Effort |
| -------- | ---------------------------------------------------------- | ---------------------------------------- | ------ |
| M-ARCH-1 | catch(error: any) pattern                                  | `backend/src/routers/readings.router.ts` | Small  |
| M-ARCH-2 | createManual missing organizationId                        | Manual reading creation                  | Small  |
| M-ARCH-3 | console.log instead of structured logger — 135 occurrences | Multiple backend files                   | Large  |
| M-ARCH-4 | Two Redis connection pools                                 | Backend Redis config                     | Medium |
| M-ARCH-5 | No DLQ for failed jobs                                     | BullMQ job config                        | Medium |
| M-ARCH-6 | Timestamps duplicated across schema files                  | Backend DB schema                        | Small  |
| M-ARCH-7 | Router file 220+ lines of comments                         | `backend/src/trpc/router.ts`             | Small  |
| M-ARCH-8 | Subscription middleware typed as any                       | Subscription handling                    | Small  |

### Frontend/UX (14 Medium)

| ID      | Description                                    | Location                | Effort |
| ------- | ---------------------------------------------- | ----------------------- | ------ |
| M-FE-1  | Widget accessibility — 39 widgets lack ARIA    | Widget components       | Medium |
| M-FE-2  | Responsive breakpoints inconsistent            | Multiple pages          | Medium |
| M-FE-3  | Button sizes inconsistent across app           | Button usage            | Small  |
| M-FE-4  | Table accessibility — missing scope, caption   | Table components        | Medium |
| M-FE-5  | Color contrast issues in status badges         | Badge/status components | Small  |
| M-FE-6  | Forms lack validation UX feedback              | Form components         | Medium |
| M-FE-7  | Date picker accessibility                      | Date picker component   | Medium |
| M-FE-8  | No skip-to-content link                        | Layout component        | Small  |
| M-FE-9  | Chart tooltips not keyboard accessible         | Chart components        | Medium |
| M-FE-10 | Missing page titles (document.title)           | Page components         | Small  |
| M-FE-11 | No error boundary per route                    | Route components        | Medium |
| M-FE-12 | Mobile navigation gaps                         | Mobile layout           | Medium |
| M-FE-13 | Toast notifications not screen-reader friendly | Toast component         | Small  |
| M-FE-14 | Icon-only buttons without labels               | Various buttons         | Small  |

### Test Quality (6 Medium)

| ID       | Description                         | Location            | Effort |
| -------- | ----------------------------------- | ------------------- | ------ |
| M-TEST-1 | Frontend hook tests missing         | `src/hooks/`        | Medium |
| M-TEST-2 | Service edge cases untested         | Backend services    | Medium |
| M-TEST-3 | Accessibility tests missing         | Frontend components | Medium |
| M-TEST-4 | TTN webhook validation incomplete   | TTN webhook tests   | Small  |
| M-TEST-5 | No snapshot tests for UI components | Frontend components | Medium |
| M-TEST-6 | Missing error path tests            | Multiple services   | Medium |

### DevOps/CI (8 Medium)

| ID      | Description                           | Location                   | Effort |
| ------- | ------------------------------------- | -------------------------- | ------ |
| M-OPS-1 | Frontend build args not passed        | CI build config            | Small  |
| M-OPS-2 | MinIO not in prod compose             | `docker/compose.prod.yaml` | Medium |
| M-OPS-3 | No migration rollback mechanism       | DB migration scripts       | Medium |
| M-OPS-4 | Bundle size limits not enforced in CI | CI config                  | Small  |
| M-OPS-5 | Health checks incomplete              | Docker compose configs     | Small  |
| M-OPS-6 | No E2E tests in CI                    | CI workflows               | Large  |
| M-OPS-7 | Worker not deployed in prod           | Production deployment      | Medium |
| M-OPS-8 | No application monitoring/APM         | Production infrastructure  | Large  |

---

## Low Findings (46)

### Security (4 Low)

| ID      | Description                               | Effort |
| ------- | ----------------------------------------- | ------ |
| L-SEC-1 | Cookie secure flag not explicitly set     | Small  |
| L-SEC-2 | No request ID correlation for audit trail | Small  |
| L-SEC-3 | Static file serving without cache headers | Small  |
| L-SEC-4 | Missing X-Content-Type-Options header     | Small  |

### Code Quality (5 Low)

| ID     | Description                                               | Effort |
| ------ | --------------------------------------------------------- | ------ |
| L-CQ-1 | Inconsistent error message formats                        | Small  |
| L-CQ-2 | Magic numbers in configuration                            | Small  |
| L-CQ-3 | Unused imports in several files                           | Small  |
| L-CQ-4 | Inconsistent naming conventions (camelCase vs snake_case) | Medium |
| L-CQ-5 | Missing JSDoc on public API functions                     | Medium |

### Performance (6 Low)

| ID       | Description                          | Effort |
| -------- | ------------------------------------ | ------ |
| L-PERF-1 | No preconnect hints for API domain   | Small  |
| L-PERF-2 | Missing font-display: swap           | Small  |
| L-PERF-3 | No resource hints (prefetch/preload) | Small  |
| L-PERF-4 | Image assets not optimized (no WebP) | Medium |
| L-PERF-5 | No service worker caching strategy   | Medium |
| L-PERF-6 | CSS not purged in production build   | Small  |

### Architecture (5 Low)

| ID       | Description                            | Effort |
| -------- | -------------------------------------- | ------ |
| L-ARCH-1 | No API versioning strategy             | Medium |
| L-ARCH-2 | Missing OpenAPI/Swagger documentation  | Medium |
| L-ARCH-3 | No feature flag system                 | Medium |
| L-ARCH-4 | Config scattered across multiple files | Small  |
| L-ARCH-5 | No graceful shutdown handler           | Small  |

### Frontend/UX (15 Low)

| ID      | Description                                          | Effort |
| ------- | ---------------------------------------------------- | ------ |
| L-FE-1  | No dark mode support                                 | Large  |
| L-FE-2  | Missing favicon variants                             | Small  |
| L-FE-3  | No print stylesheet                                  | Small  |
| L-FE-4  | Console errors visible in dev                        | Small  |
| L-FE-5  | No loading indicator on route transitions            | Small  |
| L-FE-6  | Inconsistent spacing/padding                         | Small  |
| L-FE-7  | No animation/transition consistency                  | Medium |
| L-FE-8  | Missing meta description tags                        | Small  |
| L-FE-9  | No Open Graph tags for link previews                 | Small  |
| L-FE-10 | Scrollbar styling inconsistent                       | Small  |
| L-FE-11 | No 404 page for unknown routes                       | Small  |
| L-FE-12 | Footer missing or incomplete                         | Small  |
| L-FE-13 | No user preference persistence (table density, etc.) | Medium |
| L-FE-14 | Tooltip delays inconsistent                          | Small  |
| L-FE-15 | No keyboard shortcut documentation                   | Small  |

### Test Quality (3 Low)

| ID       | Description                      | Effort |
| -------- | -------------------------------- | ------ |
| L-TEST-1 | No test coverage reporting in CI | Small  |
| L-TEST-2 | Test file naming inconsistent    | Small  |
| L-TEST-3 | No visual regression tests       | Large  |

### DevOps/CI (8 Low)

| ID      | Description                              | Effort |
| ------- | ---------------------------------------- | ------ |
| L-OPS-1 | No Dependabot/Renovate for auto-updates  | Small  |
| L-OPS-2 | Missing .dockerignore optimization       | Small  |
| L-OPS-3 | No multi-stage Docker build for frontend | Medium |
| L-OPS-4 | Missing PR template                      | Small  |
| L-OPS-5 | No CODEOWNERS file                       | Small  |
| L-OPS-6 | CI cache not optimized                   | Small  |
| L-OPS-7 | No staging environment                   | Large  |
| L-OPS-8 | Missing release tagging strategy         | Small  |

---

## Priority Roadmap

### Sprint 1: Security Emergency (Week 1)

- [x] ~~C-SEC-1: Fix SQL injection~~ DONE
- [x] ~~C-SEC-2: Remove secrets from git~~ DONE (config only, user must run git rm)
- [x] ~~C-SEC-3: Add admin role authorization~~ DONE
- [ ] C-ARCH-2: Fix WebSocket room hijack
- [ ] C-ARCH-3: Fix dashboard layout org scoping
- [ ] H-SEC-1: Telnyx webhook authentication
- [ ] H-SEC-2: Redis authentication (partially done in secrets fix)
- [ ] H-SEC-4: Update vulnerable dependencies

### Sprint 2: Performance & Stability (Week 2-3)

- [ ] C-PERF-1: Add missing DB indexes on alerts
- [ ] C-PERF-2: Add index on units.lastReadingAt
- [ ] C-PERF-4: Add unbounded SELECT hard cap
- [ ] C-CQ-1: Create safeJsonParse utility
- [ ] C-CQ-2: Remove hardcoded fake telemetry
- [ ] H-PERF-5: Add pagination to alerts
- [ ] H-PERF-6: Fix N+1 query pattern

### Sprint 3: Frontend Quality (Week 3-4)

- [ ] C-FE-1: Create PWA manifest
- [ ] C-FE-3: Add form autocomplete attributes
- [ ] C-PERF-3: Route-level code splitting
- [ ] H-FE-6: Fix button touch targets
- [ ] H-FE-1: Add ARIA labels
- [ ] H-FE-4: Consistent loading states

### Sprint 4: DevOps Hardening (Week 4-5)

- [ ] C-OPS-1: Add TLS termination
- [ ] C-OPS-2: Fix GitHub Actions secrets exposure
- [ ] C-OPS-3: Add database backup automation
- [ ] C-OPS-4: Add env validation
- [ ] H-OPS-5: Add Docker image scanning

### Sprint 5: Testing Foundation (Week 5-8)

- [ ] C-TEST-5: Auth middleware edge case tests
- [ ] C-TEST-4: Payment webhook tests
- [ ] H-TEST-3: RBAC isolation tests
- [ ] H-TEST-1: Job processor tests
- [ ] Start component test coverage

### Ongoing: Tech Debt Reduction

- [ ] H-ARCH-4: Delete supabase/functions/ dead code
- [ ] H-ARCH-2: Remove dead Supabase error codes
- [ ] H-CQ-4: Split large files (>800 lines)
- [ ] M-ARCH-3: Replace console.log with structured logger
- [ ] M-CQ-1: Remove 60+ console.log statements
- [ ] C-FE-2: Migrate forms to React Hook Form (large effort)

---

_Generated by automated 7-domain multi-agent audit. Findings should be verified before implementation._
