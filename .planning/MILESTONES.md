# Project Milestones: FreshTrack Pro Migration

## v2.8 Production Polish (Shipped: 2026-01-30)

**Delivered:** Fixed 3 production issues: useSuperAdmin context error, ServiceWorker uncaught promise rejection on self-signed SSL, and WebSocket reconnection flicker from JWT refresh race condition.

**Phases completed:** 49-51 (3 plans total)

**Key accomplishments:**

- SuperAdmin Safe Default — `useSuperAdmin` returns SUPER_ADMIN_DEFAULT constant instead of throwing when context unavailable during initial render
- ServiceWorker Graceful Handling — Replaced auto-generated `registerSW.js` (no `.catch()`) with React hook using `onRegisterError` callback for silent degradation on self-signed SSL
- Socket.io Auth Callback — Converted from imperative `socket.auth = { token }` to `auth: (cb) => {...}` callback pattern that Socket.io invokes on every connect/reconnect, eliminating async race condition
- ConnectionStatus Debounce — 500ms delay before showing connecting spinner suppresses brief visual transitions during reconnection

**Stats:**

- 18 commits, 28 files changed, +2,715 / -57 lines
- 3 phases, 3 plans
- 7/7 requirements shipped
- Timeline: 2026-01-30

**Git range:** `36f7d8f` → `66c10fd`

**What's next:** Next milestone planning

---

## v2.7 tRPC Client Fix (Shipped: 2026-01-30)

**Delivered:** Fixed tRPC runtime crash preventing React from mounting in production by migrating 30+ `.mutate()`/`.query()` proxy calls to `useTRPCClient()`, cleaning dependencies, and fixing production URL configuration and Caddy routing.

**Phases completed:** 46-48 (5 plans total)

**Key accomplishments:**

- Dependency Cleanup — Removed phantom `@trpc/react-query`, pinned all tRPC packages to 11.9.0, upgraded frontend Zod from v3 to v4
- tRPC Proxy Migration — 30+ `.mutate()`/`.query()` calls across 12 files migrated from `useTRPC()` proxy to `useTRPCClient()` vanilla client
- Root Cause Eliminated — `TypeError: e[i] is not a function` completely resolved, React mounts successfully with 5 root children
- Production URL Fix — Changed `|| 'http://localhost:3000'` fallback to `import.meta.env.DEV` ternary in 3 frontend files
- Caddy Routing Fix — Added `/trpc/*` and `/socket.io/*` reverse proxy routes, switched to port-based matching for IP deployments
- Full Verification — 4/4 Playwright smoke tests pass, user-verified browser console clean, Socket.io connects through Caddy

**Stats:**

- 15 commits, 47 files changed, +1,768 / -597 lines
- 3 phases, 5 plans
- 10/10 requirements shipped
- Timeline: 2026-01-29 → 2026-01-30

**Git range:** `55b2350` → `0b6d664`

**What's next:** Next milestone planning

---

## v2.6 Production Deployment (Shipped: 2026-01-29)

**Delivered:** Full production deployment to self-hosted Ubuntu VM at 192.168.4.181 with 14 Docker containers, Caddy reverse proxy with self-signed SSL, and comprehensive E2E smoke testing infrastructure.

**Phases completed:** 45 (3 plans total)

**Key accomplishments:**

- VM Prerequisites Validation — Ubuntu 24.04 LTS, 4 vCPU, 8GB RAM, 96GB disk, IP-based deployment (192.168.4.181)
- Docker Deployment — 14 containers deployed via `docker-compose.yml` + `compose.production.yaml`, all services healthy (backend, worker, frontend, PostgreSQL, Redis, MinIO, Caddy, Prometheus, Grafana, Loki, Promtail, Uptime Kuma, Node Exporter, Blackbox)
- Post-Deployment Validation — TLS 1.3 verified, API health endpoint healthy (DB 1ms, Redis 1ms), webhooks configured
- Bug Fixes Deployed — TTNCredentialsPanel infinite refetch loop (429 errors), excessive useEffectiveIdentity logging, Socket.io reconnection spam
- Playwright E2E Infrastructure — `playwright.production.config.ts` and `e2e/production-smoke.spec.ts` with 4 smoke tests (all pass)

**Stats:**

- 3 plans, 3 commits for bug fixes
- 14 Docker containers running, 10 with health checks passing
- Disk usage 17% (16GB/96GB)

**Requirements shipped:**

