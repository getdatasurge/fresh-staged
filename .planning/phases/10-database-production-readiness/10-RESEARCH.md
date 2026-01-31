# Phase 10: Database Production Readiness - Research

**Researched:** 2026-01-23
**Domain:** PostgreSQL connection pooling, database backups, SSL monitoring
**Confidence:** HIGH

## Summary

Phase 10 establishes production-grade database infrastructure through PgBouncer connection pooling, automated backups, and SSL certificate monitoring. The research confirms that the existing backend stack (Drizzle ORM 0.38 with node-postgres) is fully compatible with PgBouncer transaction mode without code changes, as node-postgres only uses prepared statements when explicitly named (opt-in), and the codebase audit shows no incompatible features.

The standard approach uses PgBouncer 1.20+ in transaction pooling mode with max_prepared_statements=200 (supports protocol-level prepared statements), daily pg_dump backups to MinIO with 30-day retention via a dedicated backup container, pgbouncer_exporter for Prometheus metrics, and Blackbox Exporter for SSL certificate expiry monitoring. All components integrate seamlessly with the existing observability stack (Prometheus/Grafana/Loki from Phase 7/9).

**Primary recommendation:** Deploy PgBouncer 1.20+ in transaction mode with default_pool_size=20, use a dedicated kartoza/pg-backup or custom container for daily pg_dump to MinIO with find-based 30-day cleanup, add pgbouncer_exporter sidecar on port 9127, and configure Prometheus Blackbox Exporter to monitor Caddy's SSL certificate with 30-day expiry alerts via AlertManager.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library            | Version | Purpose             | Why Standard                                                                                                                     |
| ------------------ | ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PgBouncer          | 1.20+   | Connection pooling  | Industry-standard PostgreSQL pooler, supports transaction mode with protocol-level prepared statements (max_prepared_statements) |
| pgbouncer_exporter | latest  | Prometheus metrics  | prometheus-community official exporter, exposes pools/stats/databases metrics on port 9127                                       |
| PostgreSQL pg_dump | 14+     | Database backup     | Native PostgreSQL backup utility, reliable full backup solution                                                                  |
| MinIO Client (mc)  | latest  | S3-compatible CLI   | Official MinIO CLI for uploading backups, uses S3 API                                                                            |
| Blackbox Exporter  | latest  | SSL cert monitoring | Prometheus official exporter, probe_ssl_earliest_cert_expiry metric for TLS certificates                                         |

### Supporting

| Library           | Version | Purpose                    | When to Use                                                                            |
| ----------------- | ------- | -------------------------- | -------------------------------------------------------------------------------------- |
| kartoza/pg-backup | latest  | Automated backup container | Pre-built Docker image with cron, pg_dump, compression, and retention policies         |
| bitnami/pgbouncer | latest  | PgBouncer Docker image     | Alternative to building custom image, includes health checks                           |
| ssl_exporter      | latest  | Dedicated cert exporter    | Alternative to Blackbox for certificate-only monitoring (not needed if using Blackbox) |

### Alternatives Considered

| Instead of        | Could Use      | Tradeoff                                                                                          |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| Transaction mode  | Session mode   | Session mode doesn't release connections until session ends - much less efficient pooling         |
| pg_dump           | pgBackRest     | pgBackRest provides incremental backups and PITR but adds complexity - overkill for current scale |
| pg_dump           | Barman         | Barman is enterprise-grade but requires dedicated server and more complex setup                   |
| Daily backups     | Hourly backups | More frequent backups reduce RPO but increase storage costs and I/O overhead                      |
| Blackbox Exporter | cert-exporter  | cert-exporter is certificate-specific but Blackbox already handles HTTP probes + certs            |

**Installation:**

```bash
# PgBouncer (via Docker)
docker pull bitnami/pgbouncer:latest
# or use edoburu/pgbouncer for minimal image

# pgbouncer_exporter (via Docker)
docker pull prometheuscommunity/pgbouncer-exporter:latest

# MinIO Client (via Docker or in backup container)
docker pull minio/mc:latest

# Blackbox Exporter (already in Prometheus stack)
docker pull prom/blackbox-exporter:latest

# Backup container option
docker pull kartoza/pg-backup:latest
```

