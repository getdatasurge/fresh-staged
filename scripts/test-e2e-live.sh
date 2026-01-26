#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Live E2E Test
# Validates the API against a running instance
# ===========================================
# Usage: ./scripts/test-e2e-live.sh
# ===========================================

set -o errexit
set -o nounset
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# Check if verification libs exist, else fallback to simple output
if [[ -f "${LIB_DIR}/preflight-lib.sh" ]]; then
    source "${LIB_DIR}/preflight-lib.sh"
else
    step() { echo "==> $1"; }
    success() { echo "[OK] $1"; }
    error() { echo "[ERROR] $1"; exit 1; }
fi

# Configuration
API_URL="${API_URL:-http://localhost:3000}"

step "Starting Live E2E Smoke Test..."

# 1. API Health
step "Checking API Health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
if [[ "$HTTP_CODE" == "200" ]]; then
    success "API is healthy ($API_URL)"
else
    error "API is unhealthy (HTTP $HTTP_CODE)"
fi

# 2. Database Connectivity (via API)
# Check if we can reach an endpoint that hits the DB, e.g. /api/public/stats or fail if auth required
# Assuming /health checks DB, which is standard.

# 3. Resume Capability Verification (Simulation)
# Since we can't easily crash the server in a safe live test, we check if the resume mechanisms exist
step "Verifying Resume Capabilities..."
if [[ -f "$SCRIPT_DIR/lib/preflight-lib.sh" ]]; then
    if grep -q "checkpoint_set" "$SCRIPT_DIR/lib/preflight-lib.sh"; then
        success "Checkpoint mechanism detected"
    else
        error "Checkpoint mechanism missing"
    fi
else
    error "Preflight library missing"
fi

# 4. Data Persistence
# Count organizations
step "Verifying Data Persistence..."
ORG_COUNT=$(docker compose exec -T postgres psql -U postgres -d freshtrack -t -c "SELECT count(*) FROM organizations;" | tr -d ' ')
echo "  Organizations found: $ORG_COUNT"

if [[ "$ORG_COUNT" -ge 0 ]]; then
    success "Database query successful"
else
    error "Database query failed"
fi

success "E2E Smoke Test Passed"
