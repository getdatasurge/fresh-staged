# Requirements Specification: PostgreSQL Time-Based Partitioning for Sensor Readings

**Feature ID**: REC-002
**Parent PRD**: [FrostGuard Complete Platform v1](../../prds/main.md)
**Version**: 1.0.0
**Status**: Draft
**Created**: 2026-02-01

## 1. Feature Overview

Implement PostgreSQL native table partitioning for the `sensor_readings` table to prevent performance degradation as time-series data grows. The system currently stores high-volume IoT temperature data from LoRa sensors in a single monolithic table, which will degrade query performance and maintenance operations as data volume increases with customer adoption. Monthly partitions will isolate time-range queries to relevant data subsets, reduce index sizes, and enable efficient data lifecycle management while maintaining 2+ year retention requirements for compliance.

## 2. Business Context

### 2.1 Problem Statement

**Current State**: The `sensor_readings` table stores all temperature events in a single table with indexes on `(unit_id, recorded_at)`, `device_id`, and `recorded_at`. As the platform grows, this table will accumulate millions of rows:

- **Growth Projection**: 50 devices × 4 readings/hour × 24 hours × 365 days = 1.75M rows/year per 50-device deployment
- **Multi-Tenant Scale**: 10 organizations × 1.75M rows = 17.5M rows/year
- **2-Year Retention**: 35M+ rows within first year of full adoption

**Pain Points**:
1. **Time-Range Query Degradation**: Queries for "last 7 days" or "last 30 days" scan entire table despite indexes
2. **Index Bloat**: Single table indexes grow proportionally with row count, slowing lookups and inserts
3. **Vacuum Lock Contention**: Full-table VACUUM operations lock the table, blocking critical sensor data ingestion
4. **Compliance Risk**: Cannot efficiently purge data older than retention policy without full-table scan

**Business Impact**:
- Dashboard performance degrades below 2-second load time target (NFR-RT-002)
- Alert creation latency exceeds 5-second target (NFR-MON-002)
- Maintenance windows required for VACUUM operations violate 99.9% uptime SLA (NFR-MON-001)

### 2.2 Business Value

**Immediate Benefits**:
1. **Query Performance**: Time-range queries only scan relevant monthly partitions (+60% speed improvement)
2. **Index Efficiency**: Smaller per-partition indexes improve lookup speed and insert throughput (-40% index size per partition)
3. **Maintenance Speed**: VACUUM operates on individual partitions, not full table (-70% maintenance time)
4. **Compliance Readiness**: Drop old partitions cleanly when retention period expires (automated lifecycle management)

**Strategic Value**:
- **Scalability**: Platform can handle 100+ organizations without performance cliff
- **Operational Excellence**: Zero-downtime maintenance operations support 99.9% uptime commitment
- **Customer Trust**: Sub-2-second dashboard loads maintained as data grows

**ROI**: 46% year 1, 300%+ over 3 years (from strategic recommendation REC-002)

### 2.3 Success Metrics

| Metric | Current (Estimated) | Target | Measurement Method |
|--------|---------------------|--------|-------------------|
| Time-range query performance (last 7 days) | Baseline | +60% improvement | EXPLAIN ANALYZE on representative queries pre/post migration |
| Index size per partition | N/A (single table) | -40% vs monolithic | pg_indexes query comparing total index sizes |
| VACUUM duration | Baseline (full table) | -70% time | pg_stat_user_tables monitoring |
| Dashboard load time | < 2s (low data volume) | Maintain < 2s at scale | Frontend performance monitoring |
| Alert creation latency | < 5s | Maintain < 5s | Timestamp diff: received_at → alert.created_at |

## 3. Stakeholders & Users

### 3.1 User Types

**Primary Stakeholders**:
1. **Platform Operators** (Internal DevOps/SRE)
   - Need predictable database performance as platform scales
   - Require automated partition lifecycle management
   - Must maintain 99.9% uptime during migration

2. **Backend Developers**
   - Must update Drizzle ORM queries to support partitioned table
   - Need to test partition pruning in query execution plans
   - Require rollback plan if migration fails

3. **End Users** (Organization Administrators/Facility Managers)
   - Expect consistent dashboard performance (< 2s loads)
   - Require real-time alert delivery (< 5s latency)
   - Should experience zero service disruption during migration

### 3.2 Stakeholder Interests