## Architecture Patterns

### Recommended Project Structure

```
docker/
├── pgbouncer/
│   ├── pgbouncer.ini          # PgBouncer configuration
│   └── userlist.txt           # User credentials (from Infisical)
├── prometheus/
│   ├── prometheus.yml         # Add pgbouncer_exporter and blackbox scrape configs
│   └── alerts/
│       ├── ssl-certs.yml      # SSL certificate expiry alerts
│       └── backups.yml        # Backup failure alerts
├── blackbox/
│   └── blackbox.yml           # Blackbox Exporter config for SSL probes
└── scripts/
    └── backup-postgres.sh     # Custom backup script (alternative to kartoza)
```

### Pattern 1: PgBouncer Transaction Pooling

**What:** Application connects to PgBouncer on port 6432, PgBouncer pools connections to PostgreSQL on port 5432, releasing connections after each transaction completes.
**When to use:** Production environments with multiple application instances or high connection churn.
**Example:**

```ini
# docker/pgbouncer/pgbouncer.ini
[databases]
freshtrack = host=postgres port=5432 dbname=freshtrack

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Connection pool settings
pool_mode = transaction
default_pool_size = 20
max_client_conn = 100
server_lifetime = 3600
server_idle_timeout = 600

# Transaction mode with prepared statements support
max_prepared_statements = 200

# Required for exporter
ignore_startup_parameters = extra_float_digits

# Admin access for exporter
admin_users = pgbouncer_exporter
stats_users = pgbouncer_exporter
```

### Pattern 2: Backend Connection String Update

**What:** Backend switches from direct PostgreSQL connection to PgBouncer connection by changing port from 5432 to 6432.
**When to use:** After PgBouncer is deployed and validated.
**Example:**

```typescript
// backend/src/db/client.ts
const pool = new Pool({
  // Change from: postgresql://user:pass@postgres:5432/freshtrack
  // To:         postgresql://user:pass@pgbouncer:6432/freshtrack
  connectionString: process.env.DATABASE_URL,
  max: 20, // Backend's client pool size (PgBouncer handles server pooling)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### Pattern 3: Daily Backup to MinIO with Retention

**What:** Cron job runs daily pg_dump, compresses output, uploads to MinIO, deletes backups older than 30 days.
**When to use:** Production environments requiring point-in-time recovery capability.
**Example:**

```bash
#!/bin/bash
# docker/scripts/backup-postgres.sh

set -e

BACKUP_DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="freshtrack_${BACKUP_DATE}.sql.gz"
BACKUP_PATH="/tmp/${BACKUP_FILE}"
RETENTION_DAYS=30

# Dump and compress
pg_dump -h postgres -U ${POSTGRES_USER} -d freshtrack | gzip > ${BACKUP_PATH}

# Upload to MinIO
mc alias set minio http://minio:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}
mc mb -p minio/postgres-backups
mc cp ${BACKUP_PATH} minio/postgres-backups/${BACKUP_FILE}

# Cleanup local file
rm ${BACKUP_PATH}

# Delete old backups (older than 30 days)
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)
mc ls minio/postgres-backups/ | while read -r line; do
  BACKUP_DATE=$(echo "$line" | awk '{print $1" "$2}')
  BACKUP_FILE=$(echo "$line" | awk '{print $NF}')
  if [[ "$BACKUP_DATE" < "$CUTOFF_DATE" ]]; then
    mc rm "minio/postgres-backups/${BACKUP_FILE}"
    echo "Deleted old backup: ${BACKUP_FILE}"
  fi
done

