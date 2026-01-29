#!/usr/bin/env bash
# ===========================================
# FreshTrack Pro Deployment Library
# Deployment orchestration with checkpoint-based state tracking
# ===========================================
# Usage: source this file in deployment scripts
#   source "$(dirname "$0")/lib/deploy-lib.sh"
#
# Extends preflight-lib.sh checkpoint system for deployment-specific state tracking.
# Provides resume capability from any failure point.
#
# Functions provided:
#   - get_deployment_state()      Get current deployment state
#   - set_deployment_state()      Set deployment phase state
#   - deployment_checkpoint()     Run phase with state tracking
#   - get_resume_point()          Get first incomplete phase
#   - clear_deployment_state()    Clear all deployment state
#   - show_deployment_status()    Display deployment progress
# ===========================================

# Source preflight-lib.sh for error handling and checkpoint system
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/preflight-lib.sh"

LIB_VERSION="1.1.0"

# ===========================================
# Health Check Configuration
# ===========================================
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3000/health}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-5}"      # Seconds between checks
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-10}"       # Curl timeout per check
HEALTH_CHECK_MAX_ATTEMPTS="${HEALTH_CHECK_MAX_ATTEMPTS:-60}"  # Max attempts (5 min total)
HEALTH_CONSECUTIVE_REQUIRED="${HEALTH_CONSECUTIVE_REQUIRED:-3}"  # Consecutive passes needed

# ===========================================
# Deployment Phase Constants
# ===========================================
DEPLOY_PHASES=(
  "preflight"
  "prerequisites"
  "configuration"
  "pull-images"
  "build-backend"
  "database-start"
  "database-migrate"
  "services-start"
  "health-wait"
  "cleanup"
)

# ===========================================
# State File Paths
# ===========================================
# Uses STATE_DIR from preflight-lib.sh
DEPLOYMENT_STATE_FILE="${STATE_DIR}/.deployment-state"
DEPLOYMENT_STATUS_FILE="${STATE_DIR}/.deployment-status"

# ===========================================
# Deployment State Functions
# ===========================================

# Get current deployment state
# Returns: "phase:status:timestamp" or "none:not-started:0" if no state file
get_deployment_state() {
  ensure_state_dir
  if [[ -f "$DEPLOYMENT_STATE_FILE" ]]; then
    cat "$DEPLOYMENT_STATE_FILE"
  else
    echo "none:not-started:0"
  fi
}

# Set deployment state
# Args: $1=phase, $2=status (running|completed|failed)
# Writes state file with ISO timestamp
set_deployment_state() {
  local phase="$1"
  local status="$2"
  local timestamp
  timestamp=$(date -Iseconds)

  ensure_state_dir

  # Write machine-readable state file
  echo "${phase}:${status}:${timestamp}" > "$DEPLOYMENT_STATE_FILE"

  # Write human-readable status file for debugging
  {
    echo "FreshTrack Pro Deployment Status"
    echo "================================="
    echo "Phase:     $phase"
    echo "Status:    $status"
    echo "Timestamp: $timestamp"
    echo ""
    echo "State file: $DEPLOYMENT_STATE_FILE"
  } > "$DEPLOYMENT_STATUS_FILE"
}

# Run deployment phase with checkpoint tracking
# Args: $1=phase_name, $2=function_to_run
# Wraps run_step() with deployment state tracking
deployment_checkpoint() {
  local phase_name="$1"
  local phase_func="$2"

  # Check if phase already completed (inherited from run_step via checkpoint system)
  if checkpoint_done "deploy-${phase_name}"; then
    local completed_at
    completed_at=$(checkpoint_time "deploy-${phase_name}")
    echo "[SKIP] ${phase_name} (completed at: ${completed_at})"
    return 0
  fi

  # Mark phase as running
  set_deployment_state "$phase_name" "running"

  # Run the phase function via run_step for checkpoint tracking
  if run_step "deploy-${phase_name}" "$phase_func"; then
    # Mark phase as completed
    set_deployment_state "$phase_name" "completed"
    return 0
  else
    local exit_code=$?
    # Mark phase as failed and save error context
    set_deployment_state "$phase_name" "failed"

    # Save additional error context
    {
      echo "phase=$phase_name"
      echo "function=$phase_func"
      echo "exit_code=$exit_code"
      echo "timestamp=$(date -Iseconds)"
    } >> "${STATE_DIR}/.deployment-error"

    return $exit_code
  fi
}

