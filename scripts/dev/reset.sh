#!/usr/bin/env bash
# Reset FrostGuard development environment (removes all data)
# Usage: ./scripts/dev/reset.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

echo "⚠️  This will remove ALL development data including:"
echo "    - PostgreSQL database"
echo "    - Redis cache"
echo "    - MinIO files"
echo ""
read -p "Are you sure? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled."
    exit 0
fi

echo ""
echo "🧹 Resetting FrostGuard development environment..."

# Stop all services
echo "  Stopping services..."
docker compose -f "$COMPOSE_FILE" --profile admin down -v 2>/dev/null || true

# Remove named volumes
echo "  Removing volumes..."
docker volume rm frostguard_postgres_data 2>/dev/null || true
docker volume rm frostguard_redis_data 2>/dev/null || true
docker volume rm frostguard_minio_data 2>/dev/null || true

# Remove network
echo "  Removing network..."
docker network rm frostguard_network 2>/dev/null || true

echo ""
echo "✅ Environment reset complete."
echo ""
echo "💡 Run './scripts/dev/up.sh' to start fresh."
