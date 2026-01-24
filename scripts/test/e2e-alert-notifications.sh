#!/bin/bash
# E2E Alert Notification Pipeline Test
# Tests the complete alert lifecycle: trigger → acknowledge → resolve
#
# Purpose:
#   Validates TEST-02 requirement that alert notifications are delivered successfully
#   Tests webhook notification delivery end-to-end
#
# Requirements:
#   - Backend API server running
#   - Valid API key for readings ingestion
#   - Valid JWT for alert operations
#   - Configured alert rule on a test unit
#   - jq installed for JSON parsing
#
# Usage:
#   export BASE_URL=http://localhost:3000
#   export TEST_API_KEY=your-api-key
#   export TEST_JWT=your-jwt-token
#   export ORGANIZATION_ID=your-org-id
#   export TEST_UNIT_ID=unit-with-alert-rule
#   ./e2e-alert-notifications.sh
#
# Optional:
#   export WEBHOOK_TEST=true        # Enable webhook receiver test
#   export WEBHOOK_PORT=8888        # Port for webhook receiver
#   export TEMPERATURE_HIGH=40.0    # Temperature to trigger alert

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_API_KEY="${TEST_API_KEY:-}"
TEST_JWT="${TEST_JWT:-}"
ORGANIZATION_ID="${ORGANIZATION_ID:-}"
TEST_UNIT_ID="${TEST_UNIT_ID:-}"
WEBHOOK_TEST="${WEBHOOK_TEST:-false}"
WEBHOOK_PORT="${WEBHOOK_PORT:-8888}"
TEMPERATURE_HIGH="${TEMPERATURE_HIGH:-40.0}"

# Test metadata
TEST_START=$(date +%s)
DEVICE_ID="test-device-$(date +%s)"
WEBHOOK_PID=""
WEBHOOK_OUTPUT="/tmp/webhook-test-${TEST_START}.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0

