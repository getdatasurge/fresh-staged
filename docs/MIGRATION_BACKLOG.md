# FrostGuard Migration Backlog

## Overview

This document converts the migration epics into an actionable engineering backlog with user stories, acceptance criteria, dependencies, risks, and sequencing.

---

## Cutover Strategy

### Decision: Freeze+Backfill

**Justification:**
1. **Small data volume** (<1GB) enables fast migration (estimated <30 minutes)
2. **Extended downtime window acceptable** - users can tolerate overnight/weekend maintenance
3. **Lower implementation complexity** - no dual-write synchronization logic needed
4. **Easier verification** - compare row counts and checksums atomically
5. **Simple rollback** - restore Supabase configuration if issues arise

**Alternative Considered:** Dual-Write
- Would provide zero downtime but adds significant complexity
- Risk of data inconsistency between systems
- Not justified for current scale (3-4 tenants, ~5 users)

---

## Epic 1: Infrastructure Setup

### User Stories

#### US-1.1: Local Development Environment
**As a** developer
**I want** a Docker Compose setup with all required services
**So that** I can develop and test locally without external dependencies

**Acceptance Criteria:**
- [ ] `docker-compose up` starts PostgreSQL 15, PgBouncer, Redis 7, MinIO
- [ ] All services pass health checks within 60 seconds
- [ ] PostgreSQL accessible via PgBouncer on port 6432
- [ ] MinIO console accessible on port 9001
- [ ] Environment template (`.env.example`) documented

**Dependencies:** None
**Risk:** Low
**Rollback:** Delete containers and volumes

---

#### US-1.2: Development Scripts
**As a** developer
**I want** convenient shell scripts for common operations
**So that** I can quickly start, stop, and reset the environment

**Acceptance Criteria:**
- [ ] `scripts/dev/up.sh` starts all services in detached mode
- [ ] `scripts/dev/down.sh` stops all services gracefully
- [ ] `scripts/dev/reset.sh` removes volumes and restarts fresh
- [ ] Scripts work on Linux and macOS

**Dependencies:** US-1.1
**Risk:** Low
**Rollback:** N/A

---

## Epic 2: Database Schema Migration

### User Stories

#### US-2.1: Drizzle ORM Setup
**As a** developer
**I want** Drizzle ORM configured with TypeScript
**So that** I can define and migrate database schemas type-safely

**Acceptance Criteria:**
- [ ] Backend project initialized with TypeScript
- [ ] Drizzle ORM and drizzle-kit installed
- [ ] `drizzle.config.ts` configured for PostgreSQL
- [ ] Database client (`src/db/client.ts`) connects via PgBouncer

**Dependencies:** US-1.1
**Risk:** Low
**Rollback:** Remove backend directory

---

#### US-2.2: Schema Definition
**As a** developer
**I want** all Supabase tables defined as Drizzle schemas
**So that** the new database matches the existing structure

**Acceptance Criteria:**
- [ ] All 17+ tables defined in `src/db/schema/`
- [ ] All 8 enum types defined
- [ ] Foreign key relationships match Supabase
- [ ] Indexes match existing performance requirements
- [ ] `drizzle-kit generate:pg` produces valid migrations

**Dependencies:** US-2.1
**Risk:** Medium - schema mismatch could break data migration
**Rollback:** Regenerate schemas from Supabase export

---

## Epic 3: Authentication System

### User Stories

#### US-3.1: Stack Auth Project Setup
**As a** system administrator
**I want** a Stack Auth project configured
**So that** users can authenticate with the new system

**Acceptance Criteria:**
- [ ] Stack Auth project created at stack-auth.com
- [ ] OAuth providers configured (Google, Microsoft)
- [ ] Project ID and API keys documented (not in code)
- [ ] Test user created for development

**Dependencies:** None
**Risk:** Low
**Rollback:** Delete Stack Auth project

---

#### US-3.2: JWT Validation Middleware
**As a** backend developer
**I want** middleware that validates Stack Auth JWTs
**So that** API endpoints are protected

**Acceptance Criteria:**
- [ ] Middleware extracts JWT from Authorization header
- [ ] Invalid/expired tokens return 401
- [ ] Valid tokens populate `request.user` with user info
- [ ] Token validation is cached (5-minute TTL)
- [ ] Middleware is reusable across all routes

