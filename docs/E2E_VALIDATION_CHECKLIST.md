# E2E Validation Checklist

**Purpose:** Comprehensive checklist to verify all Phase 13 requirements are met before production cutover.

**Use this checklist:** Before deploying to production to confirm system readiness for v1.1 Production Ready milestone.

---

## Overview

This checklist validates four critical requirements (TEST-01 through TEST-04) that ensure FreshTrack Pro is production-ready:

1. **TEST-01:** Sensor data ingestion pipeline works end-to-end
2. **TEST-02:** Alert notification lifecycle is functional
3. **TEST-03:** Migration procedures are tested and timed
4. **TEST-04:** Zero-downtime deployment mechanism is validated

All tests must pass before production cutover.

---

## TEST-01: Sensor Data Ingestion

**Requirement:** Sensor data flows from ingestion endpoint → database → alert evaluation without errors.

### Validation Steps

- [ ] **Run E2E sensor pipeline test**
  ```bash
  export BASE_URL="http://localhost:3000"  # Or production URL
  export TTN_WEBHOOK_SECRET="your-api-key"
  export TEST_JWT="your-jwt-token"
  ./scripts/test/e2e-sensor-pipeline.sh
  ```

- [ ] **Verify: Sensor reading appears in database within 5 seconds**
  - Test creates reading via `/api/ingest/readings` endpoint
  - Script confirms reading stored in `sensor_readings` table
  - Check: Script output shows "✓ Normal reading ingested"

- [ ] **Verify: Threshold breach triggers alert creation**
  - Test sends temperature reading above threshold (default: 5.0°C)
  - Script waits for alert evaluation (configurable timeout)
  - Check: Script output shows "✓ Alert created (found 1 active alerts)"

- [ ] **Verify: Both simulator mode and direct API paths are documented**
  - Check: `scripts/test/README.md` documents direct API mode
  - Check: `scripts/test/README.md` documents TTN webhook mode
  - Check: `scripts/test/README.md` documents UI-based testing (SensorSimulatorPanel)

### Expected Outcome

- All 8 pre-flight and execution steps pass (as shown in script output)
- Exit code: 0 (success)
- Reading IDs returned from database
- Alert ID returned from alerts API

### Troubleshooting

If tests fail, see `scripts/test/README.md` section "Troubleshooting → e2e-sensor-pipeline.sh Specific"

---

## TEST-02: Alert Notification Pipeline

**Requirement:** Alert lifecycle (trigger → acknowledge → resolve) and notification delivery work correctly.

### Validation Steps

- [ ] **Run E2E alert notification test**
  ```bash
  export BASE_URL="http://localhost:3000"
  export TEST_API_KEY="your-api-key"
  export TEST_JWT="your-jwt-token"
  export ORGANIZATION_ID="your-org-id"
  export TEST_UNIT_ID="unit-with-alert-rule"
  ./scripts/test/e2e-alert-notifications.sh
  ```

- [ ] **Verify: Alert lifecycle works (trigger → acknowledge → resolve)**
  - Check: Script output shows "✓ Alert triggered"
  - Check: Script output shows "✓ Alert acknowledged"
  - Check: Script output shows "✓ Alert resolved"

- [ ] **Verify: Webhook notifications are delivered (if configured)**
  ```bash
  export WEBHOOK_TEST=true
  export WEBHOOK_PORT=8888
  ./scripts/test/e2e-alert-notifications.sh
  ```
  - Script automatically starts webhook receiver
  - Check: Script output shows "✓ Webhook notification received"
  - Webhook payload saved to `/tmp/webhook-test-*.json`

- [ ] **Verify: Email notifications are delivered (if SMTP configured)**
  - Configure SMTP settings in backend environment
  - Enable email notification channel for alert rules
  - Trigger alert via test script
  - Check: Email received in recipient inbox
  - See: `scripts/test/README.md` → "Testing Notification Channels → Email Notifications"

### Expected Outcome

- Alert state transitions validated (triggered → acknowledged → resolved)
- Webhook notification payload captured (if WEBHOOK_TEST=true)
- Email notification received (if SMTP configured)
- Exit code: 0 (success)

### Troubleshooting

If tests fail, see `scripts/test/README.md` section "Troubleshooting → General Troubleshooting"

---

## TEST-03: Migration Procedure

**Requirement:** Migration timing is measured and production maintenance window can be estimated.

### Validation Steps

- [ ] **Generate 100K test records for migration timing**
  ```bash
  npx tsx scripts/test/generate-test-data.ts --yes
  ```
  - Check: Script generates 100,000 sensor readings
  - Check: Data distribution is realistic (30 devices, 30 days)
  - Check: 7.5% temperature excursions for alert data
  - See: `scripts/test/README.md` → "Synthetic Data Generation"

