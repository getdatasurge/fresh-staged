# FrostGuard Database Migration Plan: Supabase to Self-Hosted PostgreSQL

## Current State Analysis

**Current Database:** Supabase (hosted PostgreSQL)
- Project ID: `mfwyiifehsvwnjwqoxht`
- URL: `https://mfwyiifehsvwnjwqoxht.supabase.co`
- Client Library: `@supabase/supabase-js` v2.89.0
- Backend: PostgreSQL 14.1

**Key Components:**
- 17+ core tables with RLS policies
- Custom enums and types
- Edge functions (Deno runtime)
- Real-time subscriptions
- Auth system (GoTrue)
- Storage (for images)

---

## Migration Epic Sets

### EPIC 1: Infrastructure Setup (Foundation)
**Priority:** Critical | **Dependency:** None

| Task | Description | Effort |
|------|-------------|--------|
| 1.1 | Provision self-hosted PostgreSQL 15+ server | Medium |
| 1.2 | Set up database replication/backup strategy | Medium |
| 1.3 | Configure SSL/TLS for database connections | Low |
| 1.4 | Set up connection pooling (PgBouncer) | Medium |
| 1.5 | Create database roles and users | Low |
| 1.6 | Configure firewall rules and network security | Medium |

**Deliverables:**
- [ ] PostgreSQL server running and accessible
- [ ] Backup system configured (pg_dump cron or WAL-E/pgBackRest)
- [ ] SSL certificates installed
- [ ] Connection pooler operational
- [ ] Network security hardened

---

### EPIC 2: Schema Migration (Database Layer)
**Priority:** Critical | **Dependency:** Epic 1

| Task | Description | Effort |
|------|-------------|--------|
| 2.1 | Export Supabase schema (pg_dump --schema-only) | Low |
| 2.2 | Create all enum types | Low |
| 2.3 | Create all tables with constraints | Medium |
| 2.4 | Create all indexes | Low |
| 2.5 | Create helper functions (has_role, user_belongs_to_org, etc.) | Medium |
| 2.6 | Migrate RLS policies to application-level auth | High |
| 2.7 | Create triggers (updated_at, handle_new_user, etc.) | Medium |

**Tables to Migrate (in dependency order):**
1. `organizations` (no deps)
2. `profiles` (deps: organizations)
3. `user_roles` (deps: profiles, organizations)
4. `subscriptions` (deps: organizations)
5. `sites` (deps: organizations)
6. `areas` (deps: sites)
7. `units` (deps: areas)
8. `hubs` (deps: sites)
9. `devices` (deps: units, hubs)
10. `sensor_readings` (deps: units, devices)
11. `manual_temperature_logs` (deps: units, profiles)
12. `alert_rules` (deps: organizations, sites, units)
13. `alert_rules_history` (deps: alert_rules)
14. `alerts` (deps: units)
15. `notification_deliveries` (deps: alerts, profiles)
16. `corrective_actions` (deps: alerts, units, profiles)
17. `event_logs` (deps: organizations, sites, units)
18. Additional: `calibration_records`, `pairing_sessions`, `lora_sensors`, etc.

**Deliverables:**
- [ ] Complete schema exported and validated
- [ ] All enum types created
- [ ] All tables created with proper constraints
- [ ] All indexes created
- [ ] All functions migrated
- [ ] RLS replacement strategy implemented

---

### EPIC 3: Authentication System (Auth Layer)
**Priority:** Critical | **Dependency:** Epic 2

| Task | Description | Effort |
|------|-------------|--------|
| 3.1 | Choose auth solution (Keycloak, Auth0, or custom JWT) | Low |
| 3.2 | Set up authentication server | High |
| 3.3 | Migrate user accounts from Supabase Auth | Medium |
| 3.4 | Implement JWT token generation/validation | Medium |
| 3.5 | Create password reset flow | Medium |
| 3.6 | Implement session management | Medium |
| 3.7 | Set up OAuth providers (if needed) | Medium |

**Recommended Options:**
1. **Keycloak** (self-hosted, full-featured)
2. **Auth.js/NextAuth** (if moving to Next.js backend)
3. **Custom JWT** with bcrypt + jsonwebtoken

**Deliverables:**
- [ ] Auth server operational
- [ ] User migration scripts ready
- [ ] JWT flow implemented
- [ ] Password reset working
- [ ] Session management functional

---

### EPIC 4: API Backend (Server Layer)
**Priority:** Critical | **Dependency:** Epic 2, 3

| Task | Description | Effort |
|------|-------------|--------|
| 4.1 | Choose backend framework (Node.js/Express, Fastify, NestJS) | Low |
| 4.2 | Set up project structure | Medium |
| 4.3 | Configure database connection (pg, Prisma, or Drizzle) | Medium |
| 4.4 | Create REST API endpoints for all entities | High |
| 4.5 | Implement authorization middleware (replace RLS) | High |
| 4.6 | Migrate Supabase RPC functions to API routes | High |
| 4.7 | Implement rate limiting | Low |
| 4.8 | Add request validation (Zod/Joi) | Medium |
| 4.9 | Set up error handling and logging | Medium |