echo "Backup completed: ${BACKUP_FILE}"
```

### Pattern 4: PgBouncer Metrics Monitoring

**What:** pgbouncer_exporter sidecar connects to PgBouncer admin interface, exposes metrics on port 9127 for Prometheus scraping.
**When to use:** Always - essential for monitoring connection pool health.
**Example:**

```yaml
# docker/compose.prod.yaml
services:
  pgbouncer:
    image: bitnami/pgbouncer:latest
    environment:
      PGBOUNCER_DATABASE: freshtrack
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
    volumes:
      - ./pgbouncer/pgbouncer.ini:/bitnami/pgbouncer/conf/pgbouncer.ini:ro
    ports:
      - '6432:6432'
    healthcheck:
      test: ['CMD', 'pg_isready', '-h', 'localhost', '-p', '6432']
      interval: 10s
      timeout: 5s
      retries: 3

  pgbouncer_exporter:
    image: prometheuscommunity/pgbouncer-exporter:latest
    environment:
      PGBOUNCER_EXPORTER_CONNECTION_STRING: 'postgresql://pgbouncer_exporter:password@pgbouncer:6432/pgbouncer?sslmode=disable'
    ports:
      - '9127:9127'
    depends_on:
      - pgbouncer
```

### Pattern 5: SSL Certificate Expiry Monitoring

**What:** Blackbox Exporter probes Caddy's HTTPS endpoint, Prometheus scrapes probe_ssl_earliest_cert_expiry metric, AlertManager fires alert 30 days before expiry.
**When to use:** Always - prevents service outages from expired certificates.
**Example:**

```yaml
# docker/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'ssl-certs'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://freshtrack.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox:9115

# docker/prometheus/alerts/ssl-certs.yml
groups:
  - name: ssl_certificates
    rules:
      - alert: SSLCertificateExpiringSoon
        expr: probe_ssl_earliest_cert_expiry - time() < 86400 * 30
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: 'SSL certificate expires in less than 30 days'
          description: 'Certificate for {{ $labels.instance }} expires in {{ $value | humanizeDuration }}'