# ==============================================================================
# Helper Functions
# ==============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Cleanup function
cleanup() {
  if [ -n "$WEBHOOK_PID" ] && kill -0 "$WEBHOOK_PID" 2>/dev/null; then
    log_info "Stopping webhook receiver (PID: $WEBHOOK_PID)"
    kill "$WEBHOOK_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

# ==============================================================================
# Pre-flight Checks
# ==============================================================================

log_info "Starting E2E Alert Notification Pipeline Test"
log_info "Target: $BASE_URL"
echo ""

# Check jq is installed
if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  exit 1
fi

# Check required environment variables
if [ -z "$TEST_API_KEY" ]; then
  log_error "TEST_API_KEY environment variable is required"
  exit 1
fi

if [ -z "$TEST_JWT" ]; then
  log_error "TEST_JWT environment variable is required"
  exit 1
fi

if [ -z "$ORGANIZATION_ID" ]; then
  log_error "ORGANIZATION_ID environment variable is required"
  exit 1
fi

if [ -z "$TEST_UNIT_ID" ]; then
  log_error "TEST_UNIT_ID environment variable is required"
  exit 1
fi

# Check backend health
log_info "Step 0: Checking backend health..."
if curl -sf "${BASE_URL}/health" > /dev/null; then
  log_success "Backend is healthy"
else
  log_error "Backend health check failed"
  exit 1
fi

echo ""

# ==============================================================================
# Step 1: Start webhook receiver (optional)
# ==============================================================================

if [ "$WEBHOOK_TEST" = "true" ]; then
  log_info "Step 1: Starting webhook receiver on port $WEBHOOK_PORT..."

  # Check if webhook receiver script exists
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  WEBHOOK_RECEIVER="$SCRIPT_DIR/webhook-receiver.sh"

  if [ ! -f "$WEBHOOK_RECEIVER" ]; then
    log_warn "Webhook receiver script not found at $WEBHOOK_RECEIVER"
    log_warn "Skipping webhook test"
    WEBHOOK_TEST=false
  else
    # Start webhook receiver in background
    "$WEBHOOK_RECEIVER" --port "$WEBHOOK_PORT" --timeout 300 --output "$WEBHOOK_OUTPUT" &
    WEBHOOK_PID=$!

    # Wait for server to be ready
    sleep 2

    if kill -0 "$WEBHOOK_PID" 2>/dev/null; then
      log_success "Webhook receiver started (PID: $WEBHOOK_PID)"
      log_info "Webhook URL: http://localhost:${WEBHOOK_PORT}/webhook"
    else
      log_warn "Webhook receiver failed to start"
      WEBHOOK_TEST=false
      WEBHOOK_PID=""
    fi
  fi
else
  log_info "Step 1: Webhook test disabled (set WEBHOOK_TEST=true to enable)"
fi

echo ""

# ==============================================================================
# Step 2: Inject high-temperature reading to trigger alert
# ==============================================================================

log_info "Step 2: Injecting high-temperature reading (${TEMPERATURE_HIGH}°C)..."

READING_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
READING_PAYLOAD=$(jq -n \
  --arg unitId "$TEST_UNIT_ID" \
  --arg deviceId "$DEVICE_ID" \
  --arg temp "$TEMPERATURE_HIGH" \
  --arg timestamp "$READING_TIMESTAMP" \
  '{
    readings: [{
      unitId: $unitId,
      deviceId: $deviceId,
      temperature: ($temp | tonumber),
      humidity: 60,
      battery: 85,
      signalStrength: -70,
      recordedAt: $timestamp,
      source: "api"
    }]
  }')

INGEST_RESPONSE=$(curl -sf \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $TEST_API_KEY" \
  -d "$READING_PAYLOAD" \
  "${BASE_URL}/api/ingest/readings" || echo '{"success":false}')

INGEST_SUCCESS=$(echo "$INGEST_RESPONSE" | jq -r '.success // false')
ALERTS_TRIGGERED=$(echo "$INGEST_RESPONSE" | jq -r '.alertsTriggered // 0')

if [ "$INGEST_SUCCESS" = "true" ]; then
  log_success "Reading ingested successfully"
  log_info "Alerts triggered: $ALERTS_TRIGGERED"
else
  log_error "Failed to ingest reading"
  echo "$INGEST_RESPONSE" | jq '.'
  exit 1
fi

echo ""

# ==============================================================================
# Step 3: Wait for alert creation (poll alerts endpoint)
# ==============================================================================

log_info "Step 3: Waiting for alert creation (polling for 30 seconds)..."

ALERT_ID=""
MAX_POLLS=15
POLL_COUNT=0

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
  sleep 2
  POLL_COUNT=$((POLL_COUNT + 1))

  # Query alerts for this unit
  ALERTS_RESPONSE=$(curl -sf \
    -H "Authorization: Bearer $TEST_JWT" \
    "${BASE_URL}/api/orgs/${ORGANIZATION_ID}/alerts?unitId=${TEST_UNIT_ID}&limit=10" || echo '[]')

  # Find most recent alert
  ALERT_ID=$(echo "$ALERTS_RESPONSE" | jq -r '.[0].id // empty')

  if [ -n "$ALERT_ID" ]; then
    log_success "Alert created: $ALERT_ID"
    break
  fi

  echo -n "."
done

echo ""

if [ -z "$ALERT_ID" ]; then
  log_error "No alert found after 30 seconds"
  log_warn "Possible reasons:"
  log_warn "  - No alert rule configured for unit $TEST_UNIT_ID"
  log_warn "  - Temperature threshold not exceeded"
  log_warn "  - Alert evaluator service error"
  exit 1
fi

echo ""

# ==============================================================================
# Step 4: Verify alert details
# ==============================================================================

log_info "Step 4: Verifying alert details..."

ALERT_DETAILS=$(curl -sf \
  -H "Authorization: Bearer $TEST_JWT" \
  "${BASE_URL}/api/orgs/${ORGANIZATION_ID}/alerts/${ALERT_ID}" || echo '{}')

ALERT_STATUS=$(echo "$ALERT_DETAILS" | jq -r '.status // empty')
ALERT_SEVERITY=$(echo "$ALERT_DETAILS" | jq -r '.severity // empty')
ALERT_UNIT_ID=$(echo "$ALERT_DETAILS" | jq -r '.unitId // empty')

if [ "$ALERT_UNIT_ID" = "$TEST_UNIT_ID" ]; then
  log_success "Alert belongs to correct unit"
else
  log_error "Alert unit mismatch: expected $TEST_UNIT_ID, got $ALERT_UNIT_ID"
fi

if [ "$ALERT_STATUS" = "triggered" ] || [ "$ALERT_STATUS" = "active" ]; then
  log_success "Alert status is '$ALERT_STATUS'"
else
  log_error "Unexpected alert status: $ALERT_STATUS (expected 'triggered' or 'active')"
fi

if [ -n "$ALERT_SEVERITY" ]; then
  log_success "Alert severity: $ALERT_SEVERITY"
else
  log_error "Alert severity is missing"
fi

echo ""

# ==============================================================================
# Step 5: Test alert acknowledgment
# ==============================================================================

log_info "Step 5: Acknowledging alert..."

ACK_PAYLOAD=$(jq -n \
  --arg notes "Test acknowledgment at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{notes: $notes}')

ACK_RESPONSE=$(curl -sf \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d "$ACK_PAYLOAD" \
  "${BASE_URL}/api/orgs/${ORGANIZATION_ID}/alerts/${ALERT_ID}/acknowledge" || echo '{}')

ACK_STATUS=$(echo "$ACK_RESPONSE" | jq -r '.status // empty')
ACK_TIMESTAMP=$(echo "$ACK_RESPONSE" | jq -r '.acknowledgedAt // empty')

if [ "$ACK_STATUS" = "acknowledged" ]; then
  log_success "Alert acknowledged successfully"
else
  log_error "Alert acknowledgment failed: status=$ACK_STATUS"
fi

if [ -n "$ACK_TIMESTAMP" ]; then
  log_success "Acknowledged timestamp set: $ACK_TIMESTAMP"
else
  log_error "Acknowledged timestamp is missing"
fi

echo ""

# ==============================================================================
# Step 6: Verify acknowledgment persisted
# ==============================================================================

log_info "Step 6: Verifying acknowledgment persisted..."

sleep 1  # Brief pause to ensure DB commit

ALERT_AFTER_ACK=$(curl -sf \
  -H "Authorization: Bearer $TEST_JWT" \
  "${BASE_URL}/api/orgs/${ORGANIZATION_ID}/alerts/${ALERT_ID}" || echo '{}')

PERSISTED_STATUS=$(echo "$ALERT_AFTER_ACK" | jq -r '.status // empty')

if [ "$PERSISTED_STATUS" = "acknowledged" ]; then
  log_success "Acknowledgment persisted in database"
else
  log_error "Acknowledgment not persisted: status=$PERSISTED_STATUS"
fi

echo ""

# ==============================================================================
# Step 7: Test alert resolution
# ==============================================================================

log_info "Step 7: Resolving alert..."

RESOLVE_PAYLOAD=$(jq -n \
  --arg resolution "Test resolution at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg action "Adjusted temperature setpoint" \
  '{resolution: $resolution, correctiveAction: $action}')

RESOLVE_RESPONSE=$(curl -sf \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_JWT" \
  -d "$RESOLVE_PAYLOAD" \
  "${BASE_URL}/api/orgs/${ORGANIZATION_ID}/alerts/${ALERT_ID}/resolve" || echo '{}')

RESOLVE_STATUS=$(echo "$RESOLVE_RESPONSE" | jq -r '.status // empty')
RESOLVE_TIMESTAMP=$(echo "$RESOLVE_RESPONSE" | jq -r '.resolvedAt // empty')

if [ "$RESOLVE_STATUS" = "resolved" ]; then
  log_success "Alert resolved successfully"
else
  log_error "Alert resolution failed: status=$RESOLVE_STATUS"
fi

if [ -n "$RESOLVE_TIMESTAMP" ]; then
  log_success "Resolved timestamp set: $RESOLVE_TIMESTAMP"
else
  log_error "Resolved timestamp is missing"
fi

echo ""

# ==============================================================================
# Step 8: Verify webhook received notification (if enabled)
# ==============================================================================

if [ "$WEBHOOK_TEST" = "true" ]; then
  log_info "Step 8: Verifying webhook notification..."

  # Wait a bit for webhook delivery
  sleep 3

  if [ -f "$WEBHOOK_OUTPUT" ]; then
    WEBHOOK_PAYLOAD=$(cat "$WEBHOOK_OUTPUT")
    WEBHOOK_ALERT_ID=$(echo "$WEBHOOK_PAYLOAD" | jq -r '.alertId // .alert.id // empty' 2>/dev/null || echo "")

    if [ -n "$WEBHOOK_PAYLOAD" ]; then
      log_success "Webhook notification received"
      log_info "Payload preview:"
      echo "$WEBHOOK_PAYLOAD" | jq '.' | head -10

      if [ "$WEBHOOK_ALERT_ID" = "$ALERT_ID" ]; then
        log_success "Webhook contains correct alert ID"
      else
        log_warn "Webhook alert ID mismatch or not found in payload"
      fi
    else
      log_error "Webhook output file is empty"
    fi
  else
    log_error "No webhook notification received"
    log_warn "Possible reasons:"
    log_warn "  - Webhook URL not configured in alert notification settings"
    log_warn "  - Notification service disabled"
    log_warn "  - Network connectivity issue"
  fi
else
  log_info "Step 8: Webhook test skipped (WEBHOOK_TEST=false)"
fi

echo ""

# ==============================================================================
# Test Summary
# ==============================================================================

TEST_END=$(date +%s)
TEST_DURATION=$((TEST_END - TEST_START))

echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Duration: ${TEST_DURATION}s"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  log_success "All tests passed!"
  echo ""
  echo "Alert lifecycle verified:"
  echo "  1. High-temperature reading ingested"
  echo "  2. Alert triggered automatically"
  echo "  3. Alert acknowledged by staff"
  echo "  4. Alert resolved with corrective action"
  if [ "$WEBHOOK_TEST" = "true" ] && [ -f "$WEBHOOK_OUTPUT" ]; then
    echo "  5. Webhook notification delivered"
  fi
  echo ""
  exit 0
else
  log_error "Some tests failed"
  echo ""
  exit 1
fi
