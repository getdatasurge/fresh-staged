#!/bin/bash
# ===========================================
# FreshTrack Pro Deployment Notification
# ===========================================
# Sends deployment status notifications to configured webhook
#
# Usage:
#   ./notify.sh success "Deployment completed"
#   ./notify.sh failure "Health check failed"
#
# Environment variables:
#   DEPLOY_WEBHOOK_URL - Webhook URL (Slack, Discord, or generic)
#   DEPLOY_ENVIRONMENT - Environment name (production, staging)
#   DEPLOY_VERSION     - Version being deployed (optional)
#
# Supports:
#   - Slack webhooks (incoming webhooks)
#   - Discord webhooks (via /slack endpoint)
#   - Generic webhooks (JSON POST)

set -euo pipefail

# Arguments
STATUS="${1:-unknown}"
MESSAGE="${2:-No message provided}"

# Environment
WEBHOOK_URL="${DEPLOY_WEBHOOK_URL:-}"
ENVIRONMENT="${DEPLOY_ENVIRONMENT:-production}"
VERSION="${DEPLOY_VERSION:-$(git describe --tags --always 2>/dev/null || echo 'unknown')}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOSTNAME=$(hostname -f 2>/dev/null || hostname)

# Validate
if [ -z "$WEBHOOK_URL" ]; then
  echo "Warning: DEPLOY_WEBHOOK_URL not set, skipping notification"
  exit 0
fi

# Color mapping for Slack/Discord
case "$STATUS" in
  success)
    COLOR="#36a64f"  # Green
    EMOJI=":white_check_mark:"
    ;;
  failure)
    COLOR="#dc3545"  # Red
    EMOJI=":x:"
    ;;
  warning)
    COLOR="#ffc107"  # Yellow
    EMOJI=":warning:"
    ;;
  *)
    COLOR="#6c757d"  # Gray
    EMOJI=":information_source:"
    ;;
esac

# Construct Slack-compatible payload
# (Discord webhooks accept Slack format via /slack suffix)
PAYLOAD=$(cat <<EOF
{
  "attachments": [
    {
      "color": "$COLOR",
      "title": "$EMOJI FreshTrack Pro Deployment",
      "fields": [
        {
          "title": "Status",
          "value": "$STATUS",
          "short": true
        },
        {
          "title": "Environment",
          "value": "$ENVIRONMENT",
          "short": true
        },
        {
          "title": "Version",
          "value": "$VERSION",
          "short": true
        },
        {
          "title": "Host",
          "value": "$HOSTNAME",
          "short": true
        },
        {
          "title": "Message",
          "value": "$MESSAGE",
          "short": false
        }
      ],
      "footer": "FreshTrack Pro Deployment System",
      "ts": $(date +%s)
    }
  ]
}
EOF
)

# Send notification with retry
MAX_RETRIES=3
RETRY_DELAY=5

for i in $(seq 1 $MAX_RETRIES); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$WEBHOOK_URL" || echo "000")

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "Notification sent successfully (HTTP $HTTP_CODE)"
    exit 0
  fi

  if [ "$i" -lt "$MAX_RETRIES" ]; then
    echo "Notification failed (HTTP $HTTP_CODE), retrying in ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY * 2))
  fi
done

echo "Warning: Failed to send notification after $MAX_RETRIES attempts"
exit 0  # Don't fail deployment due to notification failure
