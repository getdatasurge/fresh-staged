# Environment Variables Documentation

This document provides complete documentation of all environment variables used by FreshTrack Pro in production.

## Quick Reference

| Category | Required Variables                                    | Secret Variables                             |
| -------- | ----------------------------------------------------- | -------------------------------------------- |
| Core     | `NODE_ENV`, `DOMAIN`                                  | -                                            |
| Database | `DATABASE_URL`                                        | `POSTGRES_PASSWORD`                          |
| Auth     | `STACK_AUTH_PROJECT_ID`, `STACK_AUTH_PUBLISHABLE_KEY` | `STACK_AUTH_SECRET_KEY`                      |
| Storage  | `MINIO_ENDPOINT`                                      | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`     |
| Payments | -                                                     | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| IoT      | `TTN_APPLICATION_ID` (if using)                       | `TTN_API_KEY`, `TTN_WEBHOOK_SECRET`          |
| SMS      | -                                                     | `TELNYX_API_KEY`                             |
| Email    | -                                                     | `RESEND_API_KEY`                             |

## Categories

### Core Application

| Variable    | Required | Default   | Description                                     |
| ----------- | -------- | --------- | ----------------------------------------------- |
| `NODE_ENV`  | Yes      | -         | Must be `production` for production deployment  |
| `PORT`      | No       | `3000`    | Backend server port                             |
| `HOST`      | No       | `0.0.0.0` | Backend server host binding                     |
| `LOG_LEVEL` | No       | `info`    | Logging level: `debug`, `info`, `warn`, `error` |

### Domain Configuration

| Variable       | Required | Default                 | Description                                       |
| -------------- | -------- | ----------------------- | ------------------------------------------------- |
| `DOMAIN`       | Yes      | -                       | Primary domain (e.g., `app.freshtrackpro.com`)    |
| `FRONTEND_URL` | No       | `https://${DOMAIN}`     | Full frontend URL for redirects                   |
| `API_URL`      | No       | `https://${DOMAIN}/api` | Full API URL                                      |
| `ACME_EMAIL`   | No       | -                       | Email for Let's Encrypt certificate notifications |

### Database (PostgreSQL)

| Variable                     | Required | Default      | Description                  |
| ---------------------------- | -------- | ------------ | ---------------------------- |
| `DATABASE_URL`               | Yes      | -            | PostgreSQL connection string |
| `POSTGRES_USER`              | No       | `frostguard` | PostgreSQL username          |
| `POSTGRES_DB`                | No       | `frostguard` | PostgreSQL database name     |
| `DB_POOL_MIN`                | No       | `5`          | Minimum pool connections     |
| `DB_POOL_MAX`                | No       | `20`         | Maximum pool connections     |
| `DB_POOL_IDLE_TIMEOUT`       | No       | `30000`      | Idle connection timeout (ms) |
| `DB_POOL_CONNECTION_TIMEOUT` | No       | `5000`       | Connection timeout (ms)      |

**Secrets:**

- `POSTGRES_PASSWORD` - Use `secrets/postgres_password.txt` (Docker secret)

### Redis

| Variable     | Required | Default     | Description                                       |
| ------------ | -------- | ----------- | ------------------------------------------------- |
| `REDIS_URL`  | Yes      | -           | Redis connection URL (e.g., `redis://redis:6379`) |
| `REDIS_HOST` | No       | `localhost` | Alternative: Redis host                           |
| `REDIS_PORT` | No       | `6379`      | Alternative: Redis port                           |

### Stack Auth (Authentication)

| Variable                     | Required | Default                      | Description                                |
| ---------------------------- | -------- | ---------------------------- | ------------------------------------------ |
| `STACK_AUTH_PROJECT_ID`      | Yes      | -                            | Stack Auth project ID from dashboard       |
| `STACK_AUTH_PUBLISHABLE_KEY` | Yes      | -                            | Publishable client key (safe for frontend) |
| `STACK_AUTH_API_URL`         | No       | `https://api.stack-auth.com` | Stack Auth API URL                         |

