# Database Architecture & PgBouncer Compatibility

This document describes FreshTrack Pro's database architecture, connection pooling configuration, and PgBouncer compatibility audit.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Backend Application                      │
│                    (Fastify + Drizzle ORM)                   │
│                                                               │
│  DATABASE_URL: postgresql://user:pass@pgbouncer:6432/db     │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ pg Pool (max: 20)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                         PgBouncer                            │
│                   (Transaction Pooling)                      │
│                                                               │
│  Listen: 0.0.0.0:6432                                       │
│  Mode: transaction                                           │
│  Pool: 20 default, 10 min, 5 reserve                        │
│  Max clients: 100                                            │
│  Prepared statements: 200 max                                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ PostgreSQL Wire Protocol
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL 17                           │
│                     (Primary Database)                       │
│                                                               │
│  Listen: 0.0.0.0:5432                                       │
│  Max connections: 100                                        │
└─────────────────────────────────────────────────────────────┘
```

## DATABASE_URL Configuration

### Development

```bash
# Direct PostgreSQL connection (no pooling)
DATABASE_URL=postgresql://frostguard:devpassword@localhost:5432/frostguard
```

Development connects directly to PostgreSQL for:
- Schema migrations (`drizzle-kit push`, `drizzle-kit migrate`)
- Drizzle Studio (`drizzle-kit studio`)
- Local debugging without pooling complexity

### Production

```bash
# PgBouncer connection pooling
DATABASE_URL=postgresql://frostguard:${SECRET}@pgbouncer:6432/frostguard
```

Production connects through PgBouncer for:
- Connection pooling (100 clients → 20 database connections)
- Query timeout enforcement (30s query, 120s wait)
- Connection lifecycle management (1h max server lifetime)
- Metrics and monitoring via pgbouncer_exporter

## PgBouncer Transaction Mode

**Pooling mode:** `transaction`

Transaction mode returns connections to the pool after each transaction completes. This provides:
- **Connection reuse** - Reduces PostgreSQL connection overhead
- **Prepared statement support** - Compatible with Drizzle ORM
- **Transaction safety** - Each database transaction gets an isolated connection
- **Scalability** - 100+ clients can share 20 database connections

**Restrictions in transaction mode:**
- ❌ No `SET SESSION` commands (session state resets between transactions)
- ❌ No `LISTEN/NOTIFY` (requires persistent connection)
- ❌ No advisory locks (connection-specific locks not available)
- ❌ No prepared statements without `max_prepared_statements` configuration

## PgBouncer Compatibility Audit

**Audit performed:** 2026-01-24
**Backend version:** 1.0.0
**ORM:** Drizzle ORM 0.38.0
**Database driver:** node-postgres (pg) 8.13.0

### Audit Results

| Check                    | Pattern Searched               | Occurrences | Status |
|--------------------------|--------------------------------|-------------|---------|
| Prepared Statements      | `.prepare()`                   | 0           | ✅ PASS |
| SET SESSION              | `SET SESSION`                  | 0           | ✅ PASS |
| SET LOCAL                | `SET LOCAL`                    | 0           | ✅ PASS |
| SET search_path          | `SET search_path`              | 0           | ✅ PASS |
| SET timezone             | `SET timezone`                 | 0           | ✅ PASS |
| LISTEN                   | `LISTEN`                       | 0           | ✅ PASS |
| NOTIFY                   | `NOTIFY`                       | 0           | ✅ PASS |
| Advisory Locks           | `pg_advisory_lock`             | 0           | ✅ PASS |

**Result:** Backend is fully compatible with PgBouncer transaction mode.

### Drizzle ORM Compatibility

Drizzle ORM uses prepared statements internally for:
- Parameterized queries (all `eq()`, `and()`, `inArray()` operations)
- Insert/Update/Delete operations with `.values()`
- Transaction boundaries (`.transaction()` blocks)

**PgBouncer configuration:** `max_prepared_statements = 200`

This allows PgBouncer to track up to 200 prepared statements per backend connection, providing full ORM compatibility while maintaining connection pooling benefits.

**Verified patterns:**
- ✅ `db.select().from(table).where(eq(column, value))` - Parameterized queries
- ✅ `db.insert(table).values(data).returning()` - Insert with RETURNING
- ✅ `db.update(table).set(data).where()` - Parameterized updates
- ✅ `db.transaction(async (tx) => { ... })` - Transaction blocks
- ✅ `inArray(column, values)` - Array parameters
- ✅ Batch inserts with `.values([...])` - Bulk operations

### Code Review Highlights

**Transaction usage** (src/services/readings.service.ts):
```typescript
return db.transaction(async (tx) => {
  // Insert readings in batches
  for (let i = 0; i < validReadings.length; i += BATCH_SIZE) {
    const inserted = await tx.insert(sensorReadings)
      .values(insertData)
      .returning({ id: sensorReadings.id });
  }

  // Update units
  await tx.update(units).set({ ... }).where(eq(units.id, unitId));

  return { insertedCount, readingIds, alertsTriggered };
});
```

This pattern is PgBouncer-safe because:
- Each `db.transaction()` call gets a dedicated connection
- Connection returns to pool after transaction commits/rolls back
- No SET commands or session state required
- Prepared statements cached per connection (up to 200)

**Pool configuration** (src/db/client.ts):
```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Match PgBouncer default_pool_size
  idleTimeoutMillis: 30000,   // 30s idle timeout
  connectionTimeoutMillis: 5000, // 5s connection timeout
});
```

Application pool size (20) matches PgBouncer pool size (20 default) to prevent connection queuing at PgBouncer level.

## Monitoring

### PgBouncer Metrics

**Exporter:** prometheuscommunity/pgbouncer-exporter:0.9.0
**Endpoint:** http://pgbouncer-exporter:9127/metrics
**Prometheus job:** `pgbouncer`

**Key metrics:**
- `pgbouncer_pools_server_active_connections` - Active database connections
- `pgbouncer_pools_server_idle_connections` - Idle pool connections
- `pgbouncer_pools_client_active_connections` - Active client connections
- `pgbouncer_pools_client_waiting_connections` - Clients waiting for connection
- `pgbouncer_stats_queries_total` - Query throughput
- `pgbouncer_stats_queries_duration_seconds` - Query latency

### Grafana Dashboards

**Recommended dashboard:** PgBouncer Overview (https://grafana.com/grafana/dashboards/12826)

Monitors:
- Connection pool utilization (active/idle ratio)
- Client wait times (queue depth)
- Query throughput (queries/sec)
- Error rates (transaction rollbacks, timeouts)

### Alerting

**Critical alerts:**
- Client wait queue > 10 for 2+ minutes (pool saturation)
- Query timeout rate > 1% (slow queries)
- Connection errors > 5/min (authentication or network issues)

**Warning alerts:**
- Pool utilization > 80% for 5+ minutes (consider increasing pool size)
- Average query wait time > 100ms (connection pressure)

## Performance Tuning

### When to increase pool size

Monitor `pgbouncer_pools_client_waiting_connections`:
- Sustained wait queue (> 5 clients for > 1 minute) → Increase `default_pool_size`
- High query latency with low database CPU → Connection bottleneck

### When to investigate queries

Monitor `pgbouncer_stats_queries_duration_seconds`:
- P99 query time > 1s → Check slow query log
- Timeout errors increasing → Add indexes or optimize queries

### Connection lifecycle

**Current settings:**
- `server_lifetime = 3600` (1 hour max connection age)
- `server_idle_timeout = 600` (10 min idle timeout)
- `client_idle_timeout = 0` (no client timeout - application manages)

These settings balance:
- Connection reuse (reduce PostgreSQL fork overhead)
- Memory cleanup (idle connections released)
- Application flexibility (no forced disconnects)

## Migration Strategy

### Development → Production

1. **Development:**
   - Direct PostgreSQL connection on port 5432
   - Run migrations with `npm run db:migrate` (dev)
   - Test with `npm run db:studio` (dev)

2. **Production deployment:**
   - Backend DATABASE_URL points to `pgbouncer:6432`
   - Migrations run against PostgreSQL directly (one-time `psql` connection)
   - Application traffic flows through PgBouncer

3. **Schema changes:**
   - Apply migrations to PostgreSQL directly (bypass PgBouncer)
   - Restart PgBouncer if changing prepared statement patterns
   - Monitor pool metrics after deployment

## Troubleshooting

### "prepared statement does not exist"

**Cause:** PgBouncer `max_prepared_statements` limit exceeded
**Fix:** Increase `max_prepared_statements` in pgbouncer.ini (current: 200)
**Check:** `SHOW STATS` in pgbouncer admin console

### "connection pool exhausted"

**Cause:** All 20 pool connections active, 100 client limit reached
**Fix:** Increase `default_pool_size` and `max_db_connections`
**Check:** `pgbouncer_pools_client_waiting_connections` metric

### "query timeout"

**Cause:** Query exceeded 30s limit
**Fix:** Optimize query, add indexes, or increase `query_timeout`
**Check:** PostgreSQL `pg_stat_statements` for slow queries

### "authentication failed"

**Cause:** Credentials in `userlist.txt` don't match PostgreSQL
**Fix:** Regenerate MD5 hash: `echo "md5$(echo -n 'password''username' | md5sum)"`
**Production:** Use Infisical secret mounts (not userlist.txt)

## Security Notes

### Development Credentials

File: `docker/pgbouncer/userlist.txt`
```
"frostguard" "md5..." # Dev password (not for production)
"pgbouncer_exporter" "md5..." # Metrics access
```

**⚠️ Development only** - Do not use these credentials in production.

### Production Credentials

Production must use Infisical secret mounts:
```yaml
# docker/compose.production.yaml
pgbouncer:
  volumes:
    - /var/infisical/secrets/pgbouncer_userlist.txt:/bitnami/pgbouncer/conf/userlist.txt:ro
