# FrostGuard/FreshTrack Database Schema Documentation

## 1. Overview

This document describes the PostgreSQL database schema for FrostGuard/FreshTrack, a cold-chain IoT monitoring platform for temperature-sensitive storage and compliance tracking.

### Technology Stack

- **Database Engine:** PostgreSQL 12+ with declarative partitioning
- **ORM:** Drizzle ORM (type-safe, generated from schema definitions)
- **Connection Pooling:** node-postgres (pg) with PgBouncer compatibility
- **Migration Tool:** Drizzle Kit (schema-driven migrations)

### Schema Statistics

- **33 Tables** across 13 schema modules
- **15 Enums** (unit types, alert statuses, notification channels, etc.)
- **Monthly Partitioning** on sensor_readings table for time-series optimization
- **Multi-Tenant Architecture** with organization-scoped isolation
- **24-Month Data Retention** with automated partition management

### Key Design Principles

1. **Multi-Tenancy:** All data is scoped to organizations. No cross-org data leakage.
2. **Soft Deletes:** Sites, areas, units, organizations use deletedAt timestamp (not hard deletes).
3. **Audit Trail:** eventLogs captures all state changes for compliance and forensics.
4. **Time-Series Optimization:** sensor_readings partitioned monthly to maintain sub-second query times at scale.
5. **Encryption Ready:** Sensitive fields (API keys, tokens) marked for application-level encryption.

---

## 2. Entity Relationship Diagram

```
Organizations (Tenant Root)
├── Subscriptions (billing/plan)
├── TTN Connections (LoRaWAN integration)
│   └── Gateways (TTN gateways for network)
├── SMS Configs (Telnyx SMS provider)
├── Notification Settings (org-level email config)
├── Sites (physical locations)
│   ├── Areas (zones within sites)
│   │   └── Units (refrigeration equipment - core entity)
│   │       ├── Sensor Readings [PARTITIONED BY RANGE(recorded_at)]
│   │       │   └── Monthly partitions: sensor_readings_y{YYYY}m{MM}
│   │       ├── Manual Temperature Logs (user-logged temps)
│   │       ├── Door Events (door open/close events)
│   │       ├── Reading Metrics (aggregated stats: hourly/daily/weekly/monthly)
│   │       ├── Alerts (alert instances)
│   │       │   ├── Notification Deliveries (per-channel delivery tracking)
│   │       │   └── Corrective Actions (compliance evidence)
│   │       └── Alert Rules (also org/site-scoped thresholds)
│   └── Hubs (BLE aggregators at site level)
├── Gateways (also org/site-scoped for cross-site TTN gateways)
├── Profiles (user accounts)
│   ├── User Roles (org membership + role assignment)
│   ├── Escalation Contacts (alert notification recipients)
│   └── Pilot Feedback (weekly feedback from pilot participants)
├── Alert Rules (hierarchical: org > site > unit scope)
├── Event Logs (audit trail for HACCP/FDA compliance)
└── Entity Dashboard Layouts (user-customized dashboard configurations)

Devices (Cross-Cutting Dimension - not org-scoped)
├── LoRa Sensors (TTN-specific device config)
├── Calibration Records (compliance calibration history)
├── Pairing Sessions (temporary device onboarding state)
├── Sensor Readings (cross-references devices.id, but foreign key allows NULL)
└── Door Events (cross-references devices.id, but foreign key allows NULL)

Platform-Level (No Org Scope)
├── Platform Roles (super admin assignments)
├── User Sync Log (user provisioning to external systems)
├── Stripe Events (webhook idempotency tracking)
└── Partition Retention Overrides (legal hold/compliance data preservation)
```

---

## 3. Tables Reference

### Enums

| Enum Name            | Values                                                                                                           | Purpose                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| unit_type            | fridge, freezer, display_case, walk_in_cooler, walk_in_freezer, blast_chiller                                    | Equipment classification            |
| unit_status          | ok, excursion, alarm_active, monitoring_interrupted, manual_required, restoring, offline                         | Unit health state machine           |
| temp_unit            | F, C                                                                                                             | Temperature display unit            |
| alert_type           | alarm_active, monitoring_interrupted, missed_manual_entry, low_battery, sensor_fault, door_open, calibration_due | Alert classification                |
| alert_severity       | info, warning, critical                                                                                          | Alert urgency level                 |
| alert_status         | active, acknowledged, resolved, escalated                                                                        | Alert lifecycle state               |
| app_role             | owner, admin, manager, staff, viewer                                                                             | User role/permission level          |
| subscription_plan    | starter, pro, haccp, enterprise                                                                                  | Billing plan tier                   |
| subscription_status  | trial, active, past_due, canceled, paused                                                                        | Subscription state                  |
| notification_channel | push, email, sms                                                                                                 | Alert delivery method               |
| notification_status  | pending, sent, delivered, failed                                                                                 | Delivery lifecycle                  |
| device_status        | active, inactive, pairing, error                                                                                 | Device provisioning state           |
| compliance_mode      | standard, haccp                                                                                                  | Organization compliance requirement |
| pairing_status       | pending, completed, failed, expired                                                                              | Device onboarding state             |
| gateway_status       | online, offline, disconnected, unknown                                                                           | Gateway connectivity state          |

---

### Tenancy Tables

#### organizations

**Path:** `backend/src/db/schema/tenancy.ts`

Root tenant entity. All other tables cascade from this.

| Column         | Type                   | Nullable | Default           | Description                           |
| -------------- | ---------------------- | -------- | ----------------- | ------------------------------------- |
| id             | UUID                   | NO       | gen_random_uuid() | Unique organization identifier        |
| name           | varchar(256)           | NO       |                   | Human-readable org name               |
| slug           | varchar(256)           | NO       |                   | URL-safe identifier (unique)          |
| timezone       | varchar(100)           | NO       | 'UTC'             | Organization timezone for reporting   |
| complianceMode | enum (compliance_mode) | NO       | 'standard'        | standard or haccp requirement         |
| sensorLimit    | integer                | NO       | 10                | Max sensors allowed on plan           |
| logoUrl        | text                   | YES      |                   | Organization logo image URL           |
| createdAt      | timestamp(3) tz        | NO       | now()             | Record creation time                  |
| updatedAt      | timestamp(3) tz        | NO       | now()             | Last modification time (auto-updated) |
| deletedAt      | timestamp(3) tz        | YES      |                   | Soft delete timestamp                 |

**Indexes:** organizations_slug_idx (UNIQUE on slug)

**Notes:** Soft delete via deletedAt. All queries should filter WHERE deletedAt IS NULL.

---

#### subscriptions

**Path:** `backend/src/db/schema/tenancy.ts`

Billing and plan management per organization.

| Column               | Type                       | Nullable | Default           | Description                                    |
| -------------------- | -------------------------- | -------- | ----------------- | ---------------------------------------------- |
| id                   | UUID                       | NO       | gen_random_uuid() | Subscription record ID                         |
| organizationId       | UUID                       | NO       |                   | Reference to organizations.id (CASCADE delete) |
| plan                 | enum (subscription_plan)   | NO       | 'starter'         | Current billing plan tier                      |
| status               | enum (subscription_status) | NO       | 'trial'           | Billing status (trial, active, past_due, etc.) |
| stripeCustomerId     | varchar(256)               | YES      |                   | Stripe customer ID for invoicing               |
| stripeSubscriptionId | varchar(256)               | YES      |                   | Stripe subscription ID for recurring billing   |
| currentPeriodStart   | timestamp(3) tz            | YES      |                   | Billing period start date                      |
| currentPeriodEnd     | timestamp(3) tz            | YES      |                   | Billing period end date                        |
| trialEndsAt          | timestamp(3) tz            | YES      |                   | Trial expiration date                          |
| canceledAt           | timestamp(3) tz            | YES      |                   | Subscription cancellation date                 |
| createdAt            | timestamp(3) tz            | NO       | now()             | Record creation time                           |
| updatedAt            | timestamp(3) tz            | NO       | now()             | Last modification time                         |
| deletedAt            | timestamp(3) tz            | YES      |                   | Soft delete timestamp                          |

**Indexes:**

- subscriptions_org_idx on organizationId
- subscriptions_stripe_customer_idx on stripeCustomerId

**Notes:** One subscription per organization. Stripe integration for SaaS billing.

---

#### ttnConnections

**Path:** `backend/src/db/schema/tenancy.ts`

The Things Network (LoRaWAN) integration configuration. Stores credentials and provisioning state.

