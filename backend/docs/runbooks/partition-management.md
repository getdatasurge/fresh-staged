# Partition Management Runbook

**Feature**: REC-002 PostgreSQL Time-Based Partitioning for Sensor Readings
**Audience**: DevOps/SRE, Backend Developers
**Last Updated**: 2026-02-01

## Overview

This runbook provides operational procedures for managing PostgreSQL partitions for the `sensor_readings` table. The table uses monthly RANGE partitioning on the `recorded_at` column with automated lifecycle management via BullMQ jobs.

**Partition Strategy**:
- **Naming**: `sensor_readings_y<YYYY>m<MM>` (e.g., `sensor_readings_y2026m02`)
- **Boundaries**: First day of month at 00:00:00 UTC
- **Future buffer**: 3 months ahead (maintained by weekly creation job)
- **Retention**: 24 months (enforced by monthly deletion job)
- **Default partition**: `sensor_readings_default` (catchall for NULL or out-of-range dates)

**Related Files**:
- Migration: `backend/drizzle/0006_partition_sensor_readings.sql`
- Service: `backend/src/services/partition.service.ts`
- Processors: `backend/src/workers/partition-create.processor.ts`, `partition-retention.processor.ts`
- Monitoring: `backend/docs/grafana/partition-health-dashboard.json`
- Alerts: `backend/docs/prometheus/partition-alerts.yml`

---

## Manual Partition Creation

**When to use**: Automated `partition:create` BullMQ job failed or future partition buffer dropped below 2 months.

**Prerequisites**:
- Database credentials with `CREATE TABLE` permission
- Access to production PostgreSQL instance
- Confirmation that partition does not already exist

### Procedure

1. **Connect to PostgreSQL**:
   ```bash
   psql $DATABASE_URL
   ```

2. **List existing partitions** to identify next month to create:
   ```sql
   SELECT tablename
   FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename LIKE 'sensor_readings_y%'
   ORDER BY tablename DESC
   LIMIT 5;
   ```

3. **Create partition for target month** (example: April 2026):
   ```sql
   CREATE TABLE sensor_readings_y2026m04 PARTITION OF sensor_readings
   FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
   ```

   **Important**:
   - Use UTC timezone (`+00`)
   - Start boundary: 1st day of month at midnight
   - End boundary: 1st day of *next* month at midnight
   - Naming format: `sensor_readings_y<YYYY>m<MM>` (zero-pad month)

4. **Verify partition created**:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename = 'sensor_readings_y2026m04';
   ```

5. **Test data routing** (insert test row):
   ```sql
   INSERT INTO sensor_readings (unit_id, temperature, recorded_at, received_at)
   VALUES (
     (SELECT id FROM units LIMIT 1),
     25.5,
     '2026-04-15 12:00:00+00',
     NOW()
   )
   RETURNING id;
   ```

6. **Verify routing to correct partition**:
   ```sql
   SELECT tableoid::regclass, COUNT(*)
   FROM sensor_readings
   WHERE recorded_at >= '2026-04-01' AND recorded_at < '2026-05-01'
   GROUP BY tableoid;
   ```
   Expected output: `sensor_readings_y2026m04 | 1`

7. **Delete test row** (if not using real unit_id):
   ```sql
   DELETE FROM sensor_readings
   WHERE recorded_at = '2026-04-15 12:00:00+00';
   ```

8. **Update monitoring**: Check Grafana partition dashboard shows new partition.

---

## Manual Partition Deletion

**When to use**: Automated `partition:retention` job failed or manual deletion required for compliance/testing.

**CRITICAL**: This is a **destructive operation**. Data is permanently deleted.

**Prerequisites**:
- Database credentials with `DROP TABLE` permission
- Confirmation that partition is older than retention policy (24 months)
- **Full database backup** completed within last 24 hours
- Business approval for data deletion

### Procedure

1. **Connect to PostgreSQL**:
   ```bash
   psql $DATABASE_URL
   ```

2. **Identify partitions older than 24 months**:
   ```sql
   SELECT
     tablename,
     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
     (SELECT COUNT(*) FROM ONLY sensor_readings_y2024m01) AS row_count
   FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename LIKE 'sensor_readings_y%'
     AND tablename < 'sensor_readings_y' || TO_CHAR(NOW() - INTERVAL '24 months', 'YYYYMM')
   ORDER BY tablename;
   ```

3. **Verify partition eligibility**:
   - Partition name matches expected pattern
   - Partition is older than 24 months
   - No regulatory hold on data
   - Backup is current

4. **Check row count and date range** (example: January 2024):
   ```sql
   SELECT
     COUNT(*) AS row_count,
     MIN(recorded_at) AS oldest_reading,
     MAX(recorded_at) AS newest_reading
   FROM sensor_readings_y2024m01;
   ```

5. **Drop partition** (DESTRUCTIVE):
   ```sql
   DROP TABLE sensor_readings_y2024m01;
   ```

6. **Verify deletion**:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename = 'sensor_readings_y2024m01';
   ```
   Expected output: 0 rows