| Stakeholder | Primary Interest | Success Criteria |
|-------------|-----------------|------------------|
| DevOps/SRE | Operational stability and maintenance efficiency | Zero data loss, automated partition creation, no downtime |
| Backend Developers | Code compatibility and query performance | All Drizzle queries work, partition pruning verified |
| End Users | Uninterrupted service and performance | No service interruption, dashboard performance maintained |
| Compliance Officers | Data retention and auditability | 2+ year retention enforced, audit trail maintained |

## 4. Scope Definition

### 4.1 In Scope

**Database Schema Changes**:
1. Convert `sensor_readings` table from standard table to partitioned table (PARTITION BY RANGE on `recorded_at`)
2. Create monthly partitions for existing data (migrate data from monolithic table)
3. Create monthly partitions for future data (next 3 months minimum)
4. Maintain existing indexes on partitions (`sensor_readings_unit_time_idx`, `sensor_readings_device_idx`, `sensor_readings_recorded_idx`)
5. Preserve foreign key relationships (unit_id → units, device_id → devices)

**Migration Implementation**:
1. Analyze current `sensor_readings` table size, row distribution, and growth rate
2. Design partition strategy (monthly boundaries, partition naming convention)
3. Create online migration plan (avoid service downtime)
4. Test migration process in staging environment with production-like data volume
5. Execute production migration with rollback plan
6. Verify data integrity (row count, FK constraints, index coverage)

**Drizzle ORM Integration**:
1. Update `backend/src/db/schema/telemetry.ts` to define partitioned table structure
2. Test Drizzle ORM queries against partitioned table (ensure partition pruning works)
3. Verify tRPC procedures continue to function correctly
4. Update database migrations to reflect partitioning changes

**Automated Partition Management**:
1. Create automated job to create future partitions (cron job or BullMQ scheduled task)
2. Create automated job to drop partitions older than retention policy (2+ years)
3. Monitor partition creation/deletion with alerts for failures
4. Document manual partition management procedures for emergency scenarios

**Observability & Monitoring**:
1. Add Prometheus metrics for partition count, partition sizes, query performance
2. Create Grafana dashboard for partition health monitoring
3. Set up alerts for missing future partitions or failed partition operations

### 4.2 Out of Scope

**Explicitly NOT Included**:
1. Partitioning other tables (`manual_temperature_logs`, `door_events`, `alerts`)
   - **Rationale**: `sensor_readings` is the highest-volume table; defer others until proven necessary
2. Custom partition key beyond `recorded_at` (e.g., composite partitioning on `organization_id + recorded_at`)
   - **Rationale**: Time-based partitioning addresses primary use case; multi-dimensional partitioning adds complexity
3. Partition merging or re-partitioning strategy
   - **Rationale**: Monthly partitions are sufficient; no business case for dynamic repartitioning
4. Multi-table distributed partitioning (Citus, TimescaleDB)
   - **Rationale**: PostgreSQL native partitioning is sufficient for v1 scale; defer sharding to future versions
5. Backfill of historical data beyond current retention window
   - **Rationale**: Only partition data currently in `sensor_readings` table; no need to recreate pre-retention data

### 4.3 Assumptions

| ID | Assumption | Validation Method | Risk if Wrong |
|----|------------|------------------|---------------|
| A1 | PostgreSQL version supports declarative partitioning (10+) | Verify production PostgreSQL version | Migration fails; need manual partitioning or upgrade |
| A2 | `recorded_at` timestamp is always populated and accurate | Query `sensor_readings` for NULL `recorded_at` values | Partition routing fails for NULL timestamps |
| A3 | Monthly partition boundaries align with business reporting needs | Consult with stakeholders on reporting periods | Partition boundaries don't match query patterns |
| A4 | Existing indexes on partitions provide sufficient query performance | Run EXPLAIN ANALYZE on key queries post-migration | Need additional partition-specific indexes |
| A5 | Drizzle ORM supports partitioned tables transparently | Test Drizzle queries against partitioned table in dev | Require Drizzle ORM workarounds or manual SQL |
| A6 | Production migration can be executed during low-traffic window | Analyze TTN webhook traffic patterns | Need online migration strategy or scheduled downtime |
| A7 | Current data volume fits within single migration transaction | Estimate row count and data size | Require chunked migration strategy |
| A8 | 2-year retention policy is sufficient for all customers | Verify compliance requirements with legal/compliance team | Need longer retention or per-customer policies |

