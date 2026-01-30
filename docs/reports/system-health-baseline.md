---
type: report
title: System Health Baseline
created: 2026-01-30
tags:
  - health-check
  - verification
  - baseline
related:
  - '[[Phase-01-Backend-Verification-And-Dev-Bootstrap]]'
  - '[[LOCAL_DEV_ENV]]'
  - '[[DATABASE]]'
---

# System Health Baseline Report

**Date:** 2026-01-30
**Phase:** 01 - Backend Verification & Dev Environment Bootstrap
**Environment:** WSL2 (Windows), Docker Desktop
**Project:** FrostGuard (Milestones v1.0 through v2.1)

## Executive Summary

All core services start successfully and pass health checks. The full backend test suite (1,072 tests) and frontend test suite (129 tests) pass with zero failures. The system is verified and ready for new development.

| Area                  | Status                                 |
| --------------------- | -------------------------------------- |
| Docker Infrastructure | **Healthy**                            |
| Database Schema       | **Applied** (32 tables, 15 enums)      |
| Backend Server        | **Running** (all endpoints respond)    |
| Frontend App          | **Builds and serves**                  |
| Backend Tests         | **1,072 passed**, 38 skipped, 0 failed |
| Frontend Tests        | **129 passed**, 12 skipped, 0 failed   |

---

## Service Details

### 1. PostgreSQL

| Property     | Value                                    |
| ------------ | ---------------------------------------- |
| Status       | **Running / Healthy**                    |
| Image        | `postgres:15-alpine`                     |
| Container    | `frostguard-postgres`                    |
| Host Port    | 5432                                     |
| Health Check | `pg_isready -U frostguard -d frostguard` |
| Database     | `frostguard`                             |
| User         | `frostguard`                             |
| Tables       | 32                                       |
| Custom Enums | 15                                       |
| Issues       | None                                     |

**Core Tables Verified:** `organizations`, `profiles`, `sites`, `areas`, `units`, `sensor_readings`, `alerts`, `alert_rules`

**Full Table List:** alert_rules, alert_rules_history, alerts, areas, calibration_records, corrective_actions, devices, door_events, entity_dashboard_layouts, escalation_contacts, event_logs, gateways, hubs, lora_sensors, manual_temperature_logs, notification_deliveries, notification_settings, organizations, pairing_sessions, pilot_feedback, platform_roles, profiles, reading_metrics, sensor_readings, sites, sms_configs, stripe_events, subscriptions, ttn_connections, units, user_roles, user_sync_log

**Custom Enum Types:** alert_severity, alert_status, alert_type, app_role, compliance_mode, device_status, gateway_status, notification_channel, notification_status, pairing_status, subscription_plan, subscription_status, temp_unit, unit_status, unit_type

### 2. Redis

| Property     | Value                            |
| ------------ | -------------------------------- |
| Status       | **Running / Healthy**            |
| Image        | `redis:7-alpine`                 |
| Container    | `frostguard-redis`               |
| Host Port    | 6379                             |
| Health Check | `redis-cli ping` → PONG          |
| Persistence  | AOF enabled (`--appendonly yes`) |
| Issues       | None                             |

### 3. MinIO (S3-Compatible Object Storage)

| Property      | Value                                                                |
| ------------- | -------------------------------------------------------------------- |
| Status        | **Running / Healthy**                                                |
| Image         | `minio/minio:RELEASE.2023-09-04T19-57-37Z`                           |
| Container     | `frostguard-minio`                                                   |
| S3 API Port   | 9200 (host) → 9000 (container)                                       |
| Console Port  | 9201 (host) → 9001 (container)                                       |
| Health Check  | `curl -f http://localhost:9000/minio/health/live`                    |
| Bucket        | `frostguard` (created automatically by `minio-setup` init container) |
| Public Access | Download enabled on `/public` prefix                                 |
| Issues        | None                                                                 |

### 4. PgBouncer (Connection Pooler)

| Property  | Value                                                                   |
| --------- | ----------------------------------------------------------------------- |
| Status    | **Disabled**                                                            |
| Reason    | Commented out in `docker-compose.yml` — image availability issues noted |
| Port 6432 | Not in use                                                              |

### 5. Fastify Backend Server

| Property     | Value                    |
| ------------ | ------------------------ |
| Status       | **Running**              |
| Framework    | Fastify 5                |
| Host:Port    | `0.0.0.0:3000`           |
| Startup Time | ~6 seconds               |
| Node.js      | ESM (`"type": "module"`) |

**Health Endpoints:**