| Column                    | Type            | Nullable | Default           | Description                                                       |
| ------------------------- | --------------- | -------- | ----------------- | ----------------------------------------------------------------- |
| id                        | UUID            | NO       | gen_random_uuid() | Connection record ID                                              |
| organizationId            | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete)                    |
| applicationId             | varchar(256)    | YES      |                   | TTN application ID (legacy alias field)                           |
| ttnApplicationId          | varchar(256)    | YES      |                   | Current TTN application ID                                        |
| webhookSecret             | varchar(256)    | NO       |                   | API key for webhook authentication (unique per org)               |
| isActive                  | boolean         | NO       | true              | Whether connection is actively sending data                       |
| lastUsedAt                | timestamp(3) tz | YES      |                   | Last time connection received data                                |
| isEnabled                 | boolean         | NO       | false             | Whether integration is enabled                                    |
| provisioningStatus        | varchar(256)    | YES      | 'not_started'     | State: not_started, in_progress, complete, failed                 |
| ttnRegion                 | varchar(256)    | YES      |                   | TTN region (e.g., 'eu1', 'us1')                                   |
| ttnApiKeyEncrypted        | varchar(512)    | YES      |                   | Encrypted app API key (application-level encryption)              |
| ttnApiKeyLast4            | varchar(4)      | YES      |                   | Last 4 chars for audit/display (no decryption needed)             |
| ttnOrgApiKeyEncrypted     | varchar(512)    | YES      |                   | Encrypted org API key (for provisioning)                          |
| ttnOrgApiKeyLast4         | varchar(4)      | YES      |                   | Last 4 chars of org API key                                       |
| ttnWebhookUrl             | varchar(512)    | YES      |                   | Webhook URL configured at TTN                                     |
| ttnWebhookSecretLast4     | varchar(4)      | YES      |                   | Last 4 chars of webhook secret                                    |
| ttnWebhookSecretEncrypted | varchar(512)    | YES      |                   | Encrypted webhook secret                                          |
| provisioningStep          | varchar(256)    | YES      |                   | Current step in provisioning state machine                        |
| provisioningStepDetails   | text            | YES      |                   | JSON string with step-specific context (MEDIUM: convert to jsonb) |
| provisioningError         | varchar(1024)   | YES      |                   | Error message from failed provisioning step                       |
| provisioningAttemptCount  | integer         | YES      | 0                 | Number of provisioning retry attempts                             |
| lastHttpStatus            | integer         | YES      |                   | Last HTTP response code from TTN API                              |
| lastHttpBody              | text            | YES      |                   | Last HTTP response body (for debugging)                           |
| appRightsCheckStatus      | varchar(256)    | YES      |                   | Status of API rights validation                                   |
| lastTtnCorrelationId      | varchar(256)    | YES      |                   | TTN correlation ID for support tickets                            |
| lastTtnErrorName          | varchar(256)    | YES      |                   | TTN error code from last API call                                 |
| credentialsLastRotatedAt  | timestamp(3) tz | YES      |                   | Audit trail: last credential rotation                             |
| createdAt                 | timestamp(3) tz | NO       | now()             | Record creation time                                              |
| updatedAt                 | timestamp(3) tz | NO       | now()             | Last modification time                                            |
| deletedAt                 | timestamp(3) tz | YES      |                   | Soft delete timestamp                                             |

**Indexes:**

- ttn_connections_org_idx on organizationId
- ttn_connections_webhook_secret_idx (UNIQUE on webhookSecret)

**Notes:** Stores encrypted API credentials. provisioningStepDetails is JSON-as-text (MEDIUM issue: should be JSONB for native operators).

---

#### smsConfigs

**Path:** `backend/src/db/schema/tenancy.ts`

Telnyx SMS service configuration per organization.

| Column                   | Type            | Nullable | Default           | Description                                            |
| ------------------------ | --------------- | -------- | ----------------- | ------------------------------------------------------ |
| id                       | UUID            | NO       | gen_random_uuid() | Config record ID                                       |
| organizationId           | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete, UNIQUE) |
| telnyxApiKey             | varchar(512)    | NO       |                   | Telnyx API key (encrypted at rest in production)       |
| telnyxPhoneNumber        | varchar(32)     | NO       |                   | Phone number for SMS sender ID                         |
| telnyxMessagingProfileId | varchar(256)    | YES      |                   | Messaging profile ID at Telnyx                         |
| isEnabled                | boolean         | NO       | true              | Whether SMS notifications are active                   |
| lastTestAt               | timestamp(3) tz | YES      |                   | Audit: last time SMS was tested                        |
| createdAt                | timestamp(3) tz | NO       | now()             | Record creation time                                   |
| updatedAt                | timestamp(3) tz | NO       | now()             | Last modification time                                 |
| deletedAt                | timestamp(3) tz | YES      |                   | Soft delete timestamp                                  |

**Indexes:**

- sms_configs_org_idx on organizationId
- sms_configs_org_unique_idx (UNIQUE on organizationId) [REDUNDANT with org_idx - MEDIUM issue]

**Notes:** One config per org. Credentials encrypted at application level.

---

#### notificationSettings

**Path:** `backend/src/db/schema/tenancy.ts`

Organization-level email notification preferences.

| Column               | Type            | Nullable | Default           | Description                                            |
| -------------------- | --------------- | -------- | ----------------- | ------------------------------------------------------ |
| id                   | UUID            | NO       | gen_random_uuid() | Settings record ID                                     |
| organizationId       | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete, UNIQUE) |
| emailEnabled         | boolean         | NO       | true              | Whether email notifications are globally enabled       |
| recipients           | text            | YES      |                   | JSON array of email addresses for alerts               |
| notifyTempExcursion  | boolean         | NO       | true              | Alert on temperature out-of-range                      |
| notifyAlarmActive    | boolean         | NO       | true              | Alert on alarm state                                   |
| notifyManualRequired | boolean         | NO       | true              | Alert on missed manual check-in                        |
| notifyOffline        | boolean         | NO       | false             | Alert when sensor goes offline                         |
| notifyLowBattery     | boolean         | NO       | false             | Alert on low battery warnings                          |
| notifyWarnings       | boolean         | NO       | false             | Alert on non-critical warnings                         |
| createdAt            | timestamp(3) tz | NO       | now()             | Record creation time                                   |
| updatedAt            | timestamp(3) tz | NO       | now()             | Last modification time                                 |

**Indexes:**

- notification_settings_org_idx on organizationId
- notification_settings_org_unique_idx (UNIQUE on organizationId) [REDUNDANT - MEDIUM issue]

**Notes:** recipients stored as JSON-as-text (MEDIUM issue: should be JSONB).

---

### User Management Tables

#### profiles

**Path:** `backend/src/db/schema/users.ts`

User profile data linked to Stack Auth (external auth provider).

| Column          | Type            | Nullable | Default           | Description                                      |
| --------------- | --------------- | -------- | ----------------- | ------------------------------------------------ |
| id              | UUID            | NO       | gen_random_uuid() | Profile ID (internal)                            |
| userId          | UUID            | NO       |                   | Stack Auth user ID (external identifier, UNIQUE) |
| organizationId  | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete)   |
| email           | varchar(256)    | NO       |                   | User email address                               |
| fullName        | varchar(256)    | YES      |                   | Display name                                     |
| avatarUrl       | text            | YES      |                   | Profile picture URL                              |
| phone           | varchar(50)     | YES      |                   | Phone number                                     |
| phoneVerified   | boolean         | NO       | false             | Whether phone is verified for SMS                |
| pushEnabled     | boolean         | NO       | true              | Opt-in for push notifications                    |
| emailEnabled    | boolean         | NO       | true              | Opt-in for email notifications                   |
| smsEnabled      | boolean         | NO       | false             | Opt-in for SMS notifications                     |
| digestDaily     | boolean         | NO       | false             | Send daily digest email                          |
| digestWeekly    | boolean         | NO       | false             | Send weekly digest email                         |
| digestDailyTime | varchar(5)      | NO       | '09:00'           | Time for daily digest (HH:MM format)             |
| digestSiteIds   | text            | YES      |                   | JSON array of site IDs to include in digest      |
| timezone        | varchar(64)     | NO       | 'UTC'             | User's local timezone                            |
| createdAt       | timestamp(3) tz | NO       | now()             | Record creation time                             |
| updatedAt       | timestamp(3) tz | NO       | now()             | Last modification time                           |

**Indexes:**

- profiles_user_id_idx (UNIQUE on userId)
- profiles_org_idx on organizationId
- profiles_email_idx on email

**Notes:**

- digestSiteIds is JSON-as-text (MEDIUM issue: should be JSONB)
- userId links to external Stack Auth system; profiles.id used for internal references
- CRITICAL DATA CONSISTENCY ISSUE: event_logs.actorId stores MIXED identifiers (some profiles.userId, some profiles.id)

---

#### userRoles

**Path:** `backend/src/db/schema/users.ts`

Role assignments per organization (user-org membership).

| Column         | Type            | Nullable | Default           | Description                                               |
| -------------- | --------------- | -------- | ----------------- | --------------------------------------------------------- |
| id             | UUID            | NO       | gen_random_uuid() | Role assignment ID                                        |
| userId         | UUID            | NO       |                   | Stack Auth user ID (not FK, allows pre-provisioned users) |
| organizationId | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete)            |
| role           | enum (app_role) | NO       | 'viewer'          | Role: owner, admin, manager, staff, viewer                |
| createdAt      | timestamp(3) tz | NO       | now()             | Record creation time                                      |
| updatedAt      | timestamp(3) tz | NO       | now()             | Last modification time                                    |

**Indexes:**

- user_roles_user_org_idx (UNIQUE on userId, organizationId)
- user_roles_org_idx on organizationId