- [ ] **Run migration timing validation**
  ```bash
  ./scripts/test/validate-migration-timing.sh
  ```
  - Check: Script measures pg_dump export duration
  - Check: Script measures pg_restore import duration
  - Check: Script verifies data integrity (row count comparison)
  - Check: Script provides scaling estimates (1M, 10M records)

- [ ] **Document migration window estimate for production data volume**
  - Record migration time from script output (e.g., "Total migration: 33s")
  - Calculate production estimate based on actual data volume
  - Example: 100K records = 30s → 1M records ≈ 300s (5 minutes)
  - Add 1.5-2x safety margin for production

- [ ] **Confirm backup/restore procedures from Phase 10 are available**
  - Check: `docs/DATABASE.md` exists with backup/restore documentation
  - Check: `docker/scripts/backup-postgres.sh` exists
  - Check: `docker/scripts/test-restore.sh` exists (from Phase 10 Plan 05)
  - See: `.planning/phases/10-database-production-readiness/` for Phase 10 context

### Expected Outcome

- Migration timing measured for 100K records
- Scaling estimates provided for 1M and 10M records
- Migration time within RTO target (30 minutes)
- Backup/restore procedures documented and tested

### Reference

- **RTO (Recovery Time Objective):** 30 minutes
- **RPO (Recovery Point Objective):** 24 hours
- Source: Phase 10 Database Production Readiness

---

## TEST-04: Zero-Downtime Deployment

**Requirement:** Health check-based deployment mechanism ensures >95% request success rate during rolling updates.

### Validation Steps

- [ ] **Run zero-downtime deployment validation**
  ```bash
  export BASE_URL="http://localhost:3000"
  ./scripts/test/validate-zero-downtime.sh
  ```
  - Script validates 5 steps (see below)
  - Script simulates container recreation during deployment
  - Script polls health endpoint during transition

- [ ] **Verify: Health checks are configured on all services**
  - Check: Script output shows "✓ Health check is configured on backend container"
  - Check: Docker inspect shows healthcheck configuration
  - Recommended intervals:
    - Interval: 10s
    - Timeout: 5s
    - Retries: 3
    - Start period: 30s

- [ ] **Verify: Service dependencies use condition: service_healthy**
  - Check: Script output shows "✓ Backend depends on postgres with condition: service_healthy"
  - Check: `docker/docker-compose.yml` uses `depends_on` with `condition: service_healthy`
  - Example:
    ```yaml
    backend:
      depends_on:
        postgres:
          condition: service_healthy
    ```

- [ ] **Verify: Deployments maintain >95% request success rate**
  - Check: Script output shows "Zero-downtime deployment validated (X% success rate)"
  - Check: Success rate is ≥95%
  - If <95%, see recommendations in script output

### Validation Flow (5 Steps)

1. **Verify current health status**
   - GET /health returns 200 with status: "healthy"
   - GET /health/ready returns ready: true

2. **Verify Docker health check configuration**
   - Backend container has healthcheck configured
   - Print interval, timeout, retries, start_period

3. **Verify service dependency conditions**
   - Check docker-compose.yml for condition: service_healthy
   - List services with health check dependencies

4. **Simulate deployment**
   - Recreate backend container with `docker compose up -d --no-deps --force-recreate`
   - Poll /health every 1 second for 30 seconds
   - Count successful vs failed requests

5. **Verify post-deployment health**
   - Confirm /health returns 200 after deployment
   - Confirm /health/ready returns ready: true

### Expected Outcome

- Health checks configured and working
- Service dependencies use condition: service_healthy
- Request success rate ≥95% during deployment simulation
- Exit code: 0 (success)

### Note on Backend Containerization

If backend is not yet containerized:
- Script will detect this gracefully
- Output will show: "No backend container found - validation requires backend service"
- Script provides docker-compose.yml example for adding backend service
- Exit code: 0 (not an error, just not applicable yet)

---

## Success Criteria Verification

Use this table to verify all Phase 13 success criteria are met:

| Criterion | How to Verify | Status |
|-----------|--------------|--------|
| Sensor data flows ingestion → storage → alert | Run `e2e-sensor-pipeline.sh` | [ ] |
| Alert notifications delivered | Run `e2e-alert-notifications.sh` with WEBHOOK_TEST=true | [ ] |
| Migration timing documented | Run `validate-migration-timing.sh`, record estimates | [ ] |
| Zero-downtime validated | Run `validate-zero-downtime.sh`, verify ≥95% success | [ ] |
| Deployment guide exists | Check `docs/DEPLOYMENT_DECISION_GUIDE.md` exists | [ ] |

