# Test Scripts

This directory contains end-to-end (E2E) test scripts for validating FreshTrack Pro functionality in deployed environments.

## Overview

These scripts are designed for:

- Production validation after deployment
- Staging environment testing
- Local development verification
- Continuous integration checks

All scripts are self-contained bash scripts with clear output and exit codes suitable for automation.

## Scripts

### E2E Sensor Data Pipeline (`e2e-sensor-pipeline.sh`)

**Status:** Implemented (Phase 13 Plan 01)

Tests the complete sensor data flow from ingestion to alert trigger.

**What it tests:**

- Backend health and database connectivity
- Sensor reading ingestion via API (normal temperature)
- Sensor reading storage verification
- Temperature threshold breach handling
- Alert creation after excursion
- Alert state machine transitions

**Test Flow:**

1. Pre-flight health checks (backend /health and /health/ready endpoints)
2. Generate unique test device ID
3. POST normal reading (below threshold) → verify ingestion success
4. POST breach reading (above threshold) → trigger alert evaluation
5. Wait for async alert processing (configurable timeout)
6. Query alerts API to verify alert creation

**Environment Variables:**

| Variable             | Required | Default                 | Description                                         |
| -------------------- | -------- | ----------------------- | --------------------------------------------------- |
| `BASE_URL`           | No       | `http://localhost:3000` | Backend API URL                                     |
| `TTN_WEBHOOK_SECRET` | **Yes**  | -                       | API key for `/api/ingest/readings` endpoint         |
| `TEST_JWT`           | No       | -                       | JWT token for authenticated endpoints (alert query) |
| `ALERT_TIMEOUT`      | No       | `10`                    | Seconds to wait for alert processing                |
| `TEST_TEMP_BREACH`   | No       | `5.0`                   | Temperature above threshold (°C)                    |

**Usage - Local Testing:**

```bash
# Set required credentials
export TTN_WEBHOOK_SECRET="your-api-key-here"
export TEST_JWT="your-jwt-token"  # Optional but recommended

# Run test
./scripts/test/e2e-sensor-pipeline.sh
```

**Usage - Production Validation:**

```bash
# Test against production
export BASE_URL="https://freshtrack.example.com"
export TTN_WEBHOOK_SECRET="prod-api-key"
export TEST_JWT="prod-jwt-token"

./scripts/test/e2e-sensor-pipeline.sh
```

**Expected Output:**

```
========================================
E2E Sensor Pipeline Test
========================================

Configuration:
  BASE_URL: http://localhost:3000
  TTN_WEBHOOK_SECRET: [SET]
  TEST_JWT: [SET]
  ALERT_TIMEOUT: 10s
  TEST_TEMP_BREACH: 5.0°C

▶ Validating prerequisites...
  ✓ curl is available
  ✓ jq is available
  ✓ TTN_WEBHOOK_SECRET is set
  ✓ TEST_JWT is set

▶ Checking backend health...
  ✓ Backend is healthy (HTTP 200)

▶ Checking database connectivity...
  ✓ Database is ready

========================================
Test Execution
========================================

▶ Step 1: POST normal sensor reading (below threshold)...
  ✓ Normal reading ingested (HTTP 200, insertedCount=1)

▶ Step 3: POST sensor reading ABOVE threshold (excursion)...
  ✓ Breach reading ingested (HTTP 200, insertedCount=1)
  ℹ Alerts triggered: 1
  ✓ Alert evaluation triggered (1 alerts)

▶ Step 5: Verify alert was created...
  ✓ Alert created (found 1 active alerts)

========================================
Test Summary
========================================

Total Tests: 8
  Passed: 8
  Failed: 0

✓ All tests passed!
```

**Exit Codes:**

- `0` - All tests passed
- `1` - One or more tests failed

**Notes:**

- Script is idempotent - generates unique device IDs on each run
- If TEST_JWT not provided, alert verification steps are skipped
- Uses `/api/ingest/readings` endpoint (direct API, not TTN webhook)
- For UI-based testing, use **Settings → Admin → Sensor Simulator Panel**

### E2E Alert Notifications (`e2e-alert-notifications.sh`)

Tests the complete alert lifecycle and notification delivery pipeline.

**What it tests:**

- Alert trigger on high-temperature reading
- Alert creation in database
- Alert acknowledgment by staff
- Alert resolution with corrective action
- Webhook notification delivery (optional)
- Complete state transitions: triggered → acknowledged → resolved