```

Infisical manages:
- PostgreSQL user passwords
- PgBouncer admin credentials
- Metrics exporter authentication

## Backup & Restore Procedures

### Backup Schedule

| Frequency | Time (UTC) | Retention | Format | Storage |
|-----------|------------|-----------|---------|---------|
| Daily | 2:00 AM | 30 days | pg_dump custom (compressed) | MinIO (postgres-backups bucket) |
| On-demand | Manual | 30 days | pg_dump custom (compressed) | MinIO (postgres-backups bucket) |

**Backup service:** `freshtrack-postgres-backup` (runs via cron in Docker container)
**Script:** `docker/scripts/backup-postgres.sh`

### Quick Restore (Automated Test)

Use the test-restore script to validate backup integrity without affecting production data.

**Script:** `docker/scripts/test-restore.sh`

```bash
# Test most recent backup (automatic selection)
docker exec freshtrack-postgres-backup /usr/local/bin/test-restore.sh

# Test specific backup file
docker exec freshtrack-postgres-backup \
  env BACKUP_FILE=freshtrack_2026-01-24_02-00-00.dump \
  /usr/local/bin/test-restore.sh
```

**What it does:**
1. Downloads backup from MinIO (most recent or specified)
2. Validates backup file integrity with `pg_restore --list`
3. Creates test database `freshtrack_restore_test`
4. Restores backup to test database
5. Validates restoration (table count, sample data)
6. Cleans up (drops test database, removes temp files)

**Expected output:**
```
[2026-01-24 02:15:00 UTC] Starting backup restoration test
[2026-01-24 02:15:01 UTC] Using most recent backup: freshtrack_2026-01-24_02-00-00.dump
[2026-01-24 02:15:05 UTC] Downloaded backup successfully: 125M
[2026-01-24 02:15:06 UTC] Backup file integrity validated
[2026-01-24 02:15:30 UTC] Restoration validated: 42 tables found in test database
[2026-01-24 02:15:31 UTC] Sample data: sensor_readings has 15234 rows
[2026-01-24 02:15:32 UTC] ✅ Backup restoration test completed successfully
```

### Manual Restore (Production Recovery)

**⚠️ WARNING:** This procedure is destructive. All current data will be lost. Only use for disaster recovery.

#### Step 1: List Available Backups

```bash
# Inside MinIO container or with mc CLI configured
docker exec freshtrack-minio mc ls minio/postgres-backups/