## 5. Functional Requirements

### REQ-PART-001: Partition Strategy Definition
**Priority**: Must Have
**User Type**: Platform Operators
**Requirement**: Define partitioning strategy using PostgreSQL native declarative partitioning with monthly RANGE partitions on `recorded_at` column.

**Rationale**: Monthly partitions balance query performance (typical queries are "last 7 days", "last 30 days") with operational overhead (too many small partitions increase management complexity).

**Acceptance Criteria**:
- Partition key is `RANGE (recorded_at)`
- Partition boundaries are first day of each month at 00:00:00 UTC
- Partition naming convention is `sensor_readings_y<YYYY>m<MM>` (e.g., `sensor_readings_y2026m02`)
- Default partition exists for data outside defined ranges (for safety during migration)

---

### REQ-PART-002: Existing Data Migration
**Priority**: Must Have
**User Type**: Backend Developers, Platform Operators
**Requirement**: Migrate all existing `sensor_readings` data from monolithic table to monthly partitions without data loss or service downtime.

**Rationale**: Zero data loss is critical for compliance (REQ-COMP-001: immutable audit trail). Zero downtime maintains 99.9% uptime SLA (NFR-MON-001).

**Acceptance Criteria**:
- Pre-migration row count equals post-migration row count across all partitions
- All foreign key constraints preserved (unit_id → units, device_id → devices)
- All indexes recreated on partitions with same definitions
- Migration executes within 4-hour maintenance window (or online if possible)
- Rollback plan tested and documented
- No sensor data ingestion failures during migration

---

### REQ-PART-003: Future Partition Creation
**Priority**: Must Have
**User Type**: Platform Operators
**Requirement**: Automatically create partitions for upcoming months to ensure continuous data ingestion without manual intervention.

**Rationale**: Prevent data ingestion failures when sensor readings fall into future months without pre-created partitions.

**Acceptance Criteria**:
- Automated job creates partitions for next 3 months
- Job runs weekly to maintain 3-month forward buffer
- Job creates partitions with correct naming convention and boundaries
- Job logs partition creation events for audit trail
- Alert triggers if job fails to create partition

---

### REQ-PART-004: Partition Retention Management
**Priority**: Must Have
**User Type**: Platform Operators, Compliance Officers
**Requirement**: Automatically drop partitions older than 2-year retention policy to manage storage costs and comply with data lifecycle requirements.

**Rationale**: Enforce compliance retention policy (REQ-COMP-004: 2+ year retention) while preventing unbounded storage growth.

**Acceptance Criteria**:
- Automated job identifies partitions older than 24 months
- Job drops old partitions only after verifying backup/archive if required
- Job logs partition deletion events with timestamps and row counts
- Job runs monthly (low frequency to avoid accidental deletions)
- Manual override mechanism exists for extending retention per partition

---

### REQ-PART-005: Drizzle ORM Compatibility
**Priority**: Must Have
**User Type**: Backend Developers
**Requirement**: Update Drizzle ORM schema definition for `sensor_readings` to support partitioned table while maintaining existing query patterns.

**Rationale**: Drizzle ORM is the primary data access layer (modules.md: 170+ backend files use ORM). Breaking ORM compatibility blocks all sensor data operations.

**Acceptance Criteria**:
- `backend/src/db/schema/telemetry.ts` updated with partitioned table definition
- Existing queries using `db.query.sensorReadings.findMany()` continue to work
- Insert operations route to correct partition based on `recorded_at` value
- Foreign key joins (unit, device) function correctly
- TypeScript types generated by Drizzle remain valid

---

### REQ-PART-006: Query Performance Verification
**Priority**: Must Have
**User Type**: Backend Developers, Platform Operators
**Requirement**: Verify partition pruning is active for time-range queries, ensuring queries only scan relevant partitions.

**Rationale**: Partition pruning is the core mechanism for performance improvement. Without it, queries still scan all partitions (no benefit).

**Acceptance Criteria**:
- EXPLAIN ANALYZE for "last 7 days" query shows partition pruning (only scans 1 partition)
- EXPLAIN ANALYZE for "last 30 days" query shows partition pruning (scans 1-2 partitions)
- Query execution time improves by >50% compared to pre-partitioning baseline
- Dashboard queries maintain < 2-second response time with 1M+ rows
- Alert creation latency remains < 5 seconds with 1M+ rows