**Dependencies:** US-3.1, US-3.3
**Risk:** Medium - auth bugs could expose data
**Rollback:** Revert to Supabase auth

---

#### US-3.3: User Profile Sync
**As a** user
**I want** my profile created automatically on first login
**So that** I don't need separate registration

**Acceptance Criteria:**
- [ ] First login creates profile in `profiles` table
- [ ] Stack Auth user ID mapped to local user ID
- [ ] Email and name synced from Stack Auth
- [ ] Subsequent logins don't duplicate profiles

**Dependencies:** US-2.2, US-3.1
**Risk:** Medium
**Rollback:** Manual profile cleanup

---

## Epic 4: RBAC Implementation

### User Stories

#### US-4.1: Role Hierarchy Middleware
**As a** developer
**I want** middleware that enforces role-based access
**So that** endpoints respect permission levels

**Acceptance Criteria:**
- [ ] Role hierarchy: owner > admin > manager > staff > viewer
- [ ] `requireRole('admin')` allows admin, owner
- [ ] `requireRole('staff')` allows staff, manager, admin, owner
- [ ] Insufficient role returns 403 with clear message
- [ ] Unit tests cover all role combinations

**Dependencies:** US-3.2
**Risk:** High - RBAC bugs could expose sensitive operations
**Rollback:** Add additional permission checks

---

#### US-4.2: Organization Context Middleware
**As a** developer
**I want** middleware that validates organization access
**So that** users can only access their organization's data

**Acceptance Criteria:**
- [ ] Middleware extracts org ID from route or user profile
- [ ] Cross-organization access returns 403
- [ ] Organization context attached to all queries
- [ ] Multi-tenant isolation verified in tests

**Dependencies:** US-4.1
**Risk:** Critical - tenant isolation failure is a security breach
**Rollback:** Add explicit org checks to all queries

---

## Epic 5: Core API Endpoints

### User Stories

#### US-5.1: Organization CRUD
**As an** organization admin
**I want** to view and update my organization
**So that** I can manage organization settings

**Acceptance Criteria:**
- [ ] `GET /organizations/:id` returns organization (all roles)
- [ ] `PUT /organizations/:id` updates organization (admin+)
- [ ] `GET /organizations/:id/users` lists members (admin+)
- [ ] Validation errors return 400 with details

**Dependencies:** US-4.2
**Risk:** Low
**Rollback:** N/A

---

#### US-5.2: Site/Area/Unit CRUD
**As a** manager
**I want** to manage sites, areas, and units
**So that** I can configure the monitoring hierarchy

**Acceptance Criteria:**
- [ ] Full CRUD for sites (admin+)
- [ ] Full CRUD for areas (admin+)
- [ ] Full CRUD for units (manager+ for update)
- [ ] Cascade delete behavior documented
- [ ] All endpoints have request validation

**Dependencies:** US-5.1
**Risk:** Low
**Rollback:** N/A

---

## Epic 6: Sensor Data Pipeline

### User Stories

#### US-6.1: Readings Query API
**As a** user
**I want** to query historical sensor readings
**So that** I can view temperature trends

**Acceptance Criteria:**
- [ ] `GET /units/:unitId/readings` returns readings
- [ ] Query params: `start`, `end`, `limit`, `offset`
- [ ] Results sorted by timestamp descending
- [ ] Pagination metadata included

**Dependencies:** US-5.2
**Risk:** Low
**Rollback:** N/A

---

#### US-6.2: Bulk Readings Ingestion
**As a** sensor device
**I want** to submit readings in bulk
**So that** data is efficiently stored

**Acceptance Criteria:**
- [ ] `POST /readings/bulk` accepts array of readings
- [ ] API key authentication (not JWT)
- [ ] Validates temperature, device ID, timestamp
- [ ] Returns count of inserted readings
- [ ] Triggers alert processing job

**Dependencies:** US-6.1, US-7.1
**Risk:** Medium - high volume endpoint
**Rollback:** Disable endpoint, revert to Supabase ingestion

---

## Epic 7: Alert System

### User Stories

#### US-7.1: Alert Rule Evaluation
**As the** system
**I want** to evaluate readings against alert rules
**So that** alerts are triggered when thresholds are exceeded