**Secrets:**

- `STACK_AUTH_SECRET_KEY` - Use `secrets/stack_auth_secret.txt` or GitHub secret

### MinIO / S3 (Object Storage)

| Variable              | Required | Default      | Description           |
| --------------------- | -------- | ------------ | --------------------- |
| `MINIO_ENDPOINT`      | Yes      | -            | MinIO/S3 endpoint URL |
| `MINIO_BUCKET`        | No       | `frostguard` | Default bucket name   |
| `MINIO_BUCKET_ASSETS` | No       | `assets`     | Assets bucket name    |

**Secrets:**

- `MINIO_ROOT_USER` - Use `secrets/minio_user.txt` (Docker secret)
- `MINIO_ROOT_PASSWORD` - Use `secrets/minio_password.txt` (Docker secret)

### Stripe (Payments)

| Variable                | Required     | Default | Description                           |
| ----------------------- | ------------ | ------- | ------------------------------------- |
| `STRIPE_SECRET_KEY`     | For payments | -       | Stripe API secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | For payments | -       | Webhook signing secret (`whsec_...`)  |

**Note:** These are always secrets, managed via GitHub Secrets for CD pipeline.

### The Things Network (IoT)

| Variable             | Required | Default                               | Description                        |
| -------------------- | -------- | ------------------------------------- | ---------------------------------- |
| `TTN_APPLICATION_ID` | For IoT  | -                                     | TTN application ID                 |
| `TTN_API_URL`        | No       | `https://eu1.cloud.thethings.network` | TTN API URL                        |
| `TTN_API_KEY`        | For IoT  | -                                     | TTN API key for device management  |
| `TTN_WEBHOOK_SECRET` | For IoT  | -                                     | Secret for validating TTN webhooks |

### Telnyx (SMS Notifications)

| Variable                      | Required | Default | Description                      |
| ----------------------------- | -------- | ------- | -------------------------------- |
| `TELNYX_API_KEY`              | For SMS  | -       | Telnyx API key                   |
| `TELNYX_MESSAGING_PROFILE_ID` | For SMS  | -       | Messaging profile ID             |
| `TELNYX_PHONE_NUMBER`         | For SMS  | -       | From phone number (E.164 format) |

### Resend (Email)

| Variable             | Required  | Default                  | Description              |
| -------------------- | --------- | ------------------------ | ------------------------ |
| `RESEND_API_KEY`     | For email | -                        | Resend API key           |
| `EMAIL_FROM_ADDRESS` | No        | `noreply@freshtrack.app` | Default from address     |
| `APP_URL`            | No        | -                        | Base URL for email links |

### Security & CORS

| Variable                  | Required | Default  | Description                                |
| ------------------------- | -------- | -------- | ------------------------------------------ |
| `CORS_ORIGINS`            | Yes      | -        | Comma-separated allowed origins            |
| `RATE_LIMIT_WINDOW`       | No       | `60000`  | Rate limit window (ms)                     |
| `RATE_LIMIT_MAX`          | No       | `100`    | Max requests per window                    |
| `SESSION_COOKIE_SECURE`   | No       | `true`   | Secure cookies (HTTPS only)                |
| `SESSION_COOKIE_SAMESITE` | No       | `strict` | SameSite cookie attribute                  |
| `SESSION_COOKIE_DOMAIN`   | No       | -        | Cookie domain (e.g., `.freshtrackpro.com`) |

### Feature Flags

| Variable                       | Required | Default | Description                 |
| ------------------------------ | -------- | ------- | --------------------------- |
| `FEATURE_DEVICE_PROVISIONING`  | No       | `true`  | Enable device provisioning  |
| `FEATURE_SMS_NOTIFICATIONS`    | No       | `true`  | Enable SMS notifications    |
| `FEATURE_EMAIL_NOTIFICATIONS`  | No       | `true`  | Enable email notifications  |
| `FEATURE_WEBHOOK_INTEGRATIONS` | No       | `true`  | Enable webhook integrations |

