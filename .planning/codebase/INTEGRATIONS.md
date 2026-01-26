# External Integrations

**Analysis Date:** 2026-01-26

## APIs & External Services

**Payment Processing:**
- Stripe - Subscription billing and customer portal
  - SDK/Client: `stripe` in `backend/package.json` and `stripe@18.5.0` in `supabase/functions/stripe-checkout/index.ts`
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (see `docs/ENVIRONMENT_VARIABLES.md`)
  - Endpoints used: Checkout sessions, customer portal, webhooks in `backend/src/routes/stripe-webhooks.ts`

**Email/SMS:**
- Resend - Transactional email delivery
  - SDK/Client: `resend` in `backend/package.json`
  - Auth: `RESEND_API_KEY` in `docs/ENVIRONMENT_VARIABLES.md`
  - Templates: Not detected
- Telnyx - SMS notifications and delivery status webhooks
  - SDK/Client: `telnyx` in `backend/package.json`
  - Auth: `TELNYX_API_KEY` in `docs/ENVIRONMENT_VARIABLES.md`
  - Webhooks: `backend/src/routes/telnyx-webhooks.ts` and Supabase edge functions in `supabase/functions/telnyx-verification-status/index.ts`

**External APIs:**
- The Things Network (TTN) - LoRaWAN device/gateway management
  - Integration method: REST API calls from backend and Supabase Edge Functions
  - Auth: `TTN_API_KEY`, `TTN_WEBHOOK_SECRET` in `docs/ENVIRONMENT_VARIABLES.md`
  - Webhooks: `backend/src/routes/ttn-webhooks.ts` and `supabase/functions/ttn-webhook/index.ts`
- Open-Meteo - Weather data
  - Integration method: REST API via `fetch` in `src/lib/weather/weatherService.ts`
  - Auth: Not required
- OpenStreetMap Nominatim - Geocoding lookup
  - Integration method: REST API via `fetch` in `src/lib/geocoding/geocodingService.ts`
  - Auth: Not required (User-Agent header required)

## Data Storage

**Databases:**
- PostgreSQL (self-hosted) - Primary relational database
  - Connection: `DATABASE_URL` in `docs/ENVIRONMENT_VARIABLES.md`
  - Client: `pg` and `drizzle-orm` in `backend/package.json`
  - Migrations: `backend/drizzle` and `supabase/migrations`
- Supabase Postgres (managed) - Used by Edge Functions
  - Connection: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `supabase/functions`
  - Client: `@supabase/supabase-js` in `supabase/functions/*`

**File Storage:**
- MinIO (S3-compatible) - Object storage for assets/uploads
  - SDK/Client: `@aws-sdk/client-s3` in `backend/package.json`
  - Auth: `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` in `docs/ENVIRONMENT_VARIABLES.md`
  - Buckets: `MINIO_BUCKET`, `MINIO_BUCKET_ASSETS` in `docs/ENVIRONMENT_VARIABLES.md`

**Caching:**
- Redis - Cache and background job coordination
  - Connection: `REDIS_URL` in `docs/ENVIRONMENT_VARIABLES.md`
  - Client: `ioredis` and `redis` in `backend/package.json`

## Authentication & Identity

**Auth Provider:**
- Stack Auth - Primary auth provider
  - Implementation: `@stackframe/react` in `src/App.tsx`, JWT validation in `backend/src/utils/jwt.ts`
  - Token storage: Not detected
  - Session management: JWT access tokens validated via Stack Auth JWKS in `backend/src/utils/jwt.ts`
- Supabase Auth - Edge Functions auth validation
  - Implementation: `supabaseClient.auth.getUser` in `supabase/functions/stripe-checkout/index.ts`
  - Token storage: Not detected
  - Session management: Not detected

**OAuth Integrations:**
- Not detected

## Monitoring & Observability

**Error Tracking:**
- Sentry - Optional APM/error tracking
  - DSN: `SENTRY_DSN` in `docs/ENVIRONMENT_VARIABLES.md`
  - Release tracking: Not detected

**Analytics:**
- Not detected

**Logs:**
- Prometheus/Grafana/Loki stack - Metrics and logs in `docker/prometheus`, `docker/grafana`, and `docker/loki`
  - Integration: Docker Compose configs in `docker-compose.yml` and `docker/compose.prod.yaml`

## CI/CD & Deployment

**Hosting:**
- Docker Compose on VPS - Documented in `docs/operations/DEPLOYMENT.md`
  - Deployment: Container images referenced in `docker-compose.prod.yml`
  - Environment vars: `.env` and secrets files described in `docs/ENVIRONMENT_VARIABLES.md`

**CI Pipeline:**
- GitHub Actions - Documented in `docs/operations/DEPLOYMENT.md` (workflows not detected in `.github/workflows`)
  - Secrets: GitHub Secrets listed in `docs/ENVIRONMENT_VARIABLES.md`

## Environment Configuration

**Development:**
- Required env vars: `VITE_API_URL`, `VITE_STACK_PROJECT_ID`, `VITE_STACK_PUBLISHABLE_CLIENT_KEY` in `docs/ENVIRONMENT_VARIABLES.md`
- Secrets location: `secrets/` for self-hosted Docker, GitHub Secrets for CI/CD in `docs/ENVIRONMENT_VARIABLES.md`
- Mock/stub services: Not detected

**Staging:**
- Environment-specific differences: Not detected
- Data: Not detected

**Production:**
- Secrets management: `secrets/` files and GitHub Secrets in `docs/ENVIRONMENT_VARIABLES.md`
- Failover/redundancy: Not detected

## Webhooks & Callbacks

**Incoming:**
- Stripe - `backend/src/routes/stripe-webhooks.ts` and `supabase/functions/stripe-webhook/index.ts`
  - Verification: Stripe signature validation in `backend/src/routes/stripe-webhooks.ts`
  - Events: Subscription and invoice events documented in `docs/engineering/INTEGRATIONS.md`
- Telnyx - `backend/src/routes/telnyx-webhooks.ts` and `supabase/functions/telnyx-webhook/index.ts`
  - Verification: Telnyx signature validation in `supabase/functions/telnyx-webhook/index.ts`
  - Events: Delivery status and inbound messages in `docs/engineering/INTEGRATIONS.md`
- The Things Network (TTN) - `backend/src/routes/ttn-webhooks.ts` and `supabase/functions/ttn-webhook/index.ts`
  - Verification: Shared secret checks in `backend/src/middleware/api-key-auth.ts`
  - Events: Uplink events and provisioning events in `docs/engineering/INTEGRATIONS.md`

**Outgoing:**
- Not detected

---

*Integration audit: 2026-01-26*
*Update when adding/removing external services*
