# Production Migration Playbook: Sensor Readings Partitioning

**Feature**: REC-002 PostgreSQL Time-Based Partitioning
**Environment**: Production
**Purpose**: Execute migration from monolithic to partitioned sensor_readings table
**Last Updated**: 2026-02-01

## Overview

This playbook guides the production migration of `sensor_readings` table from monolithic to monthly partitioned structure. The migration has been validated in staging and is ready for production deployment.

**Migration Strategy**: Low-traffic window (2-6 AM UTC)

**Critical Success Criteria**:
- Zero data loss
- Zero sensor data ingestion failures
- Dashboard performance maintained (<2s loads)
- Rollback available within 1 hour if needed

---

## Pre-Migration Requirements

### Prerequisites Checklist

- [ ] **Staging migration completed successfully** (see `staging-migration-playbook.md`)
- [ ] **Approvals obtained**: DevOps lead, Engineering lead, Product owner
- [ ] **Maintenance window scheduled**: Date, time, stakeholders notified
- [ ] **Database backup completed** (<24 hours old, tested restore)
- [ ] **Team availability**: Primary operator + backup on standby
- [ ] **Monitoring configured**: Grafana partition dashboard, Prometheus alerts
- [ ] **Rollback plan tested** in staging
- [ ] **Low-traffic window confirmed** (TTN webhook traffic analysis)

### Pre-Migration Validation

1. **Verify PostgreSQL version**:
   ```sql
   SELECT version();
   ```
   Required: PostgreSQL ≥10

2. **Check current data volume**:
   ```sql
   SELECT
     COUNT(*) AS total_rows,
     MIN(recorded_at) AS oldest_reading,
     MAX(recorded_at) AS newest_reading,
     pg_size_pretty(pg_total_relation_size('sensor_readings')) AS table_size
   FROM sensor_readings;
   ```

   Document for comparison post-migration.

3. **Verify disk space** (need 2x current table size for migration):
   ```sql
   SELECT
     pg_size_pretty(pg_database_size(current_database())) AS db_size,
     pg_size_pretty(pg_total_relation_size('sensor_readings')) AS table_size;
   ```

4. **Check for active sessions** on sensor_readings:
   ```sql
   SELECT
     pid,
     usename,
     application_name,
     state,
     query
   FROM pg_stat_activity
   WHERE query ILIKE '%sensor_readings%';
   ```

---

## Migration Timeline

**Total Duration**: 4 hours (2-6 AM UTC)

| Time | Phase | Duration | Activities |
|------|-------|----------|------------|
| 01:30 AM | Preparation | 30 min | Final validations, team briefing |
| 02:00 AM | Maintenance Start | - | Post notification, enable monitoring |
| 02:05 AM | Backup | 10 min | Full database backup |
| 02:15 AM | Migration Execute | 60-90 min | Run migration script, monitor progress |
| 03:45 AM | Validation | 30 min | Row count, partition pruning, FK checks |
| 04:15 AM | Application Test | 15 min | Restart services, API testing |
| 04:30 AM | Monitoring | 60 min | Watch for errors, performance checks |
| 05:30 AM | Finalization | 30 min | Drop old table, cleanup |
| 06:00 AM | Maintenance End | - | Post completion notification |

---

## Pre-Migration Communication

### Stakeholder Notification Template

**Subject**: [SCHEDULED MAINTENANCE] Database Optimization - Feb X, 2-6 AM UTC

**Body**:
```
Team,

We will be performing a database optimization on the sensor_readings table to improve performance as data volume grows.

**Schedule**: [DATE], 2:00 AM - 6:00 AM UTC
**Impact**: No expected downtime. Sensor data ingestion and dashboard access will continue normally.
**Rollback**: If issues are detected, we can revert within 1 hour.

**Expected Benefits**:
- 50%+ faster dashboard loads for time-range queries
- Improved database maintenance performance
- Better scalability as data grows

**Contact**: DevOps team (Slack #devops-alerts)

Thank you,
DevOps Team
```

---

## Migration Execution

### Phase 1: Preparation (01:30 AM - 02:00 AM)

1. **Assemble team**:
   - Primary operator (runs migration)
   - Backup operator (monitors, assists)
   - Engineering on-call (available for rollback)