**All criteria must be checked before proceeding to production cutover.**

---

## Pre-Cutover Checklist

Before deploying to production, verify the following infrastructure and application readiness:

### Infrastructure Readiness

- [ ] **Production domain configured**
  - DNS A record points to production server IP
  - DNS propagation verified (`dig freshtrack.example.com`)

- [ ] **SSL certificates issued**
  - Let's Encrypt certificates via Caddy
  - Certificate auto-renewal enabled
  - SSL alerts configured (30-day and 7-day warnings)
  - See: `docs/SSL_CERTIFICATES.md`

- [ ] **Secrets configured**
  - Option 1: Infisical secrets manager running
    - Check: `docker ps | grep infisical`
    - Secrets mounted at `/var/infisical/secrets/`
  - Option 2: File-based secrets
    - Secrets in `/opt/freshtrack-pro/secrets/`
    - File permissions: 600 (owner read/write only)
  - See: Phase 9 Production Environment Hardening

- [ ] **Backup system running**
  - Daily backups to MinIO configured
  - Cron job: 2 AM UTC
  - 30-day retention enforced
  - Test restore completed successfully
  - See: `docs/DATABASE.md`

### Application Readiness

- [ ] **All E2E tests pass against production deployment**
  - Export production URL: `export BASE_URL="https://freshtrack.example.com"`
  - Run all 4 test scripts (TEST-01 through TEST-04)
  - All tests exit with code 0

- [ ] **Observability stack accessible**
  - Grafana: `https://freshtrack.example.com:3000` (or configured port)
  - Prometheus: Accessible via Grafana or `http://localhost:9090`
  - Loki: Log aggregation working
  - Check: Grafana shows metrics from backend, PostgreSQL, PgBouncer

- [ ] **Alert rules configured for production thresholds**
  - Prometheus alert rules in `docker/prometheus/alerts/`
  - Temperature threshold alerts configured
  - Database connection alerts configured
  - SSL certificate expiry alerts configured (30d, 7d)
  - Webhook/email notification channels configured

- [ ] **Health checks passing on all services**
  - Run: `docker compose ps`
  - All services show "healthy" status
  - No services in "starting" or "unhealthy" state

### Data Migration (if applicable)

- [ ] **Migration scripts tested with production data sample**
  - pg_dump tested on sample of production data
  - pg_restore tested with sample backup
  - Data integrity verified (row counts match)

- [ ] **Maintenance window scheduled based on timing validation**
  - Calculate required window from migration timing test
  - Add 1.5-2x safety margin
  - Schedule maintenance with users
  - Example: 100K records = 30s → 1M = 5 min → schedule 15 min window

- [ ] **Rollback plan documented**
  - Phase 10 backup/restore procedures available
  - Latest backup verified before migration
  - Rollback steps documented (see below)
  - Team trained on rollback procedure

- [ ] **User communication sent**
  - Maintenance window notification sent
  - Downtime duration communicated
  - Contact information provided for issues
  - Alternative access options documented (if applicable)

---

## Post-Cutover Verification

After production cutover, verify system is operating correctly:

### Immediate Checks (within 5 minutes)

- [ ] **All services healthy**
  ```bash
  docker compose ps
  ```
  - All containers show "(healthy)" status
  - No containers in "restarting" or "exited" state

- [ ] **Health endpoints responding**
  ```bash
  curl https://freshtrack.example.com/health
  curl https://freshtrack.example.com/health/ready
  ```
  - Both return HTTP 200
  - /health returns `{"status": "healthy"}`
  - /health/ready returns `{"ready": true}`

- [ ] **Sensor data flowing**
  - Check recent sensor readings in database:
    ```sql
    SELECT COUNT(*) FROM sensor_readings
    WHERE created_at > NOW() - INTERVAL '5 minutes';
    ```
  - Or check via UI: Dashboard → Recent Readings

- [ ] **Alerts firing correctly**
  - Trigger test alert via sensor simulator or test script
  - Verify alert appears in UI
  - Verify alert state transitions work (acknowledge, resolve)

- [ ] **Notifications delivering**
  - Trigger test alert
  - Verify webhook notification received (check webhook endpoint logs)
  - Verify email notification received (check recipient inbox)
  - Check backend logs: `docker compose logs backend | grep -i notification`

### Extended Checks (within 1 hour)

- [ ] **Database performance normal**
  - Check PgBouncer metrics in Grafana
  - Verify connection pool is not saturated
  - Query response times within normal range

