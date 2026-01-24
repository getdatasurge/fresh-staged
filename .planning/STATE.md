# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** Food safety data must flow reliably from sensors to alerts without interruption.
**Current focus:** v2.0 planning or production cutover

## Current Position

Milestone: v2.0 Real-Time & Billing — ACTIVE
Phase: 18 of 22 (Stripe Billing) — IN PROGRESS
Plan: 1 of 6 complete
Status: Plan 18-01 complete
Last activity: 2026-01-24 — Completed 18-01 (billing foundation)

Progress: [████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 26% (22/85 plans)

## Completed Milestones

### v1.1 Production Ready (Shipped 2026-01-24)

**6 phases, 31 plans**

- Phase 8: Frontend Auth Cleanup (6 plans)
- Phase 9: Production Environment Hardening (6 plans)
- Phase 10: Database Production Readiness (6 plans)
- Phase 11: Self-Hosted Deployment (4 plans)
- Phase 12: DigitalOcean Deployment (4 plans)
- Phase 13: E2E Validation & Cutover (5 plans)

Archive: `.planning/milestones/v1.1-ROADMAP.md`

### v1.0 Self-Hosted MVP (Shipped 2026-01-23)

**7 phases, 47 plans**

Archive: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

## Performance Metrics

**v1.0 Milestone:**
- Plans completed: 47
- Phases completed: 7

**v1.1 Milestone:**
- Plans completed: 31
- Phases completed: 6
- Requirements completed: 23/24 (AUTH-02 blocked)

**v2.0 Milestone:**
- Plans completed: 22
- Phases completed: 5 (14-real-time-foundation, 15-background-jobs-infrastructure, 16-sms-notifications, 17-email-digests)
- Current phase: 18-stripe-billing (1/6 plans complete)

**Combined:**
- Total plans completed: 22/85
- Total phases: 17 (5 complete in v2.0)
- Milestones shipped: 2 (v1.0, v1.1)

## Accumulated Context

### Decisions

| ID | Decision | Phase | Impact |
|----|----------|-------|--------|
| REALTIME-01 | Custom Socket.io plugin for Fastify 5 | 14-01 | Full control over integration, bypasses fastify-socket.io incompatibility |
| REALTIME-02 | bufferutil/utf-8-validate as optional deps | 14-01 | Performance optimization without breaking changes |
| REALTIME-03 | Setup Socket.io in app.ready() callback | 14-01 | Prevents undefined access, ensures HTTP server initialized |
| REALTIME-04 | WebSocket authentication via socket.handshake.auth.token | 14-02 | Uses existing Stack Auth JWT verification, clear error messages on rejection |
| REALTIME-05 | Organization-scoped room naming convention | 14-02 | Prevents cross-organization message leakage, enables targeted broadcasting |
| REALTIME-06 | Redis adapter optional for local development | 14-02 | Graceful fallback to single-instance mode, no Redis infrastructure required locally |
| REALTIME-07 | Auto-join organization room on connection | 14-02 | Enables org-wide broadcasts, site/unit subscriptions explicit via client events |
| REALTIME-08 | 1-second flush interval for batched broadcasts | 14-03 | Balances real-time feel with network/UI performance, configurable for future tuning |
| REALTIME-09 | Buffer keyed by organization:unit combination | 14-03 | Organization-scoped isolation with per-unit logical batching, efficient memory usage |
| REALTIME-10 | Latest reading cache for instant client feedback | 14-03 | New connections query latest cached reading via get:latest event without waiting |
| REALTIME-11 | Transparent streaming integration | 14-03 | Streaming added as side effect after ingestion, no API response changes |
| REALTIME-12 | Stack Auth getAccessToken() for WebSocket JWT | 14-04 | Async token retrieval from Stack Auth user object |
| REALTIME-13 | TanStack Query cache updates via setQueryData | 14-04 | Multiple query keys updated per sensor batch event with 100-item history limit |
| REALTIME-14 | RealtimeProvider after QueryClientProvider | 14-04 | Ensures auth context and query client available for connection setup |
| REALTIME-15 | Optional socketService parameter for alert evaluator | 14-05 | Enables testing without Socket.io dependency, clear dependency injection pattern |
| REALTIME-16 | Emit events after database mutations in transaction | 14-05 | Events emitted after successful alert creation/resolution/escalation |
| REALTIME-17 | Toast duration based on severity | 14-05 | Critical alerts: 10s, warning/resolved: 5s for appropriate user attention |
| REALTIME-18 | Query cache strategy for alerts | 14-05 | Invalidate lists, update details via setQueryData for instant UI feedback |
| REALTIME-19 | Connection status via tooltip pattern | 14-06 | Non-intrusive status indicator in dashboard header with icon + tooltip |
| REALTIME-20 | E2E verification deferred to staging | 14-06 | Full real-time testing postponed until local development environment available |
| JOBS-01 | Workers use IORedis with maxRetriesPerRequest: null | 15-02 | BullMQ workers require this setting for blocking Redis operations |
| JOBS-02 | Separate Dockerfile.worker from API Dockerfile | 15-02 | Enables independent deployment and scaling of workers vs API |
| JOBS-03 | Process-based health check for workers | 15-02 | Workers don't expose HTTP endpoints, pgrep verifies process running |
| JOBS-04 | stop_grace_period of 30s in production | 15-02 | Allows in-flight jobs to complete before container shutdown |
| JOBS-05 | Redis configured with appendfsync everysec and noeviction | 15-02 | Balances performance with persistence, prevents data loss from eviction |
| QUEUE-01 | Use BullMQ over Bull or Agenda | 15-01 | BullMQ is actively maintained with better TypeScript support and Redis 6+ compatibility |
| QUEUE-02 | QueueService follows SocketService pattern | 15-01 | Consistency with existing codebase, familiar pattern for team |
| QUEUE-03 | BaseJobData enforces organizationId for all jobs | 15-01 | Multi-tenant isolation at type level prevents cross-org job leakage |
| QUEUE-04 | Redis connection optional with graceful fallback | 15-01 | Enables local development without Redis infrastructure |
| BOARD-01 | Wrap Bull Board in plugin context with onRequest auth hook | 15-03 | Ensures all dashboard routes require JWT validation without modifying Bull Board internals |
| BOARD-02 | Mount dashboard at /admin/queues (not /api/admin/queues) | 15-03 | Follows Bull Board conventions and plan requirements for clean dashboard path |
| BOARD-03 | Separate health check endpoints at /api/admin | 15-03 | Provides API-friendly JSON endpoints for programmatic queue monitoring |
| TEST-01 | Test file path adapted to project convention | 15-04 | Tests in backend/tests/services/ not src/__tests__/ |
| TEST-02 | Integration tests require running Redis | 15-04 | Skip with docker compose down, run with docker compose up redis |
| SMS-01 | Use Telnyx SDK v5.11.0 with maxRetries: 0 | 16-01 | BullMQ handles retries, SDK auto-retry would conflict |
| SMS-02 | 11 unrecoverable + 10 retryable error codes | 16-01 | Proper categorization prevents wasted retries on permanent failures |
| SMS-03 | Standard exponential backoff without jitter | 16-01 | BullMQ doesn't natively support jitter; can add custom backoff if needed |
| SMS-04 | Mask phone numbers in logs (first 5, last 2 chars) | 16-02 | Privacy protection while maintaining debuggability |
| SMS-05 | Delivery record updates don't throw on failure | 16-02 | Database update failure shouldn't fail successful SMS send |
| SMS-06 | Queue SMS async after escalation to avoid blocking | 16-03 | Don't await queueAlertSms - use fire-and-forget with .catch() |
| SMS-07 | Rate limit by user via notification_deliveries lookup | 16-03 | Check sent/delivered SMS in 15-minute window per user |
| SMS-08 | Filter recipients by smsEnabled profile flag | 16-03 | Only users with smsEnabled=true receive SMS alerts |
| DIGEST-01 | Store digestSiteIds as JSON text | 17-01 | Simpler than junction table for UUID array, fast enough for preferences |
| DIGEST-02 | HH:MM format for digestDailyTime (varchar(5)) | 17-01 | Compact and human-readable, validated via regex |
| DIGEST-03 | Weekly digest uses same dailyTime as daily | 17-01 | Consistent user experience, Monday at user's preferred time |
| DIGEST-04 | Map-based intermediate grouping for digest data | 17-02 | Efficient O(n) pass to build nested structure, then convert to arrays |
| DIGEST-05 | 5-alert limit per unit in digest emails | 17-02 | Prevents email bloat while showing representative sample per unit |
| UNSUB-01 | JWT token for unsubscribe with 30-day expiry | 17-03 | Secure, stateless, no DB lookup needed for validation |
| UNSUB-02 | UNSUBSCRIBE_SECRET with JWT_SECRET fallback | 17-03 | Dedicated secret optional, works with existing setup |
| UNSUB-03 | Endpoint at /unsubscribe (no /api prefix) | 17-03 | Public user-facing link from emails |
| BILLING-01 | Manual migration SQL for stripe_events | 18-01 | drizzle-kit ESM resolution issues, follows existing pattern |
| BILLING-02 | Meter event names as literal union type | 18-01 | 'active_sensors' | 'temperature_readings' for compile-time safety |
| BILLING-03 | 5 attempts with 5s backoff for meter reporting | 18-01 | Stripe meter events are idempotent, longer delays safe |

See also: .planning/PROJECT.md Key Decisions table

### Tech Debt Carried Forward

- AUTH-02: @supabase/supabase-js still in package.json (100+ files use for database queries)
- Production data migration pending Supabase access (DEFERRED)

### Blockers/Concerns

- AUTH-02 blocked until database queries migrate to backend API (v2.0 scope)
- Production data migration requires Supabase access (DEFERRED)
- Real-time E2E verification requires local staging environment (Phase 01 plans pending)
- TTN device tests failing: 10 tests in ttn-devices.test.ts returning 500 errors (needs debugging)
- Worker container verified working locally, deployment pending for production

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Remove Supabase references from README and project configuration | 2026-01-24 | 62c8e17 | [001-remove-supabase-references-from-readme-a](./quick/001-remove-supabase-references-from-readme-a/) |
| 002 | Install Stripe AI and wshobson/agents skills for Phase 18 billing and TypeScript patterns | 2026-01-24 | 5d75913 | [002-install-relevant-skills-from-skills-sh-f](./quick/002-install-relevant-skills-from-skills-sh-f/) |
| 003 | Install 21 additional Claude Code skills from 11 repositories | 2026-01-24 | N/A | [003-install-21-additional-skills-from-skills](./quick/003-install-21-additional-skills-from-skills/) |

## Session Continuity

**Last session:** 2026-01-24
**Stopped at:** Completed 18-01-PLAN.md
**Resume file:** None
**Next action:** Execute 18-02-PLAN.md (webhook endpoint)

---

*State updated: 2026-01-24 after completing 18-01-PLAN.md*