**Required environment variables:**

```bash
BASE_URL=http://localhost:3000
TEST_API_KEY=your-api-key           # For readings ingestion
TEST_JWT=your-jwt-token             # For alert operations (staff role)
ORGANIZATION_ID=your-org-id
TEST_UNIT_ID=unit-with-alert-rule   # Must have alert rule configured
```

**Optional environment variables:**

```bash
WEBHOOK_TEST=true                   # Enable webhook delivery test
WEBHOOK_PORT=8888                   # Port for webhook receiver
TEMPERATURE_HIGH=40.0               # Temperature to trigger alert
```

**Usage:**

```bash
# Basic test (no webhook)
export BASE_URL=http://localhost:3000
export TEST_API_KEY=your-api-key
export TEST_JWT=your-jwt-token
export ORGANIZATION_ID=your-org-id
export TEST_UNIT_ID=your-unit-id
./e2e-alert-notifications.sh

# With webhook notification test
export WEBHOOK_TEST=true
./e2e-alert-notifications.sh
```

**Test flow:**

1. Pre-flight checks (backend health, dependencies)
2. Start webhook receiver (if WEBHOOK_TEST=true)
3. Inject high-temperature reading via API
4. Poll for alert creation (30s timeout)
5. Verify alert details and status
6. Acknowledge alert via API
7. Verify acknowledgment persisted
8. Resolve alert with corrective action
9. Verify webhook notification received (if enabled)

**Output:**

- Color-coded pass/fail for each step
- Test summary with duration
- Exit code 0 on success, 1 on failure

### Webhook Receiver (`webhook-receiver.sh`)

Simple HTTP server for capturing webhook notifications during E2E testing.

**Purpose:**

- Capture alert notification payloads
- Verify webhook delivery in tests
- Inspect notification structure

**Usage:**

```bash
# Default (port 8888, 60s timeout)
./webhook-receiver.sh

# Custom configuration
./webhook-receiver.sh --port 9000 --timeout 120 --output /tmp/my-webhook.json
```

**Options:**

- `--port PORT` - Listen on PORT (default: 8888)
- `--timeout SECONDS` - Timeout after SECONDS (default: 60)
- `--output FILE` - Write payload to FILE (default: /tmp/webhook-test-<timestamp>.json)
- `--help` - Show help message

**How it works:**

1. Starts Python HTTP server on specified port
2. Listens for POST requests to any path
3. Logs received payload to stdout and file
4. Returns 200 OK to caller
5. Exits after first request or timeout

**Running alongside tests:**

```bash
# Terminal 1: Start webhook receiver
./webhook-receiver.sh --port 8888 --timeout 300

# Terminal 2: Run alert test with webhook enabled
export WEBHOOK_TEST=true
export WEBHOOK_PORT=8888
./e2e-alert-notifications.sh
```

## Testing Notification Channels

### Webhook Notifications

Webhook delivery can be tested end-to-end using the scripts above.

**Setup:**

1. Configure webhook URL in organization notification settings
2. Set `WEBHOOK_TEST=true` when running `e2e-alert-notifications.sh`
3. Script automatically starts webhook receiver and verifies delivery

**Verification:**

- Webhook receiver captures notification payload
- Test validates alert ID in payload
- Payload saved to file for inspection

### Email Notifications

Email delivery requires manual verification as it depends on external SMTP provider.

**Setup requirements:**

- SMTP configuration in environment variables
- Valid recipient email addresses in organization settings
- Email notification channel enabled for alert rules

**Manual verification steps:**

1. Run `e2e-alert-notifications.sh` to trigger alert
2. Check application logs for email send attempts
3. Verify email received in recipient inbox
4. Inspect email content for alert details

**Log inspection:**

```bash
# Check backend logs for email sending
docker compose logs backend | grep -i "email\|smtp\|notification"

# Look for successful send confirmations
docker compose logs backend | grep "Notification sent"
```

**Common issues:**

- SMTP credentials incorrect → Check logs for authentication errors
- Rate limiting → Wait and retry
- Spam filtering → Check spam folder
- Email not configured → Verify organization notification settings

## Testing Modes

### 1. Direct API Mode (Default - e2e-sensor-pipeline.sh)

The E2E sensor pipeline test uses the direct ingestion endpoint:

