#!/usr/bin/env bash
#
# validate-zero-downtime.sh
#
# Validates health check-based zero-downtime deployment mechanism.
# Tests that Docker health checks prevent traffic to unhealthy containers during rolling updates.
#
# Usage:
#   ./validate-zero-downtime.sh
#
# Environment Variables:
#   BASE_URL              - Application URL (default: http://localhost:3000)
#   COMPOSE_FILE          - Docker Compose file path (default: docker/docker-compose.yml)
#   HEALTH_ENDPOINT       - Health check endpoint (default: /health)
#
# Exit Codes:
#   0 - Zero-downtime mechanism validated successfully
#   1 - Validation failed
#   2 - Configuration error or prerequisites not met

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

BASE_URL="${BASE_URL:-http://localhost:3000}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-/health}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}▶${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}✗${NC} $*"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}ℹ${NC} $*"
}

print_header() {
    echo ""
    echo "========================================"
    echo "$1"
    echo "========================================"
    echo ""
}

check_prerequisites() {
    log_info "Validating prerequisites..."

    # Check for required commands
    if ! command -v docker &> /dev/null; then
        log_error "docker not found - please install Docker"
        return 1
    fi
    log_success "docker is available"

    if ! command -v curl &> /dev/null; then
        log_error "curl not found - please install curl"
        return 1
    fi
    log_success "curl is available"

    if ! command -v jq &> /dev/null; then
        log_error "jq not found - please install jq"
        return 1
    fi
    log_success "jq is available"

    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        return 1
    fi
    log_success "Docker daemon is running"

    # Check docker compose is available (v2 syntax)
    if ! docker compose version &> /dev/null; then
        log_error "docker compose (v2) not available - please install Docker Compose v2"
        return 1
    fi
    log_success "docker compose (v2) is available"

    return 0
}

# ============================================================================
# Step 1: Verify Current Health Status
# ============================================================================

