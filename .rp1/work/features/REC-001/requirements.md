# Requirements Specification: Redis Caching for Dashboard Aggregations

**Feature ID**: REC-001
**Parent PRD**: [FrostGuard Complete Platform v1](../../prds/main.md)
**Version**: 1.0.0
**Status**: Draft
**Created**: 2026-02-01

## 1. Feature Overview

Implement Redis-based caching for high-frequency dashboard aggregation queries to improve dashboard load performance and reduce database load. This feature addresses the strategic recommendation REC-001 from the v2.9 performance optimization roadmap by introducing a cache-aside pattern for unit status aggregations, alert counts, and temperature trend queries that are repeatedly requested by dashboard users.

## 2. Business Context

### 2.1 Problem Statement

The FrostGuard dashboard currently executes expensive aggregation queries directly against PostgreSQL for every page load and real-time update. As the number of organizations, devices, and historical temperature events grows, these queries create database contention that degrades dashboard load times and limits concurrent user capacity. Users experience dashboard load times averaging 2 seconds, with P95 exceeding 3 seconds during peak usage periods.

**Current Pain Points**:
- Dashboard load time: 2 seconds average (target: <1 second)
- Database query load creates bottleneck for concurrent users
- Repeated aggregation queries for same data (e.g., "How many units are in alarm state?")
- WebSocket real-time updates trigger expensive queries every few seconds
- Limited concurrent user capacity due to database contention

### 2.2 Business Value

**Performance Impact**:
- **Dashboard load time improvement**: Reduce P95 load time from 2 seconds to <1 second (50% improvement)
- **Database load reduction**: Decrease database query volume by 40% through 70-80% cache hit rate
- **Concurrent user capacity**: Support 50% more concurrent users by eliminating database contention

**Cost Efficiency**:
- **Zero infrastructure cost**: Redis already deployed for BullMQ and Socket.io; no new infrastructure required
- **Development cost**: $2,000 one-time development (1 week, 1 backend developer)
- **ROI**: 282% in year 1 based on improved user capacity and reduced infrastructure scaling needs

**User Experience**:
- Faster dashboard responsiveness improves user engagement
- Real-time updates feel instantaneous with cached data
- Reduced latency for high-frequency operations (status checks, alert counts)

### 2.3 Success Metrics

**Performance Targets** (measured after 7-day rollout):
- Cache hit rate >70% for dashboard queries
- Dashboard load time <1 second (P95) for cached requests
- Database query rate decreases by >30%

**Quality Targets**:
- No increase in stale data reports from users
- Cache invalidation latency <500ms on WebSocket events
- Zero cache-related errors logged in production

**Business Impact**:
- User retention improves by reducing dashboard friction
- Support capacity increases as fewer performance complaints arise

## 3. Stakeholders & Users

### 3.1 User Types

**Primary Beneficiaries**:

1. **Facility Managers** (heavy dashboard users)
   - Need to monitor multiple units across locations in real-time
   - Check dashboard 10+ times per day
   - Expect sub-second load times for responsive monitoring
   - **Benefit**: Faster dashboard loads, real-time updates feel instantaneous

2. **Operations Staff** (frequent dashboard users)
   - Respond to alerts by checking dashboard for unit status
   - Need quick confirmation that corrective action resolved issue
   - **Benefit**: Reduced wait time when verifying alert resolution

3. **System Administrators** (indirect beneficiary)
   - Manage platform performance and scalability
   - Monitor database load and query performance
   - **Benefit**: Reduced database contention, improved system stability

### 3.2 Stakeholder Interests

**Engineering Team**:
- Maintainable caching abstraction that supports future features
- Clear cache invalidation strategy to prevent stale data bugs
- Observability into cache hit rates and performance gains

**Product Team**:
- Measurable improvement in dashboard performance metrics
- No degradation in data freshness or user experience
- Foundation for future caching optimizations

**End Users**:
- Faster dashboard experience without sacrificing data accuracy
- No awareness of caching implementation (transparent)

## 4. Scope Definition

### 4.1 In Scope

**Cacheable Queries**:
1. **Unit Status Aggregations**: Count of units by alarm state (normal, too_hot, too_cold) per organization
2. **Alert Counts**: Count of unresolved alerts per organization and per unit
3. **Temperature Trends**: Recent temperature readings for unit (last 24 hours)
4. **Device Online Status**: Count of online/offline devices per organization

**Caching Infrastructure**:
1. Create `backend/src/services/cache.service.ts` - Redis caching service abstraction
2. Define cache key schema (e.g., `dashboard:org:{orgId}:units:status`)
3. Implement cache-aside pattern (check cache → query DB → set cache)
4. Configure TTL strategy (60-second default TTL)

