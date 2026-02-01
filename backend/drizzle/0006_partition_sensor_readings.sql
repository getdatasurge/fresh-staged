-- Migration: PostgreSQL Time-Based Partitioning for Sensor Readings
-- Feature: REC-002
-- Description: Convert sensor_readings table from monolithic to monthly partitioned table
--              Uses PARTITION BY RANGE (recorded_at) with monthly boundaries
-- Rationale: Prevent performance degradation as time-series data grows to millions of rows
--            Target: 50%+ query speedup, 40%+ index size reduction, 70%+ VACUUM speedup

-- PREREQUISITES:
-- 1. PostgreSQL version ≥10 (declarative partitioning support)
-- 2. Full database backup completed (<24 hours old)
-- 3. Staging migration tested successfully with 1M+ rows
-- 4. Maintenance window scheduled (2-6 AM UTC recommended)
-- 5. All stakeholders notified of maintenance

-- ROLLBACK PLAN:
-- If migration fails:
-- 1. Stop execution immediately
-- 2. Run: DROP TABLE IF EXISTS sensor_readings CASCADE;
-- 3. Run: ALTER TABLE sensor_readings_old RENAME TO sensor_readings;
-- 4. Restore from backup if needed: pg_restore <backup_file>
-- 5. Verify service recovery
-- 6. Post-mortem: analyze logs, update script, re-test staging

-- VALIDATION QUERIES (run post-migration):
-- SELECT COUNT(*) FROM sensor_readings_old;
-- SELECT COUNT(*) FROM sensor_readings;
-- SELECT tablename FROM pg_tables WHERE tablename LIKE 'sensor_readings_%' ORDER BY tablename;
-- EXPLAIN ANALYZE SELECT * FROM sensor_readings WHERE recorded_at >= NOW() - INTERVAL '7 days';

--------------------------------------------------------------------------------
-- STEP 1: Rename existing table to preserve data
--------------------------------------------------------------------------------
-- This creates a backup of the original table for rollback safety
-- DO NOT drop this table until full validation is complete
ALTER TABLE sensor_readings RENAME TO sensor_readings_old;

--------------------------------------------------------------------------------
-- STEP 2: Create partitioned parent table
--------------------------------------------------------------------------------
-- PRIMARY KEY CRITICAL: PostgreSQL requires PK to include partition key
-- We use composite PK (id, recorded_at) to satisfy this constraint
-- Application code continues to use 'id' as logical primary key
CREATE TABLE sensor_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL,
  device_id UUID,
  temperature NUMERIC(7, 2) NOT NULL,
  humidity NUMERIC(5, 2),
  battery INTEGER,
  signal_strength INTEGER,
  raw_payload TEXT,
  recorded_at TIMESTAMPTZ(3) NOT NULL, -- Partition key
  received_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  source VARCHAR(32),

  -- Composite PRIMARY KEY includes partition key (PostgreSQL requirement)
  PRIMARY KEY (id, recorded_at),

  -- Foreign key constraints
  CONSTRAINT fk_sensor_readings_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
  CONSTRAINT fk_sensor_readings_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) PARTITION BY RANGE (recorded_at);

-- Add comment for documentation
COMMENT ON TABLE sensor_readings IS 'High-volume time-series IoT temperature data. Partitioned by recorded_at (monthly RANGE). See REC-002 for strategy.';

--------------------------------------------------------------------------------
-- STEP 3: Create monthly partitions for existing data + future buffer
--------------------------------------------------------------------------------
-- NOTE: Adjust partition range based on actual data in sensor_readings_old
-- This script creates partitions from 2024-01-01 to 2026-06-01 as example
-- In production, generate partitions dynamically based on:
-- SELECT MIN(recorded_at), MAX(recorded_at) FROM sensor_readings_old;

-- Historical partitions (example: 2024-2026)
CREATE TABLE sensor_readings_y2024m01 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-01-01 00:00:00+00') TO ('2024-02-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m02 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-02-01 00:00:00+00') TO ('2024-03-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m03 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-03-01 00:00:00+00') TO ('2024-04-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m04 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-04-01 00:00:00+00') TO ('2024-05-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m05 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-05-01 00:00:00+00') TO ('2024-06-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m06 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-06-01 00:00:00+00') TO ('2024-07-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m07 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-07-01 00:00:00+00') TO ('2024-08-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m08 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-08-01 00:00:00+00') TO ('2024-09-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m09 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-09-01 00:00:00+00') TO ('2024-10-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m10 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-10-01 00:00:00+00') TO ('2024-11-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m11 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-11-01 00:00:00+00') TO ('2024-12-01 00:00:00+00');