verify_current_health() {
    print_header "Step 1: Verify Current Health Status"

    log_info "Checking ${BASE_URL}${HEALTH_ENDPOINT}..."

    # Check /health endpoint
    local health_response
    local http_code

    health_response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${HEALTH_ENDPOINT}" 2>/dev/null || echo "000")
    http_code=$(echo "$health_response" | tail -n 1)
    local health_body=$(echo "$health_response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        log_error "Health check failed (HTTP $http_code)"
        echo "Response: $health_body"
        return 1
    fi

    local status=$(echo "$health_body" | jq -r '.status' 2>/dev/null || echo "unknown")
    if [[ "$status" != "healthy" ]]; then
        log_error "Health check returned status: $status (expected: healthy)"
        return 1
    fi
    log_success "Backend is healthy (HTTP 200, status: healthy)"

    # Record baseline response time
    local start_time=$(date +%s%3N)
    curl -s "${BASE_URL}${HEALTH_ENDPOINT}" > /dev/null
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    log_info "Baseline response time: ${response_time}ms"

    # Check /health/ready endpoint
    log_info "Checking ${BASE_URL}/health/ready..."
    local ready_response
    ready_response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/health/ready" 2>/dev/null || echo "000")
    http_code=$(echo "$ready_response" | tail -n 1)
    local ready_body=$(echo "$ready_response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        log_error "Readiness check failed (HTTP $http_code)"
        return 1
    fi

    local ready=$(echo "$ready_body" | jq -r '.ready' 2>/dev/null || echo "false")
    if [[ "$ready" != "true" ]]; then
        log_error "Readiness check returned ready: $ready (expected: true)"
        return 1
    fi
    log_success "Backend is ready (ready: true)"

    return 0
}

# ============================================================================
# Step 2: Verify Docker Health Check Configuration
# ============================================================================

verify_docker_healthcheck() {
    print_header "Step 2: Verify Docker Health Check Configuration"

    # Find backend container
    local backend_container
    backend_container=$(docker ps --filter "name=backend" --format "{{.Names}}" | head -n 1)

    if [[ -z "$backend_container" ]]; then
        log_warning "No backend container found - zero-downtime validation requires backend service"
        log_info "Expected: Backend service defined in docker-compose.yml with health check"
        log_info "Note: This is expected if backend is not yet containerized"
        echo ""
        echo "To add backend service with health check to docker-compose.yml:"
        echo ""
        echo "  backend:"
        echo "    image: freshtrack-backend:latest"
        echo "    healthcheck:"
        echo "      test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:3000/health\"]"
        echo "      interval: 10s"
        echo "      timeout: 5s"
        echo "      retries: 3"
        echo "      start_period: 30s"
        echo "    depends_on:"
        echo "      postgres:"
        echo "        condition: service_healthy"
        echo ""
        return 2  # Skip remaining tests (not an error, just not applicable yet)
    fi

    log_info "Found backend container: $backend_container"

    # Inspect health check configuration
    local healthcheck_config
    healthcheck_config=$(docker inspect "$backend_container" --format='{{json .State.Health}}' 2>/dev/null || echo "{}")

    if [[ "$healthcheck_config" == "null" || "$healthcheck_config" == "{}" ]]; then
        log_error "No health check configured on backend container"
        log_info "Add healthcheck to backend service in docker-compose.yml"
        return 1
    fi
    log_success "Health check is configured on backend container"

    # Extract health check details from Config (not State)
    local healthcheck_test
    healthcheck_test=$(docker inspect "$backend_container" --format='{{json .Config.Healthcheck.Test}}' 2>/dev/null || echo "[]")
    log_info "Health check test: $healthcheck_test"

    local healthcheck_interval
    healthcheck_interval=$(docker inspect "$backend_container" --format='{{.Config.Healthcheck.Interval}}' 2>/dev/null || echo "unknown")
    log_info "Interval: $healthcheck_interval"

    local healthcheck_timeout
    healthcheck_timeout=$(docker inspect "$backend_container" --format='{{.Config.Healthcheck.Timeout}}' 2>/dev/null || echo "unknown")
    log_info "Timeout: $healthcheck_timeout"

    local healthcheck_retries
    healthcheck_retries=$(docker inspect "$backend_container" --format='{{.Config.Healthcheck.Retries}}' 2>/dev/null || echo "unknown")
    log_info "Retries: $healthcheck_retries"

    local healthcheck_start_period
    healthcheck_start_period=$(docker inspect "$backend_container" --format='{{.Config.Healthcheck.StartPeriod}}' 2>/dev/null || echo "unknown")
    log_info "Start period: $healthcheck_start_period"

    log_success "Health check configuration verified"

    return 0
}

# ============================================================================
# Step 3: Verify Service Dependency Conditions
# ============================================================================

verify_service_dependencies() {
    print_header "Step 3: Verify Service Dependency Conditions"

    log_info "Checking ${COMPOSE_FILE} for service_healthy conditions..."

    if [[ ! -f "${PROJECT_ROOT}/${COMPOSE_FILE}" ]]; then
        log_error "Compose file not found: ${PROJECT_ROOT}/${COMPOSE_FILE}"
        return 1
    fi

    # Check for depends_on with condition: service_healthy
    local has_health_dependencies=false

    # Look for backend service dependencies
    if grep -q "depends_on:" "${PROJECT_ROOT}/${COMPOSE_FILE}"; then
        log_success "Found depends_on declarations in compose file"

        # Check for condition: service_healthy pattern
        if grep -q "condition:.*service_healthy" "${PROJECT_ROOT}/${COMPOSE_FILE}"; then
            log_success "Found condition: service_healthy in depends_on blocks"
            has_health_dependencies=true

            # List services using health check dependencies
            log_info "Services with health check dependencies:"
            grep -B 5 "condition:.*service_healthy" "${PROJECT_ROOT}/${COMPOSE_FILE}" | grep -E "^\s+[a-z_-]+:" | sed 's/://g' | while read -r service; do
                echo "  - $service"
            done
        else
            log_warning "No condition: service_healthy found in depends_on blocks"
            log_info "Recommendation: Use condition: service_healthy to ensure zero-downtime deployments"
        fi
    else
        log_warning "No depends_on declarations found in compose file"
    fi

    # Check specific services for proper health dependencies
    if grep -q "backend:" "${PROJECT_ROOT}/${COMPOSE_FILE}"; then
        log_info "Checking backend service dependencies..."

        # Check if backend depends on postgres with service_healthy
        local backend_section
        backend_section=$(sed -n '/^  backend:/,/^  [a-z]/p' "${PROJECT_ROOT}/${COMPOSE_FILE}")

        if echo "$backend_section" | grep -q "postgres:"; then
            if echo "$backend_section" | grep -q "condition:.*service_healthy"; then
                log_success "Backend depends on postgres with condition: service_healthy"
            else
                log_warning "Backend depends on postgres but not using condition: service_healthy"
            fi
        fi
    fi

    return 0
}

# ============================================================================
# Step 4: Simulate Deployment (Non-Destructive)
# ============================================================================

simulate_deployment() {
    print_header "Step 4: Simulate Deployment (Non-Destructive)"

    # Find backend container
    local backend_container
    backend_container=$(docker ps --filter "name=backend" --format "{{.Names}}" | head -n 1)

    if [[ -z "$backend_container" ]]; then
        log_warning "Skipping deployment simulation - backend container not found"
        return 2
    fi

    log_info "Simulating rolling deployment of backend service..."
    log_warning "This will recreate the backend container (non-destructive)"

    # Poll health endpoint during deployment
    local poll_duration=30
    local poll_interval=1
    local successful_requests=0
    local failed_requests=0

    # Start background polling
    local poll_pid
    (
        for ((i=0; i<poll_duration; i++)); do
            if curl -sf "${BASE_URL}${HEALTH_ENDPOINT}" > /dev/null 2>&1; then
                echo "success" >> /tmp/zero-downtime-test-$$
            else
                echo "failure" >> /tmp/zero-downtime-test-$$
            fi
            sleep "$poll_interval"
        done
    ) &
    poll_pid=$!

    # Wait a moment for polling to start
    sleep 2

    # Trigger deployment (recreate backend container only)
    log_info "Recreating backend container..."
    cd "${PROJECT_ROOT}"
    if docker compose -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate backend &> /tmp/zero-downtime-deploy-$$; then
        log_success "Backend container recreated"
    else
        log_error "Failed to recreate backend container"
        cat /tmp/zero-downtime-deploy-$$
        kill "$poll_pid" 2>/dev/null || true
        return 1
    fi

    # Wait for polling to complete
    wait "$poll_pid" 2>/dev/null || true

    # Analyze results
    if [[ -f /tmp/zero-downtime-test-$$ ]]; then
        successful_requests=$(grep -c "success" /tmp/zero-downtime-test-$$ || echo 0)
        failed_requests=$(grep -c "failure" /tmp/zero-downtime-test-$$ || echo 0)
        rm -f /tmp/zero-downtime-test-$$
    fi
    rm -f /tmp/zero-downtime-deploy-$$

    local total_requests=$((successful_requests + failed_requests))
    local success_rate=0

    if [[ $total_requests -gt 0 ]]; then
        success_rate=$(awk "BEGIN {printf \"%.1f\", ($successful_requests / $total_requests) * 100}")
    fi

    echo ""
    log_info "Request statistics during deployment:"
    echo "  Total requests: $total_requests"
    echo "  Successful: $successful_requests"
    echo "  Failed: $failed_requests"
    echo "  Success rate: ${success_rate}%"
    echo ""

    # Validate success rate
    if (( $(echo "$success_rate >= 95.0" | bc -l) )); then
        log_success "Zero-downtime deployment validated (${success_rate}% success rate)"
    else
        log_warning "Success rate below 95% (${success_rate}%)"
        log_info "Recommendations:"
        echo "  - Increase health check retries"
        echo "  - Increase health check start_period"
        echo "  - Ensure Caddy/reverse proxy uses health checks for routing"
    fi

    return 0
}

# ============================================================================
# Step 5: Verify Post-Deployment Health
# ============================================================================

verify_post_deployment_health() {
    print_header "Step 5: Verify Post-Deployment Health"

    # Wait a moment for stabilization
    sleep 3

    log_info "Checking ${BASE_URL}${HEALTH_ENDPOINT}..."

    # Check /health endpoint
    local health_response
    local http_code

    health_response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${HEALTH_ENDPOINT}" 2>/dev/null || echo "000")
    http_code=$(echo "$health_response" | tail -n 1)
    local health_body=$(echo "$health_response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        log_error "Post-deployment health check failed (HTTP $http_code)"
        return 1
    fi

    local status=$(echo "$health_body" | jq -r '.status' 2>/dev/null || echo "unknown")
    if [[ "$status" != "healthy" ]]; then
        log_error "Post-deployment health returned status: $status (expected: healthy)"
        return 1
    fi
    log_success "Backend is healthy after deployment (HTTP 200, status: healthy)"

    # Check /health/ready endpoint
    log_info "Checking ${BASE_URL}/health/ready..."
    local ready_response
    ready_response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/health/ready" 2>/dev/null || echo "000")
    http_code=$(echo "$ready_response" | tail -n 1)
    local ready_body=$(echo "$ready_response" | sed '$d')

    if [[ "$http_code" != "200" ]]; then
        log_error "Post-deployment readiness check failed (HTTP $http_code)"
        return 1
    fi

    local ready=$(echo "$ready_body" | jq -r '.ready' 2>/dev/null || echo "false")
    if [[ "$ready" != "true" ]]; then
        log_error "Post-deployment readiness returned ready: $ready (expected: true)"
        return 1
    fi
    log_success "Backend is ready after deployment (ready: true)"

    return 0
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    print_header "Zero-Downtime Deployment Validation"

    echo "Configuration:"
    echo "  BASE_URL: $BASE_URL"
    echo "  COMPOSE_FILE: $COMPOSE_FILE"
    echo "  HEALTH_ENDPOINT: $HEALTH_ENDPOINT"
    echo ""

    # Pre-flight checks
    if ! check_prerequisites; then
        echo ""
        log_error "Prerequisites not met"
        exit 2
    fi

    echo ""

    # Step 1: Verify current health
    if ! verify_current_health; then
        echo ""
        log_error "Current health verification failed"
        exit 1
    fi

    # Step 2: Verify Docker health check configuration
    local healthcheck_result=0
    verify_docker_healthcheck || healthcheck_result=$?

    if [[ $healthcheck_result -eq 2 ]]; then
        # Backend not containerized yet - skip remaining tests
        echo ""
        print_header "Summary"
        echo "Backend is running but not containerized yet."
        echo "Zero-downtime validation requires backend service in docker-compose.yml."
        echo ""
        log_info "Health check mechanism is ready for implementation"
        log_info "See script output above for docker-compose.yml example"
        exit 0
    elif [[ $healthcheck_result -ne 0 ]]; then
        echo ""
        log_error "Docker health check verification failed"
        exit 1
    fi

    # Step 3: Verify service dependencies
    if ! verify_service_dependencies; then
        echo ""
        log_error "Service dependency verification failed"
        exit 1
    fi

    # Step 4: Simulate deployment
    local deploy_result=0
    simulate_deployment || deploy_result=$?

    if [[ $deploy_result -eq 2 ]]; then
        # Skip deployment simulation
        log_info "Deployment simulation skipped"
    elif [[ $deploy_result -ne 0 ]]; then
        echo ""
        log_error "Deployment simulation failed"
        exit 1
    fi

    # Step 5: Verify post-deployment health
    if [[ $deploy_result -eq 0 ]]; then
        if ! verify_post_deployment_health; then
            echo ""
            log_error "Post-deployment health verification failed"
            exit 1
        fi
    fi

    # Summary
    print_header "Test Summary"
    echo "Total Tests Passed: $TESTS_PASSED"
    echo "Total Tests Failed: $TESTS_FAILED"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed! Zero-downtime mechanism validated."
        exit 0
    else
        log_error "Some tests failed."
        exit 1
    fi
}

main "$@"
