#!/bin/bash
# FreshTrack Pro - Pre-flight Health Check Script
# Validates system readiness before deployment
# Exit codes: 0 = all checks passed, 1 = one or more checks failed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counters
CHECKS_PASSED=0
CHECKS_FAILED=0

# Helper functions
check_passed() {
    echo -e "${GREEN}✓${NC} $1"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

check_failed() {
    echo -e "${RED}✗${NC} $1"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

check_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "========================================"
echo "FreshTrack Pro Pre-flight Health Check"
echo "========================================"
echo ""

# ===========================================
# Check 1: Disk Space
# ===========================================
echo "1. Checking disk space..."
AVAILABLE_GB=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
MIN_REQUIRED_GB=5

if [ "$AVAILABLE_GB" -ge "$MIN_REQUIRED_GB" ]; then
    check_passed "Disk space: ${AVAILABLE_GB}GB available (minimum: ${MIN_REQUIRED_GB}GB)"
else
    check_failed "Insufficient disk space: ${AVAILABLE_GB}GB available (minimum: ${MIN_REQUIRED_GB}GB required)"
fi

# ===========================================
# Check 2: Docker Running
# ===========================================
echo "2. Checking Docker daemon..."
if docker info >/dev/null 2>&1; then
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}')
    check_passed "Docker daemon running (version: ${DOCKER_VERSION})"
else
    check_failed "Docker daemon not running or not accessible"
fi

# ===========================================
# Check 3: Docker Compose Available
# ===========================================
echo "3. Checking Docker Compose..."
if docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version --short)
    check_passed "Docker Compose available (version: ${COMPOSE_VERSION})"
else
    check_failed "Docker Compose not available"
fi

# ===========================================
# Check 4: Compose Files Exist
# ===========================================
echo "4. Checking Compose files..."
COMPOSE_FILES_OK=true

if [ -f "docker-compose.yml" ]; then
    check_passed "Base compose file exists: docker-compose.yml"
else
    check_failed "Missing base compose file: docker-compose.yml"
    COMPOSE_FILES_OK=false
fi

if [ -f "compose.production.yaml" ]; then
    check_passed "Production override exists: compose.production.yaml"
else
    check_failed "Missing production override: compose.production.yaml"
    COMPOSE_FILES_OK=false
fi

# ===========================================
# Check 5: Secrets Directory and Files
# ===========================================
echo "5. Checking secrets..."
SECRETS_OK=true

if [ -d "secrets" ]; then
    check_passed "Secrets directory exists"

    # Check required secret files
    REQUIRED_SECRETS=(
        "postgres_password.txt"
        "jwt_secret.txt"
        "stack_auth_secret.txt"
        "minio_user.txt"
        "minio_password.txt"
    )

    for secret in "${REQUIRED_SECRETS[@]}"; do
        if [ -f "secrets/$secret" ]; then
            # Check that file is not empty
            if [ -s "secrets/$secret" ]; then
                check_passed "Secret file exists and not empty: $secret"
            else
                check_failed "Secret file exists but is empty: $secret"
                SECRETS_OK=false
            fi
        else
            check_failed "Missing secret file: $secret"
            SECRETS_OK=false
        fi
    done
else
    check_failed "Secrets directory does not exist"
    SECRETS_OK=false
fi

# ===========================================
# Check 6: Compose Config Validation
# ===========================================
echo "6. Validating Docker Compose configuration..."
if [ "$COMPOSE_FILES_OK" = true ]; then
    if docker compose -f docker-compose.yml -f compose.production.yaml config >/dev/null 2>&1; then
        check_passed "Docker Compose configuration is valid"
    else
        check_failed "Docker Compose configuration has errors"
        echo "Run: docker compose -f docker-compose.yml -f compose.production.yaml config"
    fi
else
    check_warning "Skipping config validation (compose files missing)"
fi

# ===========================================
# Check 7: Port Availability
# ===========================================
echo "7. Checking port availability..."
REQUIRED_PORTS=(
    "3000:Backend API"
    "5432:PostgreSQL"
    "6379:Redis"
    "9000:MinIO"
    "9001:MinIO Console"
)

for port_desc in "${REQUIRED_PORTS[@]}"; do
    PORT="${port_desc%%:*}"
    DESC="${port_desc#*:}"

    # Check if port is in use (localhost binding)
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        check_warning "Port $PORT ($DESC) is already in use - may be from existing deployment"
    else
        check_passed "Port $PORT ($DESC) is available"
    fi
done

# ===========================================
# Check 8: Environment Configuration
# ===========================================
echo "8. Checking environment configuration..."
if [ -f ".env.production" ]; then
    check_passed "Production environment file exists: .env.production"

    # Check for critical env vars
    REQUIRED_ENV_VARS=(
        "DATABASE_URL"
        "REDIS_URL"
        "STACK_AUTH_PROJECT_ID"
        "STACK_AUTH_PUBLISHABLE_CLIENT_KEY"
    )

    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if grep -q "^${var}=" .env.production 2>/dev/null; then
            check_passed "Environment variable defined: $var"
        else
            check_warning "Environment variable missing or commented: $var"
        fi
    done
else
    check_warning "Production environment file not found: .env.production"
    echo "          Consider copying from .env.production.example"
fi

# ===========================================
# Summary
# ===========================================
echo ""
echo "========================================"
echo "Health Check Summary"
echo "========================================"
echo -e "${GREEN}Passed:${NC} $CHECKS_PASSED"
echo -e "${RED}Failed:${NC} $CHECKS_FAILED"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed - system ready for deployment${NC}"
    exit 0
else
    echo -e "${RED}✗ ${CHECKS_FAILED} check(s) failed - resolve issues before deployment${NC}"
    exit 1
fi
