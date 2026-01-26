# Roadmap: FreshTrack Pro Migration

## Milestones

- **v1.0 Self-Hosted MVP** - Phases 1-7 (shipped 2026-01-23) — [Archive](.planning/milestones/v1.0-ROADMAP.md)
- **v1.1 Production Ready** - Phases 8-13 (shipped 2026-01-24) — [Archive](.planning/milestones/v1.1-ROADMAP.md)
- **v2.0 Real-Time & Billing** - Phases 14-22 (active)

## v2.0 Real-Time & Billing

**Goal:** Add real-time dashboard updates, background job processing, SMS notifications, and Stripe billing integration. Complete backend API migration to remove Supabase client dependency.

**Target features:**
- Socket.io real-time subscriptions for live sensor data
- BullMQ job queue for async processing
- Telnyx SMS integration for alert notifications
- Email digest scheduling
- Stripe subscription billing
- Backend API migration (enables AUTH-02)
- AWS ECS/Fargate deployment option

### Phases

#### Phase 14: Real-Time Foundation

**Goal:** Socket.io server with Redis adapter for horizontal scaling and multi-tenant room architecture
**Depends on:** Phase 13
**Requirements:** RT-01, RT-02, RT-03, RT-04, RT-05
**Plans:** 6 plans

Plans:
- [ ] 14-01-PLAN.md — Socket.io server setup with Fastify plugin
- [ ] 14-02-PLAN.md — Redis adapter and JWT authentication
- [ ] 14-03-PLAN.md — Sensor data streaming with buffering
- [ ] 14-04-PLAN.md — React client integration with TanStack Query
- [ ] 14-05-PLAN.md — Real-time alert notifications
- [ ] 14-06-PLAN.md — Connection status UI and verification

**Success Criteria:**
1. Socket.io integrated with Fastify via fastify-socket.io plugin
2. Redis adapter configured for multi-instance deployments
3. JWT authentication on WebSocket connections
4. Organization-based room isolation working
5. Live sensor readings pushed to connected dashboard clients
6. Real-time alert notifications delivered

---

#### Phase 15: Background Jobs Infrastructure

**Goal:** BullMQ job queue with worker containers and monitoring dashboard
**Depends on:** Phase 13
**Requirements:** BG-01, BG-02, BG-06
**Plans:** 4 plans

Plans:
- [x] 15-01-PLAN.md — BullMQ core setup (plugin + service + types)
- [x] 15-02-PLAN.md — Worker container entry point and Dockerfile
- [x] 15-03-PLAN.md — Bull Board dashboard with authentication
- [x] 15-04-PLAN.md — E2E verification and integration tests

**Success Criteria:**
1. BullMQ integrated with Fastify backend
2. Worker containers deployable separately from API
3. Bull Board dashboard accessible for queue monitoring
4. Job processing verified end-to-end

---

#### Phase 16: SMS Notifications

**Goal:** Telnyx SMS delivery via BullMQ workers with retry strategies
**Depends on:** Phase 15
**Requirements:** BG-03, BG-04
**Plans:** 3 plans

Plans:
- [x] 16-01-PLAN.md — TelnyxService + error categorization config
- [x] 16-02-PLAN.md — SMS processor implementation
- [x] 16-03-PLAN.md — Alert integration + tests

**Success Criteria:**
1. Telnyx integration migrated from Edge Function to BullMQ worker
2. Alert SMS notifications delivered reliably
3. Custom backoff strategy based on Telnyx error codes
4. Rate limiting enforced (15-minute window)

---

#### Phase 17: Email Digests

**Goal:** User-configurable digest scheduling with site filtering and grouped alert display
**Depends on:** Phase 15
**Requirements:** BG-05
**Plans:** 3 plans

Plans:
- [x] 17-01-PLAN.md — Schema & scheduler enhancement (digestDailyTime, digestSiteIds, user-configurable schedule)
- [x] 17-02-PLAN.md — Grouped digest data & templates (site/unit hierarchy, plain text support)
- [x] 17-03-PLAN.md — Unsubscribe & API integration (JWT tokens, /unsubscribe endpoint, processor updates)

