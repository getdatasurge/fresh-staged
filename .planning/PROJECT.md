# FreshTrack Pro Migration

## What This Is

FreshTrack Pro is an IoT-based temperature monitoring system for food safety compliance. v2.0 added real-time dashboard updates via Socket.io, background job processing with BullMQ, SMS/email notifications, Stripe billing integration, and comprehensive backend API migration to tRPC — providing live sensor data streaming, reliable notification delivery, subscription management, and type-safe frontend-backend communication.

## Core Value

**Food safety data must flow reliably from sensors to alerts without interruption.** The self-hosted architecture ensures data sovereignty while the multi-target deployment options provide flexibility for different operational requirements.

## Requirements

### Validated

<!-- Shipped and confirmed valuable -->

**Infrastructure (v1.0)**
- Docker Compose with PostgreSQL, Redis, MinIO — v1.0
- Development scripts and environment template — v1.0
- Drizzle ORM with 22 tables, 14 enums, full migration system — v1.0

**Authentication & RBAC (v1.0)**
- Stack Auth JWT validation with JWKS caching — v1.0
- Role hierarchy (owner > admin > manager > staff > viewer) — v1.0
- Organization context middleware with tenant isolation — v1.0

**Core API (v1.0)**
- REST API with Zod validation for organizations, sites, areas, units — v1.0
- 91+ backend tests covering auth, validation, RBAC — v1.0

**Sensor Data & Alerts (v1.0)**
- Bulk readings ingestion with API key authentication — v1.0
- Alert state machine with threshold evaluation and deduplication — v1.0
- Alert lifecycle (trigger → acknowledge → resolve) — v1.0

**Frontend (v1.0)**
- Typed API client (Ky) with auth interceptor — v1.0
- 27+ hooks migrated to Stack Auth — v1.0
- TanStack Query caching preserved — v1.0

**Data Migration (v1.0)**
- Export/import scripts with 23-table dependency order — v1.0
- Stack Auth user migration with 90-day ID mapping retention — v1.0
- Verification with row counts and MD5 checksums — v1.0

**Production Infrastructure (v1.0)**
- Docker multi-stage builds, Caddy reverse proxy — v1.0
- Prometheus/Grafana/Loki observability stack — v1.0
- Deployment, rollback scripts, Uptime Kuma status page — v1.0

**Frontend Auth (v1.1)**
- All frontend hooks use Stack Auth (AUTH-01) — v1.1
- All auth components use Stack Auth hooks (AUTH-03) — v1.1

**Production Hardening (v1.1)**
- Docker Secrets for sensitive configuration (HARD-01) — v1.1
- Resource limits on all services (HARD-02) — v1.1
- Health checks for zero-downtime deployments (HARD-03) — v1.1
- Production compose overlay (HARD-04) — v1.1
- Build security with .dockerignore (HARD-05) — v1.1
- Deployment notifications (HARD-06) — v1.1

**Database Readiness (v1.1)**
- PgBouncer connection pooling with transaction mode (DB-01) — v1.1
- Backend PgBouncer compatibility audit (DB-02) — v1.1
- Automated daily backups with 30-day retention (DB-03) — v1.1
- Backup restoration procedure documented and tested (DB-04) — v1.1
- SSL certificate monitoring with 30-day alerts (DB-05) — v1.1

**Deployment Targets (v1.1)**
- Self-hosted VM deployment documentation (DEPLOY-01) — v1.1
- Self-hosted deployment scripts with health validation (DEPLOY-02) — v1.1
- SSL/TLS with Let's Encrypt auto-renewal (DEPLOY-03) — v1.1
- DigitalOcean Droplet documentation (DEPLOY-04) — v1.1
- DigitalOcean deployment scripts (DEPLOY-05) — v1.1
- Managed PostgreSQL integration (DEPLOY-06) — v1.1

**E2E Validation (v1.1)**
- Sensor → storage → alert pipeline validated (TEST-01) — v1.1
- Alert notification delivery validated (TEST-02) — v1.1
- Migration timing tested with 100K records (TEST-03) — v1.1
- Zero-downtime deployment validated (TEST-04) — v1.1