# Expected output:
# [2026-01-24 02:00:15 UTC]  125MiB freshtrack_2026-01-24_02-00-00.dump
# [2026-01-23 02:00:12 UTC]  124MiB freshtrack_2026-01-23_02-00-00.dump
# [2026-01-22 02:00:09 UTC]  123MiB freshtrack_2026-01-22_02-00-00.dump
```

#### Step 2: Download Backup File

```bash
# Download specific backup to /tmp
docker exec freshtrack-minio mc cp \
  minio/postgres-backups/freshtrack_2026-01-24_02-00-00.dump \
  /tmp/restore.dump

# Verify download
docker exec freshtrack-postgres ls -lh /tmp/restore.dump
```

#### Step 3: Stop Application Services

**CRITICAL:** Stop backend API to prevent writes during restoration.

```bash
# Stop backend API (prevents new database connections)
docker compose -f docker/compose.prod.yaml stop backend

# Verify API is down
curl http://localhost:3000/health  # Should fail
```

#### Step 4: Restore Database

**Option A: Destructive Restore (drop and recreate)**

```bash
# Drop existing database (destructive!)
docker exec freshtrack-postgres psql -U frostguard -d postgres \
  -c "DROP DATABASE IF EXISTS frostguard"

# Create fresh database
docker exec freshtrack-postgres psql -U frostguard -d postgres \
  -c "CREATE DATABASE frostguard"

