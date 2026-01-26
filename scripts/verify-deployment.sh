#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Deployment Verification
# Runs health checks against a deployed instance
# ===========================================
# Usage: ./scripts/verify-deployment.sh [domain]
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
    # Load domain from config, ignoring comments
    DOMAIN=$(grep "^DOMAIN=" "$CONFIG_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
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

echo "========================================"
echo "Verifying Deployment: $DOMAIN"
echo "========================================"

# ===========================================
# Checks
# ===========================================

# 1. Check Container Status (if local)
if docker compose ps >/dev/null 2>&1; then
    step "Checking Container Status..."
    FAILED_CONTAINERS=0
    services=("backend" "postgres" "redis" "caddy")
    for svc in "${services[@]}"; do
        if ! verify_service_status "$svc"; then
            FAILED_CONTAINERS=1
        fi
    done
    
    if [[ $FAILED_CONTAINERS -eq 0 ]]; then
        success "All core containers running"
    else
        error "Some containers are not running. Check 'docker compose ps'"
        exit 1
    fi
else
    warning "Docker Compose not accessible, skipping container checks"
fi

# 2. Check Endpoint Health
step "Checking Service Endpoints..."
failed=0

# Backend Health
if ! verify_endpoint_health "Backend API" "https://${DOMAIN}/api/health"; then
    failed=1
    # Try localhost fallback if external fails (maybe DNS not propagated)
    warning "External check failed, trying internal localhost:3000..."
    if ! verify_endpoint_health "Internal API" "http://localhost:3000/health"; then
        error "Internal API is also unreachable"
    else
        success "Internal API is reachable (External issue likely DNS/Firewall)"
    fi
fi

# Frontend access
if ! verify_endpoint_health "Frontend" "https://${DOMAIN}"; then
    failed=1
fi

# 3. Check SSL
if ! verify_ssl_cert "$DOMAIN"; then
    failed=1
fi

# ===========================================
# Results
# ===========================================

if [[ $failed -eq 0 ]]; then
    display_url_summary "$DOMAIN"
    exit 0
else
    echo ""
    error "Verification FAILED"
    echo "Check logs: docker compose logs"
    exit 1
fi
