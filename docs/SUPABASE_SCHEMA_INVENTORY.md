# Supabase Schema Inventory

## Overview

This document provides a conceptual inventory of the Supabase project `mfwyiifehsvwnjwqoxht` used by FrostGuard/FreshTrack-Pro.

**Source:** Analysis of `src/integrations/supabase/types.ts` (3,775 lines) and `supabase/migrations/`

---

## Tables by Purpose

### 1. Tenancy & Organization (3 tables)

| Table                  | Purpose                 | Key Columns                                                         | Notes                                |
| ---------------------- | ----------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| `organizations`        | Primary tenant boundary | `id`, `name`, `slug`, `timezone`, `compliance_mode`, `sensor_limit` | All data scoped to org               |
| `subscriptions`        | Billing/plan management | `organization_id`, `plan`, `status`, `stripe_customer_id`           | Links to Stripe                      |
| `organization_invites` | Pending invitations     | `organization_id`, `email`, `role`, `token`                         | **UNKNOWN:** Confirm if table exists |

### 2. User Management & RBAC (3 tables)

| Table                 | Purpose                       | Key Columns                                                       | Notes                            |
| --------------------- | ----------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `profiles`            | User profile data             | `id`, `user_id`, `organization_id`, `email`, `full_name`, `phone` | Links to `auth.users`            |
| `user_roles`          | Role assignments              | `user_id`, `organization_id`, `role`                              | Unique constraint on (user, org) |
| `escalation_contacts` | Alert notification recipients | `organization_id`, `profile_id`, `phone`, `priority`              | For SMS alerts                   |

### 3. Physical Hierarchy (4 tables)

| Table   | Purpose                 | Key Columns                                                            | Notes                      |
| ------- | ----------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `sites` | Physical locations      | `id`, `organization_id`, `name`, `address`, `timezone`                 | Top of hierarchy           |
| `areas` | Subdivisions            | `id`, `site_id`, `name`, `sort_order`                                  | E.g., "Kitchen", "Storage" |
| `units` | Refrigeration equipment | `id`, `area_id`, `name`, `unit_type`, `status`, `temp_min`, `temp_max` | Core monitoring entity     |
| `hubs`  | Network aggregators     | `id`, `site_id`, `name`, `mac_address`                                 | For BLE sensors            |

### 4. Device Management (3 tables)

| Table                 | Purpose              | Key Columns                                                  | Notes                  |
| --------------------- | -------------------- | ------------------------------------------------------------ | ---------------------- |
| `devices`             | Physical sensors     | `id`, `unit_id`, `hub_id`, `device_eui`, `status`, `battery` | Generic device record  |
| `lora_sensors`        | LoRa-specific config | `device_id`, `app_eui`, `dev_eui`, `app_key`                 | TTN integration        |
| `calibration_records` | Calibration history  | `device_id`, `calibrated_at`, `offset`, `certificate_url`    | Compliance requirement |

### 5. Telemetry Data (3 tables)

| Table                     | Purpose                      | Key Columns                                                                 | Notes                 |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------- | --------------------- |
| `sensor_readings`         | Time-series temperature data | `unit_id`, `device_id`, `temperature`, `humidity`, `battery`, `recorded_at` | High volume, indexed  |
| `manual_temperature_logs` | User-entered readings        | `unit_id`, `profile_id`, `temperature`, `photo_url`, `recorded_at`          | For manual monitoring |
| `door_events`             | Door sensor history          | `unit_id`, `state`, `timestamp`                                             | Open/close tracking   |

### 6. Alerting System (4 tables)

| Table                 | Purpose                  | Key Columns                                                                      | Notes                    |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------- | ------------------------ |
| `alert_rules`         | Threshold configuration  | `organization_id`, `site_id`, `unit_id`, `temp_min`, `temp_max`, `delay_minutes` | Hierarchical inheritance |
| `alert_rules_history` | Rule change audit        | `alert_rule_id`, `changed_by`, `old_values`, `new_values`                        | Compliance audit trail   |
| `alerts`              | Active/historical alerts | `unit_id`, `type`, `severity`, `status`, `triggered_at`, `resolved_at`           | Core alert record        |
| `corrective_actions`  | Resolution documentation | `alert_id`, `unit_id`, `profile_id`, `description`, `photo_url`                  | Compliance documentation |

