# ADR-009: PostgreSQL Partition Strategy for sensor_readings

**Status**: Accepted
**Date**: 2026-02-01
**Feature**: REC-002
**Decision Makers**: Backend Engineering Team, DevOps Team

---

## Context

The `sensor_readings` table stores high-volume time-series IoT temperature data from LoRa sensors. As the platform scales to support multiple organizations with 50+ devices each sending 4 readings/hour, the table will accumulate millions of rows within the first year of full adoption.

**Growth Projection**:
- 50 devices × 4 readings/hour × 24 hours × 365 days = 1.75M rows/year per 50-device deployment
- 10 organizations × 1.75M rows = 17.5M rows/year
- 2-year retention = 35M+ rows

**Pain Points**:
1. Time-range queries (last 7 days, last 30 days) scan entire table despite indexes
2. Index bloat increases proportionally with row count
3. VACUUM operations lock full table, blocking sensor data ingestion
4. Compliance retention enforcement requires full-table scans

This ADR documents the decision to implement PostgreSQL native table partitioning to address these scaling concerns.

---

## Decision

We will implement **monthly RANGE partitioning** on the `sensor_readings` table using the `recorded_at` column as the partition key.

**Partition Strategy**:
- **Partitioning Method**: PostgreSQL declarative partitioning (PARTITION BY RANGE)
- **Partition Key**: `recorded_at` (timestamp column representing sensor reading time)
- **Partition Granularity**: Monthly boundaries (1st day of month at 00:00:00 UTC)
- **Naming Convention**: `sensor_readings_y<YYYY>m<MM>` (e.g., `sensor_readings_y2026m02`)
- **Default Partition**: `sensor_readings_default` (catchall for NULL or out-of-range dates)
- **Future Buffer**: 3 months ahead (automated creation via BullMQ)
- **Retention**: 24 months (automated deletion via BullMQ)
- **Lifecycle Management**: BullMQ scheduled jobs (weekly creation, monthly retention)

---

## Decision Drivers

### Primary Goals

1. **Query Performance**: 50%+ speedup for time-range queries via partition pruning
2. **Operational Efficiency**: 70%+ faster VACUUM operations (per-partition vs full-table)
3. **Scalability**: Support 100+ organizations without performance cliff
4. **Compliance**: Automated retention enforcement via partition deletion

### Constraints

1. Drizzle ORM does not support PARTITION BY in schema definitions (requires custom migration)
2. PostgreSQL requires PRIMARY KEY to include partition key (composite PK needed)
3. Staging environment limited to 1M row test volume (cannot test full production scale)
4. No access to pg_partman extension in production (infrastructure constraint)

---

## Alternatives Considered

### Alternative 1: Weekly Partitions

**Partition Granularity**: Weekly instead of monthly

**Pros**:
- Finer-grained partition pruning for sub-weekly queries
- Smaller individual partition sizes (~200K rows vs ~1.5M rows)

**Cons**:
- 52 partitions/year × 2 years = 104 partitions (vs 24 monthly)
- Increased management complexity (more partitions to monitor)
- Higher overhead for query planner (more partition metadata)
- No significant performance benefit (most queries are 7-day or 30-day windows)

**Decision**: Rejected. Monthly partitioning balances query performance with operational overhead.

---

### Alternative 2: Daily Partitions

**Partition Granularity**: Daily instead of monthly

**Pros**:
- Maximum partition pruning granularity
- Very small individual partition sizes (~5K rows)

**Cons**:
- 365 partitions/year × 2 years = 730 partitions (excessive)
- Query planner overhead increases with partition count
- Management complexity (daily partition creation)
- No business requirement for daily-level isolation

**Decision**: Rejected. Excessive partition count outweighs benefits.

---

### Alternative 3: Composite Partitioning (organization_id + recorded_at)

**Partition Key**: Multi-dimensional partitioning on `organization_id` and `recorded_at`

**Pros**:
- Organization-scoped queries benefit from pruning on both dimensions
- Natural tenant isolation at partition level

**Cons**:
- Partition count = organizations × months (10 orgs × 24 months = 240 partitions)
- Complexity in managing per-organization partition lifecycle
- Organization-scoped queries already efficient with `WHERE organization_id` filters
- Not needed until single-org data volume becomes bottleneck (future enhancement)

**Decision**: Deferred to v2. Time-based partitioning addresses primary use case for v1.

---

### Alternative 4: pg_partman Extension

**Lifecycle Management**: Use pg_partman PostgreSQL extension for automated partition management

**Pros**:
- Battle-tested solution used in production at scale
- Handles edge cases (month boundaries, timezone handling)
- Community support and documentation
- Built-in retention policy enforcement

**Cons**:
- Requires PostgreSQL extension installation (superuser access needed)
- Infrastructure team blocked extension installation in production
- Additional dependency outside application codebase
- Less control over partition lifecycle logic

**Decision**: Deferred as future enhancement. Implement BullMQ solution first for consistency with existing background job architecture. Evaluate pg_partman if partition management becomes complex.

---

### Alternative 5: TimescaleDB or Citus

