#!/usr/bin/env bash
# Stop FrostGuard development services
# Usage: ./scripts/dev/down.sh [-v]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

# Check for volume removal flag
REMOVE_VOLUMES=""
if [[ "${1:-}" == "-v" ]]; then
    REMOVE_VOLUMES="-v"
    echo "🛑 Stopping FrostGuard development services and removing volumes..."
else
    echo "🛑 Stopping FrostGuard development services..."
fi

# Stop all services (including admin profile)
docker compose -f "$COMPOSE_FILE" --profile admin down $REMOVE_VOLUMES

echo ""
echo "✅ All services stopped."

if [[ -n "$REMOVE_VOLUMES" ]]; then
    echo ""
    echo "🗑️  Volumes have been removed."
else
    echo ""
    echo "💡 Data volumes are preserved. Use './scripts/dev/down.sh -v' or './scripts/dev/reset.sh' to remove all data."
fi