**Cache Invalidation**:
1. Invalidate on WebSocket events: `unitUpdate`, `alertCreated`, `alertResolved`, `deviceStatusChange`
2. TTL-based expiration as fallback (60 seconds)
3. Organization-scoped invalidation (invalidate all org-related cache keys)

**Observability**:
1. Prometheus metrics for cache hit/miss rates
2. Log cache invalidation events (debug level)
3. Monitor cache size and memory usage

### 4.2 Out of Scope

**Explicitly Excluded**:
- Caching AI assistant queries (context-dependent, low repeatability)
- Caching historical compliance reports (low frequency, high data volume)
- User-specific caching (session-based caching adds complexity)
- Redis cluster configuration (single Redis instance sufficient for v1)
- Cache warming strategies (rely on organic cache population)
- Cache preloading during deployments

### 4.3 Assumptions

**Technical Assumptions**:
- Redis is already deployed and available for caching (shared with BullMQ and Socket.io)
- Dashboard queries are organization-scoped (cache keys partition by organizationId)
- WebSocket events reliably trigger cache invalidation (Socket.io infrastructure stable)
- Cache invalidation latency <500ms acceptable (TTL provides fallback)

**Business Assumptions**:
- Users tolerate up to 60 seconds of stale data with TTL fallback
- Cache hit rate >70% achievable with identified cacheable queries
- 50% dashboard load time improvement acceptable ROI for development cost

**Risk Assumptions**:
- Cache failures degrade gracefully (fallback to database queries)
- Redis memory capacity sufficient for dashboard cache (estimated <100MB for 1000 organizations)

## 5. Functional Requirements

### REQ-CACHE-001: Cache Service Abstraction
**Priority**: Must Have
**User Type**: Backend Developer
**Requirement**: Create a reusable cache service abstraction (`backend/src/services/cache.service.ts`) that supports get, set, delete, and invalidate operations with TTL configuration.

**Rationale**: Centralized caching logic ensures consistent cache key management, TTL enforcement, and error handling across all cached queries.

**Acceptance Criteria**:
- Service provides `get<T>(key: string): Promise<T | null>` method
- Service provides `set<T>(key: string, value: T, ttl?: number): Promise<void>` method
- Service provides `delete(key: string): Promise<void>` method
- Service provides `invalidatePattern(pattern: string): Promise<void>` method for wildcard invalidation
- Default TTL configurable via environment variable (default: 60 seconds)
- Graceful fallback if Redis unavailable (log error, return null)

---

### REQ-CACHE-002: Cache Key Schema
**Priority**: Must Have
**User Type**: Backend Developer
**Requirement**: Define a consistent cache key naming schema that supports organization-scoped queries and wildcard invalidation.

**Rationale**: Structured cache keys enable efficient invalidation by organization or query type while avoiding key collisions.

**Acceptance Criteria**:
- Cache keys follow pattern: `dashboard:{queryType}:org:{orgId}:{subKey}`
- Example keys:
  - `dashboard:units:status:org:123` (unit status aggregation)
  - `dashboard:alerts:count:org:123` (alert count)
  - `dashboard:temperature:trends:org:123:unit:456` (temperature trends for unit)
  - `dashboard:devices:online:org:123` (device online count)
- Invalidation supports wildcard patterns (e.g., `dashboard:*:org:123` invalidates all org 123 cache)
- Keys are URL-safe (no special characters beyond `:`)

---

### REQ-CACHE-003: Unit Status Aggregation Caching
**Priority**: Must Have
**User Type**: Facility Manager, Operations Staff
**Requirement**: Cache the count of units by alarm state (normal, too_hot, too_cold) per organization with 60-second TTL.

**Rationale**: Unit status aggregation is the most frequently queried dashboard metric, executed on every dashboard load and real-time update.

**Acceptance Criteria**:
- Query cached with key: `dashboard:units:status:org:{orgId}`
- Cache value structure: `{ normal: number, too_hot: number, too_cold: number }`
- Cache populated on first miss (cache-aside pattern)
- TTL: 60 seconds
- Invalidated on WebSocket events: `unitUpdate`
- Cache hit logged as Prometheus metric `dashboard_cache_hit{query="units_status"}`

---

### REQ-CACHE-004: Alert Count Caching
**Priority**: Must Have
**User Type**: Facility Manager, Operations Staff
**Requirement**: Cache the count of unresolved alerts per organization and per unit with 60-second TTL.

