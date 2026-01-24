# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

### Supabase (Backend-as-a-Service)

**Primary Backend Platform:**
- Database: PostgreSQL with Row Level Security
- Authentication: Supabase Auth (email, OAuth)
- Edge Functions: 40 Deno-based serverless functions
- Realtime: Subscriptions for live data updates

**SDK/Client:** `@supabase/supabase-js` v2.89.0
**Client Location:** `src/integrations/supabase/client.ts`
**Types:** `src/integrations/supabase/types.ts`

**Environment Variables:**
- `VITE_SUPABASE_URL` - Project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Anon/public key

**Edge Function Auth:**
- `SUPABASE_URL` - Internal URL
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access for server-side operations

### Stripe (Payment Processing)

**Subscription Billing:**
- Checkout sessions for plan upgrades
- Customer portal for billing management
- Webhook processing for subscription lifecycle

**Edge Functions:**
- `supabase/functions/stripe-checkout/index.ts` - Create checkout sessions
- `supabase/functions/stripe-portal/index.ts` - Customer portal access
- `supabase/functions/stripe-webhook/index.ts` - Webhook event handler

**Plans Configuration:** `src/lib/stripe.ts`
- Starter: $29/mo, 5 sensors
- Pro: $79/mo, 25 sensors
- HACCP: $199/mo, 100 sensors
- Enterprise: Custom pricing

**Environment Variables:**
- `STRIPE_SECRET_KEY` - API secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signature verification

**Webhook Events Handled:**
- `checkout.session.completed` - Activate subscription
- `invoice.paid` - Record payment
- `invoice.payment_failed` - Mark past due
- `customer.subscription.updated` - Status changes
- `customer.subscription.deleted` - Cancellation

### The Things Network (TTN) - LoRaWAN IoT

**Device Management Platform:**
- LoRa sensor registration and provisioning
- Uplink data reception via webhooks
- Per-organization TTN application isolation

**Edge Functions:**
- `supabase/functions/ttn-webhook/index.ts` - Receive sensor data
- `supabase/functions/ttn-provision-device/index.ts` - Register devices
- `supabase/functions/ttn-provision-org/index.ts` - Create org applications
- `supabase/functions/ttn-bootstrap/index.ts` - Initial setup
- `supabase/functions/ttn-list-devices/index.ts` - Device enumeration
- `supabase/functions/ttn-deprovision-worker/index.ts` - Cleanup
- `supabase/functions/manage-ttn-settings/index.ts` - Configuration

**Shared Utilities:** `supabase/functions/_shared/ttnConfig.ts`
- DevEUI normalization and validation
- Per-org API key encryption/decryption
- Webhook secret management
- Cluster-locked to NAM1 region

**Data Flow:**
1. LoRa sensors transmit temperature/door readings
2. TTN receives via gateway network
3. Webhook delivers to `ttn-webhook` edge function
4. Function validates org webhook secret
5. Sensor data inserted into `sensor_readings` table
6. Unit status updated

**Environment Variables:**
- `TTN_ENCRYPTION_SALT` - API key obfuscation salt

**Database Table:** `ttn_connections`
- Per-org TTN application credentials
- Encrypted API keys and webhook secrets
- Provisioning status tracking

### Telnyx (SMS Notifications)

**Alert Delivery via SMS:**
- Temperature excursion alerts
- Door open notifications
- System status messages
- Toll-free number support

**Edge Functions:**
- `supabase/functions/send-sms-alert/index.ts` - Send SMS messages
- `supabase/functions/telnyx-webhook/index.ts` - Delivery status callbacks
- `supabase/functions/telnyx-configure-webhook/index.ts` - Webhook setup
- `supabase/functions/telnyx-verification-status/index.ts` - Number verification
- `supabase/functions/test-telnyx-config/index.ts` - Diagnostics

**Features:**
- E.164 phone number validation
- 15-minute rate limiting per user/alert type
- Toll-free verification status checks
- Delivery status tracking via webhooks
- Error code mapping for user-friendly messages

**Environment Variables:**
- `TELNYX_API_KEY` - API authentication
- `TELNYX_PHONE_NUMBER` - Sender number (toll-free)
- `TELNYX_MESSAGING_PROFILE_ID` - Messaging profile

**Database Table:** `sms_alert_log`
- Message tracking with status
- Provider message ID correlation
- Error logging

### Open-Meteo (Weather Data)

**Weather Information:**
- Current conditions for site locations
- Hourly forecasts (24 hours)
- Historical weather data