- POST to `/api/ingest/readings`
- Requires `X-API-Key` header with `TTN_WEBHOOK_SECRET`
- Mimics sensor data flow from TTN integration

**When to use:**

- Validating backend ingestion logic
- Testing alert evaluation service
- Local development testing
- Production smoke tests

### 2. TTN Webhook Mode (via TTN Integration)

For testing the complete TTN integration flow:

- Use actual TTN webhook endpoint (if configured)
- Data flows through TTN decoder → webhook → backend
- Tests complete end-to-end integration

**When to use:**

- Validating TTN integration setup
- Testing TTN payload decoder
- Production integration testing

See TTN webhook configuration in backend environment variables.

### 3. UI-Based Testing (SensorSimulatorPanel)

For manual testing and debugging, use the built-in Sensor Simulator:

**Location:** Settings → Admin → Sensor Simulator

**Features:**

- Select any unit to simulate sensor data
- Configure temperature, humidity, battery, signal strength
- Enable streaming mode (continuous readings at interval)
- Door sensor simulation (open/closed states)
- TTN routing toggle (route via TTN webhook or direct API)
- Real-time event log
- Visual feedback for sensor online/offline states

**How to use:**

1. Navigate to **Settings → Admin → Sensor Simulator**
2. Select a unit from the dropdown
3. Adjust temperature slider or enter specific value
4. Click "Send Reading" for single reading, or enable "Streaming" for continuous
5. Monitor alerts in real-time via Alerts page
6. Check event log at bottom of simulator panel

**When to use:**

- Manual testing during development
- Demonstrating sensor flow to stakeholders
- Debugging specific unit configurations
- Testing without physical sensors
- Verifying UI responsiveness to sensor events

## Complete E2E Test Sequence

For production validation, run tests in this order:

### 1. Sensor Data Ingestion Test

```bash
./e2e-sensor-pipeline.sh
```

**Expected result:**

- Sensor reading successfully ingested
- Data appears in database
- API returns success response

### 2. Alert Notification Test

```bash
export WEBHOOK_TEST=true
./e2e-alert-notifications.sh
```

**Expected result:**

- Alert triggered on high temperature
- Alert can be acknowledged
- Alert can be resolved
- Webhook notification delivered (if configured)

### 3. Manual Verification

- Check Grafana dashboards for sensor data visualization
- Verify alerts appear in UI
- Test acknowledgment/resolution in UI
- Verify email notifications received (if configured)

## Environment Setup

### Local Development

```bash
# Start backend
cd /opt/freshtrack-pro
docker compose up -d

# Get test credentials
export BASE_URL=http://localhost:3000
export TEST_API_KEY=$(docker compose exec backend cat /var/secrets/api-key)
export TEST_JWT=$(curl -sf http://localhost:3000/api/auth/test-token)
export ORGANIZATION_ID=your-org-id
export TEST_UNIT_ID=your-unit-id

# Run tests
./scripts/test/e2e-alert-notifications.sh
```

### Production/Staging

```bash
# Set production URL
export BASE_URL=https://freshtrack.example.com

# Use production credentials (from Infisical or secure storage)
export TEST_API_KEY=prod-api-key
export TEST_JWT=prod-jwt-token
export ORGANIZATION_ID=prod-org-id
export TEST_UNIT_ID=prod-unit-id

# Run tests
./scripts/test/e2e-alert-notifications.sh
```

## CI/CD Integration

These scripts can be integrated into CI/CD pipelines for automated testing.

### Example: GitHub Actions

```yaml
name: E2E Tests

on:
  push:
    branches: [main, staging]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run E2E Alert Tests
        env:
          BASE_URL: ${{ secrets.BASE_URL }}
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
          TEST_JWT: ${{ secrets.TEST_JWT }}
          ORGANIZATION_ID: ${{ secrets.ORGANIZATION_ID }}
          TEST_UNIT_ID: ${{ secrets.TEST_UNIT_ID }}
        run: ./scripts/test/e2e-alert-notifications.sh
```

### Exit Codes

All scripts follow standard exit code conventions:

- `0` - All tests passed
- `1` - One or more tests failed
- `2` - Configuration error (missing env vars, dependencies)

## Dependencies

### Required

- `bash` (version 4.0+)
- `curl` - HTTP requests
- `jq` - JSON parsing
- `python3` - Webhook receiver (standard library only)

