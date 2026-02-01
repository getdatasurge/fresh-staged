# Design Decisions: Redis Caching for Dashboard Aggregations

**Feature ID**: REC-001
**Created**: 2026-02-01

---

## Decision Log

| ID | Decision | Choice | Rationale | Alternatives Considered |
|----|----------|--------|-----------|------------------------|
| D1 | **Cache Storage Backend** | Redis (shared with BullMQ) | Zero infrastructure cost since Redis already deployed for BullMQ. Supports multi-instance deployments via shared state. Mature technology with proven scalability. | **Dedicated Redis instance**: Higher infrastructure cost (~$20/month), no technical benefit for current scale. **In-memory Map**: No multi-instance support, current OrganizationStatsService uses this but cannot scale horizontally. |
| D2 | **Cache Pattern** | Cache-aside (lazy loading) | Explicit cache control with database as source of truth. Simple invalidation strategy. Proven pattern used by existing OrganizationStatsService. Cache populated organically based on actual usage. | **Write-through**: Complex for read-heavy workload; every write requires cache update logic. **Read-through**: Less control over cache population; requires additional abstraction layer. |
| D3 | **Invalidation Timing** | Synchronous before WebSocket emit | Ensures next dashboard request gets fresh data immediately. Prevents race condition where event emitted but cache not invalidated. Meets NFR-CACHE-003 (<500ms invalidation latency). | **Asynchronous after emit**: Race condition risk - client receives event but cache still has stale data. **TTL-only**: 60-second stale data window unacceptable for real-time alerts. |
| D4 | **Invalidation Granularity** | Organization-level wildcard pattern | Simple implementation using Redis SCAN + DEL. 60-second TTL makes fine-grained invalidation unnecessary (stale data window already short). Reduces complexity vs per-query-type invalidation. | **Per-query-type**: More surgical invalidation (e.g., only invalidate alert counts on alertCreated), but adds complexity mapping events to query types. **Per-unit**: Over-engineering given 60s TTL; would require complex key tracking. |
| D5 | **TTL Duration** | 60 seconds | Balances cache hit rate (longer TTL = higher hit rate) with data freshness (shorter TTL = fresher data). 2x the existing in-memory cache TTL (30s in OrganizationStatsService), providing better hit rate while maintaining acceptable freshness. User tolerance for 60s staleness validated by product requirements. | **30 seconds**: Lower hit rate (~50-60%), may not achieve 70% target. **120 seconds**: Risk of stale data complaints from users; 2-minute window too long for alert-driven system. |
| D6 | **Redis Client Library** | ioredis | Already installed as dependency for BullMQ (see backend/src/services/queue.service.ts line 28). Mature library with TypeScript support. Avoids dependency bloat by reusing existing library. | **node-redis**: Newer official client, but requires migration effort and adds new dependency. **redis (old library)**: Deprecated; ioredis is industry standard. |
| D7 | **Serialization Format** | JSON.stringify/parse | Simple, built-in, type-safe with TypeScript generics. Sufficient for cached objects (all primitive values + nested objects). Human-readable for debugging. No additional dependencies. | **MessagePack**: Binary serialization, smaller payloads, but overkill for <1KB cached objects. **Protobuf**: Requires schema definitions, adds complexity without benefit. |
| D8 | **Service Architecture Pattern** | Singleton with Fastify plugin | Matches existing QueueService pattern (backend/src/services/queue.service.ts lines 376-394). Proper lifecycle management via plugin hooks (onClose for shutdown). Fastify decoration enables dependency injection across routes/services. | **Global singleton**: No Fastify integration, manual lifecycle management. **Constructor injection**: Over-engineering for service used globally; adds complexity to service initialization. |
| D9 | **Error Handling Strategy** | Graceful degradation (fallback to database) | Cache failures invisible to users; dashboard continues functioning (slower but operational). No breaking changes to existing functionality. Aligns with existing QueueService pattern (logs warning, continues without queues if Redis unavailable). | **Throw errors**: Breaks dashboard on Redis failure; unacceptable for production. **Retry logic**: Adds complexity; if Redis down, retries won't help. Graceful degradation is simpler and more resilient. |
| D10 | **Metrics Library** | prom-client | Standard Prometheus client for Node.js ecosystem. Likely already installed (architecture.md mentions Prometheus monitoring). Widely adopted, well-documented, supports custom metrics. | **Custom metrics**: Reinventing the wheel; no benefit. **Datadog client**: Vendor lock-in; requires separate account/billing. **StatsD**: Less granular than Prometheus histograms. |
| D11 | **Replace In-Memory Cache** | Yes, remove OrganizationStatsService Map | Consolidates caching to Redis for multi-instance support. Avoids dual caching layers (memory waste + invalidation complexity). Existing 30s TTL replaced with 60s Redis TTL (better hit rate). | **Keep both caches**: Memory waste running two caches. Dual invalidation logic (complex). No benefit to layered caching at this scale. **Gradual migration**: Adds complexity with feature flag; not worth it for single-service change. |
| D12 | **Cache Key Namespace** | `dashboard:` prefix | Clear namespace separation from BullMQ keys (use `bull:` prefix) and future cache types. Enables pattern-based invalidation (`dashboard:*:org:{id}`) without affecting other Redis keys. Follows Redis best practice for multi-tenant key design. | **No prefix**: Risk of key collisions with BullMQ or other services. **`cache:` prefix**: Too generic; multiple cache types may exist in future. |
| D13 | **Pattern Invalidation Implementation** | SCAN + DEL (not KEYS + DEL) | SCAN is non-blocking cursor-based iteration, safe for production. KEYS blocks Redis while scanning all keys (dangerous in production). SCAN with MATCH pattern achieves same result without blocking other operations. | **KEYS command**: Blocks Redis server during scan; unacceptable for production (could block BullMQ operations). **Track keys in Set**: Adds complexity; requires updating Set on every cache write. |
| D14 | **Health Check Integration** | Add cache health to `/health` endpoint | Consistent with existing health check pattern for database and Redis. Enables monitoring/alerting for cache availability. Returns latency metric for cache operations (useful for diagnosing performance issues). | **Separate endpoint**: Creates endpoint sprawl; consolidated `/health` is simpler. **No health check**: Cannot monitor cache availability; hidden failures. |
| D15 | **Plugin Registration Order** | Before OrganizationStatsService initialization | CacheService must be available before services that depend on it. Plugin registration in app.ts ensures singleton set before service layer initialization. Matches existing pattern (queue.plugin before workers). | **After service initialization**: Service would not have CacheService available on startup. **Lazy initialization**: Adds complexity; eager initialization is simpler and catches misconfigurations early. |

