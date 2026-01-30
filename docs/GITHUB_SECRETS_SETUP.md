# GitHub Secrets Setup for CD Pipeline

This document explains how to configure GitHub secrets for the FreshTrack Pro CD pipeline.

## Overview

The CD pipeline (`deploy.yml`) uses GitHub Secrets for sensitive values that should never be committed to the repository. These secrets are injected at runtime during deployment.

## Required Secrets

### VPS/Server Access

These secrets enable SSH access to your production server:

| Secret Name   | Description                                  | Example                                   |
| ------------- | -------------------------------------------- | ----------------------------------------- |
| `VPS_HOST`    | Hostname or IP of production server          | `app.freshtrackpro.com` or `203.0.113.50` |
| `VPS_USER`    | SSH username                                 | `deploy`                                  |
| `VPS_SSH_KEY` | SSH private key (full key including headers) | See below                                 |
| `VPS_PORT`    | SSH port (optional, defaults to 22)          | `22`                                      |

**SSH Key Setup:**

```bash
# Generate a deployment key pair
ssh-keygen -t ed25519 -C "github-actions@freshtrackpro.com" -f deploy_key

# Add the public key to your server
cat deploy_key.pub >> ~/.ssh/authorized_keys

# Copy the private key content for VPS_SSH_KEY secret
cat deploy_key
```

The `VPS_SSH_KEY` should contain the entire private key including:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...key content...
-----END OPENSSH PRIVATE KEY-----
```

### Application Secrets

These secrets are passed to your application at runtime:

| Secret Name             | Required     | Description                   | How to Obtain                             |
| ----------------------- | ------------ | ----------------------------- | ----------------------------------------- |
| `STACK_AUTH_SECRET_KEY` | Yes          | Stack Auth server-side secret | Stack Auth Dashboard > Project > API Keys |
| `STRIPE_SECRET_KEY`     | For payments | Stripe API secret key         | Stripe Dashboard > Developers > API Keys  |
| `STRIPE_WEBHOOK_SECRET` | For payments | Webhook signing secret        | Stripe Dashboard > Developers > Webhooks  |

### Optional Service Secrets

Enable additional features by adding these secrets:

| Secret Name          | Feature    | Description          | How to Obtain                                      |
| -------------------- | ---------- | -------------------- | -------------------------------------------------- |
| `TTN_API_KEY`        | IoT        | TTN API key          | The Things Stack Console > Applications > API Keys |
| `TTN_WEBHOOK_SECRET` | IoT        | Webhook verification | Generate: `openssl rand -base64 32`                |
| `TELNYX_API_KEY`     | SMS        | Telnyx API key       | Telnyx Portal > API Keys                           |
| `RESEND_API_KEY`     | Email      | Resend API key       | Resend Dashboard > API Keys                        |
| `SENTRY_DSN`         | Monitoring | Sentry project DSN   | Sentry > Settings > Client Keys                    |

## GitHub Variables (Non-Sensitive)

For non-sensitive configuration, use GitHub Variables instead of Secrets:

| Variable Name         | Description                      | Example                                |
| --------------------- | -------------------------------- | -------------------------------------- |
| `DISCORD_WEBHOOK_URL` | Discord deployment notifications | `https://discord.com/api/webhooks/...` |
| `SLACK_WEBHOOK_URL`   | Slack deployment notifications   | `https://hooks.slack.com/...`          |

## Setting Up Secrets

### Via GitHub Web UI

1. Navigate to your repository on GitHub
2. Go to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Enter the secret name and value
5. Click **Add secret**

### Via GitHub CLI

```bash
# Set a secret
gh secret set VPS_HOST --body "app.freshtrackpro.com"

# Set a secret from a file (useful for SSH keys)
gh secret set VPS_SSH_KEY < deploy_key

# Set multiple secrets from a file
gh secret set -f secrets.env
```

### Via Terraform/Infrastructure as Code

```hcl
resource "github_actions_secret" "vps_host" {
  repository      = "freshtrack-pro"
  secret_name     = "VPS_HOST"
  plaintext_value = var.vps_host
}
```

## Environment Protection Rules

For additional security, set up a **production environment** with protection rules:

1. Go to **Settings** > **Environments**
2. Create environment named `production`
3. Add protection rules:
   - **Required reviewers**: Add team members who must approve deployments
   - **Wait timer**: Optional delay before deployment (e.g., 5 minutes)
   - **Deployment branches**: Restrict to `main` branch only

The deploy workflow already uses `environment: production` which triggers these protections.

## Verification

After setting up secrets, verify the pipeline can access them:

1. Push a small change to trigger the pipeline
2. Check the Actions tab for the deploy workflow
3. Verify the "Deploy via SSH" step completes successfully

If secrets are missing, you'll see errors like:

```
Error: Input required and not supplied: host
```

## Security Best Practices

1. **Rotate SSH keys annually** - Generate new deploy keys and update `VPS_SSH_KEY`
2. **Use dedicated deploy user** - Don't use root or personal accounts for `VPS_USER`
3. **Limit SSH key permissions** - Use `command=` restrictions in `authorized_keys`
4. **Review secret access** - Audit who can view/modify repository secrets
5. **Enable branch protection** - Require PR reviews before merging to `main`
6. **Use environment secrets** - For extra isolation, store secrets at environment level

## Troubleshooting

### "Permission denied" SSH errors

- Verify `VPS_SSH_KEY` contains the complete private key
- Check `VPS_USER` has SSH access with key authentication
- Ensure the public key is in `~/.ssh/authorized_keys` on the server

### "Secret not found" errors

- Secret names are case-sensitive
- Check spelling matches exactly between workflow and secret configuration
- Verify secret is set at repository level (not just environment level)

### Deployment hangs

- Check `VPS_PORT` is correct (default is 22)
- Verify server firewall allows connections from GitHub Actions
- Test SSH access manually: `ssh -p $PORT $USER@$HOST`

## Quick Setup Checklist

```bash
# Minimum required secrets for deployment
[ ] VPS_HOST         - Production server address
[ ] VPS_USER         - SSH username
[ ] VPS_SSH_KEY      - SSH private key
[ ] STACK_AUTH_SECRET_KEY - Authentication secret

# Optional but recommended
[ ] STRIPE_SECRET_KEY      - If using payments
[ ] STRIPE_WEBHOOK_SECRET  - If using Stripe webhooks
[ ] DISCORD_WEBHOOK_URL    - Deployment notifications
```