**API Endpoints Required:**
```
Auth:
  POST /auth/login
  POST /auth/register
  POST /auth/logout
  POST /auth/refresh
  POST /auth/forgot-password
  POST /auth/reset-password

Organizations:
  GET    /organizations/:id
  PUT    /organizations/:id
  DELETE /organizations/:id

Sites:
  GET    /organizations/:orgId/sites
  POST   /organizations/:orgId/sites
  GET    /sites/:id
  PUT    /sites/:id
  DELETE /sites/:id

Areas:
  GET    /sites/:siteId/areas
  POST   /sites/:siteId/areas
  PUT    /areas/:id
  DELETE /areas/:id

Units:
  GET    /areas/:areaId/units
  POST   /areas/:areaId/units
  GET    /units/:id
  PUT    /units/:id
  DELETE /units/:id

Sensor Readings:
  GET    /units/:unitId/readings
  POST   /readings (bulk ingestion)

Alerts:
  GET    /units/:unitId/alerts
  GET    /alerts/:id
  PUT    /alerts/:id/acknowledge
  PUT    /alerts/:id/resolve

Alert Rules:
  GET    /organizations/:orgId/alert-rules
  GET    /units/:unitId/effective-rules
  PUT    /alert-rules

Users:
  GET    /users/me
  PUT    /users/me
  GET    /organizations/:orgId/users
  POST   /organizations/:orgId/users/invite
  PUT    /users/:id/role

(... additional endpoints for hubs, devices, notifications, etc.)
```

**Deliverables:**
- [ ] Backend server running
- [ ] All CRUD endpoints implemented
- [ ] Authorization middleware protecting all routes
- [ ] RPC functions migrated to API
- [ ] Validation on all inputs

---

### EPIC 5: Real-Time System (WebSocket Layer)
**Priority:** High | **Dependency:** Epic 4

| Task | Description | Effort |
|------|-------------|--------|
| 5.1 | Set up WebSocket server (Socket.io or ws) | Medium |
| 5.2 | Implement pub/sub for sensor readings | Medium |
| 5.3 | Implement real-time alerts | Medium |
| 5.4 | Add authentication to WebSocket connections | Medium |
| 5.5 | Implement room-based subscriptions (per unit/site/org) | Medium |

**Real-Time Events:**
- `sensor:reading` - New temperature reading
- `alert:triggered` - New alert fired
- `alert:updated` - Alert status changed
- `unit:status` - Unit status changed
- `device:online/offline` - Device connectivity

**Deliverables:**
- [ ] WebSocket server operational
- [ ] Real-time sensor data streaming
- [ ] Real-time alert notifications
- [ ] Auth integration complete

---

### EPIC 6: Edge Functions Migration (Serverless → Server)
**Priority:** Medium | **Dependency:** Epic 4

| Task | Description | Effort |
|------|-------------|--------|
| 6.1 | Inventory all Supabase Edge Functions | Low |
| 6.2 | Convert Deno functions to Node.js | Medium |
| 6.3 | Integrate as API routes or background jobs | Medium |
| 6.4 | Set up job queue for async tasks (Bull/BullMQ) | Medium |
| 6.5 | Migrate scheduled functions to cron jobs | Low |

**Deliverables:**
- [ ] All edge functions converted
- [ ] Background job system operational
- [ ] Cron jobs configured

---

### EPIC 7: Storage Migration (File Storage)
**Priority:** Medium | **Dependency:** Epic 4

| Task | Description | Effort |
|------|-------------|--------|
| 7.1 | Set up file storage (MinIO, S3, or local) | Medium |
| 7.2 | Create file upload/download API | Medium |
| 7.3 | Migrate existing files from Supabase Storage | Medium |
| 7.4 | Update file URL references in database | Low |
| 7.5 | Implement signed URLs for private files | Medium |

**Deliverables:**
- [ ] Storage server operational
- [ ] File upload API working
- [ ] Existing files migrated
- [ ] Signed URL generation working

---

### EPIC 8: Frontend Migration (Client Layer)
**Priority:** High | **Dependency:** Epic 4, 5

| Task | Description | Effort |
|------|-------------|--------|
| 8.1 | Create new API client to replace Supabase client | High |
| 8.2 | Update all hooks to use new API client | High |
| 8.3 | Update auth context for new auth system | Medium |
| 8.4 | Update real-time subscriptions | Medium |
| 8.5 | Update file upload components | Low |
| 8.6 | Test all data flows end-to-end | High |

**Files to Update:**
- `/src/integrations/supabase/client.ts` → `/src/lib/api-client.ts`
- All 40+ hooks in `/src/hooks/use*.ts`
- Auth context in `/src/contexts/`
- Query keys factory (may need adjustment)

**Deliverables:**
- [ ] New API client created
- [ ] All hooks migrated
- [ ] Auth flow working
- [ ] Real-time working
- [ ] Full E2E testing passed

---

### EPIC 9: Data Migration (Production Data)
**Priority:** Critical | **Dependency:** Epic 2, 3, 7