# Restore from backup
docker exec -i freshtrack-postgres pg_restore \
  --username=frostguard \
  --dbname=frostguard \
  --verbose \
  --no-owner \
  --no-acl \
  /tmp/restore.dump
```

**Option B: Safer Restore (clean + restore)**

```bash
# Clean existing data (preserves schema if needed)
docker exec freshtrack-postgres psql -U frostguard -d frostguard \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Restore from backup
docker exec -i freshtrack-postgres pg_restore \
  --username=frostguard \
  --dbname=frostguard \
  --verbose \
  --no-owner \
  --no-acl \
  /tmp/restore.dump
```

**Validation:**

```bash
# Check table count
docker exec freshtrack-postgres psql -U frostguard -d frostguard \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"

# Check sample data
docker exec freshtrack-postgres psql -U frostguard -d frostguard \
  -c "SELECT COUNT(*) FROM sensor_readings"
```

#### Step 5: Restart Application Services

```bash
# Restart backend API
docker compose -f docker/compose.prod.yaml start backend

# Verify backend is healthy
curl http://localhost:3000/health  # Should return 200 OK
```

#### Step 6: Verify Application

**Critical checks:**
- [ ] Backend API health endpoint responds
- [ ] User login works
- [ ] Sensor data displays in dashboard
- [ ] Recent sensor readings show expected timestamps
- [ ] Alert rules are loaded
- [ ] Organization/site/unit hierarchy intact

```bash
# Check recent sensor readings
docker exec freshtrack-postgres psql -U frostguard -d frostguard \
  -c "SELECT MAX(recorded_at) FROM sensor_readings"