---

### REQ-PART-007: Index Preservation
**Priority**: Must Have
**User Type**: Backend Developers
**Requirement**: Recreate all existing indexes on partitioned table to maintain query performance for device lookups and time-series queries.

**Rationale**: Partitioning without indexes loses performance benefits. Existing indexes are critical for query patterns (telemetry.ts: 3 indexes defined).

**Acceptance Criteria**:
- Index `sensor_readings_unit_time_idx` (unit_id, recorded_at) exists on each partition
- Index `sensor_readings_device_idx` (device_id) exists on each partition
- Index `sensor_readings_recorded_idx` (recorded_at) exists on each partition
- Index sizes per partition are 40%+ smaller than monolithic table index sizes
- Query planner uses partition-local indexes for lookups

---

### REQ-PART-008: Migration Validation & Testing
**Priority**: Must Have
**User Type**: Backend Developers, Platform Operators
**Requirement**: Test migration process in staging environment with production-like data volume before executing in production.

**Rationale**: Migration failures in production risk data loss and extended downtime. Staging validation reduces risk.

**Acceptance Criteria**:
- Staging environment populated with >1M rows of synthetic sensor data
- Migration script tested end-to-end in staging
- Pre-migration and post-migration data integrity checks automated
- Rollback procedure tested in staging (restore from backup)
- Migration playbook documented with step-by-step instructions
- Go/no-go checklist completed before production migration

---

### REQ-PART-009: Monitoring & Observability
**Priority**: Should Have
**User Type**: Platform Operators
**Requirement**: Add monitoring metrics and dashboards to track partition health, size, and query performance.

**Rationale**: Proactive monitoring prevents partition-related outages (missing future partitions, failed deletions).

**Acceptance Criteria**:
- Prometheus metrics for partition count, total rows per partition, partition sizes (MB)
- Grafana dashboard showing partition timeline, growth trends, query performance
- Alert for missing future partitions (< 2 months forward buffer)
- Alert for partition creation/deletion job failures
- Weekly partition health report generated for operations team

---

### REQ-PART-010: Documentation & Runbooks
**Priority**: Should Have
**User Type**: Platform Operators, Backend Developers
**Requirement**: Document partition management procedures, troubleshooting guides, and emergency manual partition creation steps.

**Rationale**: Automation failures require manual intervention. Documented procedures reduce mean-time-to-recovery (MTTR).

**Acceptance Criteria**:
- Runbook for manual partition creation (if automated job fails)
- Runbook for manual partition deletion (if retention job fails)
- Troubleshooting guide for common partition errors (routing failures, constraint violations)
- Architecture decision record (ADR) documenting why monthly partitions chosen
- Migration playbook with rollback steps

## 6. Non-Functional Requirements

### 6.1 Performance Expectations

**NFR-PART-001: Query Performance Improvement**
- **Requirement**: Time-range queries for "last 7 days" must be 50%+ faster than pre-partitioning baseline.
- **Measurement**: EXPLAIN ANALYZE comparison of query execution times with 1M+ rows.
- **Target**: Queries scanning 1 partition vs 12+ partitions should show >50% execution time reduction.

**NFR-PART-002: Index Size Reduction**
- **Requirement**: Per-partition index sizes must be 40%+ smaller than equivalent monolithic table indexes.
- **Measurement**: Query `pg_indexes` view for index sizes before and after partitioning.
- **Target**: Index size per partition = (total rows / partition count) × index overhead factor.

**NFR-PART-003: VACUUM Performance**
- **Requirement**: VACUUM operations on individual partitions must complete 70%+ faster than full-table VACUUM.
- **Measurement**: Monitor `pg_stat_user_tables` for `last_vacuum` duration.
- **Target**: Monthly partition VACUUM completes in minutes, not hours.

**NFR-PART-004: Insert Throughput**
- **Requirement**: Sensor data insert throughput must not degrade post-partitioning.
- **Measurement**: Monitor BullMQ job processing rate for TTN webhook ingestion.
- **Target**: Maintain 100+ inserts/second during peak ingestion periods.

### 6.2 Security Requirements

**NFR-SEC-PART-001: Multi-Tenant Isolation**
- **Requirement**: Partitioning must not break organization-scoped data isolation.
- **Measurement**: Test queries with `organizationId` filter verify no cross-tenant data leakage.
- **Target**: All queries continue to enforce `WHERE organization_id = ?` filter via hierarchy joins.