### 7. Notifications (2 tables)

| Table                     | Purpose            | Key Columns                                                     | Notes                          |
| ------------------------- | ------------------ | --------------------------------------------------------------- | ------------------------------ |
| `notification_deliveries` | Delivery tracking  | `alert_id`, `profile_id`, `channel`, `status`, `sent_at`        | SMS, email, push               |
| `notification_policies`   | Notification rules | `organization_id`, `alert_type`, `channels`, `escalation_delay` | **UNKNOWN:** Confirm structure |

### 8. Audit & Compliance (2 tables)

| Table                | Purpose                    | Key Columns                                                                    | Notes                          |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| `event_logs`         | Tamper-evident audit trail | `organization_id`, `event_type`, `entity_type`, `entity_id`, `payload`, `hash` | Hash chain for integrity       |
| `compliance_reports` | Generated reports          | `organization_id`, `report_type`, `date_range`, `file_url`                     | **UNKNOWN:** Confirm if exists |

### 9. Configuration & Integration (2+ tables)

| Table              | Purpose                | Key Columns                            | Notes                          |
| ------------------ | ---------------------- | -------------------------------------- | ------------------------------ |
| `pairing_sessions` | Device pairing state   | `device_id`, `status`, `started_at`    | Temporary pairing data         |
| `ttn_applications` | TTN integration config | `organization_id`, `app_id`, `api_key` | **UNKNOWN:** Confirm structure |

---

## Enums

| Enum                   | Values                                                                                                                         | Usage                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `unit_type`            | `fridge`, `freezer`, `display_case`, `walk_in_cooler`, `walk_in_freezer`, `blast_chiller`                                      | Unit classification         |
| `unit_status`          | `ok`, `excursion`, `alarm_active`, `monitoring_interrupted`, `manual_required`, `restoring`, `offline`                         | Unit state machine          |
| `alert_type`           | `alarm_active`, `monitoring_interrupted`, `missed_manual_entry`, `low_battery`, `sensor_fault`, `door_open`, `calibration_due` | Alert classification        |
| `alert_severity`       | `info`, `warning`, `critical`                                                                                                  | Alert priority              |
| `alert_status`         | `active`, `acknowledged`, `resolved`, `escalated`                                                                              | Alert lifecycle             |
| `app_role`             | `owner`, `admin`, `manager`, `staff`, `viewer`                                                                                 | RBAC roles                  |
| `subscription_plan`    | `starter`, `pro`, `haccp`, `enterprise`                                                                                        | Billing tiers               |
| `subscription_status`  | `trial`, `active`, `past_due`, `canceled`, `paused`                                                                            | Billing state               |
| `notification_channel` | `push`, `email`, `sms`                                                                                                         | Delivery methods            |
| `notification_status`  | `pending`, `sent`, `delivered`, `failed`                                                                                       | **UNKNOWN:** Confirm values |
| `device_status`        | `active`, `inactive`, `pairing`, `error`                                                                                       | **UNKNOWN:** Confirm values |
| `compliance_mode`      | `standard`, `haccp`                                                                                                            | Compliance level            |
| `pairing_status`       | `pending`, `completed`, `failed`, `expired`                                                                                    | Pairing state               |

---

## Security Primitives

### RLS Functions

| Function              | Signature                                              | Purpose                 |
| --------------------- | ------------------------------------------------------ | ----------------------- |
| `user_belongs_to_org` | `(user_id UUID, org_id UUID) → boolean`                | Tenant isolation check  |
| `has_role`            | `(user_id UUID, org_id UUID, role app_role) → boolean` | Role verification       |
| `get_user_org_id`     | `(user_id UUID) → UUID`                                | Get user's organization |

**Location to confirm:** `supabase/migrations/` SQL files

### RLS Policy Patterns

#### Pattern 1: Tenant Isolation (SELECT)

```sql
CREATE POLICY "Users can view sites in their organization"
  ON public.sites FOR SELECT
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
```

**Applied to:** `organizations`, `sites`, `areas`, `units`, `devices`, `sensor_readings`, `alerts`, `alert_rules`

#### Pattern 2: Role-Based Modification (INSERT/UPDATE/DELETE)