**Notes:** One role per user per org. userId is not foreign-keyed (allows pre-provisioning).

---

#### escalationContacts

**Path:** `backend/src/db/schema/users.ts`

Alert notification recipients (can be users or external contacts).

| Column         | Type            | Nullable | Default           | Description                                            |
| -------------- | --------------- | -------- | ----------------- | ------------------------------------------------------ |
| id             | UUID            | NO       | gen_random_uuid() | Contact record ID                                      |
| organizationId | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete)         |
| profileId      | UUID            | YES      |                   | Optional reference to profiles.id (SET NULL on delete) |
| name           | varchar(256)    | NO       |                   | Contact name                                           |
| phone          | varchar(50)     | NO       |                   | Phone number for SMS alerts                            |
| email          | varchar(256)    | YES      |                   | Email address                                          |
| priority       | integer         | NO       | 0                 | Escalation priority (0=primary, 1,2,3=backup)          |
| isActive       | boolean         | NO       | true              | Whether contact receives alerts                        |
| createdAt      | timestamp(3) tz | NO       | now()             | Record creation time                                   |
| updatedAt      | timestamp(3) tz | NO       | now()             | Last modification time                                 |

**Indexes:**

- escalation_contacts_org_idx on organizationId
- escalation_contacts_profile_idx on profileId
- escalation_contacts_priority_idx (COMPOSITE on organizationId, priority)

**Notes:** Can represent both app users and external emergency contacts.

---

#### platformRoles

**Path:** `backend/src/db/schema/users.ts`

Platform-wide roles (super admins). NOT scoped to organization.

| Column    | Type            | Nullable | Default           | Description                     |
| --------- | --------------- | -------- | ----------------- | ------------------------------- |
| id        | UUID            | NO       | gen_random_uuid() | Role assignment ID              |
| userId    | UUID            | NO       |                   | Stack Auth user ID              |
| role      | varchar(50)     | NO       |                   | Role name (e.g., 'SUPER_ADMIN') |
| createdAt | timestamp(3) tz | NO       | now()             | Record creation time            |
| updatedAt | timestamp(3) tz | NO       | now()             | Last modification time          |

**Indexes:** platform_roles_user_role_idx (UNIQUE on userId, role)

**Notes:** Global platform roles, not organization-scoped. Super admin access across all tenants.

---

#### userSyncLog

**Path:** `backend/src/db/schema/users.ts`

Audit trail for user sync events to external systems (e.g., emulator, third-party apps).

| Column    | Type            | Nullable | Default           | Description                                         |
| --------- | --------------- | -------- | ----------------- | --------------------------------------------------- |
| id        | UUID            | NO       | gen_random_uuid() | Log entry ID                                        |
| userId    | UUID            | NO       |                   | Stack Auth user ID                                  |
| eventType | varchar(64)     | NO       |                   | Event type (e.g., 'sync_user', 'create_account')    |
| payload   | text            | YES      |                   | JSON payload of sync data (MEDIUM: should be JSONB) |
| status    | varchar(32)     | NO       | 'pending'         | Status: pending, sent, failed, delivered            |
| lastError | text            | YES      |                   | Error message if failed                             |
| sentAt    | timestamp(3) tz | YES      |                   | When event was sent to external system              |
| createdAt | timestamp(3) tz | NO       | now()             | Record creation time                                |
| updatedAt | timestamp(3) tz | NO       | now()             | Last modification time                              |

**Indexes:**

- user_sync_log_user_idx on userId
- user_sync_log_status_idx on status
- user_sync_log_created_idx on createdAt

**Notes:** Global platform table (not org-scoped). payload is JSON-as-text.

---

### Hierarchy Tables

#### sites

**Path:** `backend/src/db/schema/hierarchy.ts`

Physical locations (top of organizational hierarchy).

| Column                   | Type                   | Nullable | Default           | Description                                              |
| ------------------------ | ---------------------- | -------- | ----------------- | -------------------------------------------------------- |
| id                       | UUID                   | NO       | gen_random_uuid() | Site ID                                                  |
| organizationId           | UUID                   | NO       |                   | Reference to organizations.id (CASCADE delete)           |
| name                     | varchar(256)           | NO       |                   | Site name (e.g., "Downtown Store #42")                   |
| address                  | text                   | YES      |                   | Street address                                           |
| city                     | varchar(128)           | YES      |                   | City                                                     |
| state                    | varchar(64)            | YES      |                   | State/province                                           |
| postalCode               | varchar(20)            | YES      |                   | Postal/ZIP code                                          |
| country                  | varchar(64)            | YES      |                   | Country                                                  |
| timezone                 | varchar(100)           | NO       | 'UTC'             | Site-specific timezone (overrides org)                   |
| complianceMode           | enum (compliance_mode) | YES      | 'standard'        | Site-specific compliance requirement                     |
| manualLogCadenceSeconds  | integer                | YES      |                   | Default interval for manual temperature checks (seconds) |
| correctiveActionRequired | boolean                | YES      | false             | Flag: site-wide corrective action needed                 |
| latitude                 | varchar(32)            | YES      |                   | Geographic latitude                                      |
| longitude                | varchar(32)            | YES      |                   | Geographic longitude                                     |
| isActive                 | boolean                | NO       | true              | Whether site is operational                              |
| createdAt                | timestamp(3) tz        | NO       | now()             | Record creation time                                     |
| updatedAt                | timestamp(3) tz        | NO       | now()             | Last modification time                                   |
| deletedAt                | timestamp(3) tz        | YES      |                   | Soft delete timestamp                                    |

**Indexes:**

- sites_org_idx on organizationId
- sites_active_idx (COMPOSITE on organizationId, isActive)

**Notes:** Soft delete via deletedAt. Top-level entity in hierarchy.

---

#### areas

**Path:** `backend/src/db/schema/hierarchy.ts`

Subdivisions within a site (e.g., "Produce Section", "Frozen Foods").

| Column      | Type            | Nullable | Default           | Description                            |
| ----------- | --------------- | -------- | ----------------- | -------------------------------------- |
| id          | UUID            | NO       | gen_random_uuid() | Area ID                                |
| siteId      | UUID            | NO       |                   | Reference to sites.id (CASCADE delete) |
| name        | varchar(256)    | NO       |                   | Area name                              |
| description | text            | YES      |                   | Area description/purpose               |
| sortOrder   | integer         | NO       | 0                 | Display order within site (0=first)    |
| isActive    | boolean         | NO       | true              | Whether area is operational            |
| createdAt   | timestamp(3) tz | NO       | now()             | Record creation time                   |
| updatedAt   | timestamp(3) tz | NO       | now()             | Last modification time                 |
| deletedAt   | timestamp(3) tz | YES      |                   | Soft delete timestamp                  |

**Indexes:**

- areas_site_idx on siteId
- areas_sort_idx (COMPOSITE on siteId, sortOrder)

**Notes:** Soft delete via deletedAt.

---

#### units

**Path:** `backend/src/db/schema/hierarchy.ts`

Refrigeration equipment (core monitoring entity). Temperature readings and alerts are associated with units.

| Column                   | Type               | Nullable | Default           | Description                                                  |
| ------------------------ | ------------------ | -------- | ----------------- | ------------------------------------------------------------ |
| id                       | UUID               | NO       | gen_random_uuid() | Unit ID                                                      |
| areaId                   | UUID               | NO       |                   | Reference to areas.id (CASCADE delete)                       |
| name                     | varchar(256)       | NO       |                   | Unit name (e.g., "Reach-In Freezer #3")                      |
| unitType                 | enum (unit_type)   | NO       |                   | Equipment type: fridge, freezer, display_case, etc.          |
| status                   | enum (unit_status) | NO       | 'ok'              | Current health status                                        |
| tempMin                  | integer            | NO       |                   | Minimum safe temperature (in device units, typically \* 100) |
| tempMax                  | integer            | NO       |                   | Maximum safe temperature                                     |
| tempUnit                 | enum (temp_unit)   | NO       | 'F'               | Display unit: Fahrenheit or Celsius                          |
| manualMonitoringRequired | boolean            | NO       | false             | Requires manual temperature checks                           |
| manualMonitoringInterval | integer            | YES      |                   | Interval for manual checks (minutes)                         |
| lastReadingAt            | timestamp(3) tz    | YES      |                   | Timestamp of most recent sensor reading                      |
| lastTemperature          | integer            | YES      |                   | Temperature from last reading (for dashboard)                |
| lastManualLogAt          | timestamp(3) tz    | YES      |                   | Timestamp of last manual log                                 |
| isActive                 | boolean            | NO       | true              | Whether unit is operational                                  |
| sortOrder                | integer            | NO       | 0                 | Display order within area                                    |
| createdAt                | timestamp(3) tz    | NO       | now()             | Record creation time                                         |
| updatedAt                | timestamp(3) tz    | NO       | now()             | Last modification time                                       |
| deletedAt                | timestamp(3) tz    | YES      |                   | Soft delete timestamp                                        |

**Indexes:**

- units_area_idx on areaId
- units_status_idx on status
- units_type_idx on unitType
- units_active_idx (COMPOSITE on areaId, isActive)
- units_last_reading_at_idx (PARTIAL on lastReadingAt DESC WHERE isActive = true)