**Success Criteria:**
1. Job schedulers use user-configurable daily time (not hardcoded 9 AM)
2. Daily/weekly digest jobs running with timezone-aware scheduling
3. Alerts grouped by site then unit in email templates
4. Site filtering based on user preferences
5. One-click unsubscribe with secure JWT tokens
6. Plain text email fallback for deliverability

---

#### Phase 18: Stripe Billing

**Goal:** Subscription management with usage-based metering
**Depends on:** Phase 13
**Requirements:** BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06
**Plans:** 6 plans

Plans:
- [x] 18-01-PLAN.md — stripeEvents table and meter job types
- [x] 18-02-PLAN.md — StripeMeterService and webhook idempotency
- [x] 18-03-PLAN.md — Subscription enforcement middleware
- [x] 18-04-PLAN.md — Meter reporting processor and ingestion integration
- [x] 18-05-PLAN.md — Worker registration and sensor count scheduler
- [x] 18-06-PLAN.md — Integration tests and E2E verification

**Success Criteria:**
1. Stripe checkout flow creates subscriptions
2. Active sensor count metered (last_during_period aggregation)
3. Temperature reading volume metered (sum aggregation)
4. Webhook handler verifies signatures and processes events
5. Customer Portal accessible for self-service billing
6. Subscription status enforced (limits, access control)

---

#### Phase 19: Backend API Migration - Foundation

**Goal:** tRPC infrastructure and pilot migration (organizations domain)
**Depends on:** Phase 13
**Requirements:** API-01, API-02
**Plans:** 4 plans

Plans:
- [x] 19-01-PLAN.md — tRPC infrastructure setup (Fastify plugin, context, procedures)
- [x] 19-02-PLAN.md — Organizations router with CRUD procedures
- [x] 19-03-PLAN.md — Frontend tRPC client integration
- [x] 19-04-PLAN.md — Organizations API migration and E2E verification

**Success Criteria:**
1. tRPC router configured on Fastify backend
2. Type sharing working between frontend and backend
3. Organizations domain migrated to tRPC
4. Frontend hooks use tRPC procedures
5. E2E verification passing

---

#### Phase 20: Backend API Migration - Core

**Goal:** Migrate sites, areas, units, readings, and alerts domains to tRPC
**Depends on:** Phase 19
**Requirements:** API-03, API-04, API-05, API-06
**Plans:** 5 plans

Plans:
- [x] 20-01-PLAN.md — Sites and Areas tRPC routers with tests
- [x] 20-02-PLAN.md — Units, Readings, and Alerts tRPC routers with tests
- [x] 20-03-PLAN.md — Frontend hooks migration for all domains
- [x] 20-04-PLAN.md — E2E integration tests for all routers
- [x] 20-05-PLAN.md — Gap closure: Fix frontend hook TypeScript types

**Success Criteria:**
1. Sites domain migrated to tRPC
2. Areas domain migrated to tRPC
3. Units domain migrated to tRPC
4. Readings domain migrated to tRPC (query only, bulk ingest stays REST)
5. Alerts domain migrated to tRPC
6. Frontend hooks using tRPC directly
7. E2E tests passing for all domains
8. Frontend TypeScript compilation passes

---

#### Phase 21: Backend API Migration - Completion

**Goal:** Complete migration and remove Supabase client (AUTH-02)
**Depends on:** Phase 20
**Requirements:** API-07, API-08

**Success Criteria:**
1. Settings domain migrated
2. Admin features migrated
3. All feature flags removed (100% tRPC)
4. @supabase/supabase-js removed from package.json
5. AUTH-02 requirement completed

---

#### Phase 22: AWS ECS Deployment (Optional)

**Goal:** AWS ECS/Fargate deployment option with multi-region support
**Depends on:** Phases 14-21
**Requirements:** ENT-01, ENT-02

