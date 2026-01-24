---
phase: 15-background-jobs-infrastructure
plan: 02
subsystem: infrastructure
tags: [docker, workers, bullmq, redis, deployment]

# Dependencies
requires:
  - phase: 14-real-time-foundation
    reason: Redis infrastructure established
  - plan: 15-01
    reason: Job type definitions (created during execution)
provides:
  - Worker container entry point
  - Dockerfile.worker for independent deployment
  - Docker Compose service definitions
affects:
  - plan: 15-03
    reason: Bull Board will connect to worker queues
  - plan: 16-sms-notifications
    reason: SMS processor will be implemented
  - plan: 17-email-notifications
    reason: Email processor will be implemented

# Tech Stack
tech-stack:
  added:
    - BullMQ Worker configuration
    - IORedis with maxRetriesPerRequest: null
  patterns:
    - Worker container separation from API
    - Graceful shutdown with SIGTERM/SIGINT
    - Multi-stage Docker builds for workers
    - Docker Compose service health dependencies

# File Tracking
key-files:
  created:
    - backend/src/workers/index.ts
    - backend/src/workers/processors/sms-notification.processor.ts
    - backend/src/workers/processors/email-digest.processor.ts
    - backend/src/jobs/index.ts
    - backend/Dockerfile.worker
    - docker-compose.prod.yml
  modified:
    - docker-compose.yml

