# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** Food safety data must flow reliably from sensors to alerts without interruption.
**Current focus:** v2.0 planning or production cutover

## Current Position

Milestone: v2.0 Real-Time & Billing — ACTIVE
Phase: 21 of 22 (Backend API Migration - Completion) — IN PROGRESS
Plan: 3 of 5 complete
Status: In progress
Last activity: 2026-01-25 — Completed 21-03-PLAN.md (Admin/Utility Domain tRPC Routers)

Progress: [█████████████████░░░░░░░░░░░░░░░░░░░░░░░░░] 45% (39/86 plans)

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
- Plans completed: 37
- Phases completed: 8 (14-real-time-foundation, 15-background-jobs-infrastructure, 16-sms-notifications, 17-email-digests, 18-stripe-billing, 19-backend-api-migration-foundation, 20-backend-api-migration-core)
- Current: Phase 21, Plan 1 of 5 complete

**Combined:**
- Total plans completed: 37/86
- Total phases: 20 (8 complete in v2.0)
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
| METER-01 | Lazy-initialized Stripe client singleton for meter events | 18-02 | Consistent with webhook service pattern |
| METER-02 | Return {success, error} instead of throwing for meter ops | 18-02 | Callers handle failures gracefully without try/catch |
| WEBHOOK-01 | Idempotency check at start of handleWebhookEvent | 18-02 | Prevents any duplicate processing of retried webhooks |
| WEBHOOK-02 | Record event after all handlers complete | 18-02 | Ensures partial processing doesn't mark event as done |
| SUBSCR-01 | ACTIVE_STATUSES = ['active', 'trial'] only | 18-03 | Canceled/past_due/etc block access, only active/trial allow |
| SUBSCR-02 | Hierarchical device count via join chain | 18-03 | devices -> units -> areas -> sites ensures multi-tenant isolation |
| METER-03 | Fire-and-forget pattern for meter jobs | 18-04 | Queue meter events without awaiting to avoid blocking ingestion API |
| METER-04 | Report insertedCount not requested count | 18-04 | Accurate billing based on actual inserted readings |
| SCHED-01 | Hourly cron '0 * * * *' for sensor count | 18-05 | Consistent hourly reporting aligned with billing periods |
| SCHED-02 | Dynamic import in processor for scheduler | 18-05 | Avoids circular dependency between processor and scheduler service |
| SCHED-03 | Remove existing repeatable job before creating | 18-05 | Prevents duplicate scheduler jobs on API restart |
| SCHED-04 | Initial report on startup | 18-05 | Ensures sensor counts are current when API starts |
| TEST-03 | Mock Stripe API for unit tests | 18-06 | Vitest mocks keep tests fast and deterministic |
| TEST-04 | Update queue test count after METER_REPORTING | 18-06 | Queue service now has 3 queues after billing phase |
| TRPC-01 | Use tRPC v11 with Fastify adapter | 19-01 | Type-safe API layer with automatic client generation, native Fastify integration |
| TRPC-02 | Reuse existing JWT verification from Stack Auth | 19-01 | Context creation uses same verifyAccessToken as REST middleware |
| TRPC-03 | Support both auth header formats | 19-01 | x-stack-access-token (custom) and Authorization Bearer (standard) |
| TRPC-04 | Organization middleware validates membership | 19-01 | orgProcedure checks user role and creates/retrieves profile |
| TRPC-05 | Type narrowing via middleware composition | 19-01 | protectedProcedure narrows user to non-null, orgProcedure extends this |
| TRPC-06 | Use getRawInput() for middleware input access | 19-02 | Middleware must use getRawInput() not input parameter in tRPC v11 |
| ROUTER-01 | Domain router composition pattern | 19-02 | Export domain routers, import into appRouter, mount at namespace |
| ROUTER-02 | Role-based access in procedure handlers | 19-02 | Check ctx.user.role for permission-gated operations like update |
| TRPC-06 | Use createTRPCContext for React hooks | 19-03 | Official tRPC v11 pattern for TanStack React Query integration |
| TRPC-07 | TRPCWrapper component pattern | 19-03 | Needs access to useUser (StackProvider) and useQueryClient (QueryClientProvider) |
| TRPC-08 | useMemo for client recreation | 19-03 | Recreate client when user changes (login/logout) |
| TRPC-09 | Auth token from Stack Auth user.getAuthJson() | 19-03 | All tRPC calls authenticated via x-stack-access-token header |
| TRPC-10 | Use inferRouterInputs/inferRouterOutputs for type inference | 19-04 | Official tRPC v11 pattern for extracting types from router |
| TRPC-11 | Deprecated wrapper pattern for backward compatibility | 19-04 | Allow gradual component migration without breaking existing code |
| TRPC-12 | queryOptions pattern for TanStack React Query | 19-04 | Allows custom cache configuration while maintaining type inference |
| TRPC-13 | Mock JWT verification in E2E tests | 19-04 | Avoid Stack Auth API calls and environment setup in test environment |
| ROUTER-03 | Sites/areas follow organizations.router.ts pattern | 20-01 | Consistency across all domain routers for CRUD operations |
| ROUTER-04 | Admin/owner role check for mutations | 20-01 | Matches existing REST route authorization using ['admin', 'owner'].includes() |
| ROUTER-05 | Areas validate site access via service layer | 20-01 | Returns NOT_FOUND for invalid site, consistent error handling |
| ROUTER-06 | Manager role for unit mutations | 20-02 | Matches REST requireRole('manager') for unit CRUD operations |
| ROUTER-07 | Staff role for alert mutations | 20-02 | Matches REST requireRole('staff') for acknowledge/resolve operations |
| ROUTER-08 | Readings router is query-only | 20-02 | Bulk ingest stays REST with API key auth, tRPC for queries only |
| ROUTER-09 | CONFLICT error for already-acknowledged alerts | 20-02 | Matches REST 409 response for state transition errors |
| TYPE-01 | AlertStatusFilter uses 'active' not 'pending' | 20-05 | Frontend type aligned with backend AlertStatusSchema |
| TYPE-02 | Unit mutation types use tempMin/tempMax | 20-05 | Field names match backend CreateUnitSchema/UpdateUnitSchema |
| ROUTER-10 | protectedProcedure for user-scoped preferences | 21-01 | No org context needed for digest preferences |
| ROUTER-11 | Fire-and-forget scheduler sync for preferences | 21-01 | Don't block response waiting for BullMQ scheduler update |
| ROUTER-12 | SMS config upsert admin/owner gated | 21-01 | Billing-related config restricted to org admins |
| ASSETS-01 | Pre-signed URL pattern for asset uploads | 21-03 | Avoids tRPC body size limits, enables direct S3/MinIO uploads |
| ASSETS-02 | Generated keys include timestamp + random | 21-03 | Ensures unique keys without collisions |
| AVAIL-01 | Public procedures for availability checks | 21-03 | No auth required for registration validation |