**Success Criteria:**
1. ECS task definitions for all services
2. Fargate deployment documented
3. Multi-region architecture documented
4. Deployment scripts validated

---

## Completed Work

<details>
<summary>v1.0 Self-Hosted MVP (Phases 1-7) — SHIPPED 2026-01-23</summary>

- [x] Phase 1: Local Development Environment (3/3 plans)
- [x] Phase 2: Database Schema & Migrations (2/2 plans)
- [x] Phase 3: Backend API Foundation (6/6 plans)
- [x] Phase 4: Sensor Data & Alerts (3/3 plans)
- [x] Phase 5: Frontend Migration (4/4 plans)
- [x] Phase 6: Data Migration Scripts (3/3 plans)
- [x] Phase 7: Production Infrastructure (6/6 plans)

**Total:** 7 phases, 47 plans

</details>

<details>
<summary>v1.1 Production Ready (Phases 8-13) — SHIPPED 2026-01-24</summary>

- [x] Phase 8: Frontend Auth Cleanup (6/6 plans)
- [x] Phase 9: Production Environment Hardening (6/6 plans)
- [x] Phase 10: Database Production Readiness (6/6 plans)
- [x] Phase 11: Self-Hosted Deployment (4/4 plans)
- [x] Phase 12: DigitalOcean Deployment (4/4 plans)
- [x] Phase 13: E2E Validation & Cutover (5/5 plans)

**Total:** 6 phases, 31 plans

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Local Development Environment | v1.0 | 3/3 | Complete | 2026-01-23 |
| 2. Database Schema & Migrations | v1.0 | 2/2 | Complete | 2026-01-23 |
| 3. Backend API Foundation | v1.0 | 6/6 | Complete | 2026-01-23 |
| 4. Sensor Data & Alerts | v1.0 | 3/3 | Complete | 2026-01-23 |
| 5. Frontend Migration | v1.0 | 4/4 | Complete | 2026-01-23 |
| 6. Data Migration Scripts | v1.0 | 3/3 | Complete | 2026-01-23 |
| 7. Production Infrastructure | v1.0 | 6/6 | Complete | 2026-01-23 |
| 8. Frontend Auth Cleanup | v1.1 | 6/6 | Complete | 2026-01-23 |
| 9. Production Environment Hardening | v1.1 | 6/6 | Complete | 2026-01-23 |
| 10. Database Production Readiness | v1.1 | 6/6 | Complete | 2026-01-23 |
| 11. Self-Hosted Deployment | v1.1 | 4/4 | Complete | 2026-01-24 |
| 12. DigitalOcean Deployment | v1.1 | 4/4 | Complete | 2026-01-24 |
| 13. E2E Validation & Cutover | v1.1 | 5/5 | Complete | 2026-01-24 |

**Total:** 13 phases, 78 plans — 2 milestones shipped

### v2.0 Real-Time & Billing (Active)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 14. Real-Time Foundation | v2.0 | 6/6 | Complete | 2026-01-24 |
| 15. Background Jobs Infrastructure | v2.0 | 4/4 | Complete | 2026-01-24 |
| 16. SMS Notifications | v2.0 | 3/3 | Complete | 2026-01-24 |
| 17. Email Digests | v2.0 | 3/3 | Complete | 2026-01-24 |
| 18. Stripe Billing | v2.0 | 6/6 | Complete | 2026-01-24 |
| 19. Backend API Migration - Foundation | v2.0 | 4/4 | Complete | 2026-01-24 |
| 20. Backend API Migration - Core | v2.0 | 5/5 | Complete | 2026-01-25 |
| 21. Backend API Migration - Completion | v2.0 | 0/? | Not Started | - |
| 22. AWS ECS Deployment (Optional) | v2.0 | 0/? | Not Started | - |

---

*v2.0 milestone active — 9 phases defined, Phases 14-20 complete, Phase 21 next*