```

### Anti-Patterns to Avoid

- **Using session pooling mode:** Session mode holds connections for entire client session, defeating pooling benefits - always use transaction mode.
- **Setting default_pool_size too high:** Each pool consumes database connections - calculate based on `max_concurrent_ops / number_of_pools`.
- **Forgetting ignore_startup_parameters:** pgbouncer_exporter requires `ignore_startup_parameters = extra_float_digits` or connections fail.
- **No backup testing:** Creating backups without testing restore procedures leaves you blind to corruption/incompleteness.
- **Hardcoded credentials in pgbouncer.ini:** Use Infisical secrets mounted at `/var/infisical/secrets/` and reference via environment variables.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem            | Don't Build            | Use Instead                                        | Why                                                                               |
| ------------------ | ---------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Backup scheduling  | Custom cron scripts    | kartoza/pg-backup container                        | Pre-built with cron, compression, retention, S3 upload, error handling            |
| Connection pooling | Application-level pool | PgBouncer                                          | Centralizes pooling, works across multiple app instances, reduces DB connections  |
| Backup cleanup     | Manual deletion        | find -mtime +30 -delete or mc ls with date parsing | Handles edge cases (timezone, DST, leap years), atomic operations                 |
| SSL monitoring     | Custom cert checker    | Blackbox Exporter                                  | Industry-standard, integrates with Prometheus/Grafana, handles renewal edge cases |
| PgBouncer metrics  | Custom admin queries   | pgbouncer_exporter                                 | Exposes all SHOW POOLS/STATS/DATABASES metrics, Prometheus-native format          |
| Backup compression | gzip in scripts        | pg_dump -Fc (custom format)                        | Native compression, faster restore, supports parallel restore                     |

**Key insight:** Database reliability is mission-critical - use battle-tested tools (PgBouncer since 2007, pg_dump native to PostgreSQL, Prometheus exporters maintained by community) rather than custom solutions that miss edge cases (connection storms, backup corruption, SSL renewal race conditions).

## Common Pitfalls

### Pitfall 1: Backend Pool Size Misconfiguration with PgBouncer

**What goes wrong:** Developers set backend's `max: 20` pool size thinking PgBouncer's `default_pool_size` should match, leading to 20 backend connections × 20 PgBouncer connections = 400 database connections.
**Why it happens:** Confusion between client-side pooling (backend to PgBouncer) and server-side pooling (PgBouncer to PostgreSQL).
**How to avoid:** Backend pool size controls concurrent requests from that app instance. PgBouncer pool size controls database connections. Keep backend pool modest (10-20), PgBouncer pool based on `1.5x-2x CPU cores` for CPU-bound workloads.
**Warning signs:** PostgreSQL logs "too many connections", `pg_stat_activity` shows hundreds of idle connections.

### Pitfall 2: Backup Fails Silently, No Monitoring

**What goes wrong:** Backup script runs via cron but fails (disk full, network timeout, credentials expired), no alert fires, discovery happens when restore is needed.
**Why it happens:** Cron jobs run silently unless explicitly configured to alert on failure.
**How to avoid:** Backup script should call notify.sh webhook on failure (exit 1 triggers alert), Prometheus alert on missing backup file age metric, test restore procedure quarterly.
**Warning signs:** No recent backup files in MinIO, backup logs show errors but no alerts fired.

### Pitfall 3: PgBouncer Transaction Mode Breaks SET SESSION Commands

**What goes wrong:** Application runs `SET SESSION timezone = 'UTC'` expecting it to persist, but PgBouncer transaction mode resets connection state after each transaction.
**Why it happens:** Transaction pooling releases connections after COMMIT/ROLLBACK, losing session state.
**How to avoid:** Audit code for `SET SESSION`, `SET LOCAL` (safe, resets after transaction), use application-level timezone handling instead of database session variables.
**Warning signs:** Intermittent bugs where timezone/encoding settings "randomly" change between requests.

### Pitfall 4: SSL Certificate Monitoring Only Checks Primary Domain

**What goes wrong:** Monitoring configured for `freshtrack.example.com` but not `www.freshtrack.example.com`, wildcard cert expires, monitoring doesn't catch it.
**Why it happens:** Blackbox Exporter only probes configured targets.
**How to avoid:** Probe all public endpoints served by Caddy, check `probe_ssl_earliest_cert_expiry` applies to cert chain (intermediate + root).
**Warning signs:** Certificate expires but no alert, Blackbox shows healthy probe but cert is actually expired.

### Pitfall 5: Backup Retention Cleanup Based on File Count Instead of Age

**What goes wrong:** Script keeps "last 30 backups" assuming daily schedule, but backup failures create gaps, 30 backups span 40+ days, violates compliance.
**Why it happens:** File count is easier to implement than date-based cleanup.
**How to avoid:** Always use date-based retention (`find -mtime +30` or parse backup filename date), validate backups exist for each day within retention window.
**Warning signs:** Backup count stays at 30 but oldest backup is older than 30 days.

### Pitfall 6: PgBouncer userlist.txt Credentials Out of Sync

**What goes wrong:** PostgreSQL password rotated via Infisical, backend updated, but `userlist.txt` still has old password, PgBouncer auth fails.
**Why it happens:** `userlist.txt` requires manual update, not automatically synced from Infisical.
**How to avoid:** Mount `userlist.txt` from Infisical secret (template), use md5 hashes (stable even if password changes), or use `auth_query` to delegate auth to PostgreSQL.
**Warning signs:** Backend connection errors "password authentication failed for user", PgBouncer logs authentication failures.

### Pitfall 7: Backup During High Write Load Causes Performance Degradation

**What goes wrong:** Daily backup at 2 AM coincides with batch job, pg_dump reads entire database, heavy I/O contention, queries slow down.
**Why it happens:** pg_dump acquires ACCESS SHARE locks and reads all tables, competes with writes for I/O.
**How to avoid:** Schedule backups during low-traffic hours (identify via Grafana query metrics), use `pg_dump --jobs=4` for parallel dump (faster, less blocking), monitor PostgreSQL I/O metrics during backup window.
**Warning signs:** Daily 2 AM latency spike in Grafana, pg_stat_activity shows long-running pg_dump queries.

## Code Examples

Verified patterns from official sources:

### PgBouncer Configuration with Transaction Mode

```ini
# Source: https://www.pgbouncer.org/config.html
# docker/pgbouncer/pgbouncer.ini

