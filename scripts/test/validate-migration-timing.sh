#!/usr/bin/env bash

###############################################################################
# Migration Timing Validation Script
#
# Measures database migration timing with pg_dump/pg_restore for production
# maintenance window planning.
#
# Usage:
#   ./scripts/test/validate-migration-timing.sh
#
# Requirements:
#   - Docker running with PostgreSQL container
#   - Test data in database (run generate-test-data.ts first)
#
# Environment variables:
#   POSTGRES_CONTAINER  PostgreSQL container name (default: frostguard-postgres)
#   DB_NAME            Source database name (default: frostguard)
#   DB_USER            Database user (default: frostguard)
#   TEST_DB_NAME       Test database for restore validation
###############################################################################

set -euo pipefail

# Configuration
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-frostguard-postgres}"
DB_NAME="${DB_NAME:-frostguard}"
DB_USER="${DB_USER:-frostguard}"
TEST_DB_NAME="${TEST_DB_NAME:-frostguard_migration_test}"
DUMP_FILE="/tmp/migration-timing-test.dump"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup flag
CLEANUP_NEEDED=false

###############################################################################
# Helper functions
###############################################################################

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup on exit (success or failure)
cleanup() {
  if [[ "$CLEANUP_NEEDED" == "true" ]]; then
    log_info "Cleaning up..."

    # Remove dump file
    if [[ -f "$DUMP_FILE" ]]; then
      rm -f "$DUMP_FILE"
      log_info "Removed dump file"
    fi

    # Drop test database
    docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>/dev/null || true
    log_info "Dropped test database"
  fi
}

trap cleanup EXIT

###############################################################################
# Pre-flight checks
###############################################################################

log_info "Migration Timing Validation"
log_info "===========================\n"

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
  log_error "Docker is not running. Please start Docker and try again."
  exit 1
fi
log_success "Docker is running"

# Check PostgreSQL container exists and is healthy
if ! docker ps --filter "name=$POSTGRES_CONTAINER" --filter "status=running" | grep -q "$POSTGRES_CONTAINER"; then
  log_error "PostgreSQL container '$POSTGRES_CONTAINER' is not running."
  log_info "Start the local stack with: cd scripts/dev && ./up.sh"
  exit 1
fi
log_success "PostgreSQL container is running"

# Check if database exists
if ! docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  log_error "Database '$DB_NAME' does not exist in container '$POSTGRES_CONTAINER'"
  exit 1
fi
log_success "Database '$DB_NAME' exists"

###############################################################################
# Check test data volume
###############################################################################

log_info "\nChecking test data volume..."

# Get row counts for key tables
SENSOR_READINGS_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM sensor_readings;" | xargs)
ALERTS_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM alerts;" | xargs)
UNITS_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM units;" | xargs)
ORGS_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM organizations;" | xargs)

log_info "Table row counts:"
echo "  - sensor_readings: $SENSOR_READINGS_COUNT"
echo "  - alerts: $ALERTS_COUNT"
echo "  - units: $UNITS_COUNT"
echo "  - organizations: $ORGS_COUNT"

# Warn if test data is insufficient
if [[ "$SENSOR_READINGS_COUNT" -lt 50000 ]]; then
  log_warning "Sensor readings count is low ($SENSOR_READINGS_COUNT < 50,000)"
  log_warning "Test results may not be representative of production workload"
  log_info "Generate test data with: npx tsx scripts/test/generate-test-data.ts"
  echo ""
fi

###############################################################################
# Step 1: Create test database
###############################################################################

log_info "\nStep 1: Creating test database for restore validation..."

# Drop if exists (from previous run)
docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" >/dev/null 2>&1 || true

# Create test database
if docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE $TEST_DB_NAME;" >/dev/null 2>&1; then
  log_success "Test database created"
  CLEANUP_NEEDED=true
else
  log_error "Failed to create test database"
  exit 1
fi

###############################################################################
# Step 2: Measure pg_dump export timing
###############################################################################

log_info "\nStep 2: Measuring pg_dump export timing..."
log_info "Format: Custom (-Fc) with compression level 9"
log_info "Output: $DUMP_FILE\n"

DUMP_START=$(date +%s)