**Notes:**

- Soft delete via deletedAt
- lastTemperature is denormalized for dashboard (avoids scanning sensor_readings)
- units_last_reading_at_idx supports offline unit detection queries

---

#### hubs

**Path:** `backend/src/db/schema/hierarchy.ts`

BLE gateway/aggregators at site level (collect data from BLE sensors).

| Column          | Type            | Nullable | Default           | Description                                            |
| --------------- | --------------- | -------- | ----------------- | ------------------------------------------------------ |
| id              | UUID            | NO       | gen_random_uuid() | Hub ID                                                 |
| siteId          | UUID            | NO       |                   | Reference to sites.id (CASCADE delete)                 |
| name            | varchar(256)    | NO       |                   | Hub name/location                                      |
| macAddress      | varchar(17)     | YES      |                   | MAC address (XX:XX:XX:XX:XX:XX format, unique per org) |
| firmwareVersion | varchar(32)     | YES      |                   | Current firmware version                               |
| lastSeenAt      | timestamp(3) tz | YES      |                   | Last time hub reported data                            |
| isOnline        | boolean         | NO       | false             | Whether hub is currently connected                     |
| isActive        | boolean         | NO       | true              | Whether hub is operational                             |
| createdAt       | timestamp(3) tz | NO       | now()             | Record creation time                                   |
| updatedAt       | timestamp(3) tz | NO       | now()             | Last modification time                                 |
| deletedAt       | timestamp(3) tz | YES      |                   | Soft delete timestamp                                  |

**Indexes:**

- hubs_site_idx on siteId
- hubs_mac_idx (UNIQUE on macAddress)

**Notes:** Soft delete via deletedAt. BLE network hub.

---

#### gateways

**Path:** `backend/src/db/schema/hierarchy.ts`

LoRaWAN gateways for TTN network integration.

| Column          | Type                  | Nullable | Default           | Description                                                 |
| --------------- | --------------------- | -------- | ----------------- | ----------------------------------------------------------- |
| id              | UUID                  | NO       | gen_random_uuid() | Gateway ID                                                  |
| ttnConnectionId | UUID                  | NO       |                   | Reference to ttnConnections.id (CASCADE delete)             |
| siteId          | UUID                  | YES      |                   | Reference to sites.id (SET NULL on delete)                  |
| gatewayId       | varchar(36)           | NO       |                   | TTN gateway ID (unique per TTN connection)                  |
| gatewayEui      | varchar(16)           | NO       |                   | Gateway EUI (16 hex chars, unique globally)                 |
| name            | varchar(256)          | YES      |                   | Display name                                                |
| description     | text                  | YES      |                   | Gateway description                                         |
| frequencyPlanId | varchar(64)           | YES      |                   | TTN frequency plan (e.g., 'EU_863_870')                     |
| status          | enum (gateway_status) | NO       | 'unknown'         | Connectivity status: online, offline, disconnected, unknown |
| latitude        | varchar(32)           | YES      |                   | Geographic latitude                                         |
| longitude       | varchar(32)           | YES      |                   | Geographic longitude                                        |
| altitude        | integer               | YES      |                   | Elevation in meters                                         |
| lastSeenAt      | timestamp(3) tz       | YES      |                   | Last time gateway reported stats to TTN                     |
| isActive        | boolean               | NO       | true              | Whether gateway is operational                              |
| createdAt       | timestamp(3) tz       | NO       | now()             | Record creation time                                        |
| updatedAt       | timestamp(3) tz       | NO       | now()             | Last modification time                                      |
| deletedAt       | timestamp(3) tz       | YES      |                   | Soft delete timestamp                                       |

**Indexes:**

- gateways_ttn_connection_idx on ttnConnectionId
- gateways_site_idx on siteId
- gateways_gateway_id_idx (UNIQUE on gatewayId)
- gateways_gateway_eui_idx (UNIQUE on gatewayEui)

**Notes:** Soft delete via deletedAt. Cross-org gateways can be assigned to multiple sites (via cascading OR separate records).

---

### Device Tables

#### devices

**Path:** `backend/src/db/schema/devices.ts`

Physical sensors (hardware devices).

| Column          | Type                 | Nullable | Default           | Description                                |
| --------------- | -------------------- | -------- | ----------------- | ------------------------------------------ |
| id              | UUID                 | NO       | gen_random_uuid() | Device ID                                  |
| unitId          | UUID                 | YES      |                   | Reference to units.id (SET NULL on delete) |
| hubId           | UUID                 | YES      |                   | Reference to hubs.id (SET NULL on delete)  |
| deviceEui       | varchar(32)          | NO       |                   | Device EUI (TTN identifier, unique)        |
| name            | varchar(256)         | YES      |                   | User-friendly device name                  |
| deviceType      | varchar(64)          | YES      |                   | Device type: 'lora', 'ble', 'wifi', etc.   |
| status          | enum (device_status) | NO       | 'inactive'        | Status: active, inactive, pairing, error   |
| battery         | integer              | YES      |                   | Battery percentage (0-100)                 |
| signalStrength  | integer              | YES      |                   | RSSI or signal strength (device-specific)  |
| firmwareVersion | varchar(32)          | YES      |                   | Device firmware version                    |
| lastSeenAt      | timestamp(3) tz      | YES      |                   | Last time device transmitted data          |
| isActive        | boolean              | NO       | true              | Whether device is operational              |
| createdAt       | timestamp(3) tz      | NO       | now()             | Record creation time                       |
| updatedAt       | timestamp(3) tz      | NO       | now()             | Last modification time                     |

**Indexes:**

- devices_eui_idx (UNIQUE on deviceEui)
- devices_unit_idx on unitId
- devices_hub_idx on hubId
- devices_status_idx on status

**Notes:** Cross-cutting dimension (not org-scoped). Can be assigned to multiple units/hubs.

---

#### loraSensors

**Path:** `backend/src/db/schema/devices.ts`

LoRaWAN-specific device configuration (TTN provisioning details).

| Column          | Type            | Nullable | Default           | Description                                                            |
| --------------- | --------------- | -------- | ----------------- | ---------------------------------------------------------------------- |
| id              | UUID            | NO       | gen_random_uuid() | Record ID                                                              |
| deviceId        | UUID            | NO       |                   | Reference to devices.id (CASCADE delete, UNIQUE)                       |
| appEui          | varchar(32)     | NO       |                   | Application EUI                                                        |
| devEui          | varchar(32)     | NO       |                   | Device EUI (unique globally)                                           |
| appKey          | varchar(64)     | YES      |                   | Application Key (encrypted in production)                              |
| joinEui         | varchar(32)     | YES      |                   | Join EUI (LoRaWAN spec)                                                |
| networkServerId | varchar(128)    | YES      |                   | TTN application ID                                                     |
| activationType  | varchar(16)     | YES      | 'OTAA'            | Activation: OTAA (over-the-air) or ABP (activation by personalization) |
| lastJoinAt      | timestamp(3) tz | YES      |                   | Last time device joined network                                        |
| createdAt       | timestamp(3) tz | NO       | now()             | Record creation time                                                   |
| updatedAt       | timestamp(3) tz | NO       | now()             | Last modification time                                                 |

**Indexes:**

- lora_sensors_device_idx (UNIQUE on deviceId)
- lora_sensors_dev_eui_idx (UNIQUE on devEui)
- lora_sensors_app_eui_idx on appEui

**Notes:** Encrypted appKey at application level.

---

#### calibrationRecords

**Path:** `backend/src/db/schema/devices.ts`

Device calibration history for compliance (FDA, HACCP).

| Column               | Type            | Nullable | Default           | Description                                          |
| -------------------- | --------------- | -------- | ----------------- | ---------------------------------------------------- |
| id                   | UUID            | NO       | gen_random_uuid() | Record ID                                            |
| deviceId             | UUID            | NO       |                   | Reference to devices.id (CASCADE delete)             |
| calibratedAt         | timestamp(3) tz | NO       |                   | When calibration was performed                       |
| calibratedBy         | UUID            | YES      |                   | Profile ID of technician who performed calibration   |
| temperatureOffset    | integer         | YES      |                   | Temperature correction offset (in 0.01 degree units) |
| humidityOffset       | integer         | YES      |                   | Humidity correction offset (in 0.01% units)          |
| referenceTemperature | integer         | YES      |                   | Reference temperature used for calibration           |
| certificateUrl       | text            | YES      |                   | URL to calibration certificate PDF                   |
| notes                | text            | YES      |                   | Calibration notes                                    |
| expiresAt            | timestamp(3) tz | YES      |                   | Calibration expiration date                          |
| createdAt            | timestamp(3) tz | NO       | now()             | Record creation time                                 |
| updatedAt            | timestamp(3) tz | NO       | now()             | Last modification time                               |

**Indexes:**

- calibration_records_device_idx on deviceId
- calibration_records_date_idx (COMPOSITE on deviceId, calibratedAt)
- calibration_records_expires_idx on expiresAt

**Notes:** Compliance audit trail. expiresAt used to detect overdue calibrations.