2. **Final pre-flight checks**:
   ```bash
   # Verify staging results documented
   cat staging_migration_lessons_learned.md

   # Verify migration script is latest version
   md5sum backend/drizzle/0006_partition_sensor_readings.sql

   # Test database connectivity
   psql $DATABASE_URL -c "SELECT 1;"
   ```

3. **Open monitoring dashboards**:
   - Grafana: Partition Health Dashboard
   - Grafana: Application Metrics
   - Loki: Backend Logs
   - BullMQ: Job Queue Status

### Phase 2: Backup (02:00 AM - 02:15 AM)

1. **Post maintenance start notification** (Slack, status page).

2. **Create full database backup**:
   ```bash
   pg_dump $DATABASE_URL | gzip > production_backup_$(date +%Y%m%d_%H%M%S).dump.gz
   ```

   Alternative: Use cloud provider snapshot (faster):
   ```bash
   # AWS RDS snapshot
   aws rds create-db-snapshot \
     --db-instance-identifier freshguard-prod \
     --db-snapshot-identifier migration-backup-$(date +%Y%m%d-%H%M%S)

   # Wait for snapshot completion
   aws rds wait db-snapshot-completed \
     --db-snapshot-identifier migration-backup-$(date +%Y%m%d-%H%M%S)
   ```

3. **Verify backup**:
   ```bash
   # Check backup file size (should be >100MB for production data)
   ls -lh production_backup_*.dump.gz

   # Or verify snapshot status
   aws rds describe-db-snapshots \
     --db-snapshot-identifier migration-backup-$(date +%Y%m%d-%H%M%S)
   ```

### Phase 3: Migration Execution (02:15 AM - 03:45 AM)

1. **Capture pre-migration snapshot**:
   ```sql
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

   **Save output** for validation.

2. **Execute migration script**:
   ```bash
   psql $DATABASE_URL -v ON_ERROR_STOP=1 \
     -f backend/drizzle/0006_partition_sensor_readings.sql \
     2>&1 | tee production_migration_output.log
   ```

3. **Monitor progress** in real-time:
   - Watch for "Migrated X/Y rows" progress logs
   - Check Grafana for database CPU/memory usage
   - Verify no TTN webhook errors (sensor ingestion continues)

4. **Expected duration**:
   - Staging: [X] rows in [Y] minutes
   - Production estimate: [Z] rows in [W] minutes

   If duration exceeds estimate by 50%, investigate.

### Phase 4: Validation (03:45 AM - 04:15 AM)

**CRITICAL**: All validation checks must pass before proceeding.

1. **Row count match**:
   ```sql
   SELECT
     (SELECT total_rows FROM pre_migration_stats) AS pre_count,
     (SELECT COUNT(*) FROM sensor_readings) AS post_count,
     (SELECT total_rows FROM pre_migration_stats) = (SELECT COUNT(*) FROM sensor_readings) AS match;
   ```

   **REQUIRED**: `match = true`

   **If mismatch detected**: Immediately execute rollback (see Rollback section).

2. **Partition count**:
   ```sql
   SELECT COUNT(*) AS partition_count
   FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_y%';
   ```

   Expected: 24-30 partitions (historical + current + 3 future).

3. **Default partition empty**:
   ```sql
   SELECT COUNT(*) FROM sensor_readings_default;
   ```

   **REQUIRED**: 0 rows

   **If >0 rows**: Investigate NULL or out-of-range dates (may continue if <100 rows).

4. **Indexes verified**:
   ```sql
   SELECT COUNT(*) AS index_count
   FROM pg_indexes
   WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_%'
     AND indexname IN ('sensor_readings_unit_time_idx', 'sensor_readings_device_idx', 'sensor_readings_recorded_idx');
   ```

   **REQUIRED**: `index_count = partition_count * 3`

5. **Partition pruning verification**:
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT * FROM sensor_readings
   WHERE recorded_at >= NOW() - INTERVAL '7 days'
   ORDER BY recorded_at DESC
   LIMIT 100;
   ```

   **REQUIRED**: Output shows "Partitions scanned: 1" or "Partitions scanned: 2"

   **If pruning not working**: Investigate but may continue (performance issue, not data loss).