### Optional

- `dos2unix` - Line ending normalization (recommended on Windows)

### Installation

**Ubuntu/Debian:**

```bash
sudo apt-get install curl jq python3
```

**macOS:**

```bash
brew install curl jq python3
```

**Alpine Linux (Docker):**

```bash
apk add bash curl jq python3
```

## Troubleshooting

### e2e-sensor-pipeline.sh Specific

#### Error: "TTN_WEBHOOK_SECRET environment variable is required"

**Cause:** Missing API key for sensor ingestion endpoint

**Solution:**

```bash
# Get API key from backend configuration
export TTN_WEBHOOK_SECRET="your-api-key"
```

The API key is configured in backend `.env`:

```
TTN_WEBHOOK_SECRET=your-secret-key-here
```

#### Error: "Backend health check failed (HTTP 000)"

**Cause:** Backend server not running or not accessible at BASE_URL

**Solution:**

1. Verify backend is running:
   ```bash
   curl http://localhost:3000/health
   ```
2. For Docker deployments:
   ```bash
   docker ps | grep backend
   docker compose logs backend | tail -20
   ```
3. For local development:
   ```bash
   cd backend && npm run dev
   ```

#### Error: "Database is not ready"

**Cause:** Database not available or backend can't connect

**Solution:**

1. Check database container:
   ```bash
   docker ps | grep postgres
   ```
2. Verify connection via health endpoint:
   ```bash
   curl http://localhost:3000/health | jq '.checks.database'
   ```
3. Check backend database configuration in `.env`

#### Error: "Authentication failed (HTTP 403)"

**Cause:** Incorrect `TTN_WEBHOOK_SECRET` or API key not configured in backend

**Solution:**

1. Check backend logs for authentication errors:
   ```bash
   docker compose logs backend | grep -i "auth\|403"
   ```
2. Verify API key matches backend configuration:
   ```bash
   # Backend .env
   grep TTN_WEBHOOK_SECRET backend/.env
   ```
3. For Docker deployments:
   ```bash
   docker exec freshtrack-backend env | grep TTN_WEBHOOK_SECRET
   ```

#### Error: "No active alerts found for unit"

**Note:** This is not necessarily an error - it may indicate expected behavior.

**Possible causes:**

1. **Unit has no thresholds configured**
   - Check `units.temp_min` and `units.temp_max` in database
   - Configure thresholds via UI (Settings → Units) or SQL

2. **Alert rules not configured**
   - Check `alert_rules` table for enabled rules
   - Alert hierarchy: unit-specific → site-wide → org-wide

3. **Temperature did not breach threshold**
   - Default test uses 45.0°C as breach temperature
   - Adjust with: `export TEST_TEMP_BREACH=10.0`
   - Or configure unit thresholds to match test data

4. **Alert already exists**
   - Script checks for active/acknowledged alerts
   - Resolve existing alerts before re-running test

**Debugging:**

```bash
# Check unit configuration
psql -h localhost -U postgres -d freshtrack -c \
  "SELECT id, name, temp_min, temp_max, status FROM units WHERE id = 'your-unit-id';"

# Check for existing alerts
psql -h localhost -U postgres -d freshtrack -c \
  "SELECT id, alert_type, status, severity FROM alerts WHERE unit_id = 'your-unit-id';"
```

#### Info: "Skipped - requires TEST_JWT for alert verification"

**Cause:** TEST_JWT not provided (optional)

**Impact:** Alert verification steps are skipped, but reading ingestion is still tested

**Solution (if you want full testing):**

**Option 1: Browser DevTools**

1. Login to FreshTrack Pro UI
2. Open browser DevTools → Network tab
3. Look for API requests with `Authorization: Bearer ...` header
4. Copy the JWT token

**Option 2: Stack Auth CLI**

```bash
# Login via Stack Auth and extract token
# (Exact method depends on Stack Auth configuration)
```

**Option 3: Manual extraction from browser**

```javascript
// In browser console after login
localStorage.getItem('stack-auth-token');
```

### General Troubleshooting

### Test Fails: "Backend health check failed"

**Cause:** Backend server not running or not accessible

**Solution:**

1. Verify backend is running: `curl http://localhost:3000/health`
2. Check BASE_URL is correct
3. Check network connectivity
4. Check Docker containers: `docker compose ps`