- DEPLOY-01 (VM provisioned), DEPLOY-03 (services running), DEPLOY-04 (external services configured)
- DEPLOY-02 (domain/SSL) — partial: IP-based with self-signed cert instead of domain + Let's Encrypt
- DEPLOY-05 (E2E validation) — partial: infrastructure works but app doesn't render (tRPC crash)

**Critical issue discovered:**

- React fails to mount due to `TypeError: e[i] is not a function` — tRPC proxy incompatibility with `@trpc/tanstack-react-query` v11
- 30+ call sites use `.mutate()`/`.query()` on `useTRPC()` proxy which only supports `.mutationOptions()`/`.queryOptions()`
- Phantom `@trpc/react-query` dependency, tRPC version mismatch, Zod version mismatch

**What's next:** v2.7 tRPC Client Fix to unblock production app render

---

## v2.5 TTN Test Fixes (Shipped: 2026-01-29)

**Delivered:** Fixed 15 pre-existing test failures in TTN bootstrap endpoint by mocking subscription middleware.

**Phases completed:** 44 (1 plan total)

**What's next:** v2.6 Production Deployment

---

## v2.4 Tech Debt Cleanup (Shipped: 2026-01-29)

**Delivered:** Complete Supabase removal — 35 files migrated to tRPC, 60 tests fixed, supabase-placeholder.ts deleted, zero Supabase imports remaining.

**Phases completed:** 38-43 (16 plans total)

**What's next:** v2.5 TTN Test Fixes

---

## v2.3 Deployment Orchestration (Shipped: 2026-01-29)

**Delivered:** Complete one-script deployment automation with checkpoint-based recovery, multi-layer verification, secure credential display, and comprehensive documentation for self-service deployment.

**Phases completed:** 34-37 (11 plans total)

**Key accomplishments:**

- Deployment Orchestration — Checkpoint-based deployment with resume capability via deploy-orchestrated.sh and deploy-lib.sh, 10-phase workflow integrating with existing preflight, prereq, and config libraries
- Multi-Layer Verification — verify-deployment.sh validates 6 checks: service health endpoints (VERIFY-01), SSL certificates (VERIFY-02), dashboard accessibility (VERIFY-03), E2E pipeline (VERIFY-04), monitoring stack (VERIFY-05), and 3-consecutive-pass stability (VERIFY-06)
- Secure Credential Display — post-deploy-lib.sh outputs credentials to `/dev/tty` only (prevents log capture), with masking showing first/last 4 characters for identification
- Grafana Sensor Dashboard — 6-panel freshtrack-sensors.json dashboard auto-provisioned with active sensors, readings count, temperature timeseries, and battery gauge
- Comprehensive Documentation — Prerequisites guide with VM specs/DNS/firewall checklists, step-by-step deployment walkthrough with 5-phase table, troubleshooting playbook with VERIFY-* error codes and quick reference table, and 720-line operations manual

**Stats:**

- 45 commits across v2.3 development
- 4 phases, 11 plans
- 2,836 lines added to scripts/ and docs/
- Same day from milestone start to ship (2026-01-29)

**Git range:** `39b73bb` → `a8da76b`

**Requirements shipped:**

- DEPLOY-01 through DEPLOY-05 (Deployment Orchestration)
- VERIFY-01 through VERIFY-06 (Verification)
- POST-01 through POST-05 (Post-Deployment Setup)
- DOCS-01 through DOCS-04 (Documentation)

**Tech debt carried forward:**

- 53 test failures need mock updates (38 frontend, 15 backend pre-existing)
- supabase-placeholder.ts remains (intentional graceful degradation)
- SensorSimulatorPanel edge function call kept (admin testing tool)

**What's next:** Next milestone planning — potential areas include mobile PWA improvements, advanced analytics, or new product capabilities

---

## v2.2 Technical Debt & Stabilization (Shipped: 2026-01-29)

**Delivered:** Complete elimination of Supabase edge function dependency, stabilized TTN integration on tRPC backend, error handling UI integration with graceful degradation, and tRPC pattern standardization across 165+ call sites.

**Phases completed:** 27-33 (27 plans total, Phase 29 skipped)

**Key accomplishments:**