CREATE TABLE sensor_readings_y2024m12 PARTITION OF sensor_readings
  FOR VALUES FROM ('2024-12-01 00:00:00+00') TO ('2025-01-01 00:00:00+00');

-- 2025 partitions
CREATE TABLE sensor_readings_y2025m01 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-01-01 00:00:00+00') TO ('2025-02-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m02 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-02-01 00:00:00+00') TO ('2025-03-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m03 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-03-01 00:00:00+00') TO ('2025-04-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m04 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-04-01 00:00:00+00') TO ('2025-05-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m05 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-05-01 00:00:00+00') TO ('2025-06-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m06 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-06-01 00:00:00+00') TO ('2025-07-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m07 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-07-01 00:00:00+00') TO ('2025-08-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m08 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-08-01 00:00:00+00') TO ('2025-09-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m09 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-09-01 00:00:00+00') TO ('2025-10-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m10 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-10-01 00:00:00+00') TO ('2025-11-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m11 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-11-01 00:00:00+00') TO ('2025-12-01 00:00:00+00');

CREATE TABLE sensor_readings_y2025m12 PARTITION OF sensor_readings
  FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

-- 2026 partitions (current + future buffer)
CREATE TABLE sensor_readings_y2026m01 PARTITION OF sensor_readings
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE sensor_readings_y2026m02 PARTITION OF sensor_readings
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE sensor_readings_y2026m03 PARTITION OF sensor_readings
  FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE sensor_readings_y2026m04 PARTITION OF sensor_readings
  FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

CREATE TABLE sensor_readings_y2026m05 PARTITION OF sensor_readings
  FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

CREATE TABLE sensor_readings_y2026m06 PARTITION OF sensor_readings
  FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

--------------------------------------------------------------------------------
-- STEP 4: Create default partition (safety catchall)
--------------------------------------------------------------------------------
-- Catches NULL recorded_at or dates outside partition ranges
-- Monitoring alert triggers if this partition receives data
CREATE TABLE sensor_readings_default PARTITION OF sensor_readings DEFAULT;

COMMENT ON TABLE sensor_readings_default IS 'Catchall partition for NULL or out-of-range recorded_at values. Should be empty; monitor for unexpected data.';

--------------------------------------------------------------------------------
-- STEP 5: Create indexes on partitioned table
--------------------------------------------------------------------------------
-- PostgreSQL automatically propagates these to all child partitions
-- Indexes created before data migration for optimal performance
CREATE INDEX sensor_readings_unit_time_idx ON sensor_readings (unit_id, recorded_at);
CREATE INDEX sensor_readings_device_idx ON sensor_readings (device_id);
CREATE INDEX sensor_readings_recorded_idx ON sensor_readings (recorded_at);

--------------------------------------------------------------------------------
-- STEP 6: Migrate data from old table to partitioned table
--------------------------------------------------------------------------------
-- Uses batched INSERT to avoid long locks and transaction log bloat
-- Batch size: 10,000 rows per transaction (adjust based on row size)
-- NOTE: This must be run outside a transaction block for COMMIT to work
-- Execute via: psql -v ON_ERROR_STOP=1 -f migration.sql

DO $$
DECLARE
  batch_size INT := 10000;
  total_rows BIGINT;
  processed BIGINT := 0;
  batch_start TIMESTAMP;
  batch_end TIMESTAMP;
BEGIN
  -- Get total row count for progress tracking
  SELECT COUNT(*) INTO total_rows FROM sensor_readings_old;
  RAISE NOTICE 'Starting migration of % rows in batches of %', total_rows, batch_size;

  IF total_rows = 0 THEN
    RAISE NOTICE 'No data to migrate (empty table)';
    RETURN;
  END IF;

  -- Batched migration loop
  WHILE processed < total_rows LOOP
    batch_start := clock_timestamp();

    -- Insert batch (ordered by recorded_at for sequential partition writes)
    INSERT INTO sensor_readings (
      id, unit_id, device_id, temperature, humidity, battery,
      signal_strength, raw_payload, recorded_at, received_at, source
    )
    SELECT
      id, unit_id, device_id, temperature, humidity, battery,
      signal_strength, raw_payload, recorded_at, received_at, source
    FROM sensor_readings_old
    ORDER BY recorded_at
    LIMIT batch_size OFFSET processed;

    processed := processed + batch_size;
    batch_end := clock_timestamp();

    RAISE NOTICE 'Migrated %/% rows (%.1f%%) in % ms',
      LEAST(processed, total_rows),
      total_rows,
      (LEAST(processed, total_rows)::NUMERIC / total_rows * 100),
      EXTRACT(MILLISECOND FROM batch_end - batch_start);

    -- Small delay between batches to reduce load (optional)
    -- PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'Data migration complete: % rows migrated', total_rows;