---

#### pairingSessions

**Path:** `backend/src/db/schema/devices.ts`

Temporary device onboarding state. Cleaned up after pairing completes.

| Column      | Type                  | Nullable | Default           | Description                                         |
| ----------- | --------------------- | -------- | ----------------- | --------------------------------------------------- |
| id          | UUID                  | NO       | gen_random_uuid() | Session ID                                          |
| deviceId    | UUID                  | YES      |                   | Reference to devices.id (CASCADE delete)            |
| status      | enum (pairing_status) | NO       | 'pending'         | Status: pending, completed, failed, expired         |
| pairingCode | varchar(16)           | YES      |                   | Human-readable pairing code                         |
| startedAt   | timestamp(3) tz       | NO       | now()             | When pairing session began                          |
| completedAt | timestamp(3) tz       | YES      |                   | When pairing succeeded                              |
| expiresAt   | timestamp(3) tz       | NO       |                   | When session expires (usually 1 hour)               |
| metadata    | text                  | YES      |                   | JSON metadata for pairing (MEDIUM: should be JSONB) |
| createdAt   | timestamp(3) tz       | NO       | now()             | Record creation time                                |
| updatedAt   | timestamp(3) tz       | NO       | now()             | Last modification time                              |

**Indexes:**

- pairing_sessions_device_idx on deviceId
- pairing_sessions_status_idx on status
- pairing_sessions_code_idx on pairingCode

**Notes:** metadata is JSON-as-text (MEDIUM issue). Sessions auto-cleanup after expiration.

---

### Telemetry Tables

#### sensorReadings (PARTITIONED)

**Path:** `backend/src/db/schema/telemetry.ts`

High-volume time-series temperature data. PARTITIONED by RANGE(recorded_at) on monthly boundaries.

| Column         | Type            | Nullable | Default           | Description                                                  |
| -------------- | --------------- | -------- | ----------------- | ------------------------------------------------------------ |
| id             | UUID            | NO       | gen_random_uuid() | Reading ID                                                   |
| unitId         | UUID            | NO       |                   | Reference to units.id (CASCADE delete)                       |
| deviceId       | UUID            | YES      |                   | Reference to devices.id (SET NULL on delete)                 |
| temperature    | numeric(7,2)    | NO       |                   | Temperature reading (device units, typically C \* 100)       |
| humidity       | numeric(5,2)    | YES      |                   | Humidity percentage (0-100)                                  |
| battery        | integer         | YES      |                   | Battery percentage at time of reading                        |
| signalStrength | integer         | YES      |                   | RSSI/signal strength at time of reading                      |
| rawPayload     | text            | YES      |                   | Raw payload for debugging/audit                              |
| recordedAt     | timestamp(3) tz | NO       |                   | Device timestamp (CRITICAL: partition key, MUST NOT be NULL) |
| receivedAt     | timestamp(3) tz | NO       | now()             | Server receive time                                          |
| source         | varchar(32)     | YES      |                   | Reading source: 'ttn', 'manual', 'api', etc.                 |

**Indexes:**

- sensor_readings_unit_time_idx on (unitId, recordedAt)
- sensor_readings_device_idx on deviceId
- sensor_readings_recorded_idx on recordedAt

**Partitioning Strategy:**

- Type: RANGE partitioning on recordedAt column
- Granularity: Monthly (one partition per calendar month)
- Naming: sensor_readings_y{YYYY}m{MM} (e.g., sensor_readings_y2026m02)
- Retention: 24 months (automated monthly cleanup)
- Future buffer: 3 months ahead (automated weekly creation)
- Default partition: sensor_readings_default (catchall)

**Performance:**

- Time-range queries: 50%+ faster (partition pruning)
- Index size: 40%+ smaller (per-partition indexes)
- VACUUM: 70%+ faster (per-partition maintenance)

**Notes:**

- recordedAt is CRITICAL: must never be NULL (partition routing fails)
- Drizzle ORM does not support PARTITION BY in schema definitions
- Partitioning implemented via custom migration (0006_partition_sensor_readings.sql)
- Indexes automatically created on each partition
- See backend/src/services/partition.service.ts for automation

---

#### manualTemperatureLogs

**Path:** `backend/src/db/schema/telemetry.ts`

User-logged temperature readings for HACCP compliance when sensors unavailable.

| Column      | Type            | Nullable | Default           | Description                                   |
| ----------- | --------------- | -------- | ----------------- | --------------------------------------------- |
| id          | UUID            | NO       | gen_random_uuid() | Log entry ID                                  |
| unitId      | UUID            | NO       |                   | Reference to units.id (CASCADE delete)        |
| profileId   | UUID            | YES      |                   | Reference to profiles.id (SET NULL on delete) |
| temperature | numeric(7,2)    | NO       |                   | Temperature reading                           |
| humidity    | numeric(5,2)    | YES      |                   | Humidity reading                              |
| notes       | text            | YES      |                   | User notes                                    |
| photoUrl    | text            | YES      |                   | Evidence photo for compliance                 |
| recordedAt  | timestamp(3) tz | NO       |                   | When reading was taken (user-reported)        |
| createdAt   | timestamp(3) tz | NO       | now()             | When log was submitted                        |

**Indexes:**

- manual_logs_unit_time_idx (COMPOSITE on unitId, recordedAt)
- manual_logs_profile_idx on profileId
- manual_logs_recorded_idx on recordedAt

**Notes:** Compliance audit trail. Records who logged what when.

---

#### doorEvents

**Path:** `backend/src/db/schema/telemetry.ts`

Door open/close events for refrigeration units.

| Column          | Type            | Nullable | Default           | Description                                  |
| --------------- | --------------- | -------- | ----------------- | -------------------------------------------- |
| id              | UUID            | NO       | gen_random_uuid() | Event ID                                     |
| unitId          | UUID            | NO       |                   | Reference to units.id (CASCADE delete)       |
| deviceId        | UUID            | YES      |                   | Reference to devices.id (SET NULL on delete) |
| state           | varchar(16)     | NO       |                   | Event state: 'open', 'closed', etc.          |
| timestamp       | timestamp(3) tz | NO       |                   | When door state changed                      |
| durationSeconds | integer         | YES      |                   | How long door was in previous state          |
| createdAt       | timestamp(3) tz | NO       | now()             | Record creation time                         |

**Indexes:**

- door_events_unit_time_idx (COMPOSITE on unitId, timestamp)
- door_events_device_idx on deviceId
- door_events_timestamp_idx on timestamp

**Notes:** Time-series data for door open duration alerts.

---

#### entityDashboardLayouts

**Path:** `backend/src/db/schema/telemetry.ts`

User-customized dashboard configurations (widget positions, preferences).

| Column            | Type            | Nullable | Default           | Description                                              |
| ----------------- | --------------- | -------- | ----------------- | -------------------------------------------------------- |
| id                | UUID            | NO       | gen_random_uuid() | Layout ID                                                |
| organizationId    | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete)           |
| entityType        | varchar(64)     | NO       |                   | Entity type: 'site', 'area', 'unit', etc.                |
| entityId          | UUID            | NO       |                   | ID of entity being viewed                                |
| userId            | UUID            | NO       |                   | Stack Auth user ID                                       |
| slotNumber        | integer         | NO       |                   | Dashboard slot (allows multiple layouts per entity/user) |
| name              | varchar(256)    | NO       |                   | Layout name (e.g., "Mobile View", "Summary")             |
| isUserDefault     | boolean         | NO       | false             | Whether this is user's default layout                    |
| layoutJson        | json            | NO       |                   | Widget positions and configuration (JSON object)         |
| widgetPrefsJson   | json            | YES      | {}                | Widget preferences (JSON object)                         |
| timelineStateJson | json            | YES      |                   | Timeline view state (JSON object)                        |
| layoutVersion     | integer         | NO       | 1                 | Schema version for forward compatibility                 |
| createdAt         | timestamp(3) tz | NO       | now()             | Record creation time                                     |
| updatedAt         | timestamp(3) tz | NO       | now()             | Last modification time                                   |

**Indexes:**

- entity_dashboard_layouts_entity_idx (COMPOSITE on entityType, entityId, userId)
- entity_dashboard_layouts_user_idx on userId
- entity_dashboard_layouts_org_idx on organizationId

**Notes:**

- layoutJson and widgetPrefsJson use native json type (not jsonb)
- Supports multiple saved layouts per user per entity
- isUserDefault supports "quick load" for default view

---

### Metrics Table

#### readingMetrics

**Path:** `backend/src/db/schema/reading-metrics.ts`

Aggregated sensor reading statistics (min/max/avg/count) for efficient historical queries.