---

## AFK Mode: Auto-Selected Technology Decisions

*No AFK mode decisions - this design was created in interactive mode with user-provided requirements specifying all technology choices (Redis, cache-aside pattern, 60s TTL, WebSocket invalidation).*

---

## Key Architectural Insights

### Insight 1: Existing In-Memory Cache Discovery
**Finding**: OrganizationStatsService (lines 1-474) already implements in-memory caching for the exact same dashboard queries (unit counts, alert counts, compliance percentage) with a 30-second TTL.

**Impact**: This validates the requirements' caching approach but also indicates the current implementation cannot scale horizontally (Map-based cache doesn't share state across instances).

**Decision**: Replace in-memory Map with Redis cache (D11) to enable multi-instance deployments and increase TTL to 60 seconds for better hit rate.

---

### Insight 2: Redis Already Deployed for BullMQ
**Finding**: QueueService (backend/src/services/queue.service.ts) uses ioredis client to connect to Redis for BullMQ background jobs. Redis connection configuration already exists via REDIS_URL or REDIS_HOST/REDIS_PORT environment variables.

**Impact**: Zero infrastructure cost for caching implementation. Can reuse existing Redis connection pattern and error handling strategies.

**Decision**: Share Redis instance with BullMQ (D1) and reuse ioredis library (D6) to minimize dependencies and infrastructure changes.