**Real-Time Foundation (v2.0)**
- Socket.io server with Redis adapter for horizontal scaling (RT-01) — v2.0
- Multi-tenant room architecture with organization-based isolation (RT-02) — v2.0
- JWT authentication on WebSocket connections (RT-03) — v2.0
- Live sensor data streaming to dashboard clients (RT-04) — v2.0
- Real-time alert notifications delivered (RT-05) — v2.0

**Background Jobs Infrastructure (v2.0)**
- BullMQ integrated with Fastify backend (BG-01) — v2.0
- Worker containers deployable separately from API (BG-02) — v2.0
- Bull Board dashboard with authentication (BG-06) — v2.0

**SMS & Email Notifications (v2.0)**
- Telnyx SMS delivery via BullMQ workers (BG-03) — v2.0
- Custom retry strategies based on Telnyx error codes (BG-04) — v2.0
- Email digest scheduling with site filtering (BG-05) — v2.0

**Stripe Billing (v2.0)**
- Stripe checkout flow creates subscriptions (BILL-01) — v2.0
- Active sensor count metered (BILL-02) — v2.0
- Temperature reading volume metered (BILL-03) — v2.0
- Webhook handler verifies signatures (BILL-04) — v2.0
- Customer Portal for self-service billing (BILL-05) — v2.0
- Subscription status enforcement (BILL-06) — v2.0

**Backend API Migration (v2.0)**
- tRPC v11 infrastructure with Fastify plugin (API-01) — v2.0
- Type sharing between frontend and backend (API-02) — v2.0
- Organizations, sites, areas, units migrated (API-03, API-04) — v2.0
- Readings and alerts migrated (API-05, API-06) — v2.0
- Settings, admin, TTN domains partially migrated (API-07 partial) — v2.0
- 15 tRPC routers, 169 backend tests passing — v2.0
- 9 frontend hooks migrated from Supabase to tRPC — v2.0

**TTN Integration (v2.2)**
- TTN settings/provisioning via tRPC (TTN-01) — v2.2
- TTN provisioning UI wired to tRPC backend (TTN-02) — v2.2
- TTN device diagnostics via tRPC (TTN-03) — v2.2

**Edge Function Migration (v2.2)**
- Reports export with real database queries (EDGE-01) — v2.2
- Telnyx verification status via real API (EDGE-02) — v2.2
- Telnyx webhook configuration via real API (EDGE-03) — v2.2
- All edge function calls migrated to tRPC (EDGE-04) — v2.2

**Error Handling (v2.2)**
- MigrationErrorBoundary integrated into DashboardLayout (ERR-01) — v2.2
- SupabaseMigrationError with isSupabaseMigrationError helper (ERR-02) — v2.2
- Graceful degradation in 6+ UI components (ERR-03) — v2.2

**System Hardening (v2.2)**
- Security headers via @fastify/helmet (SEC-01) — v2.2
- Request body limits and timeouts (SEC-02) — v2.2
- Dependency vulnerability audit complete (SEC-03) — v2.2

**Deployment Orchestration (v2.3)**
- Checkpoint-based deployment with resume capability (DEPLOY-01 to DEPLOY-05) — v2.3
- Multi-layer verification: health, SSL, dashboard, E2E, monitoring, 3-pass (VERIFY-01 to VERIFY-06) — v2.3
- Secure credential display via /dev/tty (POST-01 to POST-05) — v2.3
- Grafana sensor metrics dashboard auto-provisioned — v2.3
- Comprehensive documentation: prerequisites, walkthrough, troubleshooting, operations (DOCS-01 to DOCS-04) — v2.3

### Active

<!-- Current milestone scope — none until /gsd:new-milestone -->

*No active milestone. Run `/gsd:new-milestone` to start next milestone planning.*

### Out of Scope

<!-- Explicit boundaries with reasoning -->

- Dual-write migration strategy — Freeze+Backfill chosen, simpler and lower risk
- Mobile native apps — Web-first, PWA sufficient
- Multi-region deployment — Single region initially
- Kubernetes orchestration — Docker Compose for v1 simplicity
- Self-hosted Stack Auth — Hosted service reduces complexity
- Blue-green/canary deployments — Over-engineering for current scale
- Data migration from Supabase — No access to production Supabase data

