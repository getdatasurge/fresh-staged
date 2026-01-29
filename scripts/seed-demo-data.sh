#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Seed Demo Data
# Populates the database with sample data
# ===========================================
# Usage: ./scripts/seed-demo-data.sh
# ===========================================

set -o errexit
set -o nounset
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
source "${LIB_DIR}/preflight-lib.sh"

SQL_FILE="$SCRIPT_DIR/seed/demo-data.sql"

if [[ ! -f "$SQL_FILE" ]]; then
    error "SQL file not found: $SQL_FILE"
    exit 1
fi

step "Seeding Demo Data..."

# Check if postgres container is running
if ! docker compose ps postgres | grep -q "running"; then
    error "Postgres container is not running"
    exit 1
fi

# Wait for postgres to be accepting connections
step "Waiting for database to be ready..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
        success "Database is ready"
        break
    fi
    if [[ $i -eq 30 ]]; then
        error "Database not ready after 30 seconds"
        exit 1
    fi
    sleep 1
done

# Execute SQL
cat "$SQL_FILE" | docker compose exec -T postgres psql -U postgres -d freshtrack >/dev/null

success "Demo data seeded successfully!"
echo ""
echo "  Demo Organization: Demo Foods Inc."
echo "  Demo Site:         Downtown Kitchen"
echo "  Demo Unit:         Freezer 01 (Walk-in Freezer)"
echo "  Demo Sensor:       Sensor-F01"
echo "  Sample Data:       96 temperature readings (24h history)"
echo "  Demo Alert:        1 active temperature alert (temperature_high)"
echo ""
echo "  Login and navigate to the Dashboard to see the demo data."
echo ""
