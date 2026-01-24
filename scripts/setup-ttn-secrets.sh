#!/bin/bash

# Setup TTN Secrets for Production
# This script helps set TTN credentials as Supabase secrets for production.
#
# SECURITY: Never commit actual API keys to this file!
# Set credentials via environment variables or pass as arguments.
#
# Usage:
#   export TTN_USER_ID="your-user-id"
#   export TTN_ADMIN_API_KEY="NNSXS.your-key-here"
#   ./scripts/setup-ttn-secrets.sh
#
# Or with arguments:
#   ./scripts/setup-ttn-secrets.sh --user-id=frostguard --api-key=NNSXS.xxx

set -e

echo "🔧 Setting up TTN Secrets for Supabase Edge Functions"
echo "=================================================="
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed."
    echo ""
    echo "Install it with:"
    echo "  npm install -g supabase"
    echo "  # or"
    echo "  brew install supabase/tap/supabase"
    echo ""
    exit 1
fi

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --user-id=*)
            TTN_USER_ID="${arg#*=}"
            shift
            ;;
        --api-key=*)
            TTN_ADMIN_API_KEY="${arg#*=}"
            shift
            ;;
    esac
done

# Validate required environment variables
if [ -z "$TTN_USER_ID" ]; then
    echo "❌ Error: TTN_USER_ID is not set."
    echo ""
    echo "Set it via environment variable:"
    echo "  export TTN_USER_ID='your-ttn-user-id'"
    echo ""
    echo "Or pass as argument:"
    echo "  ./scripts/setup-ttn-secrets.sh --user-id=your-user-id --api-key=NNSXS.xxx"
    echo ""
    exit 1
fi

if [ -z "$TTN_ADMIN_API_KEY" ]; then
    echo "❌ Error: TTN_ADMIN_API_KEY is not set."
    echo ""
    echo "Set it via environment variable:"
    echo "  export TTN_ADMIN_API_KEY='NNSXS.your-key-here'"
    echo ""
    echo "Or pass as argument:"
    echo "  ./scripts/setup-ttn-secrets.sh --user-id=your-user-id --api-key=NNSXS.xxx"
    echo ""
    exit 1
fi

# Validate API key format
if [[ ! "$TTN_ADMIN_API_KEY" =~ ^NNSXS\. ]]; then
    echo "⚠️  Warning: TTN_ADMIN_API_KEY doesn't start with 'NNSXS.'"
    echo "   TTN API keys typically start with 'NNSXS.'"
    echo ""
fi

echo "📝 Setting TTN_USER_ID..."
supabase secrets set TTN_USER_ID="$TTN_USER_ID"

echo "📝 Setting TTN_ADMIN_API_KEY..."
supabase secrets set TTN_ADMIN_API_KEY="$TTN_ADMIN_API_KEY"

echo ""
echo "✅ TTN secrets configured successfully!"
echo ""
echo "📊 Verifying configuration..."
echo "You can verify the edge function is ready by running:"
echo "  curl https://your-project.supabase.co/functions/v1/ttn-provision-org"
echo ""
echo "Look for: \"ready\": true"
echo ""
