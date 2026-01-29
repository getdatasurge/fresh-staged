#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Post-Deployment Setup
# Runs after verification to complete deployment
# ===========================================
# Usage: ./scripts/post-deploy.sh [domain]
#
# Performs:
#   POST-01: Display URL summary (dashboard, API, monitoring, Bull Board)
#   POST-02: Display credential summary (secure terminal output)
#   POST-03: Seed demo data (organization, site, sensor readings)
#   POST-04: Note about Grafana dashboards (auto-provisioned)
#   POST-05: Display next steps for first admin setup
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
source "${LIB_DIR}/post-deploy-lib.sh"

# Load config
CONFIG_FILE="${STATE_DIR}/config.env"
DOMAIN=""

if [[ -f "$CONFIG_FILE" ]]; then
    DOMAIN=$(grep "^DOMAIN=" "$CONFIG_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'" || echo "")
fi

if [[ -n "${1:-}" ]]; then
    DOMAIN="$1"
fi

if [[ -z "$DOMAIN" ]]; then
    error "Domain not found. Usage: ./post-deploy.sh <domain>"
    echo "Or ensure .deploy-state/config.env exists"
    exit 1
fi

echo ""
echo "========================================"
echo "FreshTrack Pro Post-Deployment Setup"
echo "========================================"
echo "Domain: $DOMAIN"
echo ""

# POST-01: URL Summary
step "POST-01: Displaying service URLs..."
display_url_summary "$DOMAIN"

# POST-02: Credential Summary
step "POST-02: Displaying credentials (terminal only)..."
display_credential_summary

# POST-03: Seed Demo Data
step "POST-03: Seeding demo data..."
SEED_SCRIPT="${SCRIPT_DIR}/seed-demo-data.sh"
if [[ -x "$SEED_SCRIPT" ]]; then
    "$SEED_SCRIPT"
else
    warning "Demo seed script not found: $SEED_SCRIPT"
fi

# POST-04: Grafana Note
step "POST-04: Grafana dashboards..."
echo "  Pre-configured dashboards are automatically provisioned:"
echo "    - FreshTrack Pro Overview (system metrics)"
echo "    - FreshTrack Sensor Metrics (temperature, alerts)"
echo ""
echo "  Access at: https://${DOMAIN}/grafana"
echo "  Login with credentials shown above."
echo ""

# POST-05: Next Steps
step "POST-05: Next steps..."
display_next_steps "$DOMAIN"

echo ""
success "Post-deployment setup complete!"
echo ""
