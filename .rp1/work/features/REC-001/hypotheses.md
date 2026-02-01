# Hypothesis Document: REC-001
**Version**: 1.0.0 | **Created**: 2026-02-01T11:27:00Z | **Status**: VALIDATED

## Summary
| Hypothesis | Risk | Result | Implication |
|------------|------|--------|-------------|
| HYP-001 | HIGH | REJECTED | Must create separate Redis clients for cache invalidation pub/sub |
| HYP-002 | MEDIUM | REJECTED | Must add prom-client dependency and implement /metrics endpoint |
| HYP-003 | HIGH | CONFIRMED | Redis noeviction policy is safe for BullMQ + cache coexistence |

## Hypotheses

### HYP-001: Socket.io Redis adapter can be leveraged for cache invalidation
**Risk Level**: HIGH
**Status**: REJECTED
**Statement**: Socket.io Redis adapter can be leveraged to propagate cache invalidation across all backend instances using Redis Pub/Sub
**Context**: For the Redis caching implementation, we need a mechanism to invalidate cached dashboard aggregations across all backend instances when data changes. If the existing Socket.io Redis adapter supports custom Pub/Sub channels, we can reuse this infrastructure for cache invalidation.
**Validation Criteria**:
- CONFIRM if: Socket.io Redis adapter supports publishing/subscribing to custom channels beyond Socket.io events
- REJECT if: Socket.io Redis adapter is limited to Socket.io event propagation only and cannot be used for custom Pub/Sub
**Suggested Method**: CODEBASE_ANALYSIS + EXTERNAL_RESEARCH

### HYP-002: prom-client library is already installed in the backend
**Risk Level**: MEDIUM
**Status**: REJECTED
**Statement**: prom-client library is already installed in the backend for Prometheus metrics collection
**Context**: The design includes adding Prometheus metrics for cache hit/miss rates. If prom-client is already installed, we can immediately add cache metrics. If not installed, we need to add it as a dependency.
**Validation Criteria**:
- CONFIRM if: prom-client is listed in backend/package.json dependencies and /metrics endpoint exists
- REJECT if: prom-client is not installed in the backend
**Suggested Method**: CODEBASE_ANALYSIS

### HYP-003: Shared Redis instance has sufficient memory for dashboard cache
**Risk Level**: HIGH
**Status**: CONFIRMED
**Statement**: Shared Redis instance has sufficient memory to handle dashboard cache (estimated <100MB for 1000 organizations) without evicting BullMQ jobs
**Context**: The design uses the existing shared Redis instance for both BullMQ job queues and the new dashboard cache. If Redis is not configured with appropriate memory limits and eviction policies, adding cache data could cause BullMQ jobs to be evicted, breaking background processing.
**Validation Criteria**:
- CONFIRM if: Redis has maxmemory set with noeviction or allkeys-lru policy, OR has sufficient memory headroom (>200MB available)
- REJECT if: Redis uses volatile-* eviction policy that could evict BullMQ job data, OR has <100MB available memory
**Suggested Method**: CODEBASE_ANALYSIS + EXTERNAL_RESEARCH

## Validation Findings

### HYP-001 Findings
**Validated**: 2026-02-01T11:28:00Z
**Method**: CODEBASE_ANALYSIS + EXTERNAL_RESEARCH
**Result**: REJECTED

**Evidence**:
The Socket.io Redis adapter does NOT expose the underlying pub/sub clients for custom channel operations. Analysis revealed:

1. **Codebase Analysis** (backend/src/services/socket.service.ts:83-102):
   - The SocketService creates Redis pub/sub clients (`pubClient`, `subClient`) via the `redis` package
   - These clients are passed to `createAdapter()` from `@socket.io/redis-adapter`
   - The clients are stored as private properties and used only for Socket.io adapter initialization
   - No methods expose these clients for custom pub/sub operations outside Socket.io events

2. **External Research**:
   - Official Socket.io Redis adapter documentation does not provide API methods to access the underlying Redis clients after initialization
   - The adapter is designed specifically for Socket.io event propagation across server instances
   - The documentation recommends using a separate Redis Emitter for external publishing, not direct client access
   - To use custom Redis pub/sub channels, separate Redis client instances must be created independently