### Test Fails: "Alert not found after 30 seconds"

**Possible causes:**

1. No alert rule configured for test unit
2. Temperature threshold not exceeded
3. Alert evaluator service error

**Solution:**

1. Verify alert rule exists: Check UI or query database
2. Adjust TEMPERATURE_HIGH to exceed threshold
3. Check backend logs: `docker compose logs backend | grep -i alert`

### Test Fails: "Alert acknowledgment failed"

**Possible causes:**

1. Invalid JWT token
2. User lacks 'staff' role
3. Alert already acknowledged

**Solution:**

1. Verify JWT is valid and not expired
2. Check user role in database
3. Use fresh alert for testing

### Test Fails: "No webhook notification received"

**Possible causes:**

1. Webhook URL not configured
2. Notification service disabled
3. Network connectivity issue

**Solution:**

1. Configure webhook URL in organization settings
2. Verify webhook receiver is running: `ps aux | grep webhook`
3. Check backend logs for notification send attempts
4. Test webhook receiver separately: `curl -X POST http://localhost:8888/webhook -d '{"test":"data"}'`

## Contributing

When adding new test scripts:

1. Follow the existing naming convention: `e2e-{feature}.sh`
2. Include comprehensive help output (`--help` flag)
3. Use exit codes: 0 for success, 1 for failure
4. Add color-coded output for readability
5. Document all environment variables
6. Update this README with usage examples
7. Test on Linux and macOS
8. Handle line ending issues (CRLF vs LF)

## Related Documentation

- [Self-Hosted Deployment](../../docs/SELFHOSTED_DEPLOYMENT.md)
- [DigitalOcean Deployment](../../docs/DIGITALOCEAN_DEPLOYMENT.md)
- [Database Documentation](../../docs/DATABASE.md)
- [Alert Service Implementation](../../backend/src/services/alert.service.ts)

## Migration Timing Validation

### Purpose

Estimate maintenance window for production database migration by measuring pg_dump/pg_restore timing with production-scale data.

**Why this matters:** Production deployments require planned downtime. Understanding migration duration helps schedule maintenance windows that meet RTO/RPO targets.

**RTO target:** 30 minutes (Recovery Time Objective)
**RPO target:** 24 hours (Recovery Point Objective)
_Source: Phase 10 Database Production Readiness_

### Prerequisites

1. Docker running with PostgreSQL container
2. Local development stack up (`cd scripts/dev && ./up.sh`)
3. Database with test data (see Synthetic Data Generation below)

---

### Synthetic Data Generation (`generate-test-data.ts`)

Generate 100K sensor readings with realistic distribution patterns for migration testing.

#### How to Run

```bash
# Interactive mode (prompts for confirmation)
npx tsx scripts/test/generate-test-data.ts

# Automated mode (skip confirmations)
npx tsx scripts/test/generate-test-data.ts --yes
```

#### Configurable Parameters

| Environment Variable | Default | Description                          |
| -------------------- | ------- | ------------------------------------ |
| `TARGET_RECORDS`     | 100000  | Number of records to generate        |
| `BATCH_SIZE`         | 5000    | Records per batch (transaction size) |

Example with custom parameters:

```bash
TARGET_RECORDS=500000 BATCH_SIZE=10000 npx tsx scripts/test/generate-test-data.ts --yes
```

#### What It Generates

- **Volume:** 100K sensor readings by default
- **Devices:** 30 simulated sensors (sensor-001 through sensor-030)
- **Time range:** 30 days of historical data
- **Temperature:** -20°C to 40°C (food safety range)
  - 92.5% normal range (-20°C to 4°C)
  - 7.5% temperature excursions (5°C to 12°C) for realistic alert data
- **Humidity:** 30% to 95% with 1 decimal precision
- **Battery:** 60% to 100%
- **Signal strength:** -90 to -40 dBm (RSSI)
- **Timestamps:** Evenly distributed over 30-day period (not all at same time)

#### Expected Runtime

- **100K records:** ~2-5 minutes (depends on hardware)
- **Progress tracking:** Prints batch progress every 5,000 records
- **Safety:** Requires confirmation before inserting (unless --yes flag)

#### Requirements

- Backend database connection (DATABASE_URL in .env)
- At least one valid unit in the database (automatically detected)
- Sufficient disk space (~100MB for 100K records)

---