### Monitoring

| Variable             | Required | Default      | Description               |
| -------------------- | -------- | ------------ | ------------------------- |
| `APM_ENABLED`        | No       | `false`      | Enable APM (Sentry)       |
| `SENTRY_DSN`         | If APM   | -            | Sentry DSN                |
| `SENTRY_ENVIRONMENT` | No       | `production` | Sentry environment tag    |
| `METRICS_ENABLED`    | No       | `false`      | Enable Prometheus metrics |
| `METRICS_PORT`       | No       | `9090`       | Metrics endpoint port     |

## Secrets Management

### File-Based Secrets (Docker)

For self-hosted deployments, secrets are managed via files mounted as Docker secrets:

```
secrets/
├── postgres_password.txt
├── minio_user.txt
├── minio_password.txt
├── stack_auth_secret.txt
├── jwt_secret.txt
└── grafana_password.txt
```

See `secrets/README.md` for generation instructions.

### GitHub Secrets (CD Pipeline)

For the GitHub Actions CD pipeline, the following secrets must be configured:

**Required:**

- `VPS_HOST` - Production server hostname/IP
- `VPS_USER` - SSH username
- `VPS_SSH_KEY` - SSH private key
- `VPS_PORT` - SSH port (default: 22)

**Application Secrets:**

- `STACK_AUTH_SECRET_KEY` - Stack Auth server-side key
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

**Optional (if using features):**

- `TTN_API_KEY` - The Things Network API key
- `TTN_WEBHOOK_SECRET` - TTN webhook verification secret
- `TELNYX_API_KEY` - Telnyx SMS API key
- `RESEND_API_KEY` - Resend email API key
- `SENTRY_DSN` - Sentry error tracking DSN

### GitHub Variables (CD Pipeline)

Non-sensitive configuration as repository variables:

- `DISCORD_WEBHOOK_URL` - Discord notification webhook (optional)
- `SLACK_WEBHOOK_URL` - Slack notification webhook (optional)

## Frontend Environment Variables

The frontend uses Vite environment variables (prefixed with `VITE_`):

| Variable                            | Required | Default                 | Description                |
| ----------------------------------- | -------- | ----------------------- | -------------------------- |
| `VITE_API_URL`                      | Yes      | `http://localhost:3000` | Backend API URL            |
| `VITE_STACK_PROJECT_ID`             | Yes      | -                       | Stack Auth project ID      |
| `VITE_STACK_PUBLISHABLE_CLIENT_KEY` | Yes      | -                       | Stack Auth publishable key |
| `VITE_DEBUG_API`                    | No       | `false`                 | Enable API debugging       |

These are baked into the frontend build. For production, set them in the Docker build args or in the build environment.

## Security Best Practices

1. **Never commit secrets** - Use `.gitignore` to exclude `.env` and `secrets/`
2. **Rotate secrets regularly** - Quarterly rotation recommended
3. **Use strong secrets** - Minimum 32 characters, randomly generated
4. **Least privilege** - Each service gets only the secrets it needs
5. **Audit access** - Log who accesses production secrets
6. **Separate environments** - Different secrets for dev/staging/production
7. **No secrets in logs** - Ensure application doesn't log sensitive values

## Troubleshooting

### Common Issues

**Backend won't start: "DATABASE_URL is required"**

- Ensure `DATABASE_URL` is set in your `.env` file or Docker environment

**Authentication errors: "Invalid Stack Auth configuration"**

- Verify `STACK_AUTH_PROJECT_ID` matches your Stack Auth dashboard
- Check that `STACK_AUTH_SECRET_KEY` is correctly set

**Redis connection failed**

- Verify Redis is running: `docker ps | grep redis`
- Check `REDIS_URL` format: `redis://hostname:port`

**MinIO/S3 access denied**

- Verify `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` match server config
- Check bucket exists and permissions are correct