# Get resume point (first incomplete phase)
# Returns: phase name or "complete" if all done
get_resume_point() {
  ensure_state_dir

  for phase in "${DEPLOY_PHASES[@]}"; do
    if ! checkpoint_done "deploy-${phase}"; then
      echo "$phase"
      return 0
    fi
  done

  echo "complete"
}

# Clear all deployment state
# Removes deployment state files and clears deployment checkpoints
clear_deployment_state() {
  ensure_state_dir

  # Clear deployment-specific checkpoints
  for phase in "${DEPLOY_PHASES[@]}"; do
    checkpoint_clear "deploy-${phase}"
  done

  # Remove deployment state files
  rm -f "$DEPLOYMENT_STATE_FILE"
  rm -f "$DEPLOYMENT_STATUS_FILE"
  rm -f "${STATE_DIR}/.deployment-error"

  success "Deployment state cleared"
}

# Show deployment status with colored output
# Displays progress through deployment phases
show_deployment_status() {
  ensure_state_dir

  echo ""
  echo -e "${BLUE}Deployment Status${NC}"
  echo "========================================"

  local current_phase
  current_phase=$(get_resume_point)

  local all_complete=true
  local found_current=false

  for phase in "${DEPLOY_PHASES[@]}"; do
    local status_char status_color

    if checkpoint_done "deploy-${phase}"; then
      # Completed phase (green checkmark)
      status_char="[OK]"
      status_color="${GREEN}"
    elif [[ "$phase" == "$current_phase" ]]; then
      # Current phase (yellow arrow)
      status_char="[>>]"
      status_color="${YELLOW}"
      found_current=true
      all_complete=false
    else
      # Pending phase (dim)
      status_char="[  ]"
      status_color="${NC}"
      all_complete=false
    fi

    echo -e "${status_color}${status_char}${NC} ${phase}"
  done

  echo "========================================"

  if [[ "$all_complete" == "true" ]]; then
    echo -e "${GREEN}Status: All phases complete${NC}"
  elif [[ "$current_phase" == "none" ]] || [[ -z "$current_phase" ]]; then
    echo "Status: Not started"
  else
    echo -e "Status: Resume at ${YELLOW}${current_phase}${NC}"
  fi

  echo ""
}

# ===========================================
# Health Check Functions
# ===========================================

# Check if a specific service container is healthy
# Args: $1 = service name (e.g., "backend", "postgres")
# Returns: 0 if healthy, 1 if not
check_service_health() {
  local service="$1"
  local status

  status=$(docker compose -f docker-compose.yml -f compose.production.yaml ps --format json "$service" 2>/dev/null | jq -r '.[0].Health // "none"' 2>/dev/null) || status="unknown"

  case "$status" in
    healthy)
      return 0
      ;;
    starting)
      return 1
      ;;
    unhealthy|none|unknown)
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