### Migration Timing Script (`validate-migration-timing.sh`)

Measures pg_dump export and pg_restore import duration to estimate production migration windows.

#### How to Run

```bash
chmod +x scripts/test/validate-migration-timing.sh
./scripts/test/validate-migration-timing.sh
```

#### What It Measures

1. **Export timing:** pg_dump custom format (-Fc) with compression level 9
2. **Import timing:** pg_restore to test database
3. **Data integrity:** Compares row counts between original and restored
4. **File size:** Compressed dump file size

#### Script Flow

```
1. Pre-flight checks
   ├─ Verify Docker is running
   ├─ Verify PostgreSQL container is healthy
   ├─ Check test data exists (sensor_readings count)
   └─ Warn if < 50,000 rows (insufficient for representative test)

2. Record initial row counts
   ├─ organizations
   ├─ units
   ├─ sensor_readings
   └─ alerts

3. Create test database (frostguard_migration_test)

4. Measure pg_dump export
   ├─ Custom format (-Fc) for optimal compression
   ├─ Compression level 9 (-Z 9)
   ├─ Output to /tmp/migration-timing-test.dump
   └─ Record duration and file size

5. Measure pg_restore import
   ├─ Restore to test database
   └─ Record duration

6. Verify data integrity
   ├─ Compare row counts (original vs restored)
   └─ Flag any mismatches

7. Cleanup
   ├─ Remove dump file
   └─ Drop test database (automatic via trap on exit)
```

#### Interpreting Results

**Example output:**

```
Migration Timing Summary
===============================================

Data Volume:
  - Sensor readings: 100,000
  - Total database size: 12.34 MB (compressed)

Timing Breakdown:
  - Export (pg_dump):   15s
  - Import (pg_restore): 18s
  - Total migration:     33s (0.6 minutes)

Production Estimates:
  - For 1M sensor readings (10.0x scale):
    Estimated migration time: 330s (5.5 minutes)
```

#### Scaling Guidance

Migration time scales **roughly linearly** with row count:

- **100K records** → ~30-60 seconds
- **1M records** → ~5-10 minutes
- **10M records** → ~50-100 minutes

**Important notes:**

- **pg_dump is single-threaded** (processes one table at a time)
- Large tables (sensor_readings, alerts) dominate migration time
- Compression helps reduce dump file size but increases CPU time
- Network latency is negligible (local restore test)

---

### Production Migration Planning

Before scheduling production maintenance:

1. **Generate representative test data**
   - Match production row counts (especially sensor_readings)
   - Run timing test multiple times for consistency
   - Use `TARGET_RECORDS` to simulate production volume

2. **Add safety margin**
   - Multiply estimate by 1.5-2x for safety buffer
   - Account for production database load during migration
   - Factor in network latency if migrating to remote server

3. **Validate RTO/RPO targets**
   - **RTO (Recovery Time Objective):** 30 minutes
   - **RPO (Recovery Point Objective):** 24 hours
   - If migration time exceeds RTO, consider optimization or extended window

4. **Reference documentation**
   - See `docs/DATABASE.md` for full backup/restore procedures
   - See `.planning/phases/10-database-production-readiness/` for Phase 10 context
   - pg_dump/pg_restore flags documented in DATABASE.md

5. **Test migration procedure**
   - Practice complete migration workflow in staging
   - Document all steps for production execution
   - Prepare rollback plan if issues occur

---

### Cleanup Test Data

After migration timing validation, remove test data from development database.

**WARNING: Only run this on development databases, never production!**

```bash
# Connect to database
docker exec -it frostguard-postgres psql -U frostguard -d frostguard

# Truncate sensor_readings (removes all test data)
TRUNCATE TABLE sensor_readings;

# Exit
\q
```

Or use SQL directly:

```bash
docker exec frostguard-postgres psql -U frostguard -d frostguard -c "TRUNCATE TABLE sensor_readings;"
```

**Note:** TRUNCATE is fast but removes ALL data. If you have production data mixed with test data, use a DELETE with WHERE clause instead:

```sql
DELETE FROM sensor_readings WHERE source = 'synthetic-test';
```

---

## Complete Test Suite

Phase 13 delivers a comprehensive E2E validation suite for production readiness.

### Test Scripts Overview