**NFR-SEC-PART-002: Access Control**
- **Requirement**: Database user permissions for partition creation/deletion must be restricted to automation accounts.
- **Measurement**: Verify only `db_admin` role can execute `CREATE TABLE` for partitions.
- **Target**: Application database user cannot manually create/drop partitions.

### 6.3 Usability Requirements

**NFR-USE-PART-001: Transparent Operation**
- **Requirement**: Application code must not require changes beyond schema definition updates.
- **Measurement**: Verify all tRPC procedures function correctly without query rewrites.
- **Target**: Zero breaking changes to API contracts or service layer logic.

**NFR-USE-PART-002: Developer Experience**
- **Requirement**: Drizzle ORM schema definition must clearly document partitioned table structure.
- **Measurement**: Code review of `telemetry.ts` for partition strategy comments.
- **Target**: New developers understand partitioning setup from schema file alone.

### 6.4 Compliance Requirements

**NFR-COMP-PART-001: Data Retention Enforcement**
- **Requirement**: Automated partition deletion must enforce 2-year retention policy without manual intervention.
- **Measurement**: Verify oldest partition is never older than 24 months + 1 month buffer.
- **Target**: Audit queries confirm no data older than retention policy exists.

**NFR-COMP-PART-002: Audit Trail for Partition Operations**
- **Requirement**: All partition creation and deletion events must be logged with timestamps and row counts.
- **Measurement**: Query partition management logs for all lifecycle events.
- **Target**: 100% of partition operations have corresponding audit log entries.

## 7. User Stories

### STORY-PART-001: Platform Operator - Migration Execution
**As a** Platform Operator
**I want** to migrate `sensor_readings` to partitioned table without service downtime
**So that** customers experience zero disruption while we improve database performance

**Acceptance Criteria**:
- GIVEN the migration playbook is prepared and tested in staging
- WHEN I execute the production migration during low-traffic window
- THEN all sensor data is migrated to partitions without data loss
- AND sensor ingestion continues without errors during migration
- AND dashboard queries return correct results post-migration

---

### STORY-PART-002: Backend Developer - Query Optimization
**As a** Backend Developer
**I want** time-range queries to only scan relevant monthly partitions
**So that** dashboard loads remain fast as data volume grows to millions of rows

**Acceptance Criteria**:
- GIVEN I query sensor readings for "last 7 days"
- WHEN I run EXPLAIN ANALYZE on the query
- THEN the execution plan shows only 1 partition scanned
- AND query execution time is < 100ms with 1M+ total rows

---

### STORY-PART-003: Platform Operator - Automated Partition Lifecycle
**As a** Platform Operator
**I want** future partitions created automatically every month
**So that** I don't need to manually create partitions before sensor data arrives

**Acceptance Criteria**:
- GIVEN the automated partition creation job is configured
- WHEN the job runs weekly
- THEN partitions for next 3 months are created
- AND I receive no alerts about missing partitions
- AND sensor data ingests successfully into future partitions

---

### STORY-PART-004: Compliance Officer - Retention Enforcement
**As a** Compliance Officer
**I want** sensor data older than 2 years automatically deleted
**So that** we comply with data retention policies and avoid storage bloat

**Acceptance Criteria**:
- GIVEN the automated partition deletion job is configured
- WHEN the job runs monthly
- THEN partitions older than 24 months are dropped
- AND deletion events are logged with row counts
- AND I can verify no data older than retention policy exists

---

### STORY-PART-005: Backend Developer - Rollback Safety
**As a** Backend Developer
**I want** a tested rollback procedure for partition migration
**So that** if migration fails, I can restore service quickly without data loss

**Acceptance Criteria**:
- GIVEN the migration fails mid-process in production
- WHEN I execute the rollback procedure
- THEN the system restores to pre-migration state from backup
- AND no sensor data is lost
- AND service resumes within 1 hour

---

### STORY-PART-006: Platform Operator - Monitoring Visibility
**As a** Platform Operator
**I want** real-time visibility into partition health and performance
**So that** I can proactively address partition issues before they cause outages

**Acceptance Criteria**:
- GIVEN the Grafana partition dashboard is configured
- WHEN I view the dashboard
- THEN I see current partition count, sizes, and growth trends
- AND I see query performance metrics (partition pruning efficiency)
- AND I receive alerts if future partitions are missing