| Column       | Type            | Nullable | Default           | Description                                                      |
| ------------ | --------------- | -------- | ----------------- | ---------------------------------------------------------------- |
| id           | UUID            | NO       | gen_random_uuid() | Metric ID                                                        |
| unitId       | UUID            | NO       |                   | Reference to units.id (CASCADE delete)                           |
| periodStart  | timestamp(3) tz | NO       |                   | Period start time                                                |
| periodEnd    | timestamp(3) tz | NO       |                   | Period end time                                                  |
| granularity  | varchar(16)     | NO       |                   | Granularity: 'hourly', 'daily', 'weekly', 'monthly'              |
| tempMin      | numeric(7,2)    | NO       |                   | Minimum temperature in period                                    |
| tempMax      | numeric(7,2)    | NO       |                   | Maximum temperature in period                                    |
| tempAvg      | numeric(7,2)    | NO       |                   | Average temperature in period                                    |
| tempSum      | numeric(12,2)   | NO       |                   | Sum of temps (for incremental avg)                               |
| humidityMin  | numeric(5,2)    | YES      |                   | Minimum humidity (if available)                                  |
| humidityMax  | numeric(5,2)    | YES      |                   | Maximum humidity                                                 |
| humidityAvg  | numeric(5,2)    | YES      |                   | Average humidity                                                 |
| readingCount | integer         | NO       | 0                 | Number of readings in period                                     |
| anomalyCount | integer         | NO       | 0                 | Number of readings outside thresholds                            |
| createdAt    | timestamp(3) tz | NO       | now()             | Record creation time                                             |
| updatedAt    | timestamp(3) tz | NO       | now()             | Last modification time (currently lacks $onUpdateFn - LOW issue) |

**Indexes:**

- reading_metrics_unit_period_idx (COMPOSITE on unitId, periodStart, granularity)
- reading_metrics_granularity_idx (COMPOSITE on granularity, periodStart)
- reading_metrics_unique_period (UNIQUE CONSTRAINT on unitId, periodStart, granularity)

**Notes:**

- Prevents duplicate metrics per unit/period/granularity
- Supports hourly, daily, weekly, monthly granularities
- updatedAt missing $onUpdateFn (LOW issue)

---

### Alert Tables

#### alertRules

**Path:** `backend/src/db/schema/alerts.ts`

Alert threshold configuration with hierarchical inheritance (org > site > unit scope).

| Column                            | Type                  | Nullable | Default           | Description                                                         |
| --------------------------------- | --------------------- | -------- | ----------------- | ------------------------------------------------------------------- |
| id                                | UUID                  | NO       | gen_random_uuid() | Rule ID                                                             |
| organizationId                    | UUID                  | NO       |                   | Reference to organizations.id (CASCADE delete)                      |
| siteId                            | UUID                  | YES      |                   | Reference to sites.id (CASCADE delete) - override org defaults      |
| unitId                            | UUID                  | YES      |                   | Reference to units.id (CASCADE delete) - override site defaults     |
| name                              | varchar(256)          | NO       |                   | Rule name for display                                               |
| tempMin                           | integer               | YES      |                   | Minimum safe temperature                                            |
| tempMax                           | integer               | YES      |                   | Maximum safe temperature                                            |
| delayMinutes                      | integer               | NO       | 5                 | Minutes to wait before alerting (hysteresis)                        |
| manualIntervalMinutes             | integer               | YES      |                   | Interval for manual temperature checks                              |
| manualGraceMinutes                | integer               | YES      |                   | Grace period before manual check alert                              |
| expectedReadingIntervalSeconds    | integer               | YES      |                   | Expected interval between sensor readings                           |
| offlineTriggerMultiplier          | integer               | YES      |                   | Multiplier for offline detection (e.g., 2x expected interval)       |
| offlineTriggerAdditionalMinutes   | integer               | YES      |                   | Additional minutes past multiplied interval                         |
| offlineWarningMissedCheckins      | integer               | YES      |                   | Threshold for offline warning alert                                 |
| offlineCriticalMissedCheckins     | integer               | YES      |                   | Threshold for offline critical alert                                |
| manualLogMissedCheckinsThreshold  | integer               | YES      |                   | Threshold for manual logging alert                                  |
| doorOpenWarningMinutes            | integer               | YES      |                   | Minutes before door open warning                                    |
| doorOpenCriticalMinutes           | integer               | YES      |                   | Minutes before door open critical                                   |
| doorOpenMaxMaskMinutesPerDay      | integer               | YES      |                   | Max daily door open to ignore (suppression)                         |
| excursionConfirmMinutesDoorClosed | integer               | YES      |                   | Minutes closed before confirming excursion                          |
| excursionConfirmMinutesDoorOpen   | integer               | YES      |                   | Minutes open before confirming excursion                            |
| maxExcursionMinutes               | integer               | YES      |                   | Max duration of temperature excursion                               |
| alertType                         | enum (alert_type)     | NO       | 'alarm_active'    | Alert type this rule triggers                                       |
| severity                          | enum (alert_severity) | NO       | 'warning'         | Alert severity level                                                |
| isEnabled                         | boolean               | NO       | true              | Whether rule is active                                              |
| schedule                          | text                  | YES      |                   | JSON: { days: [0-6], startHour, endHour } (MEDIUM: should be JSONB) |
| createdAt                         | timestamp(3) tz       | NO       | now()             | Record creation time                                                |
| updatedAt                         | timestamp(3) tz       | NO       | now()             | Last modification time                                              |

**Indexes:**

- alert_rules_org_idx on organizationId
- alert_rules_site_idx on siteId
- alert_rules_unit_idx on unitId
- alert_rules_enabled_idx (COMPOSITE on organizationId, isEnabled)

**Notes:**

- Hierarchical inheritance: unit rules override site, site override org
- schedule is JSON-as-text (MEDIUM issue: should be JSONB)
- Supports complex offline detection logic with configurable thresholds

---

#### alertRulesHistory

**Path:** `backend/src/db/schema/alerts.ts`

Audit trail for alert rule changes (for HACCP compliance).

| Column      | Type            | Nullable | Default           | Description                                       |
| ----------- | --------------- | -------- | ----------------- | ------------------------------------------------- |
| id          | UUID            | NO       | gen_random_uuid() | History entry ID                                  |
| alertRuleId | UUID            | NO       |                   | Reference to alertRules.id (CASCADE delete)       |
| changedBy   | UUID            | YES      |                   | Reference to profiles.id (SET NULL on delete)     |
| changeType  | varchar(32)     | NO       |                   | 'created', 'updated', 'deleted'                   |
| oldValues   | text            | YES      |                   | JSON of previous values (MEDIUM: should be JSONB) |
| newValues   | text            | YES      |                   | JSON of new values (MEDIUM: should be JSONB)      |
| changedAt   | timestamp(3) tz | NO       | now()             | When change occurred                              |

**Indexes:**

- alert_rules_history_rule_idx on alertRuleId
- alert_rules_history_date_idx on changedAt

**Notes:** oldValues and newValues are JSON-as-text (MEDIUM issue).

---

#### alerts

**Path:** `backend/src/db/schema/alerts.ts`

Active and historical alert instances.

| Column             | Type                  | Nullable | Default           | Description                                          |
| ------------------ | --------------------- | -------- | ----------------- | ---------------------------------------------------- |
| id                 | UUID                  | NO       | gen_random_uuid() | Alert ID                                             |
| unitId             | UUID                  | NO       |                   | Reference to units.id (CASCADE delete)               |
| alertRuleId        | UUID                  | YES      |                   | Reference to alertRules.id (SET NULL on delete)      |
| alertType          | enum (alert_type)     | NO       |                   | Alert classification                                 |
| severity           | enum (alert_severity) | NO       |                   | Urgency: info, warning, critical                     |
| status             | enum (alert_status)   | NO       | 'active'          | Lifecycle: active, acknowledged, resolved, escalated |
| message            | text                  | YES      |                   | Human-readable alert message                         |
| triggerTemperature | integer               | YES      |                   | Temperature that triggered alert                     |
| thresholdViolated  | varchar(16)           | YES      |                   | 'min' or 'max' threshold violated                    |
| triggeredAt        | timestamp(3) tz       | NO       | now()             | When alert was triggered                             |
| acknowledgedAt     | timestamp(3) tz       | YES      |                   | When user acknowledged alert                         |
| acknowledgedBy     | UUID                  | YES      |                   | Profile ID of user who acknowledged (SET NULL)       |
| resolvedAt         | timestamp(3) tz       | YES      |                   | When alert was resolved                              |
| resolvedBy         | UUID                  | YES      |                   | Profile ID of user who resolved (SET NULL)           |
| escalatedAt        | timestamp(3) tz       | YES      |                   | When alert was escalated                             |
| escalationLevel    | integer               | NO       | 0                 | Escalation stage (0=initial, 1+=escalated)           |
| metadata           | text                  | YES      |                   | JSON context data (MEDIUM: should be JSONB)          |
| createdAt          | timestamp(3) tz       | NO       | now()             | Record creation time                                 |
| updatedAt          | timestamp(3) tz       | NO       | now()             | Last modification time                               |

**Indexes:**

- alerts_unit_idx on unitId
- alerts_status_idx on status
- alerts_type_idx on alertType
- alerts_triggered_idx on triggeredAt
- alerts_unit_status_idx (COMPOSITE on unitId, status)
- alerts_unit_triggered_desc_idx (COMPOSITE on unitId, triggeredAt DESC)
- alerts_status_severity_idx (COMPOSITE on status, severity)

**Notes:**

