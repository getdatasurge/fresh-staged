#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro One-Click Deployment Orchestrator
# ===========================================
# Usage: ./scripts/deploy-orchestrated.sh [--resume] [--fresh] [--status]
#
# This script provides checkpoint-based deployment with resume capability.
# It uses the same deployment sequence as deploy.sh but adds state tracking.
# deploy.sh remains available for simple one-shot deployments without checkpoints.
#
# Options:
#   --resume    Resume from last checkpoint (default)
#   --fresh     Clear all checkpoints and start from beginning
#   --status    Show current deployment status and exit
#   --help      Show this help message
# ===========================================
set -euo pipefail

# ===========================================
# Argument Parsing
# ===========================================
FRESH=false
STATUS_ONLY=false

show_usage() {
  echo "FreshTrack Pro Deployment Orchestrator"
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --resume    Resume from last checkpoint (default behavior)"
  echo "  --fresh     Clear all checkpoints and start from beginning"
  echo "  --status    Show current deployment status and exit"
  echo "  --help      Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0                  # Resume or start deployment"
  echo "  $0 --status         # Check deployment progress"
  echo "  $0 --fresh          # Start fresh deployment"
  echo ""
  echo "This orchestrator uses the same deployment sequence as deploy.sh"
  echo "but adds checkpoint tracking for resume capability on failure."
  echo ""
  echo "For simple one-shot deployments without checkpoints, use:"
  echo "  ./scripts/deploy.sh"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --fresh)
      FRESH=true
      shift
      ;;
    --resume)
      # Default behavior, no-op
      shift
      ;;
    --status)
      STATUS_ONLY=true
      shift
      ;;
    --help|-h)
      show_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo ""
      show_usage
      exit 1
      ;;
  esac
done

# ===========================================
# Source Library Chain
# ===========================================
# Store our script directory before sourcing libraries (they redefine SCRIPT_DIR)
ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${ORCHESTRATOR_DIR}/lib"

source "${LIB_DIR}/deploy-lib.sh"
# deploy-lib.sh sources preflight-lib.sh which sets up error handling

# Also source prereq-lib.sh and config-lib.sh for their functions
source "${LIB_DIR}/prereq-lib.sh"
source "${LIB_DIR}/config-lib.sh"

# Restore SCRIPT_DIR for our use
SCRIPT_DIR="$ORCHESTRATOR_DIR"

# ===========================================
# Domain Configuration
# ===========================================
# Load domain from .env.production if available
DOMAIN=""
if [[ -f "${SCRIPT_DIR}/../.env.production" ]]; then
  # Extract DOMAIN from .env.production (|| true to handle missing line)
  DOMAIN=$(grep -E "^DOMAIN=" "${SCRIPT_DIR}/../.env.production" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || true)
fi

# ===========================================
# Phase Functions
# These match the deployment sequence from deploy.sh
# ===========================================

# Phase 1: Pre-flight validation
# Same as deploy.sh STEP 1 (health-check.sh)
phase_preflight() {
  step "Running pre-flight system validation..."

  # Run preflight checks (domain optional at this stage)
  if run_preflight_checks "$DOMAIN"; then
    success "Pre-flight validation passed"
    return 0
  else
    error "Pre-flight validation failed"
    return 1
  fi
}

# Phase 2: Prerequisites installation
# Install Docker, firewall, fail2ban via prereq-lib.sh
phase_prerequisites() {
  step "Installing prerequisites..."

  # This calls the master function from prereq-lib.sh
  if install_all_prerequisites; then
    success "Prerequisites installed"
    return 0
  else
    error "Prerequisites installation failed"
    return 1
  fi
}

