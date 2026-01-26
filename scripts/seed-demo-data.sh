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

# Execute SQL
cat "$SQL_FILE" | docker compose exec -T postgres psql -U postgres -d freshtrack >/dev/null

success "Demo data seeded successfully!"
echo "  Organization: Demo Foods Inc."
echo "  Site:         Downtown Kitchen"
echo "  Unit:         Freezer 01"
echo "  Sensor:       Sensor-F01 (96 readings)"