**Rationale**: Alert counts are displayed prominently on dashboard and queried on every load to show critical status.

**Acceptance Criteria**:
- Organization-level alert count cached with key: `dashboard:alerts:count:org:{orgId}`
- Unit-level alert count cached with key: `dashboard:alerts:count:org:{orgId}:unit:{unitId}`
- Cache value: `{ unresolved: number }`
- Cache populated on first miss
- TTL: 60 seconds
- Invalidated on WebSocket events: `alertCreated`, `alertResolved`
- Cache hit logged as Prometheus metric `dashboard_cache_hit{query="alerts_count"}`

---

### REQ-CACHE-005: Temperature Trends Caching
**Priority**: Should Have
**User Type**: Facility Manager
**Requirement**: Cache recent temperature readings for a unit (last 24 hours) with 60-second TTL.

**Rationale**: Temperature trend charts require time-series queries that are expensive but infrequently change (new readings every few minutes).

**Acceptance Criteria**:
- Cached with key: `dashboard:temperature:trends:org:{orgId}:unit:{unitId}`
- Cache value: Array of `{ timestamp: string, temperature: number, alarmState: string }` (last 24 hours)
- Cache populated on first miss
- TTL: 60 seconds
- Invalidated on WebSocket events: `unitUpdate` (for specific unit)
- Cache hit logged as Prometheus metric `dashboard_cache_hit{query="temperature_trends"}`

---

### REQ-CACHE-006: Device Online Status Caching
**Priority**: Should Have
**User Type**: System Administrator, Facility Manager
**Requirement**: Cache the count of online/offline devices per organization with 60-second TTL.

**Rationale**: Device online status aggregation is used in dashboard overview and device management pages.

**Acceptance Criteria**:
- Cached with key: `dashboard:devices:online:org:{orgId}`
- Cache value: `{ online: number, offline: number }`
- Cache populated on first miss
- TTL: 60 seconds
- Invalidated on WebSocket events: `deviceStatusChange`
- Cache hit logged as Prometheus metric `dashboard_cache_hit{query="devices_online"}`

---

### REQ-CACHE-007: Cache-Aside Pattern Implementation
**Priority**: Must Have
**User Type**: Backend Developer
**Requirement**: Implement cache-aside pattern for all cacheable queries: check cache → if miss, query database → set cache → return result.

**Rationale**: Cache-aside pattern ensures database is source of truth while minimizing query load.

**Acceptance Criteria**:
- Cache check occurs before database query
- Database query executes only on cache miss
- Cache populated immediately after database query (no async delay)
- Cache misses logged as Prometheus metric `dashboard_cache_miss{query}`
- Database query errors bypass cache (do not cache errors)

---

### REQ-CACHE-008: WebSocket Event Invalidation
**Priority**: Must Have
**User Type**: Backend Developer
**Requirement**: Invalidate relevant cache keys when WebSocket events are emitted (`unitUpdate`, `alertCreated`, `alertResolved`, `deviceStatusChange`).

**Rationale**: Real-time events indicate state changes that make cached data stale; immediate invalidation ensures next dashboard load fetches fresh data.

**Acceptance Criteria**:
- `unitUpdate` event invalidates: `dashboard:units:status:org:{orgId}`, `dashboard:temperature:trends:org:{orgId}:unit:{unitId}`
- `alertCreated` event invalidates: `dashboard:alerts:count:org:{orgId}`, `dashboard:alerts:count:org:{orgId}:unit:{unitId}`
- `alertResolved` event invalidates: `dashboard:alerts:count:org:{orgId}`, `dashboard:alerts:count:org:{orgId}:unit:{unitId}`
- `deviceStatusChange` event invalidates: `dashboard:devices:online:org:{orgId}`
- Invalidation occurs synchronously before WebSocket event emitted
- Invalidation errors logged but do not block event emission

---

### REQ-CACHE-009: TTL Fallback Strategy
**Priority**: Must Have
**User Type**: Backend Developer
**Requirement**: Configure 60-second TTL on all cached queries as fallback expiration mechanism.

**Rationale**: TTL ensures stale data eventually expires even if cache invalidation fails or is missed.

**Acceptance Criteria**:
- All cache entries have 60-second TTL (configurable via environment variable)
- TTL resets on cache update (new TTL on every set operation)
- Expired cache entries automatically removed by Redis
- TTL expiration logged as metric `dashboard_cache_expiration{query}`

---

### REQ-CACHE-010: Graceful Degradation on Cache Failure
**Priority**: Must Have
**User Type**: Backend Developer, System Administrator
**Requirement**: If Redis is unavailable or cache operations fail, gracefully degrade to direct database queries without breaking dashboard functionality.