## 8. Business Rules

### BR-PART-001: Monthly Partition Boundaries
**Rule**: Partitions must align to calendar month boundaries (1st day of month at 00:00:00 UTC).
**Rationale**: Simplifies partition management and aligns with typical reporting periods (monthly summaries).
**Enforcement**: Automated partition creation job uses `DATE_TRUNC('month', CURRENT_DATE)` for boundary calculation.

### BR-PART-002: Minimum Forward Partition Buffer
**Rule**: At least 2 months of future partitions must exist at all times.
**Rationale**: Prevents data ingestion failures if partition creation job fails for 1 cycle.
**Enforcement**: Monitoring alert triggers if forward buffer drops below 2 months.

### BR-PART-003: Retention Policy Enforcement
**Rule**: Partitions older than 24 months must be deleted within 30 days of expiration.
**Rationale**: Balances compliance (2-year retention) with operational buffer (30-day grace period).
**Enforcement**: Automated deletion job runs monthly, logs all deletions for audit.

### BR-PART-004: Default Partition Existence
**Rule**: A default partition must exist to catch data with NULL or out-of-range `recorded_at` values.
**Rationale**: Prevents data loss if sensor timestamp is incorrect or future partition is missing.
**Enforcement**: Migration creates default partition; monitoring alerts if default partition receives rows.

### BR-PART-005: Index Consistency Across Partitions
**Rule**: All partitions must have identical index definitions matching original table indexes.
**Rationale**: Ensures consistent query performance regardless of which partition is accessed.
**Enforcement**: Partition creation script includes index definitions; validation checks index existence.

### BR-PART-006: Partition Naming Convention
**Rule**: Partition names follow format `sensor_readings_y<YYYY>m<MM>` (e.g., `sensor_readings_y2026m02`).
**Rationale**: Human-readable names simplify troubleshooting and manual partition management.
**Enforcement**: Automated creation job uses strict naming template; validation rejects non-conforming names.

## 9. Dependencies & Constraints

### 9.1 Technical Dependencies

| Dependency | Type | Impact if Unavailable | Mitigation |
|------------|------|----------------------|------------|
| PostgreSQL 10+ | Critical | Declarative partitioning unavailable | Verify production PostgreSQL version before migration |
| Drizzle ORM | Critical | Cannot generate partitioned table schema | Test Drizzle support for partitions in dev environment |
| BullMQ (or cron) | High | Automated partition management unavailable | Manual partition creation fallback documented |
| Prometheus/Grafana | Medium | No partition monitoring visibility | Deploy monitoring before migration |
| Staging environment | High | Cannot validate migration process | Block production migration until staging validated |

### 9.2 External Constraints

**Database Infrastructure**:
- PostgreSQL version must be 10+ for declarative partitioning
- Sufficient disk space for temporary table during migration (2x current `sensor_readings` size)
- Database backup must be current before migration (< 24 hours old)

**Operational Constraints**:
- Migration requires 4-hour maintenance window (or online migration strategy)
- Rollback requires access to pre-migration backup (< 1 hour restore time)
- Production deployment requires approval from DevOps and Engineering leads

**Performance Constraints**:
- Migration cannot block sensor data ingestion for > 10 seconds (NFR-ALT-001: alert delivery SLA)
- Post-migration query performance must meet existing SLAs (< 2s dashboard loads, < 5s alert creation)

### 9.3 Data Constraints

**Schema Constraints**:
- `recorded_at` column must never be NULL (partition routing fails for NULL values)
- Foreign key constraints (unit_id, device_id) must be preserved during migration
- Existing indexes must be recreated on partitions to maintain query performance

**Volume Constraints**:
- Current `sensor_readings` table estimated at < 10M rows (assumption; verify before migration)
- Monthly partitions expected to contain 500K-2M rows each (varies by customer count)
- Total partition count at 2-year retention: 24 partitions + default partition

## 10. Clarifications Log

### Question 1: Partition Granularity
**Question**: Why monthly partitions instead of weekly or daily?
**Answer**: Monthly partitions balance query performance with operational overhead. Most queries are "last 7 days" (1 partition scan) or "last 30 days" (1-2 partition scans). Weekly partitions (52/year) increase management complexity without significant performance benefit. Daily partitions (730 partitions at 2-year retention) create excessive overhead for partition creation, monitoring, and query planning.