7. **Update monitoring**: Check Grafana partition dashboard shows updated partition count.

8. **Document deletion** in audit log:
   - Partition name
   - Row count deleted
   - Timestamp
   - Operator name
   - Justification

---

## Troubleshooting Partition Routing Failures

**Symptoms**:
- Sensor data not appearing in expected partition
- Default partition (`sensor_readings_default`) receiving data
- Insert errors referencing partition constraints

### Diagnostic Steps

1. **Check default partition for unexpected data**:
   ```sql
   SELECT COUNT(*), MIN(recorded_at), MAX(recorded_at)
   FROM sensor_readings_default;
   ```

2. **If default partition has rows, inspect data**:
   ```sql
   SELECT id, recorded_at, received_at, source
   FROM sensor_readings_default
   LIMIT 100;
   ```

3. **Common causes**:
   - `recorded_at` is NULL (violates NOT NULL constraint; insert should fail)
   - `recorded_at` is out of partition range (future date with no partition)
   - Timezone mismatch (recorded_at in local time, partitions use UTC)
   - Application bug (incorrect date calculation)

### Resolution

**Case 1: Future dates without partitions**

Create missing future partitions (see "Manual Partition Creation" above).

**Case 2: NULL or invalid dates**

Fix application code to ensure `recorded_at` is always populated with valid UTC timestamp.

**Case 3: Timezone mismatch**

Convert application timestamps to UTC before insertion:
```sql
-- Correct: Explicit UTC timezone
INSERT INTO sensor_readings (recorded_at, ...) VALUES ('2026-02-15 12:00:00+00', ...);

-- Incorrect: Local time without timezone
INSERT INTO sensor_readings (recorded_at, ...) VALUES ('2026-02-15 12:00:00', ...);
```

**Case 4: Move data from default partition to correct partition**

If data exists in default partition with valid `recorded_at` values:

```sql
-- Example: Move February 2026 data from default to y2026m02
WITH moved AS (
  DELETE FROM sensor_readings_default
  WHERE recorded_at >= '2026-02-01' AND recorded_at < '2026-03-01'
  RETURNING *
)
INSERT INTO sensor_readings SELECT * FROM moved;
```

**Validation**:
```sql
-- Verify default partition is empty (or has minimal rows)
SELECT COUNT(*) FROM sensor_readings_default;

-- Verify data moved to correct partition
SELECT tableoid::regclass, COUNT(*)
FROM sensor_readings
WHERE recorded_at >= '2026-02-01' AND recorded_at < '2026-03-01'
GROUP BY tableoid;
```

---

## Verifying Partition Pruning

**Purpose**: Ensure time-range queries only scan relevant partitions (performance optimization).

### Procedure

1. **Connect to PostgreSQL**:
   ```bash
   psql $DATABASE_URL
   ```

2. **Run EXPLAIN ANALYZE on typical time-range query** (last 7 days):
   ```sql
   EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
   SELECT * FROM sensor_readings
   WHERE recorded_at >= NOW() - INTERVAL '7 days'
   ORDER BY recorded_at DESC
   LIMIT 100;
   ```