6. **Foreign key joins**:
   ```sql
   SELECT COUNT(*)
   FROM sensor_readings sr
   JOIN units u ON sr.unit_id = u.id
   LIMIT 10;
   ```

   **REQUIRED**: Successful join with results.

### Phase 5: Application Testing (04:15 AM - 04:30 AM)

1. **Restart backend services** (optional, only if schema changes require restart):
   ```bash
   # Docker Compose
   docker-compose restart backend

   # Kubernetes
   kubectl rollout restart deployment/backend -n production
   ```

2. **Health check**:
   ```bash
   curl -f https://api.freshguard.app/health || echo "FAILED"
   ```

   **REQUIRED**: Health check passes.

3. **API smoke tests**:
   ```bash
   # Test sensor readings endpoint
   curl -X POST https://api.freshguard.app/trpc/readings.recent \
     -H "Authorization: Bearer $TEST_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"unitId":"<test-unit-id>","limit":100}'
   ```

   **REQUIRED**: API returns data, no errors.

4. **Dashboard test**:
   - Load production dashboard in browser
   - Verify temperature charts render
   - Check page load time <2s

5. **TTN webhook test** (verify sensor data ingestion):
   ```bash
   # Check recent sensor_readings insertions
   SELECT COUNT(*) FROM sensor_readings WHERE received_at >= NOW() - INTERVAL '10 minutes';
   ```

   **REQUIRED**: New rows appearing (TTN webhooks functioning).

### Phase 6: Monitoring (04:30 AM - 05:30 AM)

**Critical monitoring period**: Watch for errors, performance degradation, or unexpected behavior.

1. **Monitor key metrics** (Grafana):
   - Partition count (should be stable)
   - Default partition rows (should be 0)
   - API response times (<2s)
   - Database CPU/memory (should return to baseline)
   - Error rate (should be 0)

2. **Check logs** (Loki):
   - Filter: `{job="backend"} |~ "sensor_readings|partition"`
   - Look for: Errors, warnings, partition routing issues

3. **BullMQ queue status**:
   - TTN webhook processing queue healthy
   - No backlog building up

4. **Alert status** (Prometheus):
   - No critical alerts triggered
   - No partition health warnings

**If issues detected**: Escalate to engineering lead, consider rollback.

### Phase 7: Finalization (05:30 AM - 06:00 AM)

**Only proceed if all validation passed and monitoring period clean.**

1. **Drop old table** (DESTRUCTIVE - data permanently deleted):
   ```sql
   -- FINAL CONFIRMATION: All validation passed?
   -- [ ] Row count match
   -- [ ] Partition pruning working
   -- [ ] Application functioning
   -- [ ] No alerts triggered

   -- If YES to all above:
   DROP TABLE sensor_readings_old;
   ```

