# Deployment Scripts

## Notification Setup

The deployment notification script supports Slack, Discord, and generic webhook endpoints.

### Configuration

Set the following environment variables:

| Variable             | Required | Description                                     |
| -------------------- | -------- | ----------------------------------------------- |
| `DEPLOY_WEBHOOK_URL` | Yes      | Webhook URL for notifications                   |
| `DEPLOY_ENVIRONMENT` | No       | Environment name (default: production)          |
| `DEPLOY_VERSION`     | No       | Version being deployed (auto-detected from git) |

### Slack Setup

1. Go to your Slack workspace settings
2. Navigate to "Apps" > "Incoming Webhooks"
3. Create a new webhook for your deployment channel
4. Copy the webhook URL:
   ```bash
   export DEPLOY_WEBHOOK_URL="https://hooks.slack.com/services/T00/B00/XXX"
   ```

### Discord Setup

1. Open Discord server settings
2. Navigate to "Integrations" > "Webhooks"
3. Create a new webhook for your deployment channel
4. Copy the webhook URL and append `/slack`:
   ```bash
   export DEPLOY_WEBHOOK_URL="https://discord.com/api/webhooks/XXX/YYY/slack"
   ```

### Generic Webhook

For custom endpoints, the script sends a JSON payload:

```json
{
  "attachments": [
    {
      "color": "#36a64f",
      "title": "FreshTrack Pro Deployment",
      "fields": [
        { "title": "Status", "value": "success" },
        { "title": "Environment", "value": "production" },
        { "title": "Version", "value": "v1.2.3" },
        { "title": "Host", "value": "prod-server-1" },
        { "title": "Message", "value": "Deployment completed" }
      ]
    }
  ]
}
```

### Usage

```bash
# Success notification
./notify.sh success "Deployment completed successfully"

# Failure notification
./notify.sh failure "Health check failed after 3 retries"

# Warning notification
./notify.sh warning "Deployment completed with warnings"
```

### Integration with Deployment

Add notifications to your deployment script:

```bash
#!/bin/bash

# At the start
./scripts/deploy/notify.sh info "Starting deployment..."

# Deploy
docker compose ... up -d

# After health checks
if health_check_passes; then
  ./scripts/deploy/notify.sh success "Deployment completed"
else
  ./scripts/deploy/notify.sh failure "Health check failed"
  exit 1
fi
```