| Endpoint               | Response                                                                                                               | Status     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| `GET /health`          | `{"status":"healthy","checks":{"database":{"status":"pass","latency_ms":1},"redis":{"status":"pass","latency_ms":0}}}` | **200 OK** |
| `GET /health/ready`    | `{"ready":true}`                                                                                                       | **200 OK** |
| `GET /health/live`     | `{"alive":true}`                                                                                                       | **200 OK** |
| `GET /health/realtime` | `{"websocket":{"enabled":true,"connections":0}}`                                                                       | **200 OK** |

**tRPC Endpoints:**

| Endpoint                          | Response                                                         | Status     |
| --------------------------------- | ---------------------------------------------------------------- | ---------- |
| `GET /trpc/health.quick?input={}` | `{"result":{"data":{"overall":"healthy",...}}}`                  | **200 OK** |
| `GET /trpc/health.all?input={}`   | Full health (database healthy, Redis/Edge skipped in tRPC layer) | **200 OK** |

**Plugins & Services Initialized:**

- Socket.io (WebSocket)
- QueueService (Redis-backed, 3 queues: `sms-notifications`, `email-digests`, `meter-reporting`)
- Bull Board dashboard at `/admin/queues`
- SensorStreamService
- SensorScheduler (hourly cron)

**Optional Services (Gracefully Disabled):**

- TelnyxService — no `TELNYX_API_KEY` configured (logs warning, does not block)
- EmailService — no `RESEND_API_KEY` configured (logs warning, does not block)

### 6. Vite Frontend Dev Server

| Property     | Value                                                      |
| ------------ | ---------------------------------------------------------- |
| Status       | **Running**                                                |
| Framework    | React 18 + TypeScript + Vite 5.4.21 + Tailwind + shadcn/ui |
| Host:Port    | `[::]:8080`                                                |
| Startup Time | ~5.3 seconds                                               |
| HMR          | Active (with polling workaround)                           |
| PWA          | Enabled (service worker, 11 precache entries)              |

**Production Build Stats:**

- Modules transformed: 8,715
- JS bundle: 3,190 KB (819 KB gzip) — single chunk, code splitting recommended
- CSS bundle: 111 KB (19 KB gzip)
- Build time: ~4 minutes
- Build errors: 0

### 7. BullMQ Worker

| Property | Value                                                                  |
| -------- | ---------------------------------------------------------------------- |
| Status   | **Not Started**                                                        |
| Reason   | Requires `backend/Dockerfile.worker` build — separate from dev server  |
| Queues   | Functional via Fastify backend (in-process queue processing available) |

---

## Test Results Summary

### Backend Tests

| Metric        | Value          |
| ------------- | -------------- |
| Runner        | Vitest v4.0.18 |
| Test Files    | 53             |
| Tests Passed  | **1,072**      |
| Tests Skipped | 38             |
| Tests Failed  | **0**          |
| Duration      | ~84 seconds    |

**Breakdown by Category:**

| Category        | Files | Tests | Notes                                                        |
| --------------- | ----- | ----- | ------------------------------------------------------------ |
| Services        | 18    | 421   | ttn, stripe, telnyx, org-stats, alerts, queue, etc.          |
| tRPC Routers    | 17    | 354   | All CRUD routers + e2e (2 skipped in sites)                  |
| API Integration | 11    | 270   | REST endpoints (36 skipped — ttn-webhooks, alerts, readings) |
| Auth & RBAC     | 2     | 10    | Authentication + role-based access                           |
| Workers         | 1     | 25    | SMS notification worker                                      |

**Skipped Tests (38):** Intentional `skip` annotations — `ttn-webhooks.test.ts` (14), `alerts.test.ts` (14), `readings.test.ts` (8), `sites.router.test.ts` (2). Not failures.

**Test Infrastructure:** Mocks for Resend (email), Stripe (payments), AWS S3 (storage), Bull Board (queue dashboard). Tests run against live Docker services (PostgreSQL, Redis).

### Frontend Tests

| Metric        | Value                        |
| ------------- | ---------------------------- |
| Runner        | Vitest v2.1.9 with happy-dom |
| Test Files    | 10                           |
| Tests Passed  | **129**                      |
| Tests Skipped | 12                           |
| Tests Failed  | **0**                        |
| Duration      | ~28 seconds                  |

**Breakdown by Area:**

