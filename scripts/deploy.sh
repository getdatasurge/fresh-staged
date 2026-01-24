#!/bin/bash
# FreshTrack Pro - Production Deployment Script
# Automates deployment with pre-flight checks, migrations, and health validation
# Usage: ./scripts/deploy.sh [--skip-checks] [--no-build]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
SKIP_CHECKS=false
NO_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --no-build)
            NO_BUILD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-checks] [--no-build]"
            exit 1
            ;;
    esac
done

# Helper functions
step() {
    echo ""
    echo -e "${BLUE}==>${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "========================================"
echo "FreshTrack Pro Production Deployment"
echo "========================================"
echo ""
echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ===========================================
# STEP 1: Pre-flight Checks
# ===========================================
if [ "$SKIP_CHECKS" = false ]; then
    step "STEP 1: Running pre-flight health checks..."
    if ./scripts/health-check.sh; then
        success "All pre-flight checks passed"
    else
        error "Pre-flight checks failed"
        echo ""
        echo "Fix the issues above or use --skip-checks to bypass (not recommended)"
        exit 1
    fi
else
    warning "STEP 1: Skipping pre-flight checks (--skip-checks flag)"
fi

# ===========================================
# STEP 2: Pull Latest Images
# ===========================================
step "STEP 2: Pulling latest images..."
if docker compose -f docker-compose.yml -f compose.production.yaml pull; then
    success "Latest images pulled"
else
    warning "Some images may not have been pulled (continuing anyway)"
fi

# ===========================================
# STEP 3: Build Backend
# ===========================================
if [ "$NO_BUILD" = false ]; then
    step "STEP 3: Building backend service..."
    if docker compose -f docker-compose.yml -f compose.production.yaml build backend; then
        success "Backend built successfully"
    else
        error "Backend build failed"
        exit 1
    fi
else
    warning "STEP 3: Skipping backend build (--no-build flag)"
fi

# ===========================================
# STEP 4: Run Database Migrations
# ===========================================
step "STEP 4: Running database migrations..."

# Start database services only
docker compose -f docker-compose.yml -f compose.production.yaml up -d postgres redis
success "Database services started"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 5

# Check PostgreSQL health
RETRIES=30
until docker compose -f docker-compose.yml -f compose.production.yaml exec -T postgres pg_isready -U postgres >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "Waiting for PostgreSQL... ($RETRIES attempts remaining)"
    sleep 2
    RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
    error "PostgreSQL did not become ready in time"
    exit 1
fi
success "PostgreSQL is ready"

# Run migrations via backend container
echo "Running migrations..."
if docker compose -f docker-compose.yml -f compose.production.yaml run --rm backend pnpm db:migrate:prod; then
    success "Database migrations completed"
else
    error "Database migrations failed"
    exit 1
fi

# ===========================================
# STEP 5: Deploy All Services
# ===========================================
step "STEP 5: Deploying all services..."
if docker compose -f docker-compose.yml -f compose.production.yaml up -d; then
    success "All services deployed"
else
    error "Service deployment failed"
    exit 1
fi

# ===========================================
# STEP 6: Wait for Health Checks
# ===========================================
step "STEP 6: Waiting for services to be healthy..."

# Wait for backend health
echo "Waiting for backend to be healthy..."
RETRIES=30
until curl -f http://localhost:3000/health >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "Waiting for backend health... ($RETRIES attempts remaining)"
    sleep 3
    RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
    error "Backend did not become healthy in time"
    echo ""
    echo "Check logs with: docker compose logs backend"
    exit 1
fi
success "Backend is healthy"

# ===========================================
# STEP 7: Verify Deployment
# ===========================================
step "STEP 7: Verifying deployment..."

# Check backend health endpoint
echo "Checking backend health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    success "Backend health check passed"
else
    warning "Backend health check returned unexpected response:"
    echo "$HEALTH_RESPONSE"
fi

# Check backend readiness endpoint
echo "Checking backend readiness endpoint..."
READY_RESPONSE=$(curl -s http://localhost:3000/health/ready)
if echo "$READY_RESPONSE" | grep -q '"database":"connected"'; then
    success "Backend readiness check passed"
else
    warning "Backend readiness check returned unexpected response:"
    echo "$READY_RESPONSE"
fi

# List running containers
echo ""
echo "Running containers:"
docker compose -f docker-compose.yml -f compose.production.yaml ps

# ===========================================
# STEP 8: Cleanup Old Images
# ===========================================
step "STEP 8: Cleaning up old images..."
if docker image prune -f --filter "dangling=true"; then
    success "Old images cleaned up"
else
    warning "Image cleanup had issues (not critical)"
fi

# ===========================================
# Deployment Complete
# ===========================================
echo ""
echo "========================================"
echo -e "${GREEN}Deployment Complete${NC}"
echo "========================================"
echo ""
echo "End time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "Next steps:"
echo "  1. Monitor logs: docker compose logs -f backend"
echo "  2. View all logs: docker compose logs -f"
echo "  3. Check service status: docker compose ps"
echo "  4. View health: curl http://localhost:3000/health"
echo ""
echo "To rollback this deployment, run: ./scripts/rollback.sh"
echo ""