# Run pg_dump with custom format and max compression
if docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -Fc \
  -Z 9 \
  -f "$DUMP_FILE" 2>&1; then

  DUMP_END=$(date +%s)
  DUMP_DURATION=$((DUMP_END - DUMP_START))

  # Get dump file size
  DUMP_SIZE=$(docker exec "$POSTGRES_CONTAINER" stat -c%s "$DUMP_FILE" 2>/dev/null || echo "0")
  DUMP_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $DUMP_SIZE / 1024 / 1024}")

  log_success "Export completed in ${DUMP_DURATION}s"
  log_info "Dump file size: ${DUMP_SIZE_MB} MB"
else
  log_error "pg_dump failed"
  exit 1
fi

###############################################################################
# Step 3: Measure pg_restore import timing
###############################################################################

log_info "\nStep 3: Measuring pg_restore import timing..."
log_info "Target: $TEST_DB_NAME\n"

RESTORE_START=$(date +%s)

# Run pg_restore
if docker exec "$POSTGRES_CONTAINER" pg_restore \
  -U "$DB_USER" \
  -d "$TEST_DB_NAME" \
  --no-owner \
  --no-acl \
  "$DUMP_FILE" 2>&1 | grep -v "^WARNING"; then

  RESTORE_END=$(date +%s)
  RESTORE_DURATION=$((RESTORE_END - RESTORE_START))

  log_success "Import completed in ${RESTORE_DURATION}s"
else
  log_error "pg_restore failed"
  exit 1
fi

###############################################################################
# Step 4: Verify data integrity
###############################################################################

log_info "\nStep 4: Verifying data integrity..."

# Compare row counts between original and restored
VERIFY_ERRORS=0

check_table_count() {
  local table=$1
  local original_count
  local restored_count

  original_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null | xargs || echo "0")
  restored_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null | xargs || echo "0")

  if [[ "$original_count" == "$restored_count" ]]; then
    log_success "$table: $original_count rows (match)"
  else
    log_error "$table: Original=$original_count, Restored=$restored_count (MISMATCH)"
    VERIFY_ERRORS=$((VERIFY_ERRORS + 1))
  fi
}

# Check key tables
check_table_count "organizations"
check_table_count "units"
check_table_count "sensor_readings"
check_table_count "alerts"

if [[ "$VERIFY_ERRORS" -gt 0 ]]; then
  log_error "Data integrity verification failed ($VERIFY_ERRORS mismatches)"
  exit 1
fi

log_success "All table counts match"

###############################################################################
# Summary and recommendations
###############################################################################

TOTAL_DURATION=$((DUMP_DURATION + RESTORE_DURATION))

echo ""
log_info "==============================================="
log_info "Migration Timing Summary"
log_info "==============================================="
echo ""
echo "Data Volume:"
echo "  - Sensor readings: $(printf "%'d" "$SENSOR_READINGS_COUNT")"
echo "  - Total database size: ${DUMP_SIZE_MB} MB (compressed)"
echo ""
echo "Timing Breakdown:"
echo "  - Export (pg_dump):   ${DUMP_DURATION}s"
echo "  - Import (pg_restore): ${RESTORE_DURATION}s"
echo "  - Total migration:     ${TOTAL_DURATION}s ($(awk "BEGIN {printf \"%.1f\", $TOTAL_DURATION / 60}") minutes)"
echo ""
echo "Production Estimates:"

# Calculate scaling factor for 1M records
if [[ "$SENSOR_READINGS_COUNT" -gt 0 ]]; then
  SCALE_1M=$(awk "BEGIN {printf \"%.1f\", 1000000 / $SENSOR_READINGS_COUNT}")
  ESTIMATE_1M=$((TOTAL_DURATION * ${SCALE_1M%.*}))

  echo "  - For 1M sensor readings (${SCALE_1M}x scale):"
  echo "    Estimated migration time: ${ESTIMATE_1M}s ($(awk "BEGIN {printf \"%.1f\", $ESTIMATE_1M / 60}") minutes)"
fi

echo ""
log_info "Recommendations:"
echo "  - pg_dump is single-threaded (processes one table at a time)"
echo "  - Migration time scales roughly linearly with row count"
echo "  - Test with production-like data volume before scheduling maintenance"
echo "  - Reference: docs/DATABASE.md for backup/restore procedures"
echo "  - RTO target: 30 minutes | RPO target: 24 hours (from Phase 10)"
echo ""

if [[ "$TOTAL_DURATION" -gt 1800 ]]; then
  log_warning "Migration exceeded 30 minutes (RTO target)"
  log_info "Consider optimizing database or adjusting maintenance window"
fi

log_success "Validation complete!"
