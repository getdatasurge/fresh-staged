#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Automated Deployment Orchestrator
# ===========================================
# Thin orchestration script that coordinates existing deployment infrastructure.
# Does NOT duplicate any logic from deploy.sh - calls it as a subprocess.
#
# Usage: ./scripts/deploy-automated.sh [OPTIONS]
#
# Options:
#   --reset         Clear all checkpoints and start fresh
#   --skip-prereqs  Skip prerequisites installation (if already done)
#   --help, -h      Show this help message
#
# Phases:
#   1. Pre-flight   - System requirements validation
#   2. Prerequisites - Docker, firewall, fail2ban installation
#   3. Configuration - Domain, email, secrets setup
#   4. Deployment    - Calls deploy.sh for actual deployment
#
# Resume: Script automatically resumes from last successful checkpoint.
# ===========================================

set -o errexit
set -o errtrace
set -o nounset
set -o pipefail

# ===========================================
# Script Configuration
# ===========================================
DEPLOY_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_SCRIPT_DIR/.." && pwd)"
LIB_DIR="${DEPLOY_SCRIPT_DIR}/lib"

# ===========================================
# Source Libraries (order matters)
# ===========================================
# preflight-lib.sh FIRST - provides error_handler, run_step, checkpoint functions
source "${LIB_DIR}/preflight-lib.sh"

# prereq-lib.sh SECOND - depends on preflight-lib
source "${LIB_DIR}/prereq-lib.sh"

# config-lib.sh THIRD - depends on preflight-lib
source "${LIB_DIR}/config-lib.sh"

# ===========================================
# Command Line Flags
# ===========================================
FLAG_RESET=false
FLAG_SKIP_PREREQS=false

# ===========================================
# Usage / Help
# ===========================================
show_usage() {
    cat << 'EOF'
FreshTrack Pro Automated Deployment

Usage: ./scripts/deploy-automated.sh [OPTIONS]

Options:
  --reset         Clear all deployment checkpoints and start fresh
  --skip-prereqs  Skip prerequisites installation (use if already installed)
  --help, -h      Show this help message

Deployment Phases:
  1. Pre-flight checks     System requirements (RAM, disk, network)
  2. Prerequisites         Docker, firewall, fail2ban, jq
  3. Configuration         Domain, email, Stack Auth credentials
  4. Deployment            Calls deploy.sh (migrations, services, health)

Resume Capability:
  Script automatically resumes from last successful step.
  Use --reset to start fresh if needed.

Examples:
  Fresh install:        ./scripts/deploy-automated.sh
  Resume after failure: ./scripts/deploy-automated.sh
  Complete reset:       ./scripts/deploy-automated.sh --reset
  Skip prerequisites:   ./scripts/deploy-automated.sh --skip-prereqs

EOF
}

# ===========================================
# Argument Parsing
# ===========================================
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --reset)
                FLAG_RESET=true
                shift
                ;;
            --skip-prereqs)
                FLAG_SKIP_PREREQS=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                echo ""
                show_usage
                exit 1
                ;;
        esac
    done
}

# ===========================================
# Deployment Phase Functions
# ===========================================
do_preflight() {
    run_preflight_checks  # Domain not known yet during preflight
}

do_prerequisites() {
    if [[ "$FLAG_SKIP_PREREQS" == "true" ]]; then
        warning "Skipping prerequisites installation (--skip-prereqs flag)"
        return 0
    fi
    install_all_prerequisites
}

do_configuration() {
    run_interactive_configuration
}

do_deployment() {
    step "Executing deploy.sh..."
    cd "$PROJECT_ROOT"
    "${DEPLOY_SCRIPT_DIR}/deploy.sh"
}