**Acceptance Criteria:**
- [ ] Effective rules resolved from unit → site → org hierarchy
- [ ] Temperature threshold comparison (min/max)
- [ ] Duplicate alerts not created for ongoing excursions
- [ ] Unit status updated based on alert state

**Dependencies:** US-5.2
**Risk:** High - missed alerts are critical failures
**Rollback:** Manual alert monitoring

---

#### US-7.2: Alert Lifecycle Management
**As a** staff member
**I want** to acknowledge and resolve alerts
**So that** I can document corrective actions

**Acceptance Criteria:**
- [ ] `PUT /alerts/:id/acknowledge` (staff+)
- [ ] `PUT /alerts/:id/resolve` (staff+)
- [ ] Status transitions validated
- [ ] Audit trail updated

**Dependencies:** US-7.1
**Risk:** Low
**Rollback:** N/A

---

## Epic 8: Real-time Features

### User Stories

#### US-8.1: Socket.io Server Setup
**As a** frontend developer
**I want** WebSocket connections for real-time updates
**So that** the UI updates without polling

**Acceptance Criteria:**
- [ ] Socket.io server attached to Fastify
- [ ] JWT authentication on connection
- [ ] Redis adapter for horizontal scaling
- [ ] Room-based subscriptions (org, site, unit)

**Dependencies:** US-3.2
**Risk:** Medium
**Rollback:** Fallback to polling

---

#### US-8.2: Real-time Events
**As a** user
**I want** to receive real-time sensor readings and alerts
**So that** I can respond quickly to issues

**Acceptance Criteria:**
- [ ] `sensor:reading` event emitted on new reading
- [ ] `alert:triggered` event emitted on new alert
- [ ] Events scoped to user's organization
- [ ] Reconnection handled gracefully

**Dependencies:** US-8.1, US-6.2, US-7.1
**Risk:** Medium
**Rollback:** Disable WebSocket, use polling

---

## Epic 9: Background Jobs

### User Stories

#### US-9.1: BullMQ Setup
**As a** developer
**I want** a job queue system
**So that** async tasks are processed reliably

**Acceptance Criteria:**
- [ ] BullMQ connected to Redis
- [ ] Queue definitions: alerts, notifications, reports
- [ ] Workers start with application
- [ ] Failed jobs logged and retried

**Dependencies:** US-1.1
**Risk:** Low
**Rollback:** Inline processing

---

#### US-9.2: Notification Processing
**As the** system
**I want** to send notifications asynchronously
**So that** API responses aren't delayed

**Acceptance Criteria:**
- [ ] SMS via Telnyx
- [ ] Email delivery
- [ ] Delivery status tracked in database
- [ ] Retry logic for failures

**Dependencies:** US-9.1, US-7.1
**Risk:** Medium - notification failures impact users
**Rollback:** Queue notifications manually

---

## Epic 10: Storage Migration

### User Stories

#### US-10.1: MinIO Integration
**As a** user
**I want** to upload and download files
**So that** I can attach photos to logs and corrective actions

**Acceptance Criteria:**
- [ ] Presigned upload URLs generated
- [ ] Presigned download URLs generated
- [ ] Bucket structure: avatars, corrective-actions, exports
- [ ] Files organized by org ID

**Dependencies:** US-1.1
**Risk:** Low
**Rollback:** Use local filesystem

---

## Epic 11: Webhook Handlers

### User Stories

#### US-11.1: TTN Webhook
**As** The Things Network
**I want** to send sensor uplinks via webhook
**So that** readings are ingested automatically

**Acceptance Criteria:**
- [ ] `POST /webhooks/ttn` endpoint
- [ ] Payload normalization from TTN format
- [ ] API key validation
- [ ] Idempotency handling

**Dependencies:** US-6.2
**Risk:** Medium
**Rollback:** Disable webhook, manual data entry

---

#### US-11.2: Stripe Webhook
**As** Stripe
**I want** to send subscription events
**So that** billing status is synchronized

**Acceptance Criteria:**
- [ ] `POST /webhooks/stripe` endpoint
- [ ] Signature verification
- [ ] Handle: checkout.completed, subscription.updated, subscription.deleted
- [ ] Organization subscription status updated

**Dependencies:** US-5.1
**Risk:** Medium - billing issues
**Rollback:** Manual subscription management

---

## Epic 12: Frontend Migration

### User Stories