---

### Insight 3: Socket.io Event-Driven Architecture
**Finding**: SocketService emits real-time events (`unitUpdate`, `alertCreated`, `alertResolved`) when state changes occur. These events already trigger dashboard UI updates via WebSocket.

**Impact**: Natural integration point for cache invalidation - invalidate cache before emitting event ensures next dashboard load fetches fresh data.

**Decision**: Synchronous cache invalidation before WebSocket emit (D3) to prevent race conditions where event arrives but cache still has stale data.

---

### Insight 4: Singleton Service Pattern
**Finding**: All infrastructure services (QueueService, SocketService, TelnyxService) follow singleton pattern with `setXService()` and `getXService()` helper functions. Fastify plugins decorate instance and set singleton during initialization.

**Impact**: Established pattern for service registration and lifecycle management. Following this pattern ensures consistency and proper shutdown handling.

**Decision**: Implement CacheService as singleton with Fastify plugin (D8) matching existing QueueService pattern.

---

### Insight 5: Graceful Degradation as Resilience Strategy
**Finding**: QueueService already implements graceful degradation - if Redis unavailable, logs warning and continues without background jobs (lines 74-80, 127-138). Health checks report degraded status but don't crash.

**Impact**: Proven resilience pattern for Redis failures. Users experience slower dashboard (database queries) but no outages.

**Decision**: Implement same graceful degradation in CacheService (D9) - catch all Redis errors, log warnings, return null/void to trigger database fallback.

---

## Risk Mitigation Summary

| Risk | Mitigation Decision | Decision ID |
|------|-------------------|-------------|
| Redis memory exhaustion | Use shared Redis with LRU eviction policy; monitor cache size | D1 |
| Cache invalidation race conditions | Synchronous invalidation before event emission | D3 |
| Multi-instance invalidation propagation | Flagged for hypothesis validation (HYP-001) | See design.md Appendix A |
| Stale data complaints | 60-second TTL balances freshness vs hit rate; event-driven invalidation | D5, D3 |
| Redis connection failures | Graceful degradation to database queries; no breaking changes | D9 |
| Cache key collisions | Namespace with `dashboard:` prefix | D12 |
| Production Redis blocking | Use SCAN instead of KEYS for pattern invalidation | D13 |

---

## Performance Trade-offs

### Trade-off 1: TTL Duration (D5)
**Chosen**: 60 seconds
**Benefit**: Higher cache hit rate (target >70%)
**Cost**: Up to 60 seconds of stale data exposure (mitigated by event-driven invalidation)
**Justification**: Product requirements explicitly accept 60s staleness; event invalidation reduces actual staleness to <500ms in practice.

---

### Trade-off 2: Invalidation Granularity (D4)
**Chosen**: Organization-level wildcard invalidation
**Benefit**: Simple implementation; single Redis SCAN + DEL operation per event
**Cost**: Over-invalidation (e.g., alertCreated invalidates unit counts, temperature trends, device counts)
**Justification**: 60s TTL means over-invalidated cache entries would expire soon anyway; complexity of fine-grained invalidation not justified.

---

### Trade-off 3: Shared Redis Instance (D1)
**Chosen**: Share Redis with BullMQ
**Benefit**: Zero infrastructure cost; simplified deployment
**Cost**: Risk of memory contention with BullMQ queues (flagged as HYP-003)
**Justification**: Estimated cache size <100MB for 1000 orgs; BullMQ queue depth typically low (jobs processed quickly); monitoring can detect memory issues early.

---

## Alternative Approaches Rejected

### Approach 1: Keep In-Memory Cache + Add Redis for Multi-Instance
**Description**: Layer Redis cache on top of existing in-memory Map cache for two-tier caching.

**Rejected Because**:
- Dual invalidation logic increases complexity (must invalidate both caches)
- Memory waste running two caches with overlapping data
- No significant performance benefit (Redis cache-aside already fast enough)
- Maintenance burden of two caching implementations

