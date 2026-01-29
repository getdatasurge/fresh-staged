#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Deployment Verification
# Complete multi-layer deployment validation
# ===========================================
# Usage: ./scripts/verify-deployment.sh [domain]
#
# Verifies:
#   VERIFY-01: All service health endpoints (backend, frontend, worker)
#   VERIFY-02: SSL certificate validity
#   VERIFY-03: Dashboard accessible via HTTPS (curl 200 OK check)
#   VERIFY-04: E2E sensor pipeline test (if TTN_WEBHOOK_SECRET set)
#   VERIFY-05: Monitoring stack (Prometheus, Grafana)
#   VERIFY-06: 3 consecutive health passes (dashboard only)
# ===========================================

set -o errexit
set -o nounset
set -o pipefail

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
STATE_DIR="${PROJECT_ROOT}/.deploy-state"

# Source libraries
source "${LIB_DIR}/preflight-lib.sh"
source "${LIB_DIR}/verify-lib.sh"

# ===========================================
# Configuration
# ===========================================

# Load config from state if available
CONFIG_FILE="${STATE_DIR}/config.env"
DOMAIN=""

if [[ -f "$CONFIG_FILE" ]]; then
    DOMAIN=$(grep "^DOMAIN=" "$CONFIG_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'" || echo "")
fi

# Override from argument if provided
if [[ -n "${1:-}" ]]; then
    DOMAIN="$1"
fi

if [[ -z "$DOMAIN" ]]; then
    error "Domain not found. Usage: ./verify-deployment.sh <domain>"
    echo "Or ensure .deploy-state/config.env exists"
    exit 1
fi

# E2E test configuration (optional)
RUN_E2E_TEST="${RUN_E2E_TEST:-auto}"  # auto, yes, no
TTN_WEBHOOK_SECRET="${TTN_WEBHOOK_SECRET:-}"
TEST_JWT="${TEST_JWT:-}"

echo "========================================"
echo "FreshTrack Pro Deployment Verification"
echo "========================================"
echo "Domain: $DOMAIN"
echo ""

# Track overall status
VERIFICATION_FAILED=0

# ===========================================
# 1. Container Status (if Docker accessible)
# ===========================================

if docker compose ps >/dev/null 2>&1; then
    step "Checking container status..."
    services=("backend" "postgres" "redis" "caddy")
    for svc in "${services[@]}"; do
        if ! verify_service_status "$svc"; then
            VERIFICATION_FAILED=1
        fi
    done
    if [[ $VERIFICATION_FAILED -eq 0 ]]; then
        success "All core containers running"
    fi
else
    warning "Docker Compose not accessible, skipping container checks"
fi

# ===========================================
# 2. VERIFY-01: All Service Health Endpoints
# ===========================================

step "VERIFY-01: Checking all service endpoints..."
if ! verify_all_services "$DOMAIN"; then
    VERIFICATION_FAILED=1
fi
echo ""

# ===========================================
# 3. VERIFY-02: SSL Certificate Validation
# ===========================================

step "VERIFY-02: Validating SSL certificate..."
if ! verify_ssl_cert "$DOMAIN"; then
    VERIFICATION_FAILED=1
fi
echo ""

# ===========================================
# 4. VERIFY-03 + VERIFY-06: Dashboard with 3 Consecutive Passes
# Note: curl 200 OK serves as network-level browser accessibility check
# The 3-pass requirement applies to dashboard only (most critical endpoint)
# ===========================================

step "VERIFY-03 + VERIFY-06: Dashboard accessibility (3 consecutive passes)..."
if ! verify_consecutive_health "Dashboard" "https://${DOMAIN}"; then
    VERIFICATION_FAILED=1
fi
echo ""

# ===========================================
# 5. VERIFY-05: Monitoring Stack
# ===========================================

step "VERIFY-05: Checking monitoring stack..."
if ! verify_monitoring_stack "$DOMAIN"; then
    # Monitoring failures are warnings, not blockers
    warning "Monitoring stack not fully accessible (may require auth)"
fi
echo ""

# ===========================================
# 6. VERIFY-04: E2E Sensor Pipeline Test
# ===========================================

step "VERIFY-04: E2E sensor pipeline test..."

# Determine if we should run E2E test
run_e2e=false
if [[ "$RUN_E2E_TEST" == "yes" ]]; then
    run_e2e=true
elif [[ "$RUN_E2E_TEST" == "auto" ]] && [[ -n "$TTN_WEBHOOK_SECRET" ]]; then
    run_e2e=true
fi

if [[ "$run_e2e" == "true" ]]; then
    if [[ -z "$TTN_WEBHOOK_SECRET" ]]; then
        warning "E2E test requested but TTN_WEBHOOK_SECRET not set"
    else
        E2E_SCRIPT="${SCRIPT_DIR}/test/e2e-sensor-pipeline.sh"
        if [[ -x "$E2E_SCRIPT" ]]; then
            echo "Running E2E sensor pipeline test..."
            export BASE_URL="https://${DOMAIN}"
            export TTN_WEBHOOK_SECRET
            export TEST_JWT

            if "$E2E_SCRIPT"; then
                success "E2E sensor pipeline test passed"
            else
                error "E2E sensor pipeline test failed"
                VERIFICATION_FAILED=1
            fi
        else
            warning "E2E test script not found or not executable: $E2E_SCRIPT"
        fi
    fi
else
    echo "  Skipped (set RUN_E2E_TEST=yes or provide TTN_WEBHOOK_SECRET to enable)"
fi
echo ""

# ===========================================
# Results
# ===========================================

if [[ $VERIFICATION_FAILED -eq 0 ]]; then
    display_url_summary "$DOMAIN"
    exit 0
else
    echo ""
    error "========================================="
    error "      VERIFICATION FAILED"
    error "========================================="
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check service logs: docker compose logs"
    echo "  2. Check container status: docker compose ps"
    echo "  3. Test endpoints manually: curl -v https://${DOMAIN}/api/health"
    echo ""
    exit 1
fi