**Service Location:** `src/lib/weather/weatherService.ts`
**API:** `https://api.open-meteo.com/v1` (free, no API key required)

**Data Retrieved:**
- Temperature
- Humidity
- Weather condition codes
- Wind speed

**Usage:**
- Site weather widgets on dashboard
- Temperature correlation analysis

## Data Storage

### Supabase PostgreSQL

**Primary Database:**
- Multi-tenant architecture with RLS
- 111 migration files in `supabase/migrations/`
- Custom enums for unit types, alert statuses, etc.

**Key Tables:**
- `organizations` - Multi-tenant root
- `profiles` - User accounts linked to auth.users
- `sites`, `areas`, `units` - Location hierarchy
- `sensor_readings` - Temperature/door data
- `alerts`, `alert_notifications` - Alerting system
- `subscriptions`, `invoices` - Billing
- `lora_sensors`, `devices` - Hardware tracking
- `ttn_connections` - TTN integration config
- `sms_alert_log` - SMS delivery tracking

### MinIO (Local Development)

**S3-Compatible Storage:**
- Configured in `docker-compose.yml`
- Used for compliance documents, reports
- Port 9000 (API), 9001 (Console)

### Redis (Local Development)

**Caching and Jobs:**
- Configured in `docker-compose.yml`
- Port 6379
- Used for session caching, background jobs

## Authentication & Identity

**Supabase Auth:**
- Email/password authentication
- OAuth providers (configurable)
- JWT-based session management
- Row Level Security enforcement

**Client Configuration:** `src/integrations/supabase/client.ts`
```typescript
{
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
}
```

**Role System:**
- Super Admin (platform-wide)
- Owner, Admin, Manager, Staff, Viewer (per-organization)
- RBAC implementation in `src/lib/rbac/`

**Contexts:**
- `src/contexts/SuperAdminContext.tsx` - Platform admin state
- `src/contexts/DebugContext.tsx` - Debug mode
- `src/contexts/TTNConfigContext.tsx` - TTN settings

## Monitoring & Observability

**Error Tracking:**
- Console logging in edge functions
- Structured JSON logs for key events
- Error explainer utilities (`src/lib/errorExplainer.ts`)

**Logging Patterns:**
```typescript
console.log(`[TTN-WEBHOOK] ${requestId} | Processing sensor: ${sensor.name}`);
console.log(JSON.stringify({
  event: "sms_send_success",
  message_id: messageId,
  timestamp: new Date().toISOString(),
}));
```

**Health Checks:**
- `supabase/functions/health-check/index.ts` - System health endpoint
- `src/pages/HealthDashboard.tsx` - Admin health view
- Pipeline health monitoring (`src/lib/pipeline/`)

## CI/CD & Deployment

**Hosting:**
- Supabase Platform (database, auth, edge functions)
- Static hosting for frontend SPA (Vite build output)

**GitHub Integration:**
- `.github/` directory present
- Deployment likely via Supabase GitHub integration

**Local Development:**
- Docker Compose for infrastructure
- Vite dev server for frontend
- Supabase CLI for edge functions

## Webhooks & Callbacks

### Incoming Webhooks

**TTN Webhook:** `/functions/v1/ttn-webhook`
- Receives LoRa sensor uplink data
- Authentication via per-org `X-Webhook-Secret` header
- Returns 202 for unknown devices (prevents retries)

**Stripe Webhook:** `/functions/v1/stripe-webhook`
- Receives subscription lifecycle events
- Authentication via `stripe-signature` header
- Signature verification with `STRIPE_WEBHOOK_SECRET`

**Telnyx Webhook:** `/functions/v1/telnyx-webhook`
- Receives SMS delivery status reports
- Signature verification

### Outgoing Webhooks

**TTN Device Provisioning:**
- Creates devices in TTN applications
- Configures webhooks back to Supabase

## Environment Configuration

### Required Environment Variables (Frontend)

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_SUPABASE_PROJECT_ID=xxx
```

### Required Secrets (Edge Functions)

```env
# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Telnyx
TELNYX_API_KEY=...
TELNYX_PHONE_NUMBER=+1...
TELNYX_MESSAGING_PROFILE_ID=...

# TTN
TTN_ENCRYPTION_SALT=...
```

### Edge Function Configuration

**Config File:** `supabase/config.toml`
- Controls JWT verification per function
- Most internal/webhook functions have `verify_jwt = false`
- User-facing functions use `verify_jwt = true`

---

*Integration audit: 2026-01-23*