| Task | Description | Effort |
|------|-------------|--------|
| 9.1 | Create data export scripts for Supabase | Medium |
| 9.2 | Create data import scripts for new DB | Medium |
| 9.3 | Validate data integrity post-migration | Medium |
| 9.4 | Plan downtime window for cutover | Low |
| 9.5 | Execute production migration | High |
| 9.6 | Verify all data migrated correctly | Medium |

**Migration Strategy:**
1. Set up read replica of Supabase (if possible)
2. Export data during low-traffic period
3. Transform auth.users → new auth system format
4. Import in dependency order (orgs first, readings last)
5. Verify row counts and checksums
6. Switch DNS/config to new system
7. Monitor for issues

**Deliverables:**
- [ ] Export scripts tested
- [ ] Import scripts tested
- [ ] Data validation passing
- [ ] Cutover plan documented
- [ ] Production data migrated

---

### EPIC 10: DevOps & Monitoring (Operations)
**Priority:** High | **Dependency:** Epic 4, 9

| Task | Description | Effort |
|------|-------------|--------|
| 10.1 | Set up CI/CD pipeline | Medium |
| 10.2 | Configure Docker containers | Medium |
| 10.3 | Set up Kubernetes/Docker Compose | Medium |
| 10.4 | Configure monitoring (Prometheus/Grafana) | Medium |
| 10.5 | Set up log aggregation (ELK/Loki) | Medium |
| 10.6 | Configure alerting (PagerDuty/Opsgenie) | Low |
| 10.7 | Create runbooks for common issues | Medium |

**Deliverables:**
- [ ] CI/CD pipeline operational
- [ ] Containerization complete
- [ ] Monitoring dashboards live
- [ ] Alerting configured
- [ ] Runbooks documented

---

## Recommended Technology Stack

### Backend
- **Runtime:** Node.js 20+ LTS
- **Framework:** Fastify (performance) or NestJS (enterprise structure)
- **ORM:** Drizzle ORM (type-safe, lightweight) or Prisma
- **Validation:** Zod
- **Auth:** Keycloak or custom JWT with argon2

### Database
- **Primary:** PostgreSQL 15+
- **Pooling:** PgBouncer
- **Backup:** pgBackRest or WAL-G
- **Migrations:** Drizzle Kit or Prisma Migrate

### Real-Time
- **WebSockets:** Socket.io
- **Message Queue:** Redis + BullMQ

### Storage
- **Object Storage:** MinIO (S3-compatible)
- **CDN:** CloudFlare (optional)

### DevOps
- **Containers:** Docker
- **Orchestration:** Docker Compose (simple) or Kubernetes (scale)
- **Monitoring:** Prometheus + Grafana
- **Logging:** Loki + Grafana

---

## Timeline Estimate

| Epic | Duration | Dependencies |
|------|----------|--------------|
| Epic 1: Infrastructure | 1 week | - |
| Epic 2: Schema | 1 week | Epic 1 |
| Epic 3: Auth | 1-2 weeks | Epic 2 |
| Epic 4: API Backend | 2-3 weeks | Epic 2, 3 |
| Epic 5: Real-Time | 1 week | Epic 4 |
| Epic 6: Edge Functions | 1 week | Epic 4 |
| Epic 7: Storage | 1 week | Epic 4 |
| Epic 8: Frontend | 2 weeks | Epic 4, 5 |
| Epic 9: Data Migration | 1 week | Epic 2, 3, 7 |
| Epic 10: DevOps | 1-2 weeks | Epic 4 |

**Total Estimated Duration:** 8-12 weeks (with parallel work)

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | Critical | Multiple backups, checksums, rollback plan |
| Auth system incompatibility | High | Thorough testing, gradual rollout |
| Performance degradation | High | Load testing, connection pooling, indexing |
| Real-time reliability | Medium | Fallback polling, reconnection logic |
| Downtime during cutover | Medium | Blue-green deployment, DNS TTL reduction |

---

## Next Steps

1. **Review and approve** this migration plan
2. **Choose technology stack** (backend framework, auth system)
3. **Provision infrastructure** (Epic 1)
4. **Begin schema migration** (Epic 2)
5. **Parallel development** of auth and API (Epic 3, 4)

---

## Related Docs

| Document | Description |
|----------|-------------|
| [MIGRATION_BACKLOG.md](./MIGRATION_BACKLOG.md) | Engineering backlog with user stories, acceptance criteria, and sequencing |
| [SUPABASE_SCHEMA_INVENTORY.md](./SUPABASE_SCHEMA_INVENTORY.md) | Inventory of current Supabase tables, RLS policies, and edge functions |
| [TARGET_ARCHITECTURE.md](./TARGET_ARCHITECTURE.md) | Target architecture with Fastify, Drizzle, Socket.io, and MinIO details |
| [LOCAL_DEV_ENV.md](./LOCAL_DEV_ENV.md) | Local development environment setup guide |
| [MIGRATION_IMPLEMENTATION_GUIDE.md](./MIGRATION_IMPLEMENTATION_GUIDE.md) | Implementation code samples and patterns |

---

*Document Version: 1.1*
*Created: January 2026*
*Last Updated: January 2026*
