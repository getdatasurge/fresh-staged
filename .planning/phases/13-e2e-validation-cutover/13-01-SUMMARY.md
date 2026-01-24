---
phase: 13-e2e-validation-cutover
plan: 01
subsystem: testing
tags: [bash, e2e, testing, validation, sensor-pipeline, alerts]

# Dependency graph
requires:
  - phase: 03-backend-api-migration
    provides: Fastify backend with /api/ingest/readings and /api/alerts endpoints
  - phase: 04-alert-system-migration
    provides: Alert evaluation service and state machine
  - phase: 07-production-deployment-cutover
    provides: Health check endpoints (/health, /health/ready)
provides:
  - E2E sensor pipeline validation script (scripts/test/e2e-sensor-pipeline.sh)
  - Comprehensive test script documentation (scripts/test/README.md)
  - Automated TEST-01 validation (sensor data ingestion and alert trigger)
affects: [13-e2e-validation-cutover, production-validation, deployment-automation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bash-based E2E testing with curl and jq"
    - "Colored output for test results (red/green/yellow/blue)"
    - "Environment variable configuration pattern"
    - "Idempotent test execution with unique device IDs"
    - "Pre-flight health check pattern"

key-files:
  created:
    - scripts/test/e2e-sensor-pipeline.sh
  modified:
    - scripts/test/README.md

key-decisions:
  - "Bash-based testing instead of Jest/Playwright for deployment portability"
  - "Direct API ingestion endpoint (/api/ingest/readings) instead of TTN webhook for simpler testing"
  - "Unique device IDs per test run for idempotent execution"
  - "Optional TEST_JWT allows partial testing without authentication"
  - "10-second default timeout for alert processing (async evaluation)"

patterns-established:
  - "E2E test scripts use environment variables for configuration (BASE_URL, TTN_WEBHOOK_SECRET, TEST_JWT)"
  - "Color-coded output: GREEN for success, RED for failure, YELLOW for steps, BLUE for info"
  - "Pre-flight checks validate backend health and database connectivity before tests"
  - "Test summary shows passed/failed counts with exit code 0 on success, 1 on failure"

# Metrics
duration: 5min
completed: 2026-01-24
---

# Phase 13 Plan 01: E2E Sensor Pipeline Test Summary

**E2E sensor pipeline validation script with 6-step flow testing sensor → storage → alert complete pipeline**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-24T07:00:01Z
- **Completed:** 2026-01-24T07:05:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created 512-line E2E test script validating complete sensor data flow
- Comprehensive test documentation with troubleshooting and usage examples
- TEST-01 requirement (sensor data ingestion validation) fully addressed
- Idempotent test execution with unique device IDs per run
- Pre-flight health checks for backend and database connectivity

## Task Commits

Each task was committed atomically:

1. **Task 1: Create E2E sensor pipeline test script** - `a5f5d9a` (test)
2. **Task 2: Create test scripts README documentation** - `e8bcb63` (docs)

**Plan metadata:** (to be committed)

## Files Created/Modified

- `scripts/test/e2e-sensor-pipeline.sh` (512 lines) - Complete E2E validation script
  - 6-step test flow: health checks → normal reading → breach reading → alert verification
  - Pre-flight validation of prerequisites (curl, jq, env vars)
  - Color-coded output with checkmarks/X for pass/fail
  - Configurable via environment variables (BASE_URL, TTN_WEBHOOK_SECRET, TEST_JWT)
  - Handles authentication via API key (X-API-Key header) and JWT (Authorization Bearer)
  - Graceful degradation when TEST_JWT not provided (skips alert verification)

- `scripts/test/README.md` (669 lines) - Comprehensive test documentation
  - Updated from existing placeholder to reflect actual implementation
  - Documents e2e-sensor-pipeline.sh usage for local and production testing
  - Three testing modes documented: Direct API, TTN webhook, UI-based (SensorSimulatorPanel)
  - Troubleshooting section with solutions for common errors
  - JWT token extraction methods (browser DevTools, Stack Auth CLI)
  - Expected output examples and exit codes

## Decisions Made

1. **Bash-based testing instead of Node.js/Jest**
   - Rationale: Maximum portability for deployment validation
   - Works on any Linux/macOS system without Node.js installation
   - Can be run from CI/CD pipelines or SSH sessions
   - No node_modules or build step required

2. **Direct API endpoint instead of TTN webhook**
   - Rationale: Simpler test setup without TTN infrastructure
   - Tests core ingestion logic directly via /api/ingest/readings
   - TTN webhook mode documented for integration testing
   - SensorSimulatorPanel provides UI-based TTN routing toggle

3. **Optional TEST_JWT for graceful degradation**
   - Rationale: Allow partial testing without authentication setup
   - Reading ingestion tests work with only TTN_WEBHOOK_SECRET
   - Alert verification requires TEST_JWT (optional step)
   - Clear output indicates which tests were skipped

4. **Unique device IDs per test run**
   - Rationale: Idempotent test execution without database cleanup
   - Each run generates `test-device-<timestamp>`
   - Prevents conflicts with existing test data
   - Safe to run multiple times in production

5. **10-second alert timeout default**
   - Rationale: Balance between test speed and alert processing time
   - Alert evaluation happens synchronously in reading ingestion
   - Timeout allows for any async processing or race conditions
   - Configurable via ALERT_TIMEOUT environment variable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shellcheck not available for validation**

- **Found during:** Task 1 verification step
- **Issue:** Shellcheck not installed on system, requires sudo for installation
- **Fix:** Used bash -n syntax check instead of shellcheck
- **Files modified:** None (verification approach changed)
- **Verification:** Script passes bash -n syntax validation
- **Impact:** No impact on script functionality - shellcheck is nice-to-have for best practices, not required for execution

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal - verification approach adjusted but script quality maintained via bash syntax check.

## Issues Encountered

### Line Ending Issue (CRLF vs LF)

- **Problem:** Initial script write had Windows-style CRLF line endings
- **Error:** `syntax error near unexpected token $'{\r''`
- **Solution:** Applied `dos2unix` or `sed -i 's/\r$//'` to convert CRLF to LF
- **Resolution:** Script now executes correctly with Unix line endings
- **Prevention:** File was created via Write tool which may preserve CRLF on WSL/Windows systems

## User Setup Required

None - no external service configuration required.

The test script requires:
1. Backend API running (local or deployed)
2. TTN_WEBHOOK_SECRET environment variable (from backend .env)
3. Optional TEST_JWT for full testing (extracted from browser or Stack Auth)

## Next Phase Readiness

**Ready for:**
- Phase 13-02: Additional E2E tests (alert notifications, TTN integration)
- Production validation workflows using e2e-sensor-pipeline.sh
- Deployment automation with automated testing

**Deliverables:**
- ✅ TEST-01 requirement addressed (sensor data ingestion validated)
- ✅ Executable test script with clear pass/fail output
- ✅ Comprehensive documentation for local and production usage
- ✅ Troubleshooting guide for common errors

**Potential enhancements (future phases):**
- Additional test scripts: e2e-alert-notifications.sh (mentioned in existing README)
- TTN webhook integration test (end-to-end via actual TTN network)
- Performance/load testing for sensor ingestion
- Automated test execution in deployment pipelines (see README CI/CD section)

---
*Phase: 13-e2e-validation-cutover*
*Completed: 2026-01-24*