### Question 2: Online Migration vs Downtime
**Question**: Can migration be executed online without downtime?
**Answer**: PostgreSQL native partitioning requires table restructuring. Two approaches:
1. **Online migration**: Create partitioned table as new table, use triggers to dual-write during transition, migrate old data in background, swap tables atomically. Complex but zero downtime.
2. **Low-traffic window migration**: Execute migration during low-traffic period (e.g., 2-4 AM UTC). Simpler, requires brief service interruption (< 10 minutes for table swap).

**Decision**: Defer to implementation team based on production traffic patterns. If TTN webhook traffic is negligible during overnight hours, use low-traffic window migration. Otherwise, implement online migration strategy.

### Question 3: Multi-Tenant Partitioning Consideration
**Question**: Should partitions be scoped per organization (composite partitioning on `organization_id + recorded_at`)?
**Answer**: Out of scope for v1. Time-based partitioning addresses primary use case (time-range queries). Multi-dimensional partitioning adds complexity:
- Requires partition-per-organization-per-month (10 orgs × 24 months = 240 partitions)
- Organization-scoped queries already efficient with `organizationId` filters via hierarchy joins
- Future consideration if single-org data volume becomes bottleneck

### Question 4: pg_partman vs Custom Scripts
**Question**: Should we use pg_partman extension for automated partition management?
**Answer**: pg_partman is mature and battle-tested for partition lifecycle management. Pros: proven solution, handles edge cases, community support. Cons: additional dependency, requires PostgreSQL extension installation. **Recommendation**: Evaluate pg_partman as preferred solution; fallback to custom BullMQ jobs if extension installation is blocked by infrastructure constraints.

### Question 5: Drizzle ORM Partition Support
**Question**: Does Drizzle ORM natively support partitioned tables?
**Answer**: Drizzle ORM supports partitioned tables as standard PostgreSQL tables. No special configuration required in schema definition. Partition routing is handled by PostgreSQL query planner transparently. **Validation Required**: Test Drizzle insert/query operations against partitioned table in development environment before production migration.

### Question 6: Data Retention Policy Flexibility
**Question**: Do all customers require 2-year retention, or should retention be configurable per organization?
**Answer**: PRD specifies 2-year retention (REQ-COMP-004). Assumption A8 flags this as potential risk if regulatory requirements vary. **Decision**: Implement uniform 2-year retention for v1. Track as feature request for v2: per-organization retention policies with partition-level metadata.

### Question 7: Partition Pruning Verification
**Question**: How do we verify partition pruning is working after migration?
**Answer**: Use PostgreSQL `EXPLAIN ANALYZE` with actual queries:
```sql
EXPLAIN ANALYZE SELECT * FROM sensor_readings
WHERE recorded_at >= NOW() - INTERVAL '7 days';
```
Look for "Partitions scanned: sensor_readings_y2026m02" in output (only 1 partition). If all partitions are scanned, partition pruning is not active (likely missing WHERE clause on partition key).

### Question 8: Rollback Strategy
**Question**: What is the rollback plan if migration fails?
**Answer**:
1. **Pre-migration**: Full database backup (pg_dump or snapshot)
2. **Migration failure**: Stop migration, assess damage
3. **Rollback**: Restore from backup, verify data integrity, resume service
4. **Post-rollback**: Analyze failure, update migration script, re-test in staging

**Time Estimate**: Rollback from backup should complete within 1 hour (assuming backup is recent and restore tested).

### Question 9: Impact on Real-Time WebSocket Updates
**Question**: Does partitioning affect Socket.io real-time updates for dashboard?
**Answer**: No impact. WebSocket events are emitted when new sensor readings are inserted. Partitioning is transparent to application code (Drizzle ORM inserts route to correct partition automatically). Real-time flow unchanged: TTN webhook → insert → Socket.io emit.

### Question 10: Testing Strategy for Partition Queries
**Question**: How do we test that all query patterns work correctly with partitions?
**Answer**:
1. Identify critical queries (dashboard recent readings, alert rule evaluation, compliance reports)
2. Populate staging with >1M rows across multiple partitions
3. Run EXPLAIN ANALYZE on each query pattern, verify partition pruning
4. Compare query execution times pre/post partitioning (expect >50% improvement)
5. Run integration tests for all tRPC procedures that query `sensor_readings`
6. Verify foreign key joins (unit, device) function correctly across partitions
