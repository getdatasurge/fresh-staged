# FreshStaged Backend

Backend API service for FreshStaged IoT temperature monitoring platform.

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npm run db:push

# Run development server
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Build for production
npm run build
```

## Database Maintenance

### Partition Management (sensor_readings table)

The `sensor_readings` table uses PostgreSQL native table partitioning to manage time-series data efficiently.

**Strategy**:
- **Monthly RANGE partitions** on `recorded_at` column
- **Automated lifecycle**: BullMQ jobs create future partitions and enforce retention
- **24-month retention**: Old partitions automatically dropped (with backup verification)
- **3-month future buffer**: Ensures writes never hit default partition

**Automated Jobs**:
- `partition:create` - Weekly (Sunday 2 AM UTC) - Creates 3-month future buffer
- `partition:retention` - Monthly (1st at 3 AM UTC) - Drops partitions older than 24 months

**Partition Naming**: `sensor_readings_y<YYYY>m<MM>` (e.g., `sensor_readings_y2026m02`)

#### Manual Operations

**List partitions**:
```sql
SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_y%'
ORDER BY tablename DESC;
```

**Create partition** (if automation fails):
```sql
-- Example: Create April 2026 partition
CREATE TABLE sensor_readings_y2026m04 PARTITION OF sensor_readings
FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
```

**Drop partition manually** (⚠️  DESTRUCTIVE):
```sql
-- CRITICAL: Verify backups exist before dropping
-- Check pg_stat_archiver for backup status
SELECT last_archived_time FROM pg_stat_archiver;

-- Drop partition (data permanently deleted)
DROP TABLE IF EXISTS sensor_readings_y2024m01;
```

**Verify partition health**:
```sql
-- Check for data in default partition (should be empty or minimal)
SELECT COUNT(*) FROM sensor_readings_default;

-- List partitions with row counts
SELECT
  tablename,
  n_live_tup AS row_count,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND tablename LIKE 'sensor_readings_%'
ORDER BY tablename DESC;
```

#### Monitoring

**Grafana Dashboard**: `backend/docs/grafana/partition-health-dashboard.json`

Key metrics:
- Partition count gauge (target: 27-30 partitions)
- Future buffer gauge (target: ≥3 months)
- Default partition row count (target: 0 rows)
- Partition size distribution
- Row growth trends

**Prometheus Alerts**: `backend/docs/prometheus/partition-alerts.yml`

Critical alerts:
- Missing future partitions (fires when buffer < 2 months)
- Partition job failures
- Data in default partition detected
- Backup verification failures

#### Backup Verification

The partition retention job includes automatic backup verification via `pg_stat_archiver`. Before dropping any partition, the job verifies:

1. WAL archiving is active and current (last archive within 24 hours)
2. No failed archive attempts
3. Total row count impact is logged for audit

**Environment Variables**:
- `BACKUP_VERIFICATION_ENABLED`: Set to `false` to skip verification (⚠️  NOT RECOMMENDED)
- `BACKUP_MAX_AGE_HOURS`: Maximum age of last backup in hours (default: 24)

#### Troubleshooting

**Issue**: Data routing to default partition instead of month partition

**Cause**: `recorded_at` value is NULL or outside defined partition ranges

**Fix**:
```sql
-- Find rows in default partition
SELECT id, unit_id, recorded_at, received_at
FROM sensor_readings_default
LIMIT 10;

-- Move to correct partition (if recorded_at can be backfilled)
UPDATE sensor_readings
SET recorded_at = received_at
WHERE recorded_at IS NULL AND received_at IS NOT NULL;
```

**Issue**: Partition creation job failing

**Symptoms**: `partition:create` job status = failed, future buffer < 3 months

**Resolution**:
1. Check BullMQ logs: `docker logs <backend-container> | grep partition:create`
2. Verify PostgreSQL permissions: User needs `CREATE TABLE` privilege
3. Manually create missing partitions (see Manual Operations above)
4. Re-run job: `bull retry partition:create <job-id>`

**Issue**: Retention job not dropping old partitions

**Symptoms**: Partition count > 30, partitions older than 24 months exist

**Resolution**:
1. Check if `BACKUP_VERIFICATION_ENABLED=false` is blocking drops
2. Verify `pg_stat_archiver` shows recent backups
3. Check retention job logs for errors
4. Manually drop old partitions if backups confirmed

For complete operational procedures, see:
- **Partition Management Runbook**: `backend/docs/runbooks/partition-management.md`
- **Staging Migration Playbook**: `backend/docs/runbooks/staging-migration-playbook.md`
- **Production Migration Playbook**: `backend/docs/runbooks/production-migration-playbook.md`

---

## Architecture

- **Framework**: Fastify (Node.js)
- **API**: tRPC for type-safe RPC
- **Database**: PostgreSQL 15+ with Drizzle ORM
- **Authentication**: Stack Auth
- **Background Jobs**: BullMQ (Redis-backed)
- **WebSocket**: Socket.io for real-time updates
- **Monitoring**: Prometheus metrics, Grafana dashboards

## Project Structure

```
backend/
├── src/
│   ├── app.ts              # Fastify application
│   ├── db/
│   │   ├── client.ts       # Drizzle DB client
│   │   └── schema/         # Database schema definitions
│   ├── routers/            # tRPC routers
│   ├── services/           # Business logic
│   ├── workers/            # BullMQ processors
│   └── jobs/               # Job definitions & schedulers
├── drizzle/                # Database migrations
├── docs/
│   ├── runbooks/           # Operational runbooks
│   ├── grafana/            # Monitoring dashboards
│   └── prometheus/         # Alert rules
└── tests/                  # Unit & integration tests
```

## Environment Variables

See `.env.example` for complete configuration reference.

Critical variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection for BullMQ
- `STACK_PROJECT_ID`: Stack Auth project ID
- `BACKUP_VERIFICATION_ENABLED`: Partition retention safety check (default: true)

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test partition.service.test.ts
```

## Deployment

```bash
# Build production bundle
npm run build

# Start production server
npm start
```

**Docker**:
```bash
# Build image
docker build -t freshstaged-backend .

# Run container
docker run -p 3000:3000 --env-file .env freshstaged-backend
```

## License

Proprietary - FreshStaged Platform