- MEDIUM DENORMALIZATION ISSUE: No organizationId column. Org-scoped queries require 3-4 table JOINs (alerts -> units -> areas -> sites).
- metadata is JSON-as-text (MEDIUM issue: should be JSONB)

---

#### correctiveActions

**Path:** `backend/src/db/schema/alerts.ts`

Compliance documentation of actions taken in response to alerts.

| Column        | Type            | Nullable | Default           | Description                                   |
| ------------- | --------------- | -------- | ----------------- | --------------------------------------------- |
| id            | UUID            | NO       | gen_random_uuid() | Action record ID                              |
| alertId       | UUID            | NO       |                   | Reference to alerts.id (CASCADE delete)       |
| unitId        | UUID            | NO       |                   | Reference to units.id (CASCADE delete)        |
| profileId     | UUID            | YES      |                   | Reference to profiles.id (SET NULL on delete) |
| description   | text            | NO       |                   | What action was needed                        |
| actionTaken   | text            | YES      |                   | What action was actually taken                |
| photoUrl      | text            | YES      |                   | Evidence photo URL                            |
| resolvedAlert | boolean         | NO       | false             | Whether this action resolved the alert        |
| actionAt      | timestamp(3) tz | NO       | now()             | When action was taken                         |
| createdAt     | timestamp(3) tz | NO       | now()             | Record creation time                          |

**Indexes:**

- corrective_actions_alert_idx on alertId
- corrective_actions_unit_idx on unitId
- corrective_actions_profile_idx on profileId
- corrective_actions_date_idx on actionAt

**Notes:** Compliance audit trail for FDA/HACCP.

---

### Notification Table

#### notificationDeliveries

**Path:** `backend/src/db/schema/notifications.ts`

Multi-channel notification delivery tracking (email, SMS, push).

| Column       | Type                        | Nullable | Default           | Description                                                                                   |
| ------------ | --------------------------- | -------- | ----------------- | --------------------------------------------------------------------------------------------- |
| id           | UUID                        | NO       | gen_random_uuid() | Delivery record ID                                                                            |
| alertId      | UUID                        | NO       |                   | Reference to alerts.id (CASCADE delete)                                                       |
| profileId    | UUID                        | YES      |                   | Reference to profiles.id (SET NULL on delete)                                                 |
| channel      | enum (notification_channel) | NO       |                   | 'push', 'email', 'sms'                                                                        |
| recipient    | varchar(256)                | NO       |                   | Phone, email, or device token                                                                 |
| status       | enum (notification_status)  | NO       | 'pending'         | 'pending', 'sent', 'delivered', 'failed'                                                      |
| externalId   | varchar(256)                | YES      |                   | Provider reference (Telnyx message ID, etc.) - NO INDEX (HIGH issue, fixed in migration 0009) |
| errorMessage | text                        | YES      |                   | Error details if failed                                                                       |
| scheduledAt  | timestamp(3) tz             | NO       | now()             | When delivery was scheduled                                                                   |
| sentAt       | timestamp(3) tz             | YES      |                   | When sent to provider                                                                         |
| deliveredAt  | timestamp(3) tz             | YES      |                   | When provider confirmed delivery                                                              |
| failedAt     | timestamp(3) tz             | YES      |                   | When delivery failed                                                                          |
| retryCount   | integer                     | YES      | 0                 | Retry attempts (fixed from varchar in migration 0009)                                         |
| lastRetryAt  | timestamp(3) tz             | YES      |                   | Last retry attempt time                                                                       |
| createdAt    | timestamp(3) tz             | NO       | now()             | Record creation time                                                                          |

**Indexes:**

- notification_deliveries_alert_idx on alertId
- notification_deliveries_profile_idx on profileId
- notification_deliveries_status_idx on status
- notification_deliveries_channel_idx on channel
- notification_deliveries_scheduled_idx on scheduledAt
- notification_deliveries_pending_idx (COMPOSITE on status, scheduledAt)
- notification_deliveries_external_id_idx on externalId (added in migration 0009)
- notification_deliveries_rate_limit_idx (COMPOSITE on channel, status, sentAt) (added in migration 0009)

**Notes:**

- retryCount type fixed from varchar to integer in migration 0009
- externalId index added in migration 0009 for Telnyx webhook lookups
- MEDIUM DENORMALIZATION ISSUE: No organizationId. Org-scoped queries require 4-5 table JOINs

---

### Audit Table

#### eventLogs

**Path:** `backend/src/db/schema/audit.ts`

Tamper-evident audit trail for compliance and security.

| Column                 | Type            | Nullable | Default           | Description                                                                                                                                |
| ---------------------- | --------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| id                     | UUID            | NO       | gen_random_uuid() | Log entry ID                                                                                                                               |
| organizationId         | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete)                                                                                             |
| actorId                | UUID            | YES      |                   | Reference to profiles.id (SET NULL on delete) - CRITICAL DATA CONSISTENCY ISSUE: stores mixed identifiers (profiles.userId OR profiles.id) |
| actorType              | varchar(32)     | NO       |                   | 'user', 'system', 'api'                                                                                                                    |
| eventType              | varchar(64)     | NO       |                   | 'site.created', 'unit.updated', 'alert.triggered', etc.                                                                                    |
| category               | varchar(64)     | YES      |                   | Event category (optional grouping)                                                                                                         |
| severity               | varchar(32)     | YES      |                   | 'info', 'warning', 'critical', 'success'                                                                                                   |
| title                  | text            | YES      |                   | Human-readable event summary                                                                                                               |
| siteId                 | UUID            | YES      |                   | Denormalized site ID for easier querying                                                                                                   |
| areaId                 | UUID            | YES      |                   | Denormalized area ID                                                                                                                       |
| unitId                 | UUID            | YES      |                   | Denormalized unit ID                                                                                                                       |
| eventData              | jsonb           | YES      |                   | Event-specific data (JSONB for native operators)                                                                                           |
| ipAddress              | varchar(45)     | YES      |                   | Request source IP (IPv4 or IPv6)                                                                                                           |
| userAgent              | text            | YES      |                   | Browser/client user agent string                                                                                                           |
| actingUserId           | UUID            | YES      |                   | Admin user ID if impersonating                                                                                                             |
| impersonationSessionId | UUID            | YES      |                   | Session ID for impersonation audit                                                                                                         |
| wasImpersonated        | boolean         | YES      | false             | Whether action was impersonated                                                                                                            |
| eventHash              | varchar(64)     | YES      |                   | SHA256 hash of event for tamper detection                                                                                                  |
| previousHash           | varchar(64)     | YES      |                   | SHA256 hash of previous event (chain)                                                                                                      |
| recordedAt             | timestamp(3) tz | NO       | now()             | When event occurred                                                                                                                        |

**Indexes:**

- event_logs_org_idx on organizationId
- event_logs_actor_idx on actorId
- event_logs_type_idx on eventType
- event_logs_recorded_idx on recordedAt
- event_logs_unit_idx on unitId
- event_logs_org_date_idx (COMPOSITE on organizationId, recordedAt)

**Notes:**

- CRITICAL DATA CONSISTENCY ISSUE: actorId stores MIXED identifiers (profiles.userId OR profiles.id). Requires standardization on profiles.id.
- eventData uses native jsonb (can use GIN indexes and native JSON operators)
- Denormalized siteId, areaId, unitId for faster org-scoped queries
- Hash chain for tamper detection

---

### Billing Table

#### stripeEvents

**Path:** `backend/src/db/schema/billing.ts`

Stripe webhook idempotency tracking (prevent duplicate processing).

| Column      | Type            | Nullable | Default           | Description                                               |
| ----------- | --------------- | -------- | ----------------- | --------------------------------------------------------- |
| id          | UUID            | NO       | gen_random_uuid() | Record ID                                                 |
| eventId     | varchar(256)    | NO       |                   | Stripe event ID (unique, immutable)                       |
| eventType   | varchar(256)    | NO       |                   | Stripe event type (e.g., 'customer.subscription.updated') |
| processedAt | timestamp(3) tz | NO       | now()             | When event was processed                                  |

**Indexes:** stripe_events_event_id_idx (UNIQUE on eventId)

**Notes:** Global platform table (not org-scoped). Stripe retries failed webhooks for 3 days with exponential backoff.

---

### Feedback Table

#### pilotFeedback

**Path:** `backend/src/db/schema/pilot-feedback.ts`

Weekly feedback from pilot program participants.

| Column                 | Type            | Nullable | Default           | Description                                    |
| ---------------------- | --------------- | -------- | ----------------- | ---------------------------------------------- |
| id                     | UUID            | NO       | gen_random_uuid() | Feedback record ID                             |
| organizationId         | UUID            | NO       |                   | Reference to organizations.id (CASCADE delete) |
| siteId                 | UUID            | YES      |                   | Reference to sites.id (SET NULL on delete)     |
| weekStart              | date            | NO       |                   | Start date of feedback week (Monday)           |
| loggingSpeedRating     | integer         | YES      |                   | 1-5 rating of logging speed                    |
| alertFatigueRating     | integer         | YES      |                   | 1-5 rating of alert fatigue                    |
| reportUsefulnessRating | integer         | YES      |                   | 1-5 rating of report usefulness                |
| notes                  | text            | YES      |                   | Qualitative feedback                           |
| submittedBy            | UUID            | NO       |                   | Reference to profiles.id (user who submitted)  |
| createdAt              | timestamp(3) tz | NO       | now()             | Record creation time                           |