# ===========================================
# Health Verification
# ===========================================
wait_for_all_services_healthy() {
    local max_attempts="${1:-60}"
    local interval="${2:-5}"
    local attempt=1

    step "Verifying all services are healthy..."

    while [[ $attempt -le $max_attempts ]]; do
        local all_healthy=true
        local failed_service=""

        # Check postgres
        if ! docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres pg_isready -U frostguard &>/dev/null; then
            all_healthy=false
            failed_service="postgres"
        # Check redis
        elif ! docker compose -f docker-compose.yml -f compose.production.yaml exec -T redis redis-cli ping &>/dev/null; then
            all_healthy=false
            failed_service="redis"
        # Check backend health endpoint
        elif ! curl -sf --max-time 5 http://localhost:3000/health &>/dev/null; then
            all_healthy=false
            failed_service="backend"
        # Check caddy is running
        elif ! docker compose -f docker-compose.yml -f compose.production.yaml ps caddy --format '{{.State}}' 2>/dev/null | grep -q "running"; then
            all_healthy=false
            failed_service="caddy"
        fi

        if [[ "$all_healthy" == "true" ]]; then
            success "All critical services are healthy"
            return 0
        fi

        echo "Waiting for $failed_service... (attempt $attempt/$max_attempts)"
        sleep "$interval"
        attempt=$((attempt + 1))
    done

    error "Services did not become healthy within timeout"
    echo "  Failed service: $failed_service"
    echo "  Check logs: docker compose logs $failed_service"
    return 1
}

# ===========================================
# Completion Summary
# ===========================================
display_completion_summary() {
    local domain="${DOMAIN:-}"

    # If DOMAIN not set, try to read from .env.production
    if [[ -z "$domain" ]] && [[ -f "${PROJECT_ROOT}/.env.production" ]]; then
        domain=$(grep "^DOMAIN=" "${PROJECT_ROOT}/.env.production" | cut -d= -f2)
    fi

    echo ""
    echo -e "${GREEN}========================================"
    echo "     FreshTrack Pro Deployment Complete!"
    echo "========================================${NC}"
    echo ""
    echo "End time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    if [[ -n "$domain" ]]; then
        echo -e "${BLUE}Access URLs:${NC}"
        echo "  Dashboard:    https://${domain}"
        echo "  API:          https://${domain}/api"
        echo "  Health:       https://${domain}/api/health"
        echo "  Monitoring:   https://monitoring.${domain}"
        echo "  Status:       https://status.${domain}"
        echo ""
    else
        echo -e "${YELLOW}Note: Domain not detected. Check .env.production${NC}"
        echo ""
    fi

    echo -e "${BLUE}Service Status:${NC}"
    docker compose -f docker-compose.yml -f compose.production.yaml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || \
        docker compose -f docker-compose.yml -f compose.production.yaml ps
    echo ""

    echo -e "${BLUE}Next Steps:${NC}"
    echo "  1. Visit the dashboard to verify the application is working"
    echo "  2. Create your first organization and user"
    echo "  3. Configure alerting thresholds"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  View logs:        docker compose logs -f"
    echo "  Service status:   docker compose ps"
    echo "  Backend logs:     docker compose logs -f backend"
    echo "  Restart:          docker compose restart"
    echo "  Stop:             docker compose down"
    echo ""
    echo -e "${BLUE}Troubleshooting:${NC}"
    echo "  Re-run deployment:  ./scripts/deploy-automated.sh"
    echo "  Full reset:         ./scripts/deploy-automated.sh --reset"
    echo "  Rollback:           ./scripts/rollback.sh"
    echo ""
}

# ===========================================
# Main Orchestration
# ===========================================
main() {
    parse_args "$@"

    echo ""
    echo "========================================"
    echo "FreshTrack Pro Automated Deployment"
    echo "========================================"
    echo ""
    echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Handle --reset flag
    if [[ "$FLAG_RESET" == "true" ]]; then
        step "Clearing all deployment checkpoints..."
        checkpoint_clear_all
    fi

    # Execute deployment phases with checkpoint tracking
    run_step "deploy-preflight" do_preflight
    run_step "deploy-prerequisites" do_prerequisites
    run_step "deploy-configuration" do_configuration
    run_step "deploy-deployment" do_deployment
    run_step "deploy-verify-health" wait_for_all_services_healthy

    # Display completion summary (not checkpointed - always show on success)
    display_completion_summary
}

# Entry point
main "$@"