# Decisions
decisions:
  - id: JOBS-01
    decision: Workers use IORedis with maxRetriesPerRequest: null
    rationale: BullMQ workers require this setting for blocking Redis operations
    alternatives: Use default value (causes deprecation warnings and undefined behavior)
  - id: JOBS-02
    decision: Separate Dockerfile.worker from API Dockerfile
    rationale: Enables independent deployment and scaling of workers vs API
    alternatives: Shared Dockerfile with different CMD (harder to optimize image size)
  - id: JOBS-03
    decision: Process-based health check for workers
    rationale: Workers don't expose HTTP endpoints, so pgrep verifies process running
    alternatives: No health check (can't detect worker crashes)
  - id: JOBS-04
    decision: stop_grace_period of 30s in production
    rationale: Allows in-flight jobs to complete before container shutdown
    alternatives: Default 10s (may interrupt job processing)
  - id: JOBS-05
    decision: Redis configured with appendfsync everysec and noeviction
    rationale: Balances performance with persistence, prevents data loss from eviction
    alternatives: appendfsync always (slower), volatile-lru eviction (loses jobs)

# Metrics
metrics:
  duration: 5m
  completed: 2026-01-24
---

# Phase 15 Plan 02: Worker Container Infrastructure Summary

Worker container entry point created with graceful shutdown, separate Dockerfile for independent deployment, and Docker Compose service definitions with resource limits.

## What Was Built

### Worker Entry Point (`backend/src/workers/index.ts`)
- BullMQ workers for SMS and email queues
- Redis connection with `maxRetriesPerRequest: null` (critical for workers)
- Graceful shutdown handling on SIGTERM/SIGINT
- Event logging for completed, failed, and stalled jobs
- Concurrency configuration (SMS: 5, Email: 2)

### Processor Stubs
- **SMS Notification Processor**: Placeholder implementation logging job data
- **Email Digest Processor**: Placeholder implementation logging job data
- Both will be fully implemented in Phases 16 and 17

### Job Type Definitions (`backend/src/jobs/index.ts`)
- **Created during execution** (deviation from plan - required for worker compilation)
- `BaseJobData` interface enforcing `organizationId` for multi-tenant isolation
- `SmsNotificationJobData` and `EmailDigestJobData` interfaces
- `QueueNames` and `JobNames` constants preventing typos
- Default job options (3 attempts, exponential backoff)

### Dockerfile.worker
- Multi-stage build (deps, builder, production)
- Minimal production image containing only worker code
- Non-root user (nodejs:nodejs) for security
- Process-based health check
- Final CMD: `node dist/src/workers/index.js`

### Docker Compose Configurations
- **docker-compose.yml**: Worker service for local development
- **docker-compose.prod.yml**: Production configuration with:
  - Resource limits (512M memory, 0.5 CPU)
  - Stop grace period (30s)
  - Redis persistence (AOF with everysec, noeviction policy)
  - Scalability support (`--scale worker=3`)

## Deviations from Plan

### Auto-added Dependencies

**1. [Rule 3 - Blocking] Created backend/src/jobs/index.ts**
- **Found during:** Task 1
- **Issue:** Worker entry point imports QueueNames from jobs/index.ts, which doesn't exist (plan 15-01 not executed yet)
- **Fix:** Created minimal job type definitions to unblock worker compilation
- **Files created:** backend/src/jobs/index.ts
- **Commit:** f31ca7b

This deviation was necessary to maintain plan atomicity. Plan 15-02 depends on plan 15-01's job definitions, but creating them here allows 15-02 to be completed and tested independently.

## Technical Decisions

### Decision 1: IORedis maxRetriesPerRequest Configuration
**Context:** BullMQ workers use blocking Redis operations (BRPOPLPUSH) that require specific connection settings.

**Decision:** Workers use `maxRetriesPerRequest: null` while API queues use default (or 1 for fast failure).

**Rationale:**
- BullMQ documentation explicitly requires this for workers
- Without it, workers show deprecation warnings and may behave unpredictably
- Separate connections for workers vs queues allow different configurations

**Impact:** Workers can wait indefinitely for jobs (correct behavior), while API queue operations fail fast if Redis is unavailable.

### Decision 2: Worker Container Separation
**Context:** Workers can run in same process as API or as separate containers.

**Decision:** Separate Dockerfile.worker building minimal worker-only image.

**Rationale:**
- Workers and API scale independently (more workers during high job volume, more API during high traffic)
- Smaller worker image (only worker code, not API routes/middleware)
- Fault isolation (worker crash doesn't affect API)
- Follows microservices best practices

**Impact:**
- Two Docker images to maintain
- Slightly more complex deployment
- Significant operational benefits for production scaling

### Decision 3: Process-Based Health Check
**Context:** Workers don't expose HTTP endpoints like API servers.

**Decision:** Health check uses `pgrep -f "node.*workers/index.js"` to verify process is running.

**Rationale:**
- Workers only connect to Redis and process jobs (no HTTP server)
- Process monitoring is simplest way to detect crashes
- Docker/Kubernetes can restart failed containers automatically

**Alternatives considered:**
- No health check (can't detect crashes)
- Custom HTTP health endpoint (adds unnecessary complexity)
- Redis connection check (doesn't verify worker logic is running)

**Impact:** Reliable worker restart on crashes, simpler than implementing HTTP endpoint.

### Decision 4: Redis Persistence Configuration
**Context:** Production Redis must persist jobs across restarts.

**Decision:** Configure Redis with `appendonly yes`, `appendfsync everysec`, `maxmemory-policy noeviction`.

**Rationale:**
- **appendfsync everysec**: Balances performance (writes every second) with durability (at most 1s of data loss)
- **noeviction**: Prevents Redis from evicting job data when memory limit reached (critical for BullMQ)
- Jobs must survive Redis restarts to prevent lost work

**Alternatives considered:**
- appendfsync always: Too slow for high job volume
- appendfsync no: Risk of significant data loss on crash
- volatile-lru eviction: Would delete jobs, breaking BullMQ

**Impact:** Jobs persist across Redis restarts, preventing lost work. Slight performance overhead from fsync.

## Verification Results

✅ TypeScript compilation successful
✅ docker-compose.yml validates without errors
✅ docker-compose.prod.yml validates without errors
✅ Worker service has correct Redis dependency
✅ Worker service has restart policy and health check
✅ Multi-stage Dockerfile.worker builds correctly
✅ Workers use maxRetriesPerRequest: null
✅ Graceful shutdown handlers registered

## Next Phase Readiness

### Blockers
None

### Prerequisites for Phase 15-03 (Bull Board Dashboard)
- ✅ Worker container can start independently
- ✅ Queues are registered and accessible
- ✅ Docker Compose services configured

### Prerequisites for Phase 16 (SMS Notifications)
- ✅ SMS processor stub exists at `backend/src/workers/processors/sms-notification.processor.ts`
- ✅ Queue name constant available (`QueueNames.SMS_NOTIFICATIONS`)
- ⚠️ Plan 15-01 still needs execution for API-side queue integration

### Prerequisites for Phase 17 (Email Notifications)
- ✅ Email processor stub exists at `backend/src/workers/processors/email-digest.processor.ts`
- ✅ Queue name constant available (`QueueNames.EMAIL_DIGESTS`)
- ⚠️ Plan 15-01 still needs execution for API-side queue integration

## Files Changed

### Created
- `backend/src/workers/index.ts` - Worker entry point with graceful shutdown
- `backend/src/workers/processors/sms-notification.processor.ts` - SMS processor stub
- `backend/src/workers/processors/email-digest.processor.ts` - Email processor stub
- `backend/src/jobs/index.ts` - Job type definitions (deviation from plan)
- `backend/Dockerfile.worker` - Multi-stage worker container build
- `docker-compose.prod.yml` - Production Docker Compose configuration

### Modified
- `docker-compose.yml` - Added worker service definition

## Commits

- `f31ca7b` - feat(15-02): create worker entry point with processor stubs
- `480929a` - feat(15-02): create Dockerfile.worker for worker container
- `c1b2f5f` - feat(15-02): add worker service to docker-compose files

## Production Deployment Notes

### Scaling Workers
```bash
# Scale to 3 worker instances
docker compose -f docker-compose.prod.yml up -d --scale worker=3
```

### Environment Variables Required
- `REDIS_HOST` or `REDIS_URL` - Redis connection
- `NODE_ENV=production` - Production mode

### Monitoring
- Check worker logs: `docker logs frostguard-worker`
- Redis health: `docker exec frostguard-redis redis-cli ping`
- Worker process: `docker exec frostguard-worker pgrep -f worker`

### Graceful Shutdown
Workers respect SIGTERM and allow 30 seconds for in-flight jobs to complete before container stop.

## Known Limitations

1. **Plan 15-01 not executed**: This plan created job definitions to unblock worker development, but plan 15-01 (Queue plugin and QueueService) still needs execution for full integration.

2. **Processor stubs only**: SMS and email processors log job data but don't send actual notifications. Full implementation in Phases 16-17.

3. **No Bull Board yet**: Queue monitoring dashboard will be added in Plan 15-03.

## Success Criteria Met

✅ Worker entry point at backend/src/workers/index.ts
✅ Dockerfile.worker with multi-stage build
✅ Worker service in docker-compose.yml with Redis dependency
✅ Worker service in docker-compose.prod.yml with resource limits
✅ Worker uses maxRetriesPerRequest: null for Redis
✅ Graceful shutdown on SIGTERM/SIGINT

---

**Completed:** 2026-01-24
**Execution Time:** 5 minutes
**Dependencies Added:** IORedis worker configuration, BullMQ Worker setup
**Status:** ✅ Ready for Plan 15-03 (Bull Board Dashboard)