| Area             | Files | Tests | Notes                                                    |
| ---------------- | ----- | ----- | -------------------------------------------------------- |
| Dashboard Layout | 3     | 73    | Payload classification, widget health, layout validation |
| Hooks            | 3     | 25    | useAlerts, useSites, useOrganizations (5 skipped)        |
| Components       | 1     | 5     | TTNCredentialsPanel rendering                            |
| Lib/Actions      | 2     | 22    | Gateway + sensor eligibility                             |
| Lib Utilities    | 1     | 6     | Org-scoped cache invalidation                            |

**Skipped Tests (12):** Intentional — layout validation (7, pending widget types), organization hooks (5, pending features).

**Coverage:** `@vitest/coverage-v8` not installed. No coverage metrics available.

---

## Environment Configuration Changes

| Change                             | File           | Reason                                                                |
| ---------------------------------- | -------------- | --------------------------------------------------------------------- |
| Uncommented `REDIS_URL`            | `backend/.env` | Redis container is running; backend needs connection                  |
| Used `NODE_OPTIONS="--import tsx"` | CLI (manual)   | `drizzle-kit push` fails with ESM `.js` resolution without tsx loader |
| Used `CHOKIDAR_USEPOLLING=true`    | CLI (manual)   | WSL/Windows cross-filesystem watchers fail with `EISDIR`              |
| Used `npx tsx src/index.ts`        | CLI (manual)   | `tsx watch` fails with `EISDIR` in WSL; non-watch mode works          |

---

## Known Issues & Recommendations

### Issues Discovered

| #   | Severity   | Issue                                                                                 | Impact                                                                   | Recommendation                                                                             |
| --- | ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | **Medium** | `tsx watch` and Vite file watchers fail with `EISDIR` on WSL/Windows cross-filesystem | Dev experience — no auto-reload without workaround                       | Use `CHOKIDAR_USEPOLLING=true` for Vite; use `npx tsx src/index.ts` (no watch) for backend |
| 2   | **Low**    | `drizzle-kit push` fails with `Cannot find module './enums.js'` without tsx loader    | Schema migration requires manual `NODE_OPTIONS` flag                     | Update `db:push` script to include `NODE_OPTIONS="--import tsx"`                           |
| 3   | **Low**    | Fastify deprecation: `maxParamLength` should move to `options.routerOptions`          | Non-blocking warning, prep for Fastify 6                                 | Migrate option in Fastify config before upgrading to Fastify 6                             |
| 4   | **Info**   | Frontend JS bundle is 3.2 MB (single chunk)                                           | Exceeds Vite 500 KB recommendation; affects initial load time            | Implement code splitting via dynamic `import()` or `manualChunks` in `vite.config.ts`      |
| 5   | **Info**   | Frontend coverage tooling not installed                                               | Cannot measure test coverage                                             | Install `@vitest/coverage-v8` and configure coverage thresholds                            |
| 6   | **Info**   | BullMQ worker container not started                                                   | Worker runs in-process via Fastify; Docker worker needs Dockerfile build | Build `backend/Dockerfile.worker` when deploying worker separately                         |
| 7   | **Info**   | 9 npm vulnerabilities in frontend (4 low, 5 moderate)                                 | No critical vulnerabilities                                              | Review with `npm audit` periodically                                                       |

### Environment-Specific Notes

- **Docker path:** Docker Desktop installed at `/c/Program Files/Docker/Docker/resources/bin/` — not on default PATH in this WSL environment. Requires explicit path or PATH modification.
- **PgBouncer:** Disabled in `docker-compose.yml` due to image availability issues. Direct PostgreSQL connections work for local development.
- **Optional services:** Telnyx (SMS) and Resend (email) require API keys. Both degrade gracefully when unconfigured.

---

## Reproducibility Commands

### Start Infrastructure

```bash
docker compose up -d
docker compose ps   # verify all healthy
```

### Apply Database Schema

```bash
cd backend
npm install
NODE_OPTIONS="--import tsx" npx drizzle-kit push
```

### Start Backend

```bash
cd backend
npx tsx src/index.ts
# Health check: curl http://localhost:3000/health
```

### Start Frontend

```bash
# From project root
npm install
CHOKIDAR_USEPOLLING=true npm run dev
# Access: http://localhost:8080
```

### Run Backend Tests

```bash
cd backend
npm test   # vitest run
```

### Run Frontend Tests

```bash
# From project root
npm test   # vitest run
```

### Production Build (Frontend)

```bash
npm run build
# Output: dist/
```

---

## Conclusion

The FrostGuard system is verified and operational for local development. All core services (PostgreSQL, Redis, MinIO) are healthy, the backend server starts and responds on all health endpoints, the frontend builds and serves correctly, and all 1,201 tests (1,072 backend + 129 frontend) pass with zero failures. The environment is ready for Phase 02 development.
