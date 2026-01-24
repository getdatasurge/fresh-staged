#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INFISICAL_DIR="$PROJECT_ROOT/docker/infisical"

echo "=== FreshTrack Pro: Infisical Secrets Manager Setup ==="

# Check if .env exists
if [ ! -f "$INFISICAL_DIR/.env" ]; then
  echo "Creating .env from template..."
  cp "$INFISICAL_DIR/infisical.env.example" "$INFISICAL_DIR/.env"

  # Generate secure keys
  echo "Generating secure encryption keys..."
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  AUTH_SECRET=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+')

  # Replace placeholders (works on both Linux and macOS)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS requires -i '' for in-place editing
    sed -i '' "s/<32-byte-hex-key>/$ENCRYPTION_KEY/" "$INFISICAL_DIR/.env"
    # Need to replace second occurrence of <32-byte-hex-key> with AUTH_SECRET
    sed -i '' "0,/<32-byte-hex-key>/! s/<32-byte-hex-key>/$AUTH_SECRET/" "$INFISICAL_DIR/.env"
    sed -i '' "s/<generate-secure-password>/$DB_PASSWORD/" "$INFISICAL_DIR/.env"
  else
    # Linux sed
    sed -i "s/<32-byte-hex-key>/$ENCRYPTION_KEY/" "$INFISICAL_DIR/.env"
    # Need to replace second occurrence of <32-byte-hex-key> with AUTH_SECRET
    sed -i "0,/<32-byte-hex-key>/! s/<32-byte-hex-key>/$AUTH_SECRET/" "$INFISICAL_DIR/.env"
    sed -i "s/<generate-secure-password>/$DB_PASSWORD/" "$INFISICAL_DIR/.env"
  fi

  echo "Generated .env with secure keys"
else
  echo ".env already exists, skipping key generation"
fi

# Start Infisical stack
echo "Starting Infisical stack..."
docker compose -f "$INFISICAL_DIR/docker-compose.infisical.yml" up -d

# Wait for health
echo "Waiting for Infisical to be healthy..."
timeout 60 bash -c 'until curl -sf http://localhost:8080/api/status > /dev/null 2>&1; do sleep 2; done' || {
  echo "ERROR: Infisical failed to start within 60 seconds"
  docker compose -f "$INFISICAL_DIR/docker-compose.infisical.yml" logs
  exit 1
}

echo ""
echo "=== Infisical Setup Complete ==="
echo "Web UI: http://localhost:8080"
echo "Create an admin account on first visit"
echo ""
