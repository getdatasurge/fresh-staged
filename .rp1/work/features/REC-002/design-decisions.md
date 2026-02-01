# Design Decisions: PostgreSQL Time-Based Partitioning for Sensor Readings

**Feature ID**: REC-002
**Created**: 2026-02-01

## Decision Log

| ID | Decision | Choice | Rationale | Alternatives Considered |
|----|----------|--------|-----------|------------------------|
| D1 | Partition Granularity | Monthly RANGE partitions | Balances query performance (typical queries are 7-30 days) with operational overhead. Weekly partitions add 4x management complexity without significant benefit. | Weekly (rejected: overhead), Quarterly (rejected: poor pruning), Daily (rejected: 730 partitions at 2-year retention) |
| D2 | Partition Automation Tool | BullMQ scheduled jobs (Option B) | Consistent with existing background job architecture. No new dependencies. Full control over lifecycle logic. Easier testing within application codebase. | pg_partman extension (deferred as future enhancement if automation becomes complex) |
| D3 | Migration Strategy | Low-traffic window (2-6 AM UTC) | Lower complexity reduces risk. 4-hour window sufficient based on staging estimates (30-60 min). Faster rollback than online migration. | Online migration with dual-write (rejected: higher complexity, trigger sync risk) |
| D4 | Default Partition | Keep as safety catchall | Catches NULL recorded_at or missing future partitions. Monitoring alert triggers if default receives data. Defense-in-depth. | Drop after migration (rejected: data loss risk if partition missing) |
| D5 | Service Layer Changes | Schema update only (no code changes) | Drizzle ORM handles partitioned tables transparently. PostgreSQL query planner routes queries automatically. | Partition-aware query logic (rejected: unnecessary complexity) |
| D6 | Monitoring | Prometheus metrics + Grafana dashboard | Consistent with existing observability stack. Enables proactive alerting for missing partitions. | Custom logging (rejected: less queryable), System catalog queries (rejected: no alerting) |
| D7 | Future Partition Buffer | 3 months ahead | Prevents ingestion failures if weekly job misses 1-2 cycles. Low overhead (3 empty partitions). Buffer > job frequency. | 1-month (rejected: insufficient redundancy), 6-month (rejected: unnecessary) |
| D8 | Retention Policy | 24 months, monthly deletion job | Satisfies 2-year compliance requirement. Monthly deletion less risky than frequent drops. 30-day grace period built-in. | Immediate deletion at 24 months (rejected: no buffer), Archive before deletion (deferred to v2) |
| D9 | Migration Batch Size | 10,000 rows per transaction | Reduces lock contention. Allows progress monitoring. Prevents transaction log bloat. | Single transaction (rejected: long locks), 1K batches (rejected: too many iterations) |
| D10 | Staging Validation | 1M+ synthetic rows | Validates migration at production-like scale. Provides accurate time estimate. Identifies edge cases. | 100K rows (rejected: insufficient scale), 10M+ rows (rejected: staging limits) |

## Technology Decisions

| Decision | Choice | Source | Rationale |
|----------|--------|--------|-----------|
| Database Partitioning | PostgreSQL declarative partitioning (v10+) | Existing PostgreSQL stack | Native feature, no external dependencies, battle-tested performance |
| ORM Compatibility | Drizzle ORM v0.38.0 (existing) | Existing ORM | Hypothesis: Drizzle handles partitioned tables transparently (validate in Phase 1) |
| Migration Tool | drizzle-kit + manual DDL | Existing migration tool | drizzle-kit generates base migration; partitioning requires manual DDL append |
| Job Scheduler | BullMQ v5.67.0 (existing) | Existing job queue | Consistent with architecture; weekly creation job, monthly retention job |
| Monitoring Stack | Prometheus + Grafana (existing) | Existing observability | No new tools; partition metrics integrate with current dashboards |

## AFK Mode: Auto-Selected Technology Decisions

*Not applicable - AFK_MODE=false (interactive mode)*

## Assumptions Validated

| Assumption | Validation Method | Status |
|------------|------------------|--------|
| A1: PostgreSQL ≥10 | Query `SELECT version()` in production | **FLAGGED** for Phase 1 validation |
| A5: Drizzle ORM supports partitioned tables | Test insert/query in dev environment | **FLAGGED** for Phase 1 validation |
| A2: recorded_at is NOT NULL | Schema constraint exists (line 41, telemetry.ts) | **VALIDATED** |
| A6: Low-traffic window exists | Analyze TTN webhook traffic patterns | Inform migration strategy in Phase 1 |
| A7: Data volume <10M rows | Query `SELECT COUNT(*) FROM sensor_readings` | Inform batch size in Phase 1 |

## Risk Mitigation Decisions

| Risk | Impact | Mitigation Strategy | Decision |
|------|--------|-------------------|----------|
| Drizzle ORM incompatibility | HIGH | Test in dev before migration (Phase 1) | Block production migration until validated |
| PostgreSQL version <10 | HIGH | Verify version immediately | Upgrade PostgreSQL if necessary before proceeding |
| Migration exceeds window | MEDIUM | Test duration in staging (Phase 4) | Use online migration if >4 hours |
| Partition pruning fails | HIGH | Verify with EXPLAIN ANALYZE post-migration | Document rollback procedure |
| pg_partman unavailable | MEDIUM | Design BullMQ fallback (Option B) | Implement BullMQ first; pg_partman as future enhancement |

## Design Principles Applied

1. **Existing Patterns First**: BullMQ for automation, Prometheus for monitoring, Drizzle ORM for data access
2. **Operational Safety**: Staging validation, rollback plan, default partition catchall, monitoring alerts
3. **Minimal Code Changes**: Schema-only updates; service layer unchanged (transparent partitioning)
4. **Progressive Delivery**: Phase 1 validates assumptions before committing to full migration
5. **Documentation-Driven**: Runbooks, ADR, troubleshooting guides for operational excellence

## Open Questions for Phase 1 Validation

1. **PostgreSQL Version**: Confirm production version is ≥10 (declarative partitioning requirement)
2. **Drizzle ORM Partitioning**: Test insert/query operations on partitioned table in dev
3. **Current Data Volume**: Query row count to size migration batch strategy
4. **Traffic Patterns**: Analyze TTN webhook logs to confirm low-traffic window (2-6 AM UTC)
5. **pg_partman Availability**: Check if PostgreSQL extension can be installed (infrastructure policy)

## Future Enhancements (Out of Scope for v1)

1. **pg_partman Integration**: Evaluate as replacement for BullMQ if partition management becomes complex
2. **Partition Archiving**: Archive old partitions to S3 before deletion (compliance requirement evolution)
3. **Multi-Dimensional Partitioning**: Composite partitioning on `organization_id + recorded_at` (if single-org data volume becomes bottleneck)
4. **Automated Partition Rebalancing**: Dynamically adjust partition boundaries based on data distribution
5. **Per-Organization Retention**: Configurable retention policies per organization (regulatory variance)