# Wait for all services to be healthy with 3-consecutive-pass requirement
# Returns: 0 when healthy, 1 on timeout
# Satisfies: DEPLOY-05
wait_for_healthy_services() {
  local consecutive_passes=0
  local total_attempts=0
  local last_response=""

  step "Waiting for services to be healthy..."
  echo "  Checking: $HEALTH_CHECK_URL"
  echo "  Requirement: $HEALTH_CONSECUTIVE_REQUIRED consecutive passes"
  echo "  Max attempts: $HEALTH_CHECK_MAX_ATTEMPTS ($(( HEALTH_CHECK_MAX_ATTEMPTS * HEALTH_CHECK_INTERVAL / 60 )) minutes)"
  echo ""

  while [[ $total_attempts -lt $HEALTH_CHECK_MAX_ATTEMPTS ]]; do
    total_attempts=$((total_attempts + 1))

    # Attempt health check
    local http_code
    local response
    response=$(curl -s --max-time "$HEALTH_CHECK_TIMEOUT" "$HEALTH_CHECK_URL" 2>/dev/null) || response=""
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$HEALTH_CHECK_TIMEOUT" "$HEALTH_CHECK_URL" 2>/dev/null) || http_code="000"

    # Check for healthy response
    if [[ "$http_code" == "200" ]] && echo "$response" | grep -q '"status":"healthy"'; then
      consecutive_passes=$((consecutive_passes + 1))
      echo -e "  [${GREEN}PASS${NC}] Attempt $total_attempts: HTTP $http_code - consecutive: $consecutive_passes/$HEALTH_CONSECUTIVE_REQUIRED"

      if [[ $consecutive_passes -ge $HEALTH_CONSECUTIVE_REQUIRED ]]; then
        echo ""
        success "Services healthy after $consecutive_passes consecutive passes!"
        return 0
      fi
    else
      # Reset consecutive counter on failure
      if [[ $consecutive_passes -gt 0 ]]; then
        warning "Consecutive pass streak reset (was $consecutive_passes)"
      fi
      consecutive_passes=0

      if [[ "$http_code" == "000" ]]; then
        echo -e "  [${RED}FAIL${NC}] Attempt $total_attempts: Connection failed"
      else
        echo -e "  [${RED}FAIL${NC}] Attempt $total_attempts: HTTP $http_code"
      fi
    fi

    # Wait before next attempt
    sleep "$HEALTH_CHECK_INTERVAL"
  done

  # Timeout reached
  echo ""
  error "Health check timeout after $total_attempts attempts"
  echo ""
  echo "Services did not achieve $HEALTH_CONSECUTIVE_REQUIRED consecutive healthy responses."
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check backend logs: docker compose logs backend"
  echo "  2. Check service status: docker compose ps"
  echo "  3. Test health endpoint: curl -v $HEALTH_CHECK_URL"
  echo ""
  return 1
}