# Phase 3: Interactive configuration
# Generate .env.production if missing
phase_configuration() {
  local env_file="${SCRIPT_DIR}/../.env.production"

  step "Checking configuration..."

  if [[ -f "$env_file" ]]; then
    success "Configuration exists: $env_file"
    echo "  Skipping interactive configuration"

    # Load DOMAIN if not already set
    if [[ -z "$DOMAIN" ]]; then
      DOMAIN=$(grep -E "^DOMAIN=" "$env_file" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    fi

    return 0
  fi

  step "Starting interactive configuration..."
  echo "  Configuration file not found: $env_file"
  echo ""

  # Run interactive configuration from config-lib.sh
  if run_interactive_configuration; then
    # Reload DOMAIN from newly created config
    DOMAIN=$(grep -E "^DOMAIN=" "$env_file" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    success "Configuration complete"
    return 0
  else
    error "Configuration failed"
    return 1
  fi
}

# Phase 4: Pull Docker images
# Same as deploy.sh STEP 2
phase_pull_images() {
  step "Pulling latest Docker images..."

  cd "${SCRIPT_DIR}/.."

  if docker compose -f docker-compose.yml -f compose.production.yaml pull; then
    success "Docker images pulled"
    return 0
  else
    warning "Some images may not have been pulled (continuing anyway)"
    return 0
  fi
}

# Phase 5: Build backend
# Same as deploy.sh STEP 3
phase_build_backend() {
  step "Building backend service..."

  cd "${SCRIPT_DIR}/.."

  if docker compose -f docker-compose.yml -f compose.production.yaml build backend; then
    success "Backend built successfully"
    return 0
  else
    error "Backend build failed"
    return 1
  fi
}

# Phase 6: Start database services
# Same as deploy.sh STEP 4 part 1
phase_database_start() {
  step "Starting database services..."

  cd "${SCRIPT_DIR}/.."

  if docker compose -f docker-compose.yml -f compose.production.yaml up -d postgres redis; then
    success "Database services started"
    return 0
  else
    error "Failed to start database services"
    return 1
  fi
}

# Phase 7: Run database migrations
# Same as deploy.sh STEP 4 part 2
phase_database_migrate() {
  step "Running database migrations..."

  cd "${SCRIPT_DIR}/.."

  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL to be ready..."
  local retries=30
  until docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres pg_isready -U postgres >/dev/null 2>&1 || [[ $retries -eq 0 ]]; do
    echo "Waiting for PostgreSQL... ($retries attempts remaining)"
    sleep 2
    retries=$((retries - 1))
  done

  if [[ $retries -eq 0 ]]; then
    error "PostgreSQL did not become ready in time"
    return 1
  fi
  success "PostgreSQL is ready"

  # Run migrations
  echo "Running migrations..."
  if docker compose -f docker-compose.yml -f compose.production.yaml run --rm backend pnpm db:migrate:prod; then
    success "Database migrations completed"
    return 0
  else
    error "Database migrations failed"
    return 1
  fi
}

# Phase 8: Start all services
# Same as deploy.sh STEP 5
phase_services_start() {
  step "Starting all services..."

  cd "${SCRIPT_DIR}/.."

  if docker compose -f docker-compose.yml -f compose.production.yaml up -d; then
    success "All services started"
    return 0
  else
    error "Failed to start services"
    return 1
  fi
}

# Phase 9: Wait for health
# Uses 3-consecutive-pass requirement from deploy-lib.sh
# Same as deploy.sh STEP 6
phase_health_wait() {
  step "Phase: Health Wait"
  echo "Waiting for all services to report healthy status..."
  echo ""

  # First, give services a moment to start
  echo "Allowing services 10 seconds to initialize..."
  sleep 10

  # Run the 3-consecutive-pass health check from deploy-lib.sh
  if ! wait_for_healthy_services; then
    error "Health wait phase failed"
    echo ""
    echo "The deployment has started but services are not healthy."
    echo "This checkpoint will be saved - you can resume after fixing the issue."
    return 1
  fi

  # Additional service checks (optional, informational)
  echo ""
  step "Verifying individual service status..."

  local services=("backend" "postgres" "redis")
  local all_healthy=true

  for service in "${services[@]}"; do
    if check_service_health "$service"; then
      success "$service: healthy"
    else
      warning "$service: not reporting healthy (may still be starting)"
      # Don't fail on individual service checks - the main health endpoint passed
    fi
  done

  echo ""
  success "Health wait phase complete"
  return 0
}

# Phase 10: Cleanup
# Same as deploy.sh STEP 8
phase_cleanup() {
  step "Cleaning up old images..."

  if docker image prune -f --filter "dangling=true" >/dev/null 2>&1; then
    success "Old images cleaned up"
  else
    warning "Image cleanup had issues (not critical)"
  fi

  return 0
}

# ===========================================
# Display Deployment Summary
# Shows service URLs and management commands after successful deployment
# ===========================================
display_deployment_summary() {
  local domain="${DOMAIN:-localhost}"

  echo ""
  echo -e "${GREEN}========================================"
  echo "       Deployment Complete!"
  echo "========================================${NC}"
  echo ""
  echo "Your FreshTrack Pro instance is ready!"
  echo ""
  echo -e "${BLUE}Service URLs:${NC}"
  if [[ "$domain" != "localhost" ]]; then
    echo "  Dashboard:    https://${domain}"
    echo "  API:          https://${domain}/api"
    echo "  Health:       https://${domain}/health"
    echo "  Monitoring:   https://monitoring.${domain}"
    echo "  Status Page:  https://status.${domain}"
  else
    echo "  Dashboard:    http://localhost:5173"
    echo "  API:          http://localhost:3000/api"
    echo "  Health:       http://localhost:3000/health"
  fi
  echo ""
  echo -e "${BLUE}Management Commands:${NC}"
  echo "  View logs:    docker compose logs -f"
  echo "  View status:  docker compose ps"
  echo "  Stop:         docker compose down"
  echo "  Restart:      docker compose restart"
  echo ""
  echo -e "${BLUE}Deployment State:${NC}"
  echo "  State file:   ${STATE_DIR}/.deployment-state"
  echo "  Redeploy:     ./scripts/deploy-orchestrated.sh --fresh"
  echo "  Resume:       ./scripts/deploy-orchestrated.sh --resume"
  echo ""
  echo "To rollback this deployment, run: ./scripts/rollback.sh"
  echo ""
}

# ===========================================
# Main Orchestration
# ===========================================
main() {
  echo "========================================"
  echo "FreshTrack Pro Deployment Orchestrator"
  echo "========================================"
  echo ""
  echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""

  # Handle --fresh flag
  if [[ "$FRESH" == "true" ]]; then
    echo "Starting fresh deployment (clearing previous state)..."
    clear_deployment_state
    echo ""
  fi

  # Show current status
  show_deployment_status

  # Get resume point
  local resume_point
  resume_point=$(get_resume_point)

  if [[ "$resume_point" == "complete" ]]; then
    echo ""
    success "Deployment already complete!"
    echo "Use --fresh to redeploy from scratch."
    echo ""
    display_deployment_summary
    exit 0
  fi

  echo ""
  if [[ "$resume_point" != "preflight" ]]; then
    echo "Resuming deployment from: $resume_point"
  else
    echo "Starting deployment from beginning..."
  fi
  echo ""

  # Run each phase with checkpoint tracking
  deployment_checkpoint "preflight" phase_preflight
  deployment_checkpoint "prerequisites" phase_prerequisites
  deployment_checkpoint "configuration" phase_configuration
  deployment_checkpoint "pull-images" phase_pull_images
  deployment_checkpoint "build-backend" phase_build_backend
  deployment_checkpoint "database-start" phase_database_start
  deployment_checkpoint "database-migrate" phase_database_migrate
  deployment_checkpoint "services-start" phase_services_start
  deployment_checkpoint "health-wait" phase_health_wait
  deployment_checkpoint "cleanup" phase_cleanup

  # Mark deployment complete
  set_deployment_state "complete" "completed"

  display_deployment_summary
}

# ===========================================
# Entry Point
# ===========================================
if [[ "$STATUS_ONLY" == "true" ]]; then
  echo "FreshTrack Pro Deployment Status"
  echo "================================="
  echo ""
  show_deployment_status
  exit 0
fi

main