- TTN SDK Integration — Backend services now own entire TTN lifecycle (settings, provisioning, diagnostics) via tRPC procedures, replacing 6 Supabase edge function calls
- Edge Function Migration — 15 remaining edge function calls migrated to tRPC across reports export, Telnyx integration, TTN device diagnostics, and onboarding flows
- Reports Export — Real database queries from sensorReadings and manualTemperatureLogs tables with CSV/HTML formatting, date range filtering, and site/unit scoping
- Telnyx Integration — Real API calls for toll-free verification status and webhook configuration using official Telnyx SDK
- Error Handling UI — MigrationErrorBoundary integrated into DashboardLayout, SupabaseMigrationError class with isSupabaseMigrationError helper, graceful degradation across 6+ UI components
- tRPC Pattern Fix — Standardized codebase to createTRPCContext (queryOptions pattern) fixing app crash, migrated 20+ files to consistent pattern

**Stats:**

- 122 commits across v2.2 development
- 6 active phases (27, 28, 30, 31, 32, 33), 27 plans, Phase 29 skipped
- 5 days from milestone start to ship (2026-01-25 → 2026-01-29)
- 18/18 cross-phase integration links verified
- 3/3 E2E flows complete (TTN Settings, Report Export, Error Handling)

**Git range:** Phases 27-33

**Gap closure phases:**

- Phase 31: TTN Provisioning UI Migration — Closed integration gap (TTN UI → tRPC)
- Phase 32: Remaining Edge Function Migration — Closed 15 edge function calls in 12 files
- Phase 33: Error Handling UI Integration — Closed error boundary integration gap + tRPC pattern fix

**Tech debt resolved:**

- All edge function calls migrated to tRPC (except intentional SensorSimulator)
- TTN provisioning flow now works end-to-end
- Reports export returns real data from database
- Telnyx verification/webhook uses real API calls
- Error boundaries catch and display migration errors gracefully

**Tech debt carried forward:**

- 53 test failures need mock updates (38 frontend, 15 backend pre-existing)
- supabase-placeholder.ts remains (intentional graceful degradation)
- SensorSimulatorPanel edge function call kept (admin testing tool)

**What's next:** Next milestone planning — potential areas include completing v2.1 deployment orchestration, mobile PWA improvements, or new product capabilities

---

## v2.0 Real-Time & Billing (Shipped: 2026-01-25)

**Delivered:** Real-time dashboard updates, background job processing, SMS/email notifications, Stripe billing integration, and comprehensive backend API migration from Supabase to tRPC.

**Phases completed:** 14-21 (40 plans total)

**Key accomplishments:**

- Real-Time Foundation — Socket.io server with Redis adapter for horizontal scaling, multi-tenant room architecture with organization-based isolation, JWT authentication on WebSocket connections, and live sensor data streaming to connected dashboard clients
- Background Jobs Infrastructure — BullMQ job queue integrated with Fastify backend, worker containers deployable separately from API, Bull Board dashboard with authentication for queue monitoring, and E2E verification of job processing
- SMS & Email Notifications — Telnyx SMS integration migrated from Edge Function to BullMQ worker with custom retry strategies based on error codes, user-configurable email digest scheduling with site filtering and grouped alert display, one-click unsubscribe with secure JWT tokens, and plain text email fallback for deliverability
- Stripe Billing — Subscription checkout flow, usage-based metering for active sensor count (last_during_period) and temperature reading volume (sum aggregation), webhook handler with signature verification and idempotent processing, Customer Portal for self-service billing, and subscription status enforcement middleware
- Backend API Migration — tRPC v11 with Fastify adapter, 15 domain routers created (organizations, sites, areas, units, readings, alerts, preferences, admin, assets, availability, smsConfig, payments, notificationPolicies, ttnSettings, escalationContacts), 169 backend tests passing, type safety across frontend-backend boundary, 9 frontend hooks migrated from Supabase edge functions/queries to tRPC procedures, and clear documentation of 6 TTN hooks requiring future TTN SDK integration

**Stats:**

- 83 commits across v2.0 development
- 472 files changed, +94,295 insertions, -5,816 deletions
- 8 phases, 40 plans
- 2 days from milestone start to ship (2026-01-24 → 2026-01-25)

**Git range:** `256c909` → `48a6e98`

**Requirements shipped:**

- RT-01 through RT-05 (Real-Time Foundation)
- BG-01 through BG-06 (Background Jobs & Notifications)
- BILL-01 through BILL-06 (Stripe Billing)
- API-01 through API-07 partial (Backend API Migration — first batch complete, TTN SDK integration deferred)

**Tech debt resolved:**