| Script                         | Purpose                             | Required | Duration     |
| ------------------------------ | ----------------------------------- | -------- | ------------ |
| `e2e-sensor-pipeline.sh`       | Sensor ingestion → storage → alert  | ✓        | ~30 seconds  |
| `e2e-alert-notifications.sh`   | Alert lifecycle + webhook delivery  | ✓        | ~45 seconds  |
| `validate-migration-timing.sh` | Migration timing measurement        | Optional | ~2-5 minutes |
| `validate-zero-downtime.sh`    | Zero-downtime deployment validation | ✓        | ~45 seconds  |

### Test Execution Order

For production validation, run tests in this recommended order:

```bash
# 1. Basic ingestion validation
./scripts/test/e2e-sensor-pipeline.sh

# 2. Alert lifecycle validation
./scripts/test/e2e-alert-notifications.sh

# 3. (Optional) Migration timing - requires test data
npx tsx scripts/test/generate-test-data.ts --yes
./scripts/test/validate-migration-timing.sh

# 4. Zero-downtime validation
./scripts/test/validate-zero-downtime.sh
```

**Total time:** ~2 minutes (or ~7 minutes with optional migration test)

### Environment Variables Summary

All environment variables used across test scripts:

#### Common Variables

| Variable   | Required | Default                 | Used By     |
| ---------- | -------- | ----------------------- | ----------- |
| `BASE_URL` | No       | `http://localhost:3000` | All scripts |

#### Authentication

| Variable             | Required    | Scripts                                            |
| -------------------- | ----------- | -------------------------------------------------- |
| `TTN_WEBHOOK_SECRET` | **Yes**     | e2e-sensor-pipeline.sh                             |
| `TEST_JWT`           | Recommended | e2e-sensor-pipeline.sh, e2e-alert-notifications.sh |
| `TEST_API_KEY`       | **Yes**     | e2e-alert-notifications.sh                         |

#### Test Configuration

| Variable           | Required | Default                     | Scripts                    |
| ------------------ | -------- | --------------------------- | -------------------------- |
| `ORGANIZATION_ID`  | **Yes**  | -                           | e2e-alert-notifications.sh |
| `TEST_UNIT_ID`     | **Yes**  | -                           | e2e-alert-notifications.sh |
| `ALERT_TIMEOUT`    | No       | `10`                        | e2e-sensor-pipeline.sh     |
| `TEST_TEMP_BREACH` | No       | `5.0`                       | e2e-sensor-pipeline.sh     |
| `TEMPERATURE_HIGH` | No       | `40.0`                      | e2e-alert-notifications.sh |
| `WEBHOOK_TEST`     | No       | `false`                     | e2e-alert-notifications.sh |
| `WEBHOOK_PORT`     | No       | `8888`                      | e2e-alert-notifications.sh |
| `COMPOSE_FILE`     | No       | `docker/docker-compose.yml` | validate-zero-downtime.sh  |
| `HEALTH_ENDPOINT`  | No       | `/health`                   | validate-zero-downtime.sh  |

#### Migration Testing

| Variable         | Default  | Script                |
| ---------------- | -------- | --------------------- |
| `TARGET_RECORDS` | `100000` | generate-test-data.ts |
| `BATCH_SIZE`     | `5000`   | generate-test-data.ts |

### Example .env.test File

Create a `.env.test` file for easy test execution:

```bash
# .env.test - E2E test configuration

# Target environment
BASE_URL=http://localhost:3000

# Authentication (replace with actual values)
TTN_WEBHOOK_SECRET=your-webhook-secret-here
TEST_API_KEY=your-api-key-here
TEST_JWT=your-jwt-token-here

# Test data (replace with actual IDs from your database)
ORGANIZATION_ID=org-12345678-1234-1234-1234-123456789012
TEST_UNIT_ID=unit-12345678-1234-1234-1234-123456789012

# Optional: Adjust test parameters
ALERT_TIMEOUT=10
TEST_TEMP_BREACH=5.0
TEMPERATURE_HIGH=40.0

# Optional: Enable webhook testing
WEBHOOK_TEST=true
WEBHOOK_PORT=8888
```

**Usage:**

```bash
# Source environment variables
source .env.test

# Run tests
./scripts/test/e2e-sensor-pipeline.sh
./scripts/test/e2e-alert-notifications.sh
./scripts/test/validate-zero-downtime.sh
```

### Production Testing

For testing against production deployment:

```bash
# Production environment
export BASE_URL="https://freshtrack.example.com"

# Production credentials (retrieve from secure storage/Infisical)
export TTN_WEBHOOK_SECRET="prod-webhook-secret"
export TEST_API_KEY="prod-api-key"
export TEST_JWT="prod-jwt-token"
export ORGANIZATION_ID="prod-org-id"
export TEST_UNIT_ID="prod-unit-id"

# Run full test suite
./scripts/test/e2e-sensor-pipeline.sh
./scripts/test/e2e-alert-notifications.sh
./scripts/test/validate-zero-downtime.sh
```

**Security note:** Never commit production credentials to git. Use secure secrets management (Infisical, 1Password, etc.)

### Continuous Integration

Example GitHub Actions workflow for automated E2E testing:

```yaml
name: E2E Validation

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Start Docker stack
        run: |
          cd scripts/dev
          ./up.sh

      - name: Wait for services
        run: |
          timeout 60 bash -c 'until curl -sf http://localhost:3000/health; do sleep 2; done'

      - name: Run E2E sensor pipeline test
        env:
          BASE_URL: http://localhost:3000
          TTN_WEBHOOK_SECRET: ${{ secrets.TTN_WEBHOOK_SECRET }}
          TEST_JWT: ${{ secrets.TEST_JWT }}
        run: ./scripts/test/e2e-sensor-pipeline.sh

      - name: Run E2E alert notifications test
        env:
          BASE_URL: http://localhost:3000
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
          TEST_JWT: ${{ secrets.TEST_JWT }}
          ORGANIZATION_ID: ${{ secrets.ORGANIZATION_ID }}
          TEST_UNIT_ID: ${{ secrets.TEST_UNIT_ID }}
        run: ./scripts/test/e2e-alert-notifications.sh

      - name: Run zero-downtime validation
        env:
          BASE_URL: http://localhost:3000
        run: ./scripts/test/validate-zero-downtime.sh
```

---

## Final Notes

### Production Cutover

Before deploying to production, complete the validation checklist:

**See:** `docs/E2E_VALIDATION_CHECKLIST.md`

This comprehensive checklist covers:

- All TEST-01 through TEST-04 requirements
- Pre-cutover infrastructure readiness
- Post-cutover verification steps
- Rollback procedures

### Test Environments

All tests can run against:

- **Local development** (`http://localhost:3000`)
- **Staging** (`https://staging.freshtrack.example.com`)
- **Production** (`https://freshtrack.example.com`)

Simply set `BASE_URL` to the target environment.

### Recommended Testing Workflow

1. **During development:**
   - Run `e2e-sensor-pipeline.sh` after backend changes
   - Run `e2e-alert-notifications.sh` after alert service changes
   - Use SensorSimulatorPanel for manual UI testing

2. **Before staging deployment:**
   - Run full test suite against local development
   - Fix any failures before deploying to staging
   - Commit fixes and re-test

3. **After staging deployment:**
   - Run full test suite against staging environment
   - Verify zero-downtime deployment works in staging
   - Test rollback procedure in staging

4. **Before production deployment:**
   - Complete E2E validation checklist (`docs/E2E_VALIDATION_CHECKLIST.md`)
   - Run full test suite against production environment
   - Verify all infrastructure prerequisites met
   - Schedule maintenance window based on migration timing

5. **After production deployment:**
   - Run full test suite against production
   - Monitor observability dashboards (Grafana)
   - Verify backups are running
   - Test alert notifications

### Getting Help

If tests fail, refer to troubleshooting sections in this README:

- **e2e-sensor-pipeline.sh issues:** See "Troubleshooting → e2e-sensor-pipeline.sh Specific"
- **e2e-alert-notifications.sh issues:** See "Troubleshooting → General Troubleshooting"
- **Migration timing issues:** See "Migration Timing Validation → Interpreting Results"
- **Zero-downtime issues:** See script output for specific recommendations

For deployment issues, see:

- `docs/SELFHOSTED_DEPLOYMENT.md`
- `docs/DIGITALOCEAN_DEPLOYMENT.md`
- `docs/DEPLOYMENT_DECISION_GUIDE.md`

---

**Test suite version:** 1.0
**Last updated:** 2026-01-24 (Phase 13 Plan 05)
**Related:** Phase 13 (E2E Validation & Cutover) - v1.1 Production Ready milestone