**Sources**:
- backend/src/services/socket.service.ts:27-117
- [Socket.IO Redis Adapter Documentation](https://socket.io/docs/v4/redis-adapter/)
- [Socket.IO Adapter Documentation](https://socket.io/docs/v4/adapter/)

**Implications for Design**:
The design must create separate Redis client instances for cache invalidation pub/sub. The existing Socket.io Redis adapter cannot be reused for this purpose. This adds a small dependency (separate Redis clients) but provides clear separation of concerns between real-time Socket.io events and cache invalidation messages.

### HYP-002 Findings
**Validated**: 2026-02-01T11:28:00Z
**Method**: CODEBASE_ANALYSIS
**Result**: REJECTED

**Evidence**:
The prom-client library is NOT installed in the backend. Analysis revealed:

1. **Package.json Analysis** (backend/package.json:18-62):
   - Searched all dependencies, devDependencies, and optionalDependencies
   - No `prom-client` or related Prometheus client library found
   - 26 total production dependencies, none related to Prometheus metrics

2. **Code Search Results**:
   - Grep search for `prom-client` and `/metrics` endpoint found zero results in backend source code
   - Only reference to `/metrics` found in documentation file (backend/docs/MONITORING.md:261) as a future TODO item
   - No existing Prometheus metrics implementation

**Sources**:
- backend/package.json:1-62

**Implications for Design**:
The design must add prom-client as a new dependency and implement the /metrics endpoint from scratch. This is a straightforward addition but requires:
1. Adding `prom-client` to package.json dependencies
2. Implementing metrics endpoint in Fastify
3. Creating metric collectors for cache hit/miss rates
4. Updating Prometheus scrape configuration to include the /metrics endpoint

### HYP-003 Findings
**Validated**: 2026-02-01T11:28:00Z
**Method**: CODEBASE_ANALYSIS + EXTERNAL_RESEARCH
**Result**: CONFIRMED

**Evidence**:
Redis IS properly configured with `noeviction` policy, which is safe for BullMQ and cache coexistence. Analysis revealed:

1. **Production Configuration** (docker-compose.prod.yml:36-58):
   - Redis command explicitly sets: `--maxmemory-policy noeviction`
   - Memory limits configured: 512MB max, 256MB reserved
   - This provides ample headroom for estimated <100MB dashboard cache
   - With 512MB limit and typical BullMQ usage (<100MB for job metadata), there's 300-400MB available for cache

2. **Development Configuration** (docker-compose.yml:52-65):
   - Redis runs with default settings (no maxmemory limit)
   - Default Redis behavior is `noeviction` when no maxmemory is set
   - Development environment has unlimited memory growth potential

3. **BullMQ Safety Research**:
   - BullMQ official documentation states: "It is very important to configure the maxmemory-policy setting to noeviction, as this is the only setting that guarantees the correct behavior of the queues"
   - The `noeviction` policy prevents Redis from arbitrarily removing keys when memory limit is reached
   - Instead of evicting data (which would break BullMQ), Redis returns errors for new writes when full
   - This ensures BullMQ job data and cache data are both safe from eviction

**Sources**:
- docker-compose.prod.yml:38-42
- docker-compose.yml:52-65
- [BullMQ Production Guide - Going to Production](https://docs.bullmq.io/guide/going-to-production)
- [BullMQ Issue #2737 - Eviction policy is volatile-lru. It should be "noeviction"](https://github.com/taskforcesh/bullmq/issues/2737)

**Implications for Design**:
The shared Redis instance is correctly configured and safe for adding cache data. The `noeviction` policy guarantees that neither BullMQ jobs nor cache entries will be arbitrarily evicted. With 512MB production limit and estimated <100MB cache usage, there's sufficient headroom. The design should:
1. Monitor Redis memory usage in production (set alerts at ~80% capacity as recommended by BullMQ community)
2. Use appropriate TTLs on cache keys to allow natural expiration
3. Consider adding Redis memory metrics to Grafana dashboards for visibility
