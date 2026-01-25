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
    exec "${DEPLOY_SCRIPT_DIR}/deploy.sh"
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

    # This point is only reached if deploy.sh succeeds
    echo ""
    echo "========================================"
    echo -e "${GREEN}Automated Deployment Complete${NC}"
    echo "========================================"
    echo ""
    echo "End time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
}

# Entry point
main "$@"
