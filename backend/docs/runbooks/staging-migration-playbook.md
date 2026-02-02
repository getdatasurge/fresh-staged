# Staging Migration Playbook: Sensor Readings Partitioning

**Feature**: REC-002 PostgreSQL Time-Based Partitioning
**Environment**: Staging
**Purpose**: Validate migration process before production deployment
**Last Updated**: 2026-02-01

## Overview

This playbook guides the staging migration test for converting `sensor_readings` from monolithic to partitioned table. The staging migration validates:

1. Migration script executes successfully
2. Data integrity preserved (row count match, FK constraints)
3. Partition pruning works as expected (50%+ query speedup)
4. Application code functions correctly with partitioned table
5. Rollback procedure works within 1 hour

**Critical Success Criteria**:

- Zero data loss (pre-migration count = post-migration count)
- Partition pruning verified via EXPLAIN ANALYZE
- All tRPC procedures function correctly
- Rollback tested and validated

---

## Pre-Migration Checklist

- [ ] Staging environment accessible and healthy
- [ ] Staging database has 1M+ synthetic sensor readings (see Data Preparation section)
- [ ] Database backup completed within last 24 hours
- [ ] Migration script reviewed: `backend/drizzle/0006_partition_sensor_readings.sql`
- [ ] Team notified of staging migration test window
- [ ] Grafana partition dashboard configured in staging
- [ ] Monitoring alerts configured in staging Prometheus

---

## Data Preparation

### Objective

Populate staging with production-like data volume (1M+ rows across 12 months) to validate migration performance and partition pruning.

### Procedure