**Rationale**: Cache failures should not cause dashboard outages; database queries serve as fallback.

**Acceptance Criteria**:
- Cache service catches Redis connection errors
- Cache miss returned on Redis failure (triggers database query)
- Cache errors logged with error level
- Prometheus metric `dashboard_cache_errors{operation}` incremented
- Dashboard queries continue functioning (slower but operational)

## 6. Non-Functional Requirements

### 6.1 Performance Expectations

**NFR-CACHE-001: Cache Hit Rate**
- **Target**: Achieve >70% cache hit rate within 7 days of production rollout
- **Measurement**: Prometheus metric `dashboard_cache_hit_rate` (hits / (hits + misses))
- **Justification**: 70% hit rate required to achieve 40% database load reduction

**NFR-CACHE-002: Dashboard Load Time**
- **Target**: Dashboard load time <1 second (P95) for cached requests
- **Measurement**: Frontend performance monitoring (Web Vitals, Lighthouse)
- **Justification**: 50% improvement from current 2-second P95 load time

**NFR-CACHE-003: Cache Invalidation Latency**
- **Target**: Cache invalidation completes <500ms after WebSocket event
- **Measurement**: Server-side timing between event emission and invalidation completion
- **Justification**: Ensures next dashboard load fetches fresh data within acceptable window

**NFR-CACHE-004: Database Query Reduction**
- **Target**: Decrease database query rate by >30%
- **Measurement**: PostgreSQL query logs; queries per second before/after rollout
- **Justification**: Reduces database contention, increases concurrent user capacity

### 6.2 Security Requirements

**NFR-CACHE-005: Cache Isolation**
- **Requirement**: Cache keys must enforce organization-scoped isolation to prevent cross-tenant data leakage
- **Mitigation**: All cache keys include `org:{orgId}` segment; cache service validates organizationId
- **Validation**: Integration tests verify organization A cannot access organization B cached data

**NFR-CACHE-006: Sensitive Data Handling**
- **Requirement**: Cached data must not include personally identifiable information (PII) beyond organizationId
- **Mitigation**: Cache only aggregations (counts, statuses); exclude user names, emails, phone numbers
- **Validation**: Code review ensures cached payloads contain no PII

### 6.3 Usability Requirements

**NFR-CACHE-007: Transparent Caching**
- **Requirement**: Caching implementation must be transparent to frontend; no API contract changes
- **Validation**: Frontend code unchanged; tRPC procedures return same response shape
- **Justification**: Minimizes deployment risk and testing scope

**NFR-CACHE-008: Data Freshness**
- **Requirement**: Users must not perceive stale data; cached data staleness <60 seconds acceptable
- **Measurement**: User feedback surveys; stale data reports tracked
- **Justification**: 60-second TTL balances performance gain with data freshness

### 6.4 Compliance Requirements

**NFR-CACHE-009: Audit Trail Integrity**
- **Requirement**: Caching must not interfere with audit trail completeness for compliance reporting
- **Validation**: Audit trail queries bypass cache; historical compliance reports unaffected
- **Justification**: Compliance data must be sourced from authoritative database records

**NFR-CACHE-010: Data Retention**
- **Requirement**: Cached data does not affect 2-year temperature data retention requirement
- **Validation**: Cache TTL does not replace database retention policies
- **Justification**: Cache is ephemeral performance optimization; database remains source of truth

## 7. User Stories

### STORY-CACHE-001: Facility Manager Checks Dashboard
**As a** Facility Manager
**I want** the dashboard to load in under 1 second
**So that** I can quickly check unit status without waiting

**Acceptance Criteria**:
- **GIVEN** I am logged into the dashboard as a Facility Manager
- **WHEN** I navigate to the dashboard overview page
- **THEN** the page loads in <1 second (P95) on cached requests
- **AND** unit status counts (normal, too_hot, too_cold) display immediately
- **AND** alert counts display without delay

---

### STORY-CACHE-002: Operations Staff Verifies Alert Resolution
**As an** Operations Staff member
**I want** the dashboard to show updated alert counts immediately after resolving an alert
**So that** I can confirm my corrective action worked

**Acceptance Criteria**:
- **GIVEN** I resolved an alert by fixing a temperature issue
- **WHEN** I refresh the dashboard
- **THEN** the alert count decreases within 1 second (cache invalidation triggered)
- **AND** the unit status reflects "normal" alarm state
- **AND** no stale cached data is shown

---