**Selected Instead**: D11 - Replace in-memory cache entirely with Redis.

---

### Approach 2: Write-Through Caching
**Description**: Update cache synchronously on every database write (e.g., after temperature reading ingestion, update cached unit status).

**Rejected Because**:
- Complex implementation for read-heavy workload (dashboard queries)
- Every write path requires cache update logic (error-prone)
- Limited benefit since WebSocket events already trigger invalidation
- Cache-aside pattern is simpler and proven (already used in OrganizationStatsService)

**Selected Instead**: D2 - Cache-aside pattern with event-driven invalidation.

---

### Approach 3: Dedicated Redis Instance for Caching
**Description**: Deploy separate Redis instance exclusively for dashboard caching.

**Rejected Because**:
- Infrastructure cost (~$20/month for managed Redis)
- Operational overhead (additional service to monitor, backup, scale)
- No technical benefit at current scale (<100MB cache size estimate)
- Shared Redis instance has sufficient capacity for both BullMQ and cache

**Selected Instead**: D1 - Share Redis instance with BullMQ.

---

## Open Questions for Implementation

### Q1: Prometheus Metrics Infrastructure
**Question**: Is `prom-client` already installed? Does `/metrics` endpoint exist?

**Context**: Requirements specify Prometheus metrics for cache hit/miss tracking. Design assumes metrics infrastructure is ready.

**Resolution Plan**: Verify `prom-client` in package.json during implementation. If not installed, add dependency and create `/metrics` endpoint (estimated +4 hours).

**Risk**: MEDIUM (see HYP-002 in design.md)

---

### Q2: Multi-Instance Cache Invalidation
**Question**: Can Socket.io Redis adapter be leveraged for cache invalidation propagation across all backend instances?

**Context**: Design assumes cache invalidation on one instance propagates to all instances via Redis Pub/Sub.

**Resolution Plan**: Verify Socket.io Redis adapter supports custom Pub/Sub channels during implementation. If not, implement separate Redis Pub/Sub client for invalidation messages (estimated +6 hours).

**Risk**: HIGH (see HYP-001 in design.md)

---

### Q3: Redis Memory Capacity
**Question**: Does shared Redis instance have sufficient memory for dashboard cache without evicting BullMQ jobs?

**Context**: Estimated cache size <100MB for 1000 orgs, but actual BullMQ usage unknown.

**Resolution Plan**: Monitor Redis memory usage in staging environment during integration testing. If memory issues detected, reduce TTL to 30s or increase Redis memory allocation.

**Risk**: HIGH (see HYP-003 in design.md)

---

## Lessons Learned from Existing Code

### Lesson 1: Graceful Degradation is First-Class Pattern
**Observation**: QueueService logs warning and continues without queues if Redis unavailable (lines 127-138). Health checks report "degraded" status but don't crash application.

**Application**: CacheService follows same pattern - cache failures fallback to database queries transparently. No breaking changes to existing functionality.

---

### Lesson 2: Singleton + Plugin Pattern for Infrastructure Services
**Observation**: All infrastructure services (QueueService, SocketService) use singleton pattern with Fastify plugin for initialization and lifecycle management.

**Application**: CacheService uses identical pattern for consistency. Plugin registration in app.ts ensures proper initialization order and shutdown handling.

---

### Lesson 3: In-Memory Caching Already Validated Approach
**Observation**: OrganizationStatsService already implements in-memory caching with TTL, cache invalidation, and cache-aside pattern for the same dashboard queries.

**Application**: Redis caching is evolutionary improvement (multi-instance support, longer TTL) rather than revolutionary change. Existing code validates the caching approach works.

---

## Decision Approval

**Reviewed By**: [Pending]
**Approved By**: [Pending]
**Date**: 2026-02-01

**Sign-off Status**: Draft - pending hypothesis validation (HYP-001, HYP-002, HYP-003)