2. **Verify cleanup**:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename = 'sensor_readings_old';
   ```

   Expected: 0 rows (table dropped).

3. **Reclaim disk space**:
   ```sql
   VACUUM FULL sensor_readings;
   ```

   Note: This may take 10-15 minutes. Not critical, can run async.

4. **Update documentation**:
   - Mark migration as completed in tracking system
   - Update KB docs with partition strategy

5. **Post completion notification** (Slack, status page):
   ```
   Database optimization complete. All services functioning normally.
   Benefits: 50%+ faster queries, improved scalability.
   ```

---

## Rollback Procedure

**Trigger Conditions**:
- Row count mismatch detected
- Partition pruning not working
- Application errors observed
- Critical alerts triggered

**Decision Maker**: DevOps lead + Engineering lead consensus

### Rollback Execution

1. **Stop migration immediately** (if in progress):
   ```sql
   -- Cancel running query (if possible)
   SELECT pg_cancel_backend(<pid>);
   ```

2. **Drop partitioned table**:
   ```sql
   DROP TABLE IF EXISTS sensor_readings CASCADE;
   ```

3. **Restore from backup**:

   **Option A: Rename old table** (fastest, if sensor_readings_old exists):
   ```sql
   ALTER TABLE sensor_readings_old RENAME TO sensor_readings;
   ```

   **Option B: Restore from dump** (slower, if old table dropped):
   ```bash
   gunzip -c production_backup_*.dump.gz | psql $DATABASE_URL
   ```

   **Option C: Restore from snapshot** (cloud provider):
   ```bash
   # AWS RDS restore (creates new instance, requires DNS update)
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier freshguard-prod-restored \
     --db-snapshot-identifier migration-backup-$(date +%Y%m%d-%H%M%S)
   ```

4. **Verify service recovery**:
   ```sql
   SELECT COUNT(*) FROM sensor_readings;
   ```

   Expected: Pre-migration row count.

5. **Restart application** (if needed):
   ```bash
   docker-compose restart backend
   ```

6. **Verify health**:
   - Health check endpoint: `GET /health`
   - Dashboard loads successfully
   - Sensor data ingestion working

7. **Post rollback notification**:
   ```
   Migration rollback completed. Services restored to pre-migration state.
   Investigating failure cause. Will reschedule after fixes validated in staging.
   ```

8. **Post-mortem**:
   - Document failure cause
   - Update migration script
   - Re-test in staging before retry

**Target Rollback Duration**: <1 hour from decision to full service recovery

---

## Post-Migration Checklist

### Immediate (Within 2 Hours)

- [ ] Row count validated
- [ ] Partition pruning verified
- [ ] Application tested successfully
- [ ] No critical alerts triggered
- [ ] Monitoring shows normal metrics
- [ ] TTN webhook ingestion functioning
- [ ] Dashboard performance <2s

### Within 24 Hours

- [ ] Monitor partition health dashboard daily
- [ ] Verify BullMQ partition jobs scheduled correctly
- [ ] Run full integration test suite
- [ ] Check for any delayed errors in logs
- [ ] Validate partition metrics in Prometheus

### Within 1 Week

- [ ] Document lessons learned
- [ ] Update KB docs with partition strategy
- [ ] Train team on partition management runbook
- [ ] Schedule first manual partition health check
- [ ] Verify automated partition creation job ran

---

## Success Metrics

### Performance Targets

- **Query speedup**: ≥50% for time-range queries
- **Dashboard load time**: Maintained <2s
- **Index size reduction**: 40%+ per partition vs monolithic
- **VACUUM duration**: 70%+ faster on individual partitions

### Operational Targets

- **Zero data loss**: Pre-migration count = post-migration count
- **Zero downtime**: Sensor ingestion continues during migration
- **Rollback capability**: <1 hour to restore if needed
- **Automation success**: partition:create and partition:retention jobs functioning

---

## Troubleshooting

### Issue: Migration Script Fails Mid-Execution

**Symptoms**: Script errors out during data copy
**Cause**: Disk space, memory, or transaction timeout
**Action**: Execute rollback, investigate cause, update script, retry

### Issue: Row Count Mismatch

**Symptoms**: Validation shows old count ≠ new count
**Cause**: Data loss during migration
**Action**: IMMEDIATE ROLLBACK. Do not proceed.

### Issue: Partition Pruning Not Working

**Symptoms**: EXPLAIN ANALYZE shows all partitions scanned
**Cause**: Query missing WHERE clause on partition key
**Action**: Investigate but may continue. Fix application queries post-migration.

### Issue: Application Errors After Migration

**Symptoms**: 500 errors in API logs, dashboard failures
**Cause**: Schema incompatibility, FK constraint issues
**Action**: Check logs for specific errors. If critical, execute rollback.

---

## Contact & Escalation

**Primary Operator**: [Name]
**Backup Operator**: [Name]
**Engineering Lead**: [Name]
**DevOps Lead**: [Name]
**Emergency Contact**: PagerDuty on-call rotation

**Communication Channels**:
- Slack: #devops-alerts, #engineering
- Incident Room: [Conference line / Zoom link]

---

## Related Documentation

- **Staging Playbook**: `staging-migration-playbook.md`
- **Partition Runbook**: `partition-management.md`
- **Migration Script**: `backend/drizzle/0006_partition_sensor_readings.sql`
- **ADR**: `backend/docs/adr/ADR-009-partition-strategy.md`
- **Grafana Dashboard**: `backend/docs/grafana/partition-health-dashboard.json`
- **Prometheus Alerts**: `backend/docs/prometheus/partition-alerts.yml`
