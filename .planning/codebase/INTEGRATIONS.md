# External Integrations

**Analysis Date:** 2026-01-29

## APIs & External Services

**Authentication:**
- Stack Auth - User authentication and identity management
  - SDK/Client: `@stackframe/react` 2.8.60 (frontend), JWT validation (backend)
  - Auth: `VITE_STACK_AUTH_PROJECT_ID`, `VITE_STACK_AUTH_PUBLISHABLE_CLIENT_KEY`
  - Implementation: `src/lib/stack/client.ts`, `backend/src/plugins/auth.plugin.ts`
  - Usage: JWT tokens passed via `x-stack-access-token` header

**Payment Processing:**
- Stripe - Subscription billing and metered usage
  - SDK/Client: `stripe` 20.2.0
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Implementation: `backend/src/services/stripe-webhook.service.ts`, `backend/src/services/stripe-meter.service.ts`
  - Webhooks: `backend/src/routes/stripe-webhooks.ts`
  - Events: subscription lifecycle, meter events

**IoT Device Integration:**
- The Things Network (TTN) - LoRaWAN device management
  - SDK/Client: Custom HTTP client (no SDK, REST API)
  - Auth: `TTN_API_KEY`, `TTN_APPLICATION_ID`
  - API URL: `TTN_API_URL` (default: https://eu1.cloud.thethings.network)
  - Implementation: `backend/src/services/ttn.service.ts`, `backend/src/services/ttn-device.service.ts`, `backend/src/services/ttn-gateway.service.ts`
  - Webhooks: `backend/src/routes/ttn-webhooks.ts` - receives temperature readings
  - Operations: device provisioning, deprovisioning, gateway management

**Email Delivery:**
- Resend - Transactional email service
  - SDK/Client: `resend` 4.2.0
  - Auth: `RESEND_API_KEY`
  - From Address: `EMAIL_FROM_ADDRESS`
  - Implementation: `backend/src/services/email.service.ts`
  - Usage: Digest emails, alert notifications (via BullMQ jobs)

**SMS Notifications:**
- Telnyx - SMS delivery service (optional)
  - SDK/Client: `telnyx` 5.11.0
  - Auth: `TELNYX_API_KEY`, `TELNYX_MESSAGING_PROFILE_ID`
  - Phone: `TELNYX_PHONE_NUMBER`
  - Implementation: `backend/src/services/telnyx.service.ts`
  - Webhooks: `backend/src/routes/telnyx-webhooks.ts`
  - Usage: Alert notifications (via BullMQ jobs)

## Data Storage

**Databases:**
- PostgreSQL - Primary relational database
  - Connection: `DATABASE_URL`
  - Client: Drizzle ORM 0.38.0 with `pg` 8.13.0
  - Schema: `backend/src/db/schema/*.ts` (15+ schema files)
  - Migrations: `backend/drizzle/` (managed by drizzle-kit)
  - Pool settings: `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT`, `DB_POOL_CONNECTION_TIMEOUT`

**File Storage:**
- MinIO / AWS S3 - Object storage for assets
  - SDK/Client: `@aws-sdk/client-s3` 3.750.0
  - Connection: `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
  - Bucket: `MINIO_BUCKET_ASSETS` (default: "assets")
  - Region: `MINIO_REGION` (default: "us-east-1")
  - SSL: `MINIO_USE_SSL` (true/false)
  - Implementation: `backend/src/services/asset-storage.service.ts`
  - Usage: Presigned URLs for upload/download

**Caching:**
- Redis - Cache and job queue backend
  - Connection: `REDIS_URL` (default: redis://redis:6379)
  - Client: `ioredis` 5.9.2 (BullMQ), `redis` 5.10.0 (Socket.IO adapter)
  - Usage: BullMQ job queues, Socket.IO pub/sub adapter (`@socket.io/redis-adapter` 8.3.0)

## Authentication & Identity

**Auth Provider:**
- Stack Auth - Third-party authentication service
  - Implementation: JWT-based authentication
  - Frontend: `@stackframe/react` provider wraps entire app (`src/App.tsx`)
  - Backend: JWT verification middleware (`backend/src/plugins/auth.plugin.ts`)
  - Token passing: `x-stack-access-token` header in tRPC and REST requests
  - Session management: Stack Auth handles sessions, tokens obtained via `useUser().getAuthJson()`

## Monitoring & Observability

**Error Tracking:**
- Sentry (configured but optional)
  - Environment vars: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`

**Logs:**
- Structured JSON logging via Fastify built-in logger
  - Config: `backend/src/utils/logger.js` (getFastifyLoggerConfig)
  - Pretty printing: `pino-pretty` 13.1.3 (dev dependency)
  - Log level: `LOG_LEVEL` environment variable

**Metrics:**
- Prometheus export (optional)
  - Environment vars: `METRICS_ENABLED`, `METRICS_PORT` (default: 9090)

**Job Monitoring:**
- Bull Board - Web UI for BullMQ queues
  - Integration: `@bull-board/fastify` 6.16.4
  - Mounted in: `backend/src/plugins/queue.plugin.ts`

## CI/CD & Deployment

**Hosting:**
- Platform: Not detected (self-hosted or cloud platform)
  - Frontend: Static build output from Vite (SPA)
  - Backend: Node.js server (Fastify)

**CI Pipeline:**
- Not detected (no `.github/workflows`, `.gitlab-ci.yml`, or similar)

**Deployment Configuration:**
- Docker: Not detected (no `Dockerfile` or `docker-compose.yml` analyzed)
- Environment-specific builds: `npm run build` (production), `npm run build:dev` (development mode)

## Environment Configuration

**Required env vars:**
- `VITE_API_URL` - Backend API URL
- `VITE_STACK_AUTH_PROJECT_ID` - Stack Auth project ID
- `VITE_STACK_AUTH_PUBLISHABLE_CLIENT_KEY` - Stack Auth client key
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `RESEND_API_KEY` - Resend email API key
- `TTN_API_KEY` - The Things Network API key
- `TTN_APPLICATION_ID` - TTN application ID
- `MINIO_ENDPOINT` - MinIO/S3 endpoint
- `MINIO_ROOT_USER` - MinIO access key
- `MINIO_ROOT_PASSWORD` - MinIO secret key

**Optional env vars:**
- `TELNYX_API_KEY` - Telnyx SMS API key (SMS notifications)
- `TELNYX_MESSAGING_PROFILE_ID` - Telnyx messaging profile
- `TELNYX_PHONE_NUMBER` - Telnyx sender phone number
- `SENTRY_DSN` - Sentry error tracking DSN
- `VITE_DEBUG_API` - Enable API debug logging (frontend)

**Secrets location:**
- Development: `.env` files (gitignored)
- Production: File-based secrets in `./secrets/` directory
  - `secrets/postgres_password.txt`
  - `secrets/jwt_secret.txt`
  - `secrets/stack_auth_secret.txt`
  - `secrets/minio_user.txt`
  - `secrets/minio_password.txt`
  - `secrets/grafana_password.txt`

**Environment Files:**
- `.env.example` - Development environment template
- `.env.production.example` - Production environment template with Docker setup guidance

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/ttn` - The Things Network device data
  - Implementation: `backend/src/routes/ttn-webhooks.ts`
  - Purpose: Receive temperature sensor readings from IoT devices
- `POST /api/webhooks/stripe` - Stripe subscription events
  - Implementation: `backend/src/routes/stripe-webhooks.ts`
  - Events: subscription updates, payment events, meter events
  - Verification: Stripe signature verification via `STRIPE_WEBHOOK_SECRET`
- `POST /api/webhooks/telnyx` - Telnyx SMS delivery status
  - Implementation: `backend/src/routes/telnyx-webhooks.ts`
  - Purpose: Track SMS delivery status

**Outgoing:**
- TTN webhook registration: Configured via `TTN_WEBHOOK_URL`
  - Target: `https://api.{domain}/api/webhooks/ttn`
  - Purpose: Receive device uplink messages

## Real-Time Communication

**WebSocket:**
- Socket.IO 4.8.3 - Bidirectional real-time updates
  - Client: `src/lib/socket.ts`
  - Server: `backend/src/plugins/socket.plugin.ts`
  - Authentication: JWT token passed in `socket.auth.token`
  - Events:
    - `sensor:reading` - New temperature reading
    - `sensor:readings:batch` - Batch readings update
    - `alert:triggered` - New alert notification
    - `alert:resolved` - Alert resolution
    - `alert:escalated` - Alert escalation
    - `unit:state:changed` - Unit dashboard state change
  - Subscriptions: `subscribe:site`, `subscribe:unit`, `unsubscribe:site`, `unsubscribe:unit`
  - Redis adapter: `@socket.io/redis-adapter` for multi-instance scaling

## Background Jobs

**Job Queue:**
- BullMQ 5.67.0 - Background job processing
  - Redis-backed job queue
  - Implementation: `backend/src/jobs/index.ts`, `backend/src/workers/index.ts`
  - Job types:
    - `SmsNotificationJobData` - Send SMS alerts via Telnyx
    - `EmailDigestJobData` - Send daily/weekly email digests via Resend
    - `MeterReportJobData` - Report usage metrics to Stripe
  - Monitoring: Bull Board UI at `/admin/queues`

---

*Integration audit: 2026-01-29*