#### US-12.1: API Client
**As a** frontend developer
**I want** a typed API client
**So that** I can replace Supabase client calls

**Acceptance Criteria:**
- [ ] `src/lib/api-client.ts` created
- [ ] Token management integrated with Stack Auth
- [ ] All endpoint methods typed
- [ ] Error handling matches existing patterns

**Dependencies:** US-5.1, US-5.2, US-6.1, US-7.2
**Risk:** Low
**Rollback:** Keep Supabase client

---

#### US-12.2: Hook Migration
**As a** frontend developer
**I want** all 40+ hooks migrated to new API
**So that** the app works with new backend

**Acceptance Criteria:**
- [ ] All hooks updated to use API client
- [ ] React Query caching preserved
- [ ] Real-time subscriptions use Socket.io
- [ ] All existing tests pass

**Dependencies:** US-12.1, US-8.2
**Risk:** High - extensive changes
**Rollback:** Branch-based revert

---

## Epic 13: Data Migration

### User Stories

#### US-13.1: Export Scripts
**As a** developer
**I want** scripts to export Supabase data
**So that** data can be migrated to new database

**Acceptance Criteria:**
- [ ] Export all tables in dependency order
- [ ] Export to JSON files
- [ ] Include metadata (row counts, checksums)
- [ ] User export from Supabase Auth

**Dependencies:** None
**Risk:** Low
**Rollback:** N/A

---

#### US-13.2: Import Scripts
**As a** developer
**I want** scripts to import data to new database
**So that** migration can be executed

**Acceptance Criteria:**
- [ ] Import tables in dependency order
- [ ] Map Supabase user IDs to Stack Auth IDs
- [ ] Preserve timestamps
- [ ] Verification queries run automatically

**Dependencies:** US-13.1, US-2.2
**Risk:** High - data loss possible
**Rollback:** Restore from Supabase

---

## Epic 14: Production Deployment

### User Stories

#### US-14.1: Production Configuration
**As a** DevOps engineer
**I want** production-ready Docker configuration
**So that** the system can be deployed to cloud

**Acceptance Criteria:**
- [ ] Production Docker Compose / K8s manifests
- [ ] Resource limits configured
- [ ] Health checks for all services
- [ ] Secrets management documented

**Dependencies:** All previous epics
**Risk:** Medium
**Rollback:** Revert deployment

---

#### US-14.2: Cutover Execution
**As a** team lead
**I want** a documented cutover procedure
**So that** migration executes smoothly

**Acceptance Criteria:**
- [ ] Pre-cutover checklist complete
- [ ] Maintenance mode enabled
- [ ] Data exported and imported
- [ ] Verification scripts pass
- [ ] DNS/config updated
- [ ] Post-cutover monitoring active

**Dependencies:** US-14.1, US-13.2
**Risk:** Critical
**Rollback:** Restore Supabase configuration

---

## Sequencing: MVP Path

### Phase 1: Foundation (Steps 1-6)
1. US-1.1, US-1.2: Local dev environment
2. US-2.1, US-2.2: Database schema
3. US-3.1, US-3.2, US-3.3: Stack Auth
4. US-4.1, US-4.2: RBAC middleware
5. US-5.1, US-5.2: Core CRUD APIs

### Phase 2: Core Features (Steps 7-8)
6. US-6.1, US-6.2: Sensor readings
7. US-7.1, US-7.2: Alert system

### Phase 3: Frontend (Steps 13-14)
8. US-12.1, US-12.2: Frontend migration

### Phase 4: Cutover (Steps 15-17)
9. US-13.1, US-13.2: Data migration
10. US-14.1, US-14.2: Production cutover

### Deferred (Post-MVP)
- US-8.1, US-8.2: Real-time (can use polling initially)
- US-9.1, US-9.2: Background jobs (can inline process)
- US-10.1: Storage (can defer file uploads)
- US-11.1, US-11.2: Webhooks (can configure post-cutover)

---

## Risk Summary

| Risk Level | Count | Examples |
|------------|-------|----------|
| Critical | 2 | Tenant isolation, cutover execution |
| High | 4 | RBAC bugs, alert system, hook migration, data import |
| Medium | 8 | Auth, webhooks, notifications, real-time |
| Low | 10+ | CRUD endpoints, scripts, configuration |

---

*Backlog Version: 1.0*
*Created: January 2026*
