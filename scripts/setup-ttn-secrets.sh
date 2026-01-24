#!/bin/bash

# Setup TTN Secrets for Production
# This script configures TTN credentials from secrets files or environment variables.
#
# Usage:
#   chmod +x scripts/setup-ttn-secrets.sh
#   ./scripts/setup-ttn-secrets.sh
#
# Prerequisites:
#   Create secrets files or set environment variables:
#   - secrets/ttn_user_id.txt OR TTN_USER_ID env var
#   - secrets/ttn_api_key.txt OR TTN_ADMIN_API_KEY env var

set -e

echo "Setting up TTN Secrets"
echo "======================"
echo ""

# Load from secrets files if they exist
SECRETS_DIR="${SECRETS_DIR:-./secrets}"

if [ -f "$SECRETS_DIR/ttn_user_id.txt" ]; then
    TTN_USER_ID=$(cat "$SECRETS_DIR/ttn_user_id.txt" | tr -d '\n')
fi

if [ -f "$SECRETS_DIR/ttn_api_key.txt" ]; then
    TTN_ADMIN_API_KEY=$(cat "$SECRETS_DIR/ttn_api_key.txt" | tr -d '\n')
fi

# Validate required credentials
if [ -z "$TTN_USER_ID" ]; then
    echo "Error: TTN_USER_ID is not set."
    echo ""
    echo "Set it via environment variable or create secrets/ttn_user_id.txt:"
    echo "  echo 'your-ttn-user-id' > secrets/ttn_user_id.txt"
    echo ""
    exit 1
fi

if [ -z "$TTN_ADMIN_API_KEY" ]; then
    echo "Error: TTN_ADMIN_API_KEY is not set."
    echo ""
    echo "Set it via environment variable or create secrets/ttn_api_key.txt:"
    echo "  echo 'NNSXS.your-api-key' > secrets/ttn_api_key.txt"
    echo ""
    echo "Get your API key from The Things Network Console:"
    echo "  https://console.cloud.thethings.network/"
    echo ""
    exit 1
fi

echo "TTN credentials loaded"
echo "  User ID: $TTN_USER_ID"
echo "  API Key: ${TTN_ADMIN_API_KEY:0:10}...${TTN_ADMIN_API_KEY: -4}"
echo ""

# Export for use by other scripts or docker-compose
export TTN_USER_ID
export TTN_ADMIN_API_KEY

echo "TTN secrets configured successfully!"
echo ""
echo "These credentials are now available as environment variables."
echo "For Docker deployment, ensure they are added to your .env.production file."
echo ""