1. **Generate synthetic sensor readings**:

   Create data generation script: `backend/scripts/generate-synthetic-readings.ts`

   ```typescript
   import { db } from '../src/db/client.js';
   import { sensorReadings } from '../src/db/schema/telemetry.js';

   async function generateSyntheticReadings() {
     const TARGET_COUNT = 1_000_000;
     const BATCH_SIZE = 1000;
     const START_DATE = new Date('2025-02-01');
     const END_DATE = new Date('2026-02-01');

     // Fetch sample unit IDs and device IDs
     const units = await db.execute(sql`SELECT id FROM units LIMIT 50`);
     const devices = await db.execute(sql`SELECT id FROM devices LIMIT 50`);

     if (units.rowCount === 0 || devices.rowCount === 0) {
       console.error('No units or devices found. Create test data first.');
       process.exit(1);
     }

     const unitIds = units.rows.map((r) => r.id);
     const deviceIds = devices.rows.map((r) => r.id);

     let inserted = 0;
     const startTime = Date.now();

     while (inserted < TARGET_COUNT) {
       const batch = [];

       for (let i = 0; i < BATCH_SIZE; i++) {
         const randomDate = new Date(
           START_DATE.getTime() + Math.random() * (END_DATE.getTime() - START_DATE.getTime()),
         );

         batch.push({
           unitId: unitIds[Math.floor(Math.random() * unitIds.length)],
           deviceId: deviceIds[Math.floor(Math.random() * deviceIds.length)],
           temperature: (Math.random() * 30 - 10).toFixed(2),
           humidity: (Math.random() * 100).toFixed(2),
           battery: Math.floor(Math.random() * 100),
           signalStrength: Math.floor(Math.random() * -120 + 20),
           recordedAt: randomDate,
           receivedAt: new Date(randomDate.getTime() + Math.random() * 60000),
           source: 'synthetic',
         });
       }

       await db.insert(sensorReadings).values(batch);
       inserted += BATCH_SIZE;

       if (inserted % 10000 === 0) {
         const elapsed = (Date.now() - startTime) / 1000;
         const rate = inserted / elapsed;
         console.log(
           `Inserted ${inserted.toLocaleString()}/${TARGET_COUNT.toLocaleString()} ` +
             `(${rate.toFixed(0)} rows/sec)`,
         );
       }
     }

     console.log(
       `\nGeneration complete: ${inserted.toLocaleString()} rows in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
     );
   }

   generateSyntheticReadings().catch(console.error);
   ```

2. **Run data generation**:

   ```bash
   cd backend
   tsx scripts/generate-synthetic-readings.ts
   ```

3. **Verify data distribution**:

   ```sql
   SELECT
     DATE_TRUNC('month', recorded_at) AS month,
     COUNT(*) AS row_count
   FROM sensor_readings
   GROUP BY month
   ORDER BY month;
   ```

   Expected: ~80K-100K rows per month across 12 months.

4. **Capture baseline metrics**:

   ```sql
   -- Total row count
   SELECT COUNT(*) FROM sensor_readings;

   -- Date range
   SELECT MIN(recorded_at), MAX(recorded_at) FROM sensor_readings;

   -- Table size
   SELECT pg_size_pretty(pg_total_relation_size('sensor_readings')) AS size;

   -- Index sizes
   SELECT
     indexname,
     pg_size_pretty(pg_relation_size(indexrelid::regclass)) AS size
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public' AND tablename = 'sensor_readings';
   ```

   Document these values for post-migration comparison.

---

## Migration Execution

### Step 1: Pre-Migration Snapshot

1. **Create database backup**:

   ```bash
   pg_dump $STAGING_DATABASE_URL > staging_backup_$(date +%Y%m%d_%H%M%S).dump
   ```

2. **Record pre-migration metrics**:

   ```sql
   -- Save to temp table for validation
   CREATE TEMP TABLE pre_migration_stats AS
   SELECT
     COUNT(*) as total_rows,
     MIN(recorded_at) as oldest_reading,
     MAX(recorded_at) as newest_reading,
     COUNT(DISTINCT unit_id) as unique_units,
     COUNT(DISTINCT device_id) as unique_devices
   FROM sensor_readings;

   SELECT * FROM pre_migration_stats;
   ```

3. **Benchmark query performance** (last 7 days):

   ```sql
   \timing on
   EXPLAIN ANALYZE
   SELECT * FROM sensor_readings
   WHERE recorded_at >= NOW() - INTERVAL '7 days'
   ORDER BY recorded_at DESC
   LIMIT 100;
   ```

   Record execution time (e.g., "Execution Time: 45.2 ms").

### Step 2: Execute Migration

1. **Run migration script**:

   ```bash
   psql $STAGING_DATABASE_URL -f backend/drizzle/0006_partition_sensor_readings.sql 2>&1 | tee migration_output.log
   ```

2. **Monitor output** for:
   - Batch migration progress logs
   - Validation check results
   - Any errors or warnings

3. **Capture execution duration**:
   Expected: 30-60 minutes for 1M rows (extrapolate for production estimate).

### Step 3: Post-Migration Validation

1. **Verify row count match**:

   ```sql
   -- Compare with pre_migration_stats
   SELECT
     (SELECT total_rows FROM pre_migration_stats) AS pre_count,
     (SELECT COUNT(*) FROM sensor_readings) AS post_count,
     (SELECT total_rows FROM pre_migration_stats) = (SELECT COUNT(*) FROM sensor_readings) AS match;
   ```

   Expected output: `match = true`

2. **Verify partition count**:

   ```sql
   SELECT COUNT(*) AS partition_count
   FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_y%';
   ```

   Expected: 24-30 partitions (12 months historical + current + 3 future).

3. **Verify default partition is empty**:

   ```sql
   SELECT COUNT(*) FROM sensor_readings_default;
   ```

   Expected: 0 rows (no NULL or out-of-range dates).

4. **Verify indexes exist on partitions**:

   ```sql
   SELECT
     tablename,
     COUNT(*) AS index_count
   FROM pg_indexes
   WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_%'
   GROUP BY tablename
   ORDER BY tablename;
   ```

   Expected: Each partition has 3 indexes (unit_time, device, recorded).

5. **Verify foreign key constraints**:

   ```sql
   -- Test join with units table
   SELECT COUNT(*)
   FROM sensor_readings sr
   JOIN units u ON sr.unit_id = u.id
   LIMIT 10;
   ```

   Expected: Successful join with results.

---

## Partition Pruning Verification

### Objective

Confirm PostgreSQL query planner only scans relevant partitions for time-range queries.

### Procedure

1. **Test "last 7 days" query** (should scan 1 partition):

   ```sql
   EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
   SELECT * FROM sensor_readings
   WHERE recorded_at >= NOW() - INTERVAL '7 days'
   ORDER BY recorded_at DESC
   LIMIT 100;
   ```

   **Expected output**:

   ```
   -> Seq Scan on sensor_readings_y2026m02
   Partitions scanned: 1
   Execution Time: 20-25 ms (50%+ faster than baseline)
   ```

2. **Test "last 30 days" query** (should scan 1-2 partitions):

   ```sql
   EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
   SELECT * FROM sensor_readings
   WHERE recorded_at >= NOW() - INTERVAL '30 days'
   ORDER BY recorded_at DESC
   LIMIT 1000;
   ```

   **Expected output**: Partitions scanned = 1 or 2 (depending on month boundary).

3. **Test specific month query**:

   ```sql
   EXPLAIN ANALYZE
   SELECT COUNT(*)
   FROM sensor_readings
   WHERE recorded_at >= '2025-06-01' AND recorded_at < '2025-07-01';
   ```

   **Expected output**: Only `sensor_readings_y2025m06` scanned.

4. **Document performance improvement**:
   - Pre-partitioning: X ms
   - Post-partitioning: Y ms
   - Speedup: (X - Y) / X \* 100%

   Target: ≥50% improvement.

---

## Application Compatibility Testing

### Objective

Verify all application code functions correctly with partitioned table.

### Procedure

1. **Test tRPC procedures** that query `sensor_readings`:

   ```bash
   # List all procedures querying sensor_readings
   grep -r "sensorReadings" backend/src/routers/ backend/src/services/
   ```

   Key procedures to test:
   - `readings.recent` - Recent readings for dashboard
   - `readings.byUnit` - Unit-specific time-series
   - `readings.aggregate` - Statistical aggregations
   - `alerts.evaluate` - Alert rule evaluation

2. **Manual API testing**:

   ```bash
   # Example: Get recent readings via tRPC
   curl -X POST http://localhost:3000/trpc/readings.recent \
     -H "Content-Type: application/json" \
     -d '{"unitId": "<unit-id>", "limit": 100}'
   ```

   Verify:
   - Response returns data
   - No errors in backend logs
   - Response time acceptable (<2s)

3. **Load dashboard** in browser:
   - Navigate to unit dashboard
   - Verify temperature charts render
   - Check browser console for errors

4. **Run integration tests** (if available):
   ```bash
   cd backend
   npm test -- --grep "sensor.*reading"
   ```

---

## Automated Partition Lifecycle Testing

### Objective

Verify BullMQ jobs for partition creation and retention function correctly.

### Procedure

1. **Trigger partition creation job manually**:

   ```bash
   # Via BullMQ dashboard or CLI
   npx bullmq add partition-management partition:create \
     '{"organizationId":"system","bufferMonths":3}'
   ```

2. **Verify future partitions created**:

   ```sql
   SELECT tablename
   FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename LIKE 'sensor_readings_y%'
     AND tablename > 'sensor_readings_y' || TO_CHAR(NOW(), 'YYYYMM')
   ORDER BY tablename;
   ```

   Expected: 3 future partitions.

3. **Trigger partition retention job manually** (dry-run with short retention):

   ```bash
   # Test with 12-month retention (not 24) to see deletion behavior
   npx bullmq add partition-management partition:retention \
     '{"organizationId":"system","retentionMonths":12}'
   ```

4. **Verify old partitions dropped**:

   ```sql
   SELECT COUNT(*) FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_y%';
   ```

   Expected: Partition count reduced (partitions older than 12 months dropped).

5. **Check job logs** in BullMQ dashboard:
   - Partition creation logs
   - Partition deletion logs
   - No errors reported

---

## Rollback Test

### Objective

Validate rollback procedure works within 1 hour in case of migration failure.

### Procedure

1. **Simulate migration failure** (assume validation detected row count mismatch):

   ```
   ERROR: Row count mismatch (old=1000000, new=999950)
   ```

2. **Execute rollback**:

   ```sql
   -- Drop partitioned table
   DROP TABLE IF EXISTS sensor_readings CASCADE;

   -- Restore from backup
   -- Option 1: Restore full database
   pg_restore -d $STAGING_DATABASE_URL staging_backup_*.dump

   -- Option 2: Rename old table back (if it exists)
   ALTER TABLE sensor_readings_old RENAME TO sensor_readings;
   ```

3. **Verify service recovery**:

   ```sql
   SELECT COUNT(*) FROM sensor_readings;
   ```

   Expected: Pre-migration row count.

4. **Test application**:
   - Load dashboard
   - Query sensor readings via API
   - Verify no errors

5. **Record rollback duration**:
   Start: Detection of failure
   End: Application fully functional
   Target: <1 hour

---

## Post-Migration Checklist

- [ ] Row count matches pre-migration count
- [ ] Partition pruning verified (EXPLAIN ANALYZE shows pruning)
- [ ] All indexes recreated on partitions
- [ ] Foreign key constraints functional
- [ ] tRPC procedures tested successfully
- [ ] Dashboard loads correctly
- [ ] Partition automation jobs tested
- [ ] Rollback procedure tested successfully
- [ ] Migration duration documented (for production estimate)
- [ ] Performance improvement measured (target: ≥50%)
- [ ] No critical errors in logs for 2 hours post-migration

---

## Go/No-Go Decision Criteria

**Proceed to production migration if**:

- [x] All checklist items passed
- [x] Partition pruning confirmed working
- [x] Performance improvement ≥50%
- [x] Rollback tested within 1 hour
- [x] No data loss detected
- [x] Team confidence high

**Do NOT proceed if**:

- [ ] Row count mismatch detected
- [ ] Partition pruning not working
- [ ] Application errors observed
- [ ] Rollback failed or exceeded 1 hour
- [ ] Migration script errors occurred
- [ ] Performance degraded

---

## Lessons Learned

**Document after staging migration**:

1. **What went well**:
   - [Record successful aspects]

2. **What went wrong**:
   - [Record issues encountered]

3. **Script adjustments needed**:
   - [Note any migration script fixes]

4. **Production migration estimate**:
   - Staging: X rows in Y minutes
   - Production: Estimated Z rows in W minutes

5. **Recommendations for production**:
   - [Key takeaways for production execution]

---

## Next Steps

After successful staging migration:

1. Update migration script with any fixes identified
2. Document production migration window (low-traffic period)
3. Schedule production migration (use production playbook)
4. Brief team on staging results and production plan
5. Prepare rollback plan for production (same procedure as staging)

**Related Playbooks**:

- Production Migration Playbook: `production-migration-playbook.md`
- Partition Management Runbook: `partition-management.md`