# Expected: Recent timestamp (within expected backup window)
```

### Disaster Recovery Checklist

Use this checklist during actual production recovery events.

**Pre-Restoration:**
- [ ] Identify root cause of data loss (prevent recurrence)
- [ ] Document incident start time and scope
- [ ] Notify stakeholders (downtime window)
- [ ] Determine required backup (most recent or specific point-in-time)
- [ ] Verify backup file integrity (`pg_restore --list`)

**During Restoration:**
- [ ] Stop backend API services
- [ ] Verify no active database connections (`SELECT count(*) FROM pg_stat_activity`)
- [ ] Download backup from MinIO
- [ ] Execute restore procedure (Option A or B above)
- [ ] Validate table count matches expected schema
- [ ] Check sample data from critical tables

**Post-Restoration:**
- [ ] Restart backend API services
- [ ] Verify application health endpoint
- [ ] Test critical user flows (login, dashboard, sensor data)
- [ ] Check data freshness (most recent sensor reading timestamp)
- [ ] Monitor error logs for 30 minutes
- [ ] Update incident timeline (restoration complete)
- [ ] Schedule post-mortem review

### Backup Monitoring

**Prometheus alerts:** `docker/prometheus/alerts/backups.yml`

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| BackupAgeTooOld | No backup in 25+ hours | Critical | Check backup container logs, verify MinIO connectivity |
| BackupContainerDown | Backup container stopped | Critical | Restart container, verify cron schedule |
| BackupStorageLow | MinIO volume > 85% full | Warning | Review retention policy, expand storage |

**Manual monitoring:**

```bash
# Check backup container status
docker ps | grep freshtrack-postgres-backup

# View backup logs
docker logs freshtrack-postgres-backup

# List recent backups
docker exec freshtrack-minio mc ls minio/postgres-backups/ | tail -5

# Check backup file sizes (should be consistent)
docker exec freshtrack-minio mc ls --summarize minio/postgres-backups/
```

### Recovery Time Objectives (RTO/RPO)

**RPO (Recovery Point Objective):** 24 hours
- Daily backups at 2 AM UTC
- Maximum data loss: up to 24 hours (since last backup)
- Critical data: Sensor readings, alerts, user data

**RTO (Recovery Time Objective):** 30 minutes
- Backup download: ~5 minutes (125MB @ 25MB/s)
- Database restore: ~15 minutes (varies with data volume)
- Service restart + validation: ~10 minutes

**To improve RPO/RTO:**
- Enable WAL (Write-Ahead Log) archiving for point-in-time recovery (PITR)
- Increase backup frequency to 6-hour intervals
- Implement streaming replication for hot standby
- Add automated restore testing to CI/CD pipeline

### On-Demand Backup

Trigger manual backup before risky operations (schema changes, bulk data imports).

```bash
# Manual backup execution
docker exec freshtrack-postgres-backup /usr/local/bin/backup-postgres.sh

# Verify backup created
docker exec freshtrack-minio mc ls minio/postgres-backups/ | grep $(date -u +"%Y-%m-%d")
```

**Use cases:**
- Before database schema migrations
- Before bulk data deletion
- Before major application upgrades
- Before security updates affecting database

## References

- **PgBouncer documentation:** https://www.pgbouncer.org/config.html
- **Drizzle ORM:** https://orm.drizzle.team/
- **node-postgres:** https://node-postgres.com/
- **pgbouncer_exporter:** https://github.com/prometheus-community/pgbouncer_exporter
- **PostgreSQL Backup & Restore:** https://www.postgresql.org/docs/current/backup.html
- **pg_dump documentation:** https://www.postgresql.org/docs/current/app-pgdump.html
- **pg_restore documentation:** https://www.postgresql.org/docs/current/app-pgrestore.html

---

**Last updated:** 2026-01-24
**Audit status:** ✅ Backend fully compatible with PgBouncer transaction mode
**Backup status:** ✅ Daily automated backups with tested restore procedures