```sql
CREATE POLICY "Admins can manage sites"
  ON public.sites FOR ALL
  USING (
    public.has_role(auth.uid(), organization_id, 'owner') OR
    public.has_role(auth.uid(), organization_id, 'admin')
  );
```

**Applied to:** Entity management (sites, areas, units, alert_rules)

#### Pattern 3: Hierarchical Access

```sql
CREATE POLICY "Users can view areas"
  ON public.areas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = areas.site_id
      AND public.user_belongs_to_org(auth.uid(), s.organization_id)
    )
  );
```

**Applied to:** `areas`, `units`, `sensor_readings`, `alerts`

#### Pattern 4: Self-Access Only

```sql
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);
```

**Applied to:** `profiles` (personal data)

### Service Role Usage

The `service_role` key bypasses RLS for:

- Data ingestion (sensor readings from TTN webhooks)
- Background job processing (alert evaluation)
- Admin operations (user management)

**Security Note:** Service role should only be used in Edge Functions, never exposed to client.

---

## Realtime Usage

### Current Implementation

| Feature            | Implementation                      | Notes                       |
| ------------------ | ----------------------------------- | --------------------------- |
| Auth state changes | `supabase.auth.onAuthStateChange()` | Session management          |
| Data polling       | React Query with refetch intervals  | Not using Supabase Realtime |
| Live updates       | Limited                             | Most data fetched on-demand |

### Realtime Channels (if any)

**UNKNOWN:** Confirm if any tables have realtime enabled:

```sql
-- Check in Supabase dashboard or migrations
ALTER TABLE sensor_readings REPLICA IDENTITY FULL;
```

### Payload Types (if using realtime)

| Channel           | Payload                                 | Subscribers                |
| ----------------- | --------------------------------------- | -------------------------- |
| `sensor_readings` | `{ unit_id, temperature, recorded_at }` | **UNKNOWN:** Confirm usage |
| `alerts`          | `{ id, type, severity, unit_id }`       | **UNKNOWN:** Confirm usage |

**Recommendation:** Current codebase uses polling via React Query. Socket.io migration should be straightforward.

---

## Edge Functions Inventory

### Data Ingestion (2 functions)

| Function                   | Trigger   | Purpose                                               | Dependencies                         |
| -------------------------- | --------- | ----------------------------------------------------- | ------------------------------------ |
| `ingest-readings`          | HTTP POST | Normalize and store sensor data from multiple sources | Zod validation, payloadNormalization |
| `update-sensor-assignment` | HTTP POST | Bind sensor to unit                                   | Database update                      |

### Alert Processing (3 functions)

| Function              | Trigger           | Purpose                                  | Dependencies                     |
| --------------------- | ----------------- | ---------------------------------------- | -------------------------------- |
| `process-unit-states` | Job queue or HTTP | Evaluate alert rules, update unit status | Alert rules, state machine logic |
| `process-escalations` | Job queue         | Handle escalation workflows              | Time-based logic                 |
| `send-sms-alert`      | Job queue         | Send SMS via Telnyx                      | Telnyx API                       |

### Notification System (2 functions)

| Function                      | Trigger   | Purpose                                 | Dependencies                  |
| ----------------------------- | --------- | --------------------------------------- | ----------------------------- |
| `process-notification-events` | Job queue | Multi-channel delivery orchestration    | Channel handlers              |
| `telnyx-webhook`              | HTTP POST | Handle incoming SMS and delivery status | Telnyx signature verification |

### TTN Integration (12 functions)

| Function                  | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `ttn-bootstrap`           | Initial TTN application setup           |
| `ttn-provision-org`       | Create TTN application for organization |
| `ttn-provision-device`    | Register device in TTN                  |
| `ttn-provision-gateway`   | Register gateway in TTN                 |
| `ttn-deprovision-worker`  | Clean up TTN resources                  |
| `ttn-webhook`             | Handle TTN uplink messages              |
| `ttn-list-devices`        | List devices from TTN API               |
| `ttn-manage-application`  | Application management operations       |
| `sync-ttn-settings`       | Sync config between DB and TTN          |
| `update-ttn-webhook`      | Configure TTN webhook URL               |
| `check-ttn-device-exists` | Validate device in TTN                  |
| `ttn-gateway-preflight`   | Gateway validation checks               |