### STORY-CACHE-003: System Administrator Monitors Cache Performance
**As a** System Administrator
**I want** to monitor cache hit rates and database query reduction
**So that** I can validate the caching performance gains

**Acceptance Criteria**:
- **GIVEN** Redis caching is enabled in production
- **WHEN** I view Prometheus/Grafana dashboards
- **THEN** I see cache hit rate >70% for dashboard queries
- **AND** database query rate decreased by >30%
- **AND** cache errors (if any) are logged and alerted

---

### STORY-CACHE-004: Facility Manager Views Temperature Trends
**As a** Facility Manager
**I want** temperature trend charts to load quickly
**So that** I can analyze recent temperature patterns without waiting

**Acceptance Criteria**:
- **GIVEN** I am viewing a unit's temperature trend chart (last 24 hours)
- **WHEN** the chart loads
- **THEN** the data is fetched from cache if available (<1 second load)
- **AND** if cache miss, data is queried from database and cached for next request
- **AND** cached trend data is invalidated when new temperature reading arrives

---

### STORY-CACHE-005: Developer Deploys Caching Feature
**As a** Backend Developer
**I want** cache failures to gracefully degrade to database queries
**So that** Redis outages do not break dashboard functionality

**Acceptance Criteria**:
- **GIVEN** Redis is unavailable or connection fails
- **WHEN** a dashboard query is requested
- **THEN** the cache service logs an error
- **AND** the query falls back to direct database query
- **AND** the dashboard continues functioning (slower but operational)
- **AND** Prometheus alerts fire for cache errors

## 8. Business Rules

**BR-CACHE-001: Organization-Scoped Caching**
- All cache keys must include organizationId to enforce multi-tenant isolation
- Cache service validates organizationId before returning cached data

**BR-CACHE-002: TTL Enforcement**
- All cached entries expire after 60 seconds (default TTL)
- TTL configurable via environment variable `CACHE_TTL_SECONDS`

**BR-CACHE-003: Cache Invalidation Priority**
- WebSocket event-based invalidation takes precedence over TTL expiration
- Invalidation executes synchronously before event emission to ensure consistency

**BR-CACHE-004: Cacheable Query Criteria**
- Only aggregate queries (counts, statuses) are cacheable
- Queries returning PII (user names, emails) must not be cached
- Compliance audit queries must bypass cache

**BR-CACHE-005: Cache Failure Handling**
- Cache failures degrade gracefully to database queries (no user-facing errors)
- Cache errors logged with error level and alerted via Prometheus

**BR-CACHE-006: Cache Warming**
- No proactive cache warming on deployment (rely on organic population)
- Cache populated lazily on first request (cache-aside pattern)

## 9. Dependencies & Constraints

### Dependencies

**Internal Dependencies**:
- **Redis Infrastructure**: Redis instance already deployed for BullMQ and Socket.io (shared instance acceptable)
- **WebSocket Events**: Socket.io event emission for cache invalidation triggers (`unitUpdate`, `alertCreated`, etc.)
- **tRPC Procedures**: Dashboard query procedures wrapped with caching logic
- **Prometheus Metrics**: Metrics infrastructure for cache hit/miss tracking

**External Dependencies**:
- **Redis**: Version 6.0+ (supports TTL, key expiration, pattern-based deletion)

### Constraints

**Technical Constraints**:
- Redis memory limited by shared instance (estimated <100MB for 1000 organizations)
- Cache invalidation latency constrained by Redis network latency (<500ms target)
- Single Redis instance (no Redis cluster in v1)

**Business Constraints**:
- Development timeline: 1 week (5 business days)
- Development cost: $2,000 (1 backend developer)
- Zero infrastructure cost (shared Redis instance)

**Performance Constraints**:
- Cache hit rate must exceed 70% to achieve ROI
- Dashboard load time improvement must be measurable (P95 <1 second)
- Database query reduction must exceed 30%

## 10. Clarifications Log

*No clarifications required during initial requirements gathering. Feature requirements derived from strategic recommendation REC-001 with clear performance targets and technical approach.*

---

## Implementation Timeline

**Week 1 (5 days)**:
- Day 1: Implement `cache.service.ts` with get/set/delete/invalidatePattern methods
- Day 2: Define cache key schema; wrap unit status and alert count queries with caching
- Day 3: Implement cache invalidation on WebSocket events
- Day 4: Add Prometheus metrics for cache hit/miss rates; integration testing
- Day 5: Deploy to staging; validate performance metrics; production rollout

**Success Validation** (7 days post-rollout):
- Cache hit rate >70%
- Dashboard load time <1 second (P95)
- Database query rate decreased >30%
- Zero stale data reports from users