See also: .planning/PROJECT.md Key Decisions table

### Tech Debt Carried Forward

- AUTH-02: @supabase/supabase-js still in package.json (100+ files use for database queries)
- Production data migration pending Supabase access (DEFERRED)

### Blockers/Concerns

- AUTH-02 blocked until database queries migrate to backend API (v2.0 scope)
- Production data migration requires Supabase access (DEFERRED)
- Real-time E2E verification requires local staging environment (Phase 01 plans pending)
- TTN device tests failing: 15 tests in ttn-devices.test.ts returning 500 errors (needs debugging)
- Worker container verified working locally, deployment pending for production

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Remove Supabase references from README and project configuration | 2026-01-24 | 62c8e17 | [001-remove-supabase-references-from-readme-a](./quick/001-remove-supabase-references-from-readme-a/) |
| 002 | Install Stripe AI and wshobson/agents skills for Phase 18 billing and TypeScript patterns | 2026-01-24 | 5d75913 | [002-install-relevant-skills-from-skills-sh-f](./quick/002-install-relevant-skills-from-skills-sh-f/) |
| 003 | Install 21 additional Claude Code skills from 11 repositories | 2026-01-24 | N/A | [003-install-21-additional-skills-from-skills](./quick/003-install-21-additional-skills-from-skills/) |

## Session Continuity

**Last session:** 2026-01-25
**Stopped at:** Completed 21-03-PLAN.md (Admin/Utility Domain tRPC Routers)
**Resume file:** None
**Next action:** Execute 21-02-PLAN.md (TTN Integration tRPC Routers)

---

*State updated: 2026-01-25 after completing Plan 21-03 (Admin/Utility Domain tRPC Routers)*