- [ ] **No error spikes in logs**
  - Check Loki logs in Grafana
  - Filter for ERROR and WARN level logs
  - Investigate any new error patterns

- [ ] **SSL certificate valid**
  - Check certificate expiry: `curl -vI https://freshtrack.example.com 2>&1 | grep expire`
  - Verify Caddy auto-renewal is configured
  - Check Prometheus SSL alerts (should not be firing)

- [ ] **Backup job successful**
  - Check backup logs: `docker compose logs postgres_backup`
  - Verify latest backup exists in MinIO
  - Run test restore to validate backup

---

## Rollback Procedure

If critical issues are detected after cutover, follow this rollback procedure:

### When to Rollback

Rollback immediately if:
- Health checks fail for >5 minutes
- Database is unreachable or corrupted
- Critical functionality broken (sensor ingestion, alert evaluation)
- Data loss or corruption detected
- Security breach or unauthorized access

### Rollback Steps

1. **Restore from latest backup**
   ```bash
   # Stop application services
   docker compose down backend frontend

   # Restore database (see docs/DATABASE.md for full procedure)
   cd /opt/freshtrack-pro
   ./scripts/restore-database.sh

   # Verify restore
   psql -h localhost -U postgres -d freshtrack -c "SELECT COUNT(*) FROM sensor_readings;"
   ```
   - See: `docs/DATABASE.md` → "Disaster Recovery Procedures"
   - See: `.planning/phases/10-database-production-readiness/10-05-SUMMARY.md`

2. **Revert to previous Docker images**
   ```bash
   # deploy-selfhosted.sh supports rollback via version tags
   cd /opt/freshtrack-pro
   ./scripts/deploy-selfhosted.sh --rollback

   # Or manually specify previous version
   docker compose down
   docker compose pull  # Pull previous tagged versions
   docker compose up -d
   ```
   - Deployment script maintains 3 versions by default (VERSION_RETENTION)
   - Rollback only affects application code, not database

3. **Notify users of rollback**
   - Send notification via configured channels
   - Explain reason for rollback
   - Provide estimated time for fix and re-attempt
   - Apologize for inconvenience

4. **Investigate and fix before re-attempting**
   - Analyze logs to determine root cause
   - Fix issues in staging environment
   - Re-run full E2E test suite
   - Schedule new maintenance window

### Important Notes

- **Database rollback is destructive:** Restoring from backup loses data created after backup
- **Code rollback is safe:** Docker image rollback only affects application code
- **RPO is 24 hours:** Daily backups mean up to 24 hours of data could be lost
- **Always test restore before production:** Run test-restore.sh in staging first

---

## Additional Resources

### Documentation

- **Phase 13 Plans:** `.planning/phases/13-e2e-validation-cutover/`
  - 13-01: E2E sensor pipeline test
  - 13-02: Alert notification test + webhook receiver
  - 13-03: Migration timing validation
  - 13-04: Deployment decision guide
  - 13-05: Zero-downtime validation (this plan)

- **Deployment Guides:**
  - `docs/SELFHOSTED_DEPLOYMENT.md` - Self-hosted on existing server
  - `docs/DIGITALOCEAN_DEPLOYMENT.md` - DigitalOcean Droplet deployment
  - `docs/DEPLOYMENT_DECISION_GUIDE.md` - Choose deployment mode

- **Database Documentation:**
  - `docs/DATABASE.md` - Backup, restore, disaster recovery
  - Phase 10 (Database Production Readiness)

- **SSL Certificates:**
  - `docs/SSL_CERTIFICATES.md` - HTTP-01 and DNS-01 approaches
  - Wildcard certificates with Cloudflare

### Test Scripts

All test scripts located in `scripts/test/`:

- `e2e-sensor-pipeline.sh` - Sensor data ingestion test
- `e2e-alert-notifications.sh` - Alert lifecycle test
- `webhook-receiver.sh` - Webhook capture utility
- `generate-test-data.ts` - Synthetic data generator (100K records)
- `validate-migration-timing.sh` - Migration timing measurement
- `validate-zero-downtime.sh` - Zero-downtime deployment validation

See: `scripts/test/README.md` for complete test suite documentation

---

## Checklist Completion

**Date:** _________________

**Validated by:** _________________

**Production URL:** _________________

**All tests passed:** [ ] Yes / [ ] No

**Ready for production cutover:** [ ] Yes / [ ] No

**Notes:**

---

**Version:** 1.0
**Last updated:** 2026-01-24 (Phase 13 Plan 05)
**Related:** Phase 13 (E2E Validation & Cutover) - v1.1 Production Ready milestone