### Payment & Billing (3 functions)

| Function          | Purpose                           |
| ----------------- | --------------------------------- |
| `stripe-webhook`  | Handle Stripe subscription events |
| `stripe-checkout` | Create checkout session           |
| `stripe-portal`   | Create customer portal session    |

### SMS Configuration (3 functions)

| Function                     | Purpose                       |
| ---------------------------- | ----------------------------- |
| `telnyx-verification-status` | Check phone verification      |
| `telnyx-configure-webhook`   | Set up Telnyx webhook         |
| `test-telnyx-config`         | Validate Telnyx configuration |

### Utility Functions (8+ functions)

| Function                   | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `check-slug-available`     | Validate organization slug uniqueness    |
| `check-password-breach`    | Check password against Have I Been Pwned |
| `upload-public-asset`      | Handle public file uploads               |
| `verify-public-asset`      | Validate uploaded assets                 |
| `cleanup-user-sensors`     | Clean up on account deletion             |
| `user-sync-emitter`        | Broadcast user events                    |
| `fetch-org-state`          | Get organization state snapshot          |
| `org-state-api`            | State query API                          |
| `health-check`             | System diagnostics                       |
| `export-temperature-logs`  | Generate CSV/PDF reports                 |
| `run-simulator-heartbeats` | Test data generation                     |
| `emulator-sync`            | Emulator state synchronization           |

### Shared Utilities (`_shared/`)

| File                      | Purpose                            |
| ------------------------- | ---------------------------------- |
| `validation.ts`           | Zod schemas for runtime validation |
| `cors.ts`                 | CORS header configuration          |
| `response.ts`             | Standardized response format       |
| `payloadNormalization.ts` | Multi-source payload handling      |
| `deviceRegistry.ts`       | Device metadata registry           |
| `ttnBase.ts`              | TTN client setup                   |
| `ttnConfig.ts`            | TTN configuration                  |
| `ttnPermissions.ts`       | TTN permission validation          |

---

## Unknowns & Confirmations Needed

### Tables to Confirm

| Item                                    | Status  | Where to Confirm                 |
| --------------------------------------- | ------- | -------------------------------- |
| `organization_invites` table            | UNKNOWN | Check migrations or types.ts     |
| `notification_policies` table structure | UNKNOWN | Check types.ts or codebase usage |
| `compliance_reports` table              | UNKNOWN | Check migrations                 |
| `ttn_applications` table structure      | UNKNOWN | Check TTN-related code           |

### Enums to Confirm

| Item                         | Status  | Where to Confirm                   |
| ---------------------------- | ------- | ---------------------------------- |
| `notification_status` values | UNKNOWN | Check notification_deliveries type |
| `device_status` values       | UNKNOWN | Check devices table type           |

### Realtime to Confirm

| Item                          | Status  | Where to Confirm                   |
| ----------------------------- | ------- | ---------------------------------- |
| Tables with REPLICA IDENTITY  | UNKNOWN | Supabase dashboard or migrations   |
| Active realtime subscriptions | UNKNOWN | Search codebase for `.subscribe()` |

### Edge Functions to Confirm

| Item                        | Status  | Where to Confirm                     |
| --------------------------- | ------- | ------------------------------------ |
| Scheduled function triggers | UNKNOWN | Check `supabase/functions/` for cron |
| Environment variables used  | UNKNOWN | Check each function's imports        |

---

## Data Volume Estimates

| Table             | Estimated Rows | Growth Rate | Notes                 |
| ----------------- | -------------- | ----------- | --------------------- |
| `organizations`   | 3-4            | Slow        | Tenant count          |
| `profiles`        | ~5             | Slow        | User count            |
| `sites`           | ~10            | Slow        | Location count        |
| `units`           | ~20            | Slow        | Equipment count       |
| `sensor_readings` | ~100K          | High        | ~50 readings/unit/day |
| `alerts`          | ~500           | Medium      | Based on excursions   |
| `event_logs`      | ~5K            | Medium      | Audit events          |

**Total estimated data:** <1GB (confirmed in requirements)

---

_Inventory Version: 1.0_
_Created: January 2026_
_Status: Review and confirm unknowns_