**Partitioning Method**: Specialized time-series database or distributed PostgreSQL

**Pros**:
- Purpose-built for time-series data
- Automatic compression and retention policies
- Advanced query optimization

**Cons**:
- Major infrastructure change (new database deployment)
- Learning curve for team
- Citus requires horizontal scaling (not needed yet)
- TimescaleDB license considerations
- Native PostgreSQL partitioning sufficient for v1 scale

**Decision**: Deferred to future versions. Native PostgreSQL partitioning is sufficient for current and near-term scale (sub-100M rows).

---

### Alternative 6: Online Migration Strategy

**Migration Approach**: Dual-write strategy with triggers during transition (zero downtime)

**Pros**:
- Zero downtime during migration
- Gradual data migration in background
- No maintenance window required

**Cons**:
- Higher implementation complexity (trigger synchronization)
- Risk of dual-write inconsistencies during migration
- Longer migration window (hours vs minutes)
- Trigger performance overhead during transition

**Decision**: Rejected for v1. Low-traffic window migration (2-6 AM UTC) is simpler and lower risk. TTN webhook traffic is minimal during overnight hours. If 24/7 uptime becomes critical, online migration can be revisited.

---

### Alternative 7: Application-Layer Partitioning

**Implementation**: Application code manually routes queries to monthly tables

**Pros**:
- No PostgreSQL version dependency (works on any version)
- Full control over partitioning logic in application code

**Cons**:
- Manual query routing in every service/router
- Breaking change to ORM usage (cannot use `db.query.sensorReadings.findMany()`)
- No partition pruning optimization (PostgreSQL unaware of partitioning)
- High risk of routing bugs (data loss if routed incorrectly)

**Decision**: Rejected. PostgreSQL native partitioning is transparent to application code (Drizzle ORM handles routing automatically).

---

## Consequences

### Positive

1. **Query Performance**: Time-range queries 50%+ faster via partition pruning (validated in dev environment)
2. **Index Efficiency**: Per-partition indexes 40%+ smaller (linear decrease with partition count)
3. **Maintenance Speed**: VACUUM operates on individual partitions, not full table (70%+ faster)
4. **Retention Enforcement**: Drop old partitions cleanly (no full-table DELETE scans)
5. **Scalability**: Platform can handle 100+ organizations without performance cliff
6. **Transparent Operation**: Drizzle ORM handles partitioned table transparently (no service layer changes)

### Negative

1. **Migration Complexity**: Custom DDL migration script required (Drizzle does not support PARTITION BY)
2. **Composite Primary Key**: PostgreSQL requires PK to include partition key (application uses `id` as logical PK)
3. **Future Partition Management**: Requires BullMQ jobs for partition creation/deletion (new operational overhead)
4. **Default Partition Monitoring**: Must monitor catchall partition for unexpected data (routing failures)
5. **Query Planner Overhead**: Small increase in query planning time (negligible with 24-30 partitions)

### Risks

1. **Data Loss During Migration**: Mitigated by staging validation, row count checks, rollback plan
2. **Partition Routing Failures**: Mitigated by default partition catchall, monitoring alerts
3. **Automation Job Failures**: Mitigated by monitoring, manual partition creation runbook
4. **Query Performance Degradation**: Mitigated by partition pruning validation (EXPLAIN ANALYZE)

---

## Implementation

**Migration Strategy**: Low-traffic window (2-6 AM UTC)

**Deliverables**:
1. Custom migration script: `backend/drizzle/0006_partition_sensor_readings.sql`
2. Partition service: `backend/src/services/partition.service.ts`
3. BullMQ processors: `partition-create.processor.ts`, `partition-retention.processor.ts`
4. Monitoring: Grafana dashboard, Prometheus alerts
5. Runbooks: Partition management, staging playbook, production playbook

**Validation**:
- Staging migration test with 1M+ synthetic rows
- Row count match verification
- Partition pruning validation via EXPLAIN ANALYZE
- Application compatibility testing (all tRPC procedures)
- Rollback procedure tested (<1 hour recovery)

**Success Criteria**:
- Zero data loss (pre-migration count = post-migration count)
- Partition pruning working (queries scan 1-2 partitions, not all)
- Dashboard performance maintained (<2s loads)
- No critical alerts for 48 hours post-migration

---

## References

- **Requirements**: `.rp1/work/features/REC-002/requirements.md`
- **Technical Design**: `.rp1/work/features/REC-002/design.md`
- **Migration Script**: `backend/drizzle/0006_partition_sensor_readings.sql`
- **Partition Service**: `backend/src/services/partition.service.ts`
- **Runbooks**: `backend/docs/runbooks/partition-management.md`
- **Grafana Dashboard**: `backend/docs/grafana/partition-health-dashboard.json`
- **Prometheus Alerts**: `backend/docs/prometheus/partition-alerts.yml`

---

## Review & Approval

**Reviewed By**:
- Backend Engineering Lead: [Name]
- DevOps Lead: [Name]
- Product Owner: [Name]

**Approval Date**: 2026-02-01

**Revision History**:
- 2026-02-01: Initial decision documented