**Indexes:**

- pilot_feedback_weekly_unique (UNIQUE COMPOSITE on organizationId, siteId, weekStart)
- pilot_feedback_org_idx on organizationId

**Notes:** Collects UX feedback during pilot phase.

---

### Partition Management Table

#### partitionRetentionOverrides

**Path:** `backend/src/db/schema/partition-overrides.ts`

Legal hold and compliance data preservation. Prevents automatic partition deletion.

| Column        | Type            | Nullable | Default           | Description                                                |
| ------------- | --------------- | -------- | ----------------- | ---------------------------------------------------------- |
| id            | UUID            | NO       | gen_random_uuid() | Override ID                                                |
| partitionName | varchar(128)    | NO       |                   | Partition name (e.g., 'sensor_readings_y2025m01') - UNIQUE |
| reason        | text            | NO       |                   | Reason for hold (e.g., 'Legal hold per case #12345')       |
| createdBy     | varchar(255)    | NO       |                   | User/system that created hold                              |
| expiresAt     | timestamp(3) tz | YES      |                   | When hold expires (null = permanent)                       |
| createdAt     | timestamp(3) tz | NO       | now()             | Record creation time                                       |

**Notes:**

- partition:retention BullMQ job checks this table before dropping partitions
- Active overrides (where expiresAt IS NULL or expiresAt > NOW()) prevent deletion
- Supports time-limited holds (e.g., litigation holds) via expiresAt

---

## 4. Partitioning Strategy

### Design

PostgreSQL RANGE partitioning on `sensorReadings.recordedAt` column with monthly boundaries.

### Partition Naming

```
sensor_readings_y{YYYY}m{MM}
Examples:
  sensor_readings_y2026m01 (January 2026)
  sensor_readings_y2026m02 (February 2026)
  sensor_readings_default (catchall for NULL or out-of-range)
```

### Retention & Future Buffer

- **Retention:** 24 months backward (automated deletion via BullMQ)
- **Future Buffer:** 3 months forward (pre-created for write availability)
- **Cleanup:** Monthly job drops partitions older than 24 months
- **Creation:** Weekly job ensures 3-month forward buffer

### Performance Impact

- **Time-Range Queries:** 50%+ faster (partition pruning scans only relevant months)
- **Index Size:** 40%+ smaller per partition vs monolithic table (indexes per partition)
- **VACUUM:** 70%+ faster (maintenance per-partition vs full-table locks)

### Implementation Notes

- Drizzle ORM does not support PARTITION BY in schema definitions
- Partitioning implemented via custom migration: `backend/drizzle/migrations/0006_partition_sensor_readings.sql`
- PostgreSQL handles partition routing transparently (no application code changes)
- Inserts automatically route to correct partition based on recordedAt value
- Queries with WHERE recordedAt clauses benefit from automatic partition pruning

### Automation

- **Service:** `backend/src/services/partition.service.ts`
- **Monitoring:** `backend/src/services/partition-metrics.service.ts`
- **BullMQ Jobs:**
  - `partition:create` - Creates future partitions (weekly)
  - `partition:retention` - Drops old partitions (monthly)
- **Monitoring Alerts:** Alerts if future partitions missing or jobs fail

---

## 5. Migration History

All 10 migrations with key details:

### Migration 0000: Initial Schema (2025-01-15)

Creates baseline schema with all 15 enums, 33 tables, and 60+ indexes.

### Migration 0001: Additional Constraints (2025-01-15)

Adds foreign key constraints and composite indexes.

### Migration 0002: Reading Metrics Table (2025-01-15)

Creates aggregated metrics table for efficient historical queries.

### Migration 0003: Digest Preferences (2025-01-15)

Adds email digest preference columns to profiles table.

### Migration 0004: Stripe Events (2025-01-15)

Creates webhook idempotency tracking for Stripe integration.

### Migration 0005: Soft Delete for Organizations (2025-01-15)

Adds deletedAt column to organizations table.

### Migration 0006: Partition sensor_readings (2025-01-15)

Major: Converts sensor_readings from monolithic to RANGE partitioned by recordedAt with monthly boundaries. Performance impact: 50%+ query speedup, 40%+ index reduction, 70%+ VACUUM speedup.

### Migration 0007: Partition Retention Overrides (2026-02-01)

Creates table for legal hold and compliance data preservation.

### Migration 0008: Add Performance Indexes (2026-02-02)

Fixes HIGH issues:

- alerts_unit_triggered_desc_idx - Recent alerts per unit
- alerts_status_severity_idx - Dashboard filtering
- units_last_reading_at_idx - Offline detection (partial index)

### Migration 0009: Schema Audit Fixes (2026-02-02)

Fixes from comprehensive schema audit:

- notification_deliveries.retry_count type fix (varchar to integer)
- notification_deliveries_external_id_idx - Webhook lookup index
- notification_deliveries_rate_limit_idx - SMS rate limiting composite index
- alerts_active_triggered_idx - Active alerts partial index
- Dropped redundant indexes: sms_configs_org_idx, notification_settings_org_idx

---

## 6. Known Issues and Recommendations

### CRITICAL

**Critical-1: Data Consistency - event_logs.actorId Mixed Identifiers**

- Problem: Column stores both Stack Auth IDs (profiles.userId) and profile UUIDs (profiles.id)
- Impact: Audit trail data integrity, compliance risk
- Fix: Standardize all callers to use profiles.id only

---

### HIGH

**High-1: Missing Index on notification_deliveries.external_id**

- Status: FIXED in migration 0008
- Impact: Telnyx webhook throughput degraded

**High-2: Wrong Column Type - notification_deliveries.retry_count**

- Status: FIXED in migration 0008
- Impact: Type coercion overhead
- Fix: Changed from varchar(10) to integer

**High-3: Redundant Indexes**

- Status: FIXED in migration 0009
- Impact: Wasteful index maintenance
- Redundant pairs: sms_configs (org_idx + org_unique_idx), notification_settings (org_idx + org_unique_idx)

---

### MEDIUM

**Medium-1: Denormalization Opportunity - alerts Missing organizationId**

- Problem: Org-scoped queries require 4-table JOINs
- Recommendation: Add organizationId column and index (enables direct org filtering)

**Medium-2: Denormalization Opportunity - notification_deliveries Missing organizationId**

- Problem: Similar to alerts, requires 5-table JOINs for org scoping
- Recommendation: Add organizationId column

**Medium-3: JSON Columns as Text Instead of JSONB**

- Problem: No native JSON operators, no GIN indexes
- Affected: ttn_connections.provisioning_step_details, alert_rules_history (old/new values), alerts.metadata, pairing_sessions.metadata, notification_settings.recipients, profiles.digest_site_ids, alert_rules.schedule, user_sync_log.payload
- Recommendation: Convert to JSONB (priority: provisioning_step_details, alert_rules.schedule)

**Medium-4: DRY Violation - Timestamps Helper Duplicated**

- Problem: timestamps object defined in 5 schema files
- Recommendation: Extract to shared module

**Medium-5: reading_metrics.updatedAt Missing $onUpdateFn**

- Status: FIXED in schema code (no migration needed, Drizzle ORM-level fix)
- Fix: Added .$onUpdateFn(() => new Date()) to reading-metrics.ts

**Medium-6: Admin COUNT(\*) on sensor_readings**

- Problem: Full-table COUNT(\*) scans all partitions
- Workaround: Use pg_class.reltuples estimate
- Solution: Maintain summary stats table with daily partition counts

---

### LOW

**Low-1: Formatting Inconsistency - VARCHAR vs text**

- Status: COSMETIC
- Recommendation: Document convention (use text for unlimited, varchar(N) for constrained)

---

## 7. Connection Configuration

### Pool Settings

```typescript
{
  max: 20,                           // Max pooled connections
  idleTimeoutMillis: 30000,         // Close idle after 30s
  connectionTimeoutMillis: 5000,    // Fail fast if unavailable
  statement_timeout: 30000          // Kill queries > 30s
}
```

### PgBouncer Compatibility

Verified compatible with transaction pooling mode (`pool_mode = transaction`).

**Safe Patterns:**

- Drizzle ORM parameterized queries (prepared statements)
- db.transaction() blocks (get dedicated connection)
- Batch inserts/updates (within single transaction)

**Avoided Patterns:**

- SET SESSION/LOCAL
- LISTEN/NOTIFY
- Advisory locks

---

## References

- Schema Definition Files: `/backend/src/db/schema/*.ts`
- Client Configuration: `/backend/src/db/client.ts`
- Drizzle Configuration: `/backend/drizzle.config.ts`
- Migrations: `/backend/drizzle/migrations/`
- Partition Service: `/backend/src/services/partition.service.ts`

---

**Document Version:** 2.0 (Comprehensive Schema Reference)
**Last Updated:** 2026-02-02