[databases]
freshtrack = host=postgres port=5432 dbname=freshtrack

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
logfile = /var/log/pgbouncer/pgbouncer.log
pidfile = /var/run/pgbouncer/pgbouncer.pid

# Pool mode: transaction (release connection after each transaction)
pool_mode = transaction

# Pool sizing (per user/database pair)
default_pool_size = 20
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3

# Client connection limits
max_client_conn = 100
max_db_connections = 20
max_user_connections = 20

# Connection timeouts
server_lifetime = 3600
server_idle_timeout = 600
server_connect_timeout = 15
query_timeout = 0

# Transaction mode prepared statements support
max_prepared_statements = 200

# Required for pgbouncer_exporter
ignore_startup_parameters = extra_float_digits

# Admin/stats users for monitoring
admin_users = pgbouncer_exporter
stats_users = pgbouncer_exporter

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
```

### Drizzle ORM with node-postgres (No Changes Needed)

```typescript
// Source: Verified - node-postgres doesn't use prepared statements unless named
// backend/src/db/client.ts

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

// Connection string points to PgBouncer (port 6432)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // postgresql://user:pass@pgbouncer:6432/freshtrack
  max: 20, // Backend pool size (not PgBouncer pool size)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle({ client: pool, schema });

// No prepare() calls in codebase - fully compatible with PgBouncer transaction mode
// Drizzle with node-postgres only uses prepared statements when explicitly calling .prepare()
```

### Docker Compose Backup Service with Cron

```yaml
# Source: https://github.com/kartoza/docker-pg-backup pattern
# docker/compose.prod.yaml

services:
  postgres_backup:
    image: kartoza/pg-backup:latest
    environment:
      # PostgreSQL connection
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: freshtrack
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASS: ${POSTGRES_PASSWORD}

      # Backup settings
      CRON_SCHEDULE: '0 2 * * *' # Daily at 2 AM UTC
      BACKUP_DIR: /backups
      DUMP_ARGS: '-Fc' # Custom format (compressed)

      # MinIO S3 upload
      S3_BUCKET: postgres-backups
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: ${MINIO_ACCESS_KEY}
      S3_SECRET_KEY: ${MINIO_SECRET_KEY}

      # Retention
      DBBACKUP_RETENTION_DAYS: 30

      # Notifications (use existing notify.sh)
      WEBHOOK_URL: ${BACKUP_WEBHOOK_URL}
    volumes:
      - backup_data:/backups
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: loki
      options:
        loki-url: 'http://loki:3100/loki/api/v1/push'
        loki-batch-size: '400'
        loki-retries: '3'
        loki-external-labels: 'service={{.Name}},environment=production'

volumes:
  backup_data:
    name: freshtrack_backup_data
```

### Prometheus SSL Certificate Monitoring

```yaml
# Source: https://www.robustperception.io/get-alerted-before-your-ssl-certificates-expire/
# docker/prometheus/prometheus.yml

scrape_configs:
  - job_name: 'blackbox-ssl'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://freshtrack.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox:9115

  - job_name: 'pgbouncer'
    static_configs:
      - targets:
          - pgbouncer_exporter:9127

---
# docker/prometheus/alerts/ssl-certs.yml
groups:
  - name: ssl_expiry
    rules:
      - alert: SSLCertExpiring30Days
        expr: probe_ssl_earliest_cert_expiry - time() < 86400 * 30
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: 'SSL certificate expires in less than 30 days'
          description: 'Certificate for {{ $labels.instance }} expires on {{ $value | humanizeTimestamp }}'

      - alert: SSLCertExpiring7Days
        expr: probe_ssl_earliest_cert_expiry - time() < 86400 * 7
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: 'SSL certificate expires in less than 7 days'
          description: 'Certificate for {{ $labels.instance }} expires on {{ $value | humanizeTimestamp }} - URGENT RENEWAL NEEDED'