## Current State (v2.3 Shipped)

**Codebase:**
- Backend: ~55K LOC TypeScript (Fastify, Drizzle, PostgreSQL, tRPC, Socket.io, BullMQ)
- Frontend: ~100K LOC TypeScript/TSX (React, TanStack Query, tRPC client)
- Migration scripts: 1,354 LOC TypeScript
- Test/deployment scripts: ~7,000 LOC Shell/TypeScript (includes 2,800+ lines added in v2.3)
- 37 phases, 167 plans completed across v1.0, v1.1, v2.0, v2.1, v2.2, and v2.3
- 1,030 backend tests passing, 107 frontend tests passing

**Infrastructure:**
- Docker Compose with 15+ services (backend, worker, Socket.io server, production overlay)
- PgBouncer connection pooling (transaction mode)
- Redis for Socket.io adapter and BullMQ job queue
- Prometheus/Grafana/Loki/Blackbox monitoring stack
- Bull Board dashboard for queue monitoring
- Automated daily backups with MinIO storage
- Multi-target deployment (self-hosted, DigitalOcean)

**Tech Debt:**
- 53 test failures need mock updates (38 frontend, 15 backend pre-existing)
- supabase-placeholder.ts remains (intentional graceful degradation)
- SensorSimulatorPanel edge function call kept (admin testing tool)

**Known Issues:**
- None critical — production ready

## Constraints

- **Preserve Integrations**: TTN, Stripe, Telnyx must continue working
- **Zero Data Loss**: All historical sensor readings must migrate intact
- **Minimal Downtime**: Freeze+Backfill window target < 4 hours
- **Stack Auth Hosted**: Using hosted service for auth
- **Local Dev First**: Must work in docker-compose before cloud

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fastify over Express | Better TypeScript support, schema validation, plugin system | Good — delivered typed API with Zod |
| Drizzle ORM over Prisma | Type-safe, SQL-like API, better migration control | Good — 22 tables, clean migrations |
| Stack Auth over self-hosted | Reduces auth complexity, still portable | Good — JWT validation working |
| Ky over Axios | Lightweight (157KB), built-in retry | Good — clean API client |
| Freeze+Backfill over Dual-Write | Simpler, lower risk, acceptable downtime | Pending — not yet executed |
| Socket.io over raw WebSockets | Built-in reconnection, rooms, Redis adapter | Good — v2.0 real-time streaming working |
| MinIO for object storage | S3-compatible, works same locally and in cloud | Good — integrated |
| BullMQ over Agenda/node-cron | Redis-backed, reliable, good DX | Good — v2.0 job processing working |
| tRPC over REST expansion | Type safety, auto-completion, smaller bundle | Good — 15 routers, 9 hooks migrated |
| Telnyx for SMS | Reliability, error categorization | Good — custom retry strategies working |
| Stripe for billing | Industry standard, webhook reliability | Good — metering and subscriptions working |
| Docker Compose override pattern | Multi-target deployment with shared base | Good — self-hosted + DO working |
| PgBouncer transaction mode | ORM compatible with max_prepared_statements | Good — validated in 10-04 |
| Bash E2E tests over Jest | Portable across deployment targets | Good — works locally and remote |
| Health check-based deployments | Zero-downtime via Docker health checks | Good — >95% success rate |
| createTRPCContext over createTRPCReact | queryOptions pattern used across codebase | Good — 165+ call sites standardized |
| MigrationErrorBoundary wraps children only | Preserve header/sidebar on page errors | Good — graceful degradation working |
| supabase-placeholder with SupabaseMigrationError | Graceful degradation during migration | Good — user-friendly error messages |
| Checkpoint-based deployment | Resume from failure point | Good — v2.3 deploy-orchestrated.sh working |
| /dev/tty for credentials | Prevents log capture of secrets | Good — v2.3 secure display working |
| 3-consecutive-pass health check | Prevents transient false positives | Good — v2.3 stability verification |

---
*Last updated: 2026-01-29 after v2.3 milestone shipped*
