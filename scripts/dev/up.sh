#!/usr/bin/env bash
# Start FrostGuard development services
# Usage: ./scripts/dev/up.sh [--admin]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

echo "🚀 Starting FrostGuard development services..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check for admin flag
PROFILES=""
if [[ "${1:-}" == "--admin" ]]; then
    PROFILES="--profile admin"
    echo "📊 Including admin UIs (pgAdmin, Redis Commander)"
fi

# Start services
docker compose -f "$COMPOSE_FILE" $PROFILES up -d

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."

# Wait for PostgreSQL
echo -n "  PostgreSQL: "
until docker exec frostguard-postgres pg_isready -U frostguard -d frostguard > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " ✅"

# Wait for Redis
echo -n "  Redis: "
until docker exec frostguard-redis redis-cli ping > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " ✅"

# Wait for MinIO
echo -n "  MinIO: "
until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " ✅"

echo ""
echo "✅ All services are running!"
echo ""
echo "📝 Service URLs:"
echo "   PostgreSQL: localhost:5432 (via PgBouncer: localhost:6432)"
echo "   Redis:      localhost:6379"
echo "   MinIO API:  http://localhost:9000"
echo "   MinIO Console: http://localhost:9001 (minioadmin / minioadmin_dev_password)"

if [[ "${1:-}" == "--admin" ]]; then
    echo "   pgAdmin:   http://localhost:5050 (admin@frostguard.local / admin)"
    echo "   Redis Commander: http://localhost:8081"
fi

echo ""
echo "📋 Connection strings:"
echo "   DATABASE_URL=postgresql://frostguard:frostguard_dev_password@localhost:6432/frostguard"
echo "   REDIS_URL=redis://localhost:6379"
echo "   S3_ENDPOINT=http://localhost:9000"