```

### PgBouncer Health Check

```yaml
# Source: https://github.com/edoburu/docker-pgbouncer/blob/master/examples/docker-compose/docker-compose.yml
# docker/compose.prod.yaml

services:
  pgbouncer:
    image: bitnami/pgbouncer:latest
    healthcheck:
      test: ['CMD', 'pg_isready', '-h', 'localhost', '-p', '6432', '-U', 'pgbouncer']
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### Backup Restoration Test Procedure

```bash
# Source: PostgreSQL official documentation pattern
# docker/scripts/test-restore.sh

#!/bin/bash
# Test backup restoration procedure (run quarterly or after backup changes)

set -e

BACKUP_FILE=$1
RESTORE_DB="freshtrack_restore_test"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

# Download backup from MinIO
mc alias set minio http://minio:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}
mc cp "minio/postgres-backups/${BACKUP_FILE}" /tmp/restore-test.sql.gz

# Create temporary database
psql -h postgres -U ${POSTGRES_USER} -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"
psql -h postgres -U ${POSTGRES_USER} -c "CREATE DATABASE ${RESTORE_DB};"

# Restore backup
gunzip < /tmp/restore-test.sql.gz | psql -h postgres -U ${POSTGRES_USER} -d ${RESTORE_DB}

# Validate restoration
TABLE_COUNT=$(psql -h postgres -U ${POSTGRES_USER} -d ${RESTORE_DB} -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

if [ "$TABLE_COUNT" -lt 10 ]; then
  echo "ERROR: Restore validation failed - only $TABLE_COUNT tables found"
  exit 1
fi

echo "SUCCESS: Restored $TABLE_COUNT tables from ${BACKUP_FILE}"

# Cleanup
psql -h postgres -U ${POSTGRES_USER} -c "DROP DATABASE ${RESTORE_DB};"
rm /tmp/restore-test.sql.gz
```

## State of the Art

| Old Approach                                                      | Current Approach                                                               | When Changed                                  | Impact                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------- |
| PgBouncer doesn't support prepared statements in transaction mode | max_prepared_statements=200 enables protocol-level prepared statement tracking | PgBouncer 1.20.0 (April 2024)                 | Transaction mode now works with most ORMs without code changes |
| Each service needs custom backup scripts                          | Containerized backup solutions (kartoza/pg-backup) with cron, S3, retention    | ~2020                                         | Standardized backup patterns, less custom code                 |
| SSL monitoring via custom scripts                                 | Blackbox Exporter probe_ssl_earliest_cert_expiry metric                        | Prometheus ecosystem maturity (~2018)         | Native Prometheus integration, unified alerting                |
| pg_dump -Fp (plain SQL)                                           | pg_dump -Fc (custom format)                                                    | Always available but adoption increased ~2015 | Compressed backups, parallel restore, better performance       |
| Manual connection pooling in app code                             | Centralized PgBouncer transaction pooling                                      | PgBouncer transaction mode since ~2010        | Works across multiple app instances, reduces DB connections    |

**Deprecated/outdated:**

- **PgBouncer statement pooling mode:** Rarely needed, transaction mode is sufficient for 99% of use cases
- **pgpool-II for connection pooling:** PgBouncer has become the de-facto standard, simpler configuration
- **pg_basebackup for logical backups:** pg_basebackup is for physical backups (PITR), pg_dump is standard for logical backups
- **Certbot manual SSL renewal:** Caddy auto-renewal with Let's Encrypt is now standard, eliminates manual intervention

## Open Questions

Things that couldn't be fully resolved:

1. **Node-postgres implicit prepared statement behavior in pooled connections**
   - What we know: node-postgres only uses prepared statements when explicitly named via `name` parameter
   - What's unclear: Whether connection pooling (pg.Pool) ever triggers automatic prepared statement caching at protocol level
   - Recommendation: Code audit confirms no `.prepare()` calls and no `name` parameters in queries - proceed with confidence, but add integration test: "connect to PgBouncer, run 100 queries, verify no prepared statement errors"