# ===========================================
# Self-test when run directly
# ===========================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Testing deploy-lib.sh v${LIB_VERSION}..."
  echo ""

  # Use temp state dir for tests
  original_state_dir="$STATE_DIR"
  export STATE_DIR=$(mktemp -d)
  DEPLOYMENT_STATE_FILE="${STATE_DIR}/.deployment-state"
  DEPLOYMENT_STATUS_FILE="${STATE_DIR}/.deployment-status"

  # Test 1: State file creation/reading
  echo "Testing state file creation..."
  set_deployment_state "preflight" "running"

  if [[ -f "$DEPLOYMENT_STATE_FILE" ]]; then
    state_content=$(cat "$DEPLOYMENT_STATE_FILE")
    if [[ "$state_content" == preflight:running:* ]]; then
      echo "PASS: State file contains 'preflight:running'"
    else
      echo "FAIL: State file should contain 'preflight:running', got: $state_content"
      rm -rf "$STATE_DIR"
      exit 1
    fi
  else
    echo "FAIL: State file not created"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  # Verify get_deployment_state reads correctly
  current_state=$(get_deployment_state)
  if [[ "$current_state" == preflight:running:* ]]; then
    echo "PASS: get_deployment_state returns correct state"
  else
    echo "FAIL: get_deployment_state returned: $current_state"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Test 2: Phase progression and get_resume_point
  echo "Testing get_resume_point..."

  # Clear and start fresh
  clear_deployment_state >/dev/null

  # Initially should return first phase
  resume_point=$(get_resume_point)
  if [[ "$resume_point" == "preflight" ]]; then
    echo "PASS: Initial resume point is 'preflight'"
  else
    echo "FAIL: Initial resume point should be 'preflight', got: $resume_point"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  # Mark preflight as complete
  checkpoint_set "deploy-preflight"
  set_deployment_state "preflight" "completed"

  # Now should return second phase
  resume_point=$(get_resume_point)
  if [[ "$resume_point" == "prerequisites" ]]; then
    echo "PASS: After preflight complete, resume point is 'prerequisites'"
  else
    echo "FAIL: Resume point should be 'prerequisites', got: $resume_point"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  # Mark multiple phases complete
  checkpoint_set "deploy-prerequisites"
  checkpoint_set "deploy-configuration"
  checkpoint_set "deploy-pull-images"

  resume_point=$(get_resume_point)
  if [[ "$resume_point" == "build-backend" ]]; then
    echo "PASS: After 4 phases complete, resume point is 'build-backend'"
  else
    echo "FAIL: Resume point should be 'build-backend', got: $resume_point"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Test 3: All phases complete
  echo "Testing all-phases-complete detection..."
  for phase in "${DEPLOY_PHASES[@]}"; do
    checkpoint_set "deploy-${phase}"
  done

  resume_point=$(get_resume_point)
  if [[ "$resume_point" == "complete" ]]; then
    echo "PASS: All phases complete returns 'complete'"
  else
    echo "FAIL: Should return 'complete' when all done, got: $resume_point"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Test 4: Clear deployment state
  echo "Testing clear_deployment_state..."
  clear_deployment_state >/dev/null

  if [[ -f "$DEPLOYMENT_STATE_FILE" ]]; then
    echo "FAIL: .deployment-state should be removed"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  resume_point=$(get_resume_point)
  if [[ "$resume_point" == "preflight" ]]; then
    echo "PASS: After clear, resume point is back to 'preflight'"
  else
    echo "FAIL: After clear, resume should be 'preflight', got: $resume_point"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Test 5: Show deployment status (visual check)
  echo "Testing show_deployment_status..."
  checkpoint_set "deploy-preflight"
  checkpoint_set "deploy-prerequisites"
  show_deployment_status
  echo "PASS: show_deployment_status runs without error"
  echo ""

  # Test 6: Verify DEPLOY_PHASES array
  echo "Testing DEPLOY_PHASES array..."
  if [[ ${#DEPLOY_PHASES[@]} -eq 10 ]]; then
    echo "PASS: DEPLOY_PHASES has 10 phases"
  else
    echo "FAIL: DEPLOY_PHASES should have 10 phases, got ${#DEPLOY_PHASES[@]}"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  if [[ "${DEPLOY_PHASES[0]}" == "preflight" ]] && [[ "${DEPLOY_PHASES[9]}" == "cleanup" ]]; then
    echo "PASS: DEPLOY_PHASES starts with 'preflight' and ends with 'cleanup'"
  else
    echo "FAIL: DEPLOY_PHASES order incorrect"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Test 7: Health check configuration defaults
  echo "Testing health check configuration defaults..."
  if [[ "$HEALTH_CONSECUTIVE_REQUIRED" == "3" ]]; then
    echo "PASS: HEALTH_CONSECUTIVE_REQUIRED defaults to 3"
  else
    echo "FAIL: HEALTH_CONSECUTIVE_REQUIRED should default to 3, got: $HEALTH_CONSECUTIVE_REQUIRED"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  if [[ "$HEALTH_CHECK_INTERVAL" == "5" ]]; then
    echo "PASS: HEALTH_CHECK_INTERVAL defaults to 5"
  else
    echo "FAIL: HEALTH_CHECK_INTERVAL should default to 5, got: $HEALTH_CHECK_INTERVAL"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  if [[ "$HEALTH_CHECK_URL" == "http://localhost:3000/health" ]]; then
    echo "PASS: HEALTH_CHECK_URL defaults to http://localhost:3000/health"
  else
    echo "FAIL: HEALTH_CHECK_URL should default to http://localhost:3000/health, got: $HEALTH_CHECK_URL"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Test 8: Health function definitions
  echo "Testing health function definitions..."
  if type wait_for_healthy_services &>/dev/null; then
    echo "PASS: wait_for_healthy_services function is defined"
  else
    echo "FAIL: wait_for_healthy_services function not defined"
    rm -rf "$STATE_DIR"
    exit 1
  fi

  if type check_service_health &>/dev/null; then
    echo "PASS: check_service_health function is defined"
  else
    echo "FAIL: check_service_health function not defined"
    rm -rf "$STATE_DIR"
    exit 1
  fi
  echo ""

  # Cleanup
  rm -rf "$STATE_DIR"
  export STATE_DIR="$original_state_dir"

  echo "========================================"
  echo "All deploy-lib.sh tests passed!"
  echo "========================================"
fi