3. **Check output for partition pruning**:
   ```
   Expected output snippet:
   -> Seq Scan on sensor_readings_y2026m02
   Partitions scanned: 1
   ```

4. **If all partitions are scanned** (no pruning):
   - **Cause**: Query missing WHERE clause on `recorded_at` partition key
   - **Fix**: Add explicit `recorded_at` filter:
     ```sql
     -- Good: Partition pruning works
     SELECT * FROM sensor_readings
     WHERE recorded_at >= '2026-02-01' AND recorded_at < '2026-03-01';

     -- Bad: No partition pruning (full table scan)
     SELECT * FROM sensor_readings WHERE unit_id = '<some_uuid>';
     ```

5. **Benchmark query performance**:
   - Pre-partitioning baseline (if available)
   - Post-partitioning with pruning
   - Target: 50%+ speedup for time-range queries

---

## Partition Health Monitoring

**Dashboard**: Grafana → Sensor Readings Partition Health
**Metrics**: Prometheus `/metrics` endpoint

### Key Metrics

| Metric | Expected Value | Alert Threshold |
|--------|---------------|----------------|
| `sensor_readings_partition_count` | 24-27 partitions | N/A |
| `sensor_readings_future_partition_count` | ≥2 partitions | <2 (warning) |
| `sensor_readings_default_partition_rows` | 0 rows | >100 (warning) |
| `sensor_readings_partition_healthy` | 1 (healthy) | 0 (critical) |
| `sensor_readings_total_rows` | Growing | N/A |
| `sensor_readings_total_size_bytes` | Growing | N/A |

### Weekly Health Check

1. **Review Grafana dashboard** for:
   - Future partition buffer ≥2 months
   - Default partition empty (0 rows)
   - No alerts triggered

2. **Check BullMQ job status**:
   - `partition:create` last run: < 7 days ago
   - `partition:retention` last run: < 30 days ago
   - No failed jobs in history

3. **Validate partition count**:
   ```sql
   SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'sensor_readings_y%';
   ```
   Expected: 24-30 partitions (current + future buffer)

4. **Verify oldest partition** within retention:
   ```sql
   SELECT tablename
   FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_y%'
   ORDER BY tablename ASC
   LIMIT 1;
   ```
   Expected: Not older than 24 months from current date

---

## Emergency Rollback

**When to use**: Production migration failed or partitioning causing critical issues.

**Prerequisites**:
- Pre-migration database backup available
- Downtime window approved
- Root cause identified

### Procedure

1. **Stop application services** to prevent writes:
   ```bash
   docker-compose stop backend
   ```

2. **Drop partitioned table**:
   ```sql
   DROP TABLE IF EXISTS sensor_readings CASCADE;
   ```

3. **Restore from backup**:
   ```bash
   # Option 1: Restore full database
   pg_restore -d $DATABASE_URL backup.dump

   # Option 2: Restore single table
   pg_restore -t sensor_readings_old -d $DATABASE_URL backup.dump
   ```

4. **If `sensor_readings_old` exists, rename**:
   ```sql
   ALTER TABLE sensor_readings_old RENAME TO sensor_readings;
   ```

5. **Verify data integrity**:
   ```sql
   SELECT COUNT(*) FROM sensor_readings;
   SELECT MIN(recorded_at), MAX(recorded_at) FROM sensor_readings;
   ```

6. **Restart application services**:
   ```bash
   docker-compose start backend
   ```

7. **Verify service recovery**:
   - Health check endpoint: `GET /health`
   - Sample query: `GET /trpc/readings.recent`
   - Dashboard loads successfully

8. **Post-mortem**:
   - Document failure cause
   - Update migration script
   - Re-test in staging before retry

---

## Contact & Escalation

**Primary Contact**: DevOps Team
**Secondary Contact**: Backend Engineering Lead
**Emergency**: On-call rotation (PagerDuty)

**Related Documentation**:
- ADR-009: Partition Strategy Decision
- Migration Playbook: `staging-migration-playbook.md`
- Production Migration Playbook: `production-migration-playbook.md`