- Significant progress on AUTH-02: 9 frontend hooks migrated from Supabase to tRPC (organizations, sites, areas, units, readings, alerts, preferences, escalation contacts, TTN settings read/write)
- Backend now provides 15 tRPC routers with 169 passing tests
- Type safety enforced across frontend-backend boundary

**Tech debt carried forward:**

- AUTH-02 partial: 6 TTN hooks require backend TTN SDK integration (@ttn-lw/grpc-web-api-client) and BullMQ job queue for provisioning workflow (useTTNApiKey, useTTNWebhook, useTTNSetupWizard, useCheckTtnProvisioningState, useGatewayProvisioningPreflight, useTTNDeprovision)
- 11 additional hooks outside Phase 21 scope still use Supabase (to be addressed in future milestone)

**What's next:** Next milestone planning — potential areas include TTN SDK integration for complete Supabase removal, additional real-time features, advanced billing analytics, or new product capabilities

---

## v1.1 Production Ready (Shipped: 2026-01-24)

**Delivered:** Production-ready deployment infrastructure with PgBouncer connection pooling, automated backups, multi-target deployment (self-hosted + DigitalOcean), and comprehensive E2E validation suite.

**Phases completed:** 8-13 (31 plans total)

**Key accomplishments:**

- Complete frontend auth migration with all hooks using Stack Auth (AUTH-01, AUTH-03 validated)
- Production environment hardening with Docker Secrets, resource limits, health checks, and deployment notifications
- PgBouncer connection pooling with transaction mode, backend compatibility audit, and Prometheus metrics
- Automated daily PostgreSQL backups to MinIO with 30-day retention and tested restoration procedure
- SSL certificate expiration monitoring with Blackbox Exporter and Prometheus alerts
- Self-hosted deployment automation with DNS pre-check, health validation, and automatic rollback
- DigitalOcean Droplet deployment with managed PostgreSQL integration and cost comparison
- E2E test suite validating sensor pipeline, alert notifications, migration timing, and zero-downtime deployment

**Stats:**

- 345 commits
- ~4,500 lines of scripts/configuration created
- 6 phases, 31 plans
- 2 days from milestone start to ship (2026-01-23 → 2026-01-24)

**Git range:** Phase 8 → Phase 13

**Requirements shipped:** 23/24 (AUTH-02 blocked — Supabase client needed for database queries until backend API migration)

**Tech debt resolved:**

- FE-03: ~30 hooks using Supabase auth → All migrated to Stack Auth
- verify.ts checksum → Validated via TEST-03 migration timing tests

**Tech debt carried forward:**

- AUTH-02: @supabase/supabase-js in package.json (100+ files use for database queries)
- Production data migration pending Supabase access (DEFERRED)

**What's next:** v2.0 planning — real-time subscriptions, background job processing, SMS notifications, billing integration

---

## v1.0 Self-Hosted MVP (Shipped: 2026-01-23)

**Delivered:** Complete migration of FreshTrack Pro from Supabase to self-hosted stack with Fastify API, PostgreSQL/Drizzle ORM, Stack Auth, and production-ready infrastructure.

**Phases completed:** 1-7 (47 plans total)

**Key accomplishments:**

- Complete backend infrastructure with Fastify API server, Drizzle ORM, and 22-table PostgreSQL schema
- Stack Auth authentication with JWT verification, RBAC role hierarchy (owner > admin > manager > staff > viewer), and organization context isolation
- REST API with full CRUD for organizations, sites, areas, and units — 91+ passing tests
- Sensor data pipeline with bulk ingestion, API key authentication, and real-time alert evaluation state machine
- Frontend migration with 27+ hooks converted to Stack Auth, typed API client (Ky), and TanStack Query integration
- Data migration scripts supporting 23-table export/import with Supabase-to-Stack-Auth user ID mapping
- Production infrastructure with Docker multi-stage builds, Caddy reverse proxy, and Prometheus/Grafana/Loki observability stack

**Stats:**

- 856 files created/modified
- ~125,400 lines of TypeScript (37,921 backend + 86,127 frontend + 1,354 migration scripts)
- 7 phases, 47 plans, ~200 tasks
- 1,171 commits

**Git range:** `bebc3a2` → `319fd79`

**Tech debt accepted:**

- FE-03: ~30 hooks retain Supabase auth calls (marked with TODO markers)
- PROD-05: Data migration pending Supabase access

**What's next:** Complete frontend auth cleanup, execute data migration when Supabase access available, production cutover

---
