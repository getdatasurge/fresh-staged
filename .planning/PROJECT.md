# FreshTrack Pro Migration

## What This Is

FreshTrack Pro is an IoT-based temperature monitoring system for food safety compliance. v1.1 completed production-ready deployment infrastructure with multi-target support (self-hosted VM, DigitalOcean Droplet), PgBouncer connection pooling, automated backups, and comprehensive E2E validation — deployable on local servers, cloud VMs, or managed services.

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

### Active

<!-- Deferred to v2.0 -->

**v2.0 Real-Time & Background Processing**
- [ ] Real-time subscriptions via Socket.io (RT-01)
- [ ] Live sensor reading updates without page refresh (RT-02)
- [ ] BullMQ job queue for async processing (BG-01)
- [ ] SMS notifications via Telnyx (BG-02)
- [ ] Email digest scheduling (BG-03)

**v2.0 Billing**
- [ ] Stripe subscription integration (BILL-01)
- [ ] Usage-based billing metering (BILL-02)

**v2.0 Enterprise Deployment**
- [ ] AWS ECS/Fargate deployment (ENT-01)
- [ ] Multi-region deployment support (ENT-02)

**v2.0 Backend API Migration**
- [ ] Migrate frontend database queries to backend API (enables AUTH-02)

### Out of Scope

<!-- Explicit boundaries with reasoning -->

- Dual-write migration strategy — Freeze+Backfill chosen, simpler and lower risk
- Mobile native apps — Web-first, PWA sufficient
- Multi-region deployment — Single region initially
- Kubernetes orchestration — Docker Compose for v1 simplicity
- Self-hosted Stack Auth — Hosted service reduces complexity
- Blue-green/canary deployments — Over-engineering for current scale
- Data migration from Supabase — No access to production Supabase data

## Current Milestone: v2.0 Real-Time & Billing

**Focus:** Real-time features, background processing, billing integration, and backend API migration

**Target features:**
- Socket.io real-time subscriptions for live dashboard updates
- BullMQ job queue for SMS notifications and email digests
- Telnyx SMS integration for alert notifications
- Stripe subscription billing
- Backend API migration to enable Supabase client removal (AUTH-02)
- AWS ECS/Fargate deployment option

## Current State (v1.1 Shipped)

**Codebase:**
- Backend: 37,921 LOC TypeScript (Fastify, Drizzle, PostgreSQL)
- Frontend: 86,127 LOC TypeScript/TSX (React, TanStack Query, Ky)
- Migration scripts: 1,354 LOC TypeScript
- Test/deployment scripts: ~4,500 LOC Shell/TypeScript
- 13 phases, 78 plans completed across v1.0 and v1.1
- 91+ backend tests, 45 frontend tests

**Infrastructure:**
- Docker Compose with 12+ services (production overlay)
- PgBouncer connection pooling (transaction mode)
- Prometheus/Grafana/Loki/Blackbox monitoring stack
- Automated daily backups with MinIO storage
- Multi-target deployment (self-hosted, DigitalOcean)

**Tech Debt:**
- AUTH-02: @supabase/supabase-js in package.json (100+ files use for DB queries)
- Production data migration pending Supabase access

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
| Socket.io over raw WebSockets | Built-in reconnection, rooms, Redis adapter | Deferred to v2.0 |
| MinIO for object storage | S3-compatible, works same locally and in cloud | Good — integrated |
| BullMQ over Agenda/node-cron | Redis-backed, reliable, good DX | Deferred to v2.0 |
| Docker Compose override pattern | Multi-target deployment with shared base | Good — self-hosted + DO working |
| PgBouncer transaction mode | ORM compatible with max_prepared_statements | Good — validated in 10-04 |
| Bash E2E tests over Jest | Portable across deployment targets | Good — works locally and remote |
| Health check-based deployments | Zero-downtime via Docker health checks | Good — >95% success rate |

---
*Last updated: 2026-01-24 after v1.1 milestone*