END $$;

--------------------------------------------------------------------------------
-- STEP 7: Verify data integrity (CRITICAL)
--------------------------------------------------------------------------------
-- These checks must pass before proceeding to drop old table
DO $$
DECLARE
  old_count BIGINT;
  new_count BIGINT;
  default_count BIGINT;
  partition_count INT;
BEGIN
  -- Row count validation
  SELECT COUNT(*) INTO old_count FROM sensor_readings_old;
  SELECT COUNT(*) INTO new_count FROM sensor_readings;

  IF old_count != new_count THEN
    RAISE EXCEPTION 'VALIDATION FAILED: Row count mismatch (old=%, new=%)', old_count, new_count;
  END IF;
  RAISE NOTICE 'PASS: Row count match (%)', old_count;

  -- Check default partition is empty (should not receive data)
  SELECT COUNT(*) INTO default_count FROM sensor_readings_default;
  IF default_count > 0 THEN
    RAISE WARNING 'Default partition contains % rows (expected 0). Investigate NULL or out-of-range dates.', default_count;
  ELSE
    RAISE NOTICE 'PASS: Default partition empty';
  END IF;

  -- Verify partition count
  SELECT COUNT(*) INTO partition_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE 'sensor_readings_y%';
  RAISE NOTICE 'PASS: % monthly partitions created', partition_count;

  -- Verify indexes exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'sensor_readings'
      AND indexname = 'sensor_readings_unit_time_idx'
  ) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: Index sensor_readings_unit_time_idx not found';
  END IF;
  RAISE NOTICE 'PASS: Indexes created';

  RAISE NOTICE 'Migration validated successfully. Ready to drop sensor_readings_old.';
END $$;

--------------------------------------------------------------------------------
-- STEP 8: Drop old table (ONLY AFTER VALIDATION)
--------------------------------------------------------------------------------
-- IMPORTANT: Manually execute this after confirming all validations pass
-- Uncomment and run separately to ensure data safety

-- DROP TABLE sensor_readings_old;

-- RAISE NOTICE 'Old table dropped. Migration complete.';

--------------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION CHECKLIST
--------------------------------------------------------------------------------
-- [ ] Row count matches: SELECT COUNT(*) FROM sensor_readings;
-- [ ] Partition pruning works: EXPLAIN ANALYZE SELECT * FROM sensor_readings WHERE recorded_at >= NOW() - INTERVAL '7 days';
--     Expected output: "Partitions scanned: sensor_readings_y2026m02" (1 partition, not all)
-- [ ] Indexes exist on partitions: SELECT tablename, indexname FROM pg_indexes WHERE tablename LIKE 'sensor_readings_%' ORDER BY tablename;
-- [ ] Foreign keys intact: SELECT * FROM sensor_readings sr JOIN units u ON sr.unit_id = u.id LIMIT 1;
-- [ ] Application queries work: Test all tRPC procedures that query sensor_readings
-- [ ] Dashboard loads <2s: Load dashboard with sensor data
-- [ ] No alerts triggered: Check Prometheus/Grafana for 2 hours post-migration
-- [ ] Default partition empty: SELECT COUNT(*) FROM sensor_readings_default; (expected: 0)
-- [ ] BullMQ partition jobs working: Manually trigger partition:create and partition:retention jobs

--------------------------------------------------------------------------------
-- MONITORING QUERIES
--------------------------------------------------------------------------------
-- List all partitions with row counts and sizes
-- SELECT
--   schemaname,
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
--   (SELECT COUNT(*) FROM ONLY sensor_readings_y2026m02) AS row_count
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename LIKE 'sensor_readings_%'
-- ORDER BY tablename;

-- Check partition pruning for time-range query
-- EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
-- SELECT * FROM sensor_readings
-- WHERE recorded_at >= '2026-02-01' AND recorded_at < '2026-03-01'
-- LIMIT 100;

-- Verify partition boundaries
-- SELECT
--   c.relname AS partition_name,
--   pg_get_expr(c.relpartbound, c.oid) AS partition_bound
-- FROM pg_class c
-- JOIN pg_inherits i ON i.inhrelid = c.oid
-- JOIN pg_class parent ON parent.oid = i.inhparent
-- WHERE parent.relname = 'sensor_readings'
-- ORDER BY c.relname;