2. **Optimal backup window timing**
   - What we know: 2 AM UTC is conventional, but actual traffic patterns unknown
   - What's unclear: When is the actual lowest-traffic period for FreshTrack production?
   - Recommendation: Start with 2 AM UTC, monitor Grafana query latency metrics during first week, adjust if needed

3. **PgBouncer pool sizing for actual workload**
   - What we know: Guidance is 1.5x-2x CPU cores for CPU-bound, default_pool_size=20 is reasonable starting point
   - What's unclear: Actual concurrency profile of FreshTrack backend (I/O-bound vs CPU-bound)
   - Recommendation: Start with default_pool_size=20, monitor pgbouncer_pools_client_waiting_connections metric, tune based on observed cl_waiting vs sv_idle ratio

4. **Backup file size and compression tradeoffs**
   - What we know: pg_dump -Fc provides compression, gzip provides better compression but slower restore
   - What's unclear: Expected database size growth trajectory, restore time SLA
   - Recommendation: Start with pg_dump -Fc (custom format), measure backup size and restore time in test, switch to -Fc with gzip if storage costs become concern

## Sources

### Primary (HIGH confidence)

- [PgBouncer Configuration Documentation](https://www.pgbouncer.org/config.html) - Pool mode, max_prepared_statements, default values
- [PgBouncer Features Documentation](https://www.pgbouncer.org/features.html) - Transaction mode limitations (SET, LISTEN, advisory locks)
- [node-postgres Query Documentation](https://node-postgres.com/features/queries) - Prepared statement opt-in behavior
- [prometheus-community/pgbouncer_exporter](https://github.com/prometheus-community/pgbouncer-exporter) - Installation, port 9127, metrics exposed
- [Caddy Prometheus Metrics Documentation](https://caddyserver.com/docs/metrics) - Official Caddy metrics endpoint

### Secondary (MEDIUM confidence)

- [PgBouncer Best Practices - Azure](https://techcommunity.microsoft.com/blog/adforpostgresql/pgbouncer-best-practices-in-azure-database-for-postgresql-%E2%80%93-part-1/4453323) - Pool sizing formulas verified with official docs
- [PgBouncer Transaction Pooling - CYBERTEC](https://www.cybertec-postgresql.com/en/pgbouncer-types-of-postgresql-connection-pooling/) - Transaction vs session mode explained
- [kartoza/docker-pg-backup](https://github.com/kartoza/docker-pg-backup) - Pre-built backup container pattern
- [Robust Perception - SSL Certificate Alerts](https://www.robustperception.io/get-alerted-before-your-ssl-certificates-expire/) - Blackbox Exporter SSL monitoring pattern
- [Grafana SSL Certificate Monitoring Blog](https://grafana.com/blog/2020/11/25/how-we-eliminated-service-outages-from-certificate-expired-by-setting-up-alerts-with-grafana-and-prometheus/) - Real-world SSL monitoring implementation
- [MinIO mc Docker Hub](https://hub.docker.com/r/minio/mc/) - Official MinIO client container

### Tertiary (LOW confidence)

- [Drizzle ORM PgBouncer Discussion](https://www.answeroverflow.com/m/1154594546202706004) - Community discussion, needs verification
- [Supabase PgBouncer Documentation](https://supabase.com/docs/guides/database/connecting-to-postgres) - Supabase-specific context
- [Medium: Backup Postgres to MinIO](https://sreyaj.dev/how-to-backup-postgres-data-to-s3-bucket-using-minio) - Individual blog post, pattern verified with official sources

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - PgBouncer, pg_dump, Blackbox Exporter are industry-standard with official documentation
- Architecture: HIGH - Patterns verified with official PgBouncer config docs and prometheus-community exporter
- Pitfalls: MEDIUM - Based on community discussions and best practices guides, validated against official limitations
- Code compatibility: HIGH - Backend code audited, no prepared statements (.prepare()), no SET/LISTEN/advisory locks found

**Research date:** 2026-01-23
**Valid until:** 2026-04-23 (90 days - stack is mature and stable, changes infrequent)
