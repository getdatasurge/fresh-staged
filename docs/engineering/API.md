# FreshTrack Pro API Reference

Complete API documentation for the Fastify + tRPC backend with type-safe RPC procedures and REST endpoints.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Authorization](#authorization)
4. [tRPC Procedures](#trpc-procedures)
5. [REST Endpoints](#rest-endpoints)
6. [Error Handling](#error-handling)

---

## Overview

FreshTrack Pro backend is built on a hybrid architecture combining **tRPC 11.8.1** (type-safe RPC) and **Fastify 5.7.1** (HTTP framework).

### Architecture

- **tRPC Procedures** at `/trpc` prefix — type-safe RPC used by React frontend
- **REST Endpoints** at `/api/*` — webhooks, bulk ingestion, and public endpoints
- **Socket.io 4.8.3** — real-time data streaming for unit readings and alerts
- **Drizzle ORM** — database abstraction layer
- **BullMQ** — background job processing
- **Zod** — runtime type validation

### Base URL

```
https://api.example.com
```

### Common Headers

All authenticated requests should include either:

```
Authorization: Bearer <JWT_TOKEN>
```

or (for Stack Auth SDK):

```
x-stack-access-token: <JWT_TOKEN>
```

---

## Authentication

### Stack Auth (JWT)

FreshTrack uses **Stack Auth** for authentication. All tRPC procedures and most REST endpoints require valid JWT tokens.

#### Token Validation

- Tokens are verified using Stack Auth's JWKS endpoint
- Tokens include claims: `sub` (user ID), `email`, `name`, `email_verified`
- Expired or invalid tokens return `401 Unauthorized`

#### Two Header Formats Supported

1. **Standard Authorization Header**

   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. **Stack Auth Header** (preferred by SDK)
   ```
   x-stack-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### API Key Authentication

Used for bulk data ingestion via `POST /api/ingest/readings`.

Include the API key in the request:

```
x-api-key: your_organization_api_key
```

### Webhook Secrets

- **TTN Webhooks**: Use `WEBHOOK_SECRET` from TTN connection settings
- **Stripe Webhooks**: Use `STRIPE_WEBHOOK_SECRET` from environment
- **Telnyx Webhooks**: Use Telnyx API credentials

---

## Authorization

### Role Hierarchy

All application roles follow a strict hierarchy where higher roles have greater permissions:

```
owner (5) > admin (4) > manager (3) > staff (2) > viewer (1)
```

Higher roles automatically satisfy lower role requirements.

### Procedure Types

#### `publicProcedure`

No authentication required. Used for:

- Email/phone availability checks (registration)
- Telnyx verification status checks
- Public asset verification

#### `protectedProcedure`

JWT required. User must be authenticated but not necessarily in an organization. Used for:

- User profile operations (`users.me`)
- Preferences management
- Dashboard layouts (per user)

#### `orgProcedure`

JWT + organization membership required. Automatically verifies:

- Valid JWT token
- User is a member of the organization
- Attaches `organizationId`, `role`, and `profileId` to context

Most procedures use this.

#### `superAdminProcedure`

JWT + SUPER_ADMIN platform role required. For platform-wide admin operations:

- System status and queue health
- Organization and user management
- Audit logs
- TTN connections across orgs

#### `sensorCapacityProcedure`

Extends `orgProcedure` with sensor subscription limit checks. Used for device provisioning:

- TTN device provisioning
- TTN gateway registration

Throws `FORBIDDEN` if organization has exceeded sensor limit.

### Role-Based Restrictions

| Operation                                 | Required Role                | Examples                |
| ----------------------------------------- | ---------------------------- | ----------------------- |
| Create/Update/Delete Sites, Areas         | admin, owner                 | Site CRUD               |
| Create/Update/Delete Units                | manager, admin, owner        | Unit CRUD               |
| Register/Deprovision TTN Devices/Gateways | manager, admin, owner        | TTN provisioning        |
| Acknowledge/Resolve Alerts                | staff, manager, admin, owner | Alert management        |
| Configure SMS/Webhooks                    | admin, owner                 | System configuration    |
| View Escalation Contacts                  | viewer+                      | All authenticated users |
| Manage Escalation Contacts                | manager, admin, owner        | Contact CRUD            |
| Update Member Roles                       | admin, owner                 | User role assignment    |

---

## tRPC Procedures

All procedures use the tRPC naming convention: `router.procedure`. Access via:

```
POST /trpc/[router].[procedure]?input={json}
```

### Health & Monitoring

#### `health.quick` — Query / Public

Quick database connectivity check

- **Input**: `{ organizationId?: uuid }`
- **Returns**: Health status with single database check

#### `health.all` — Query / Public

Comprehensive health check (database, redis, external services)

- **Input**: `{ organizationId?: uuid }`
- **Returns**: Detailed health checks with status and latencies

### Organizations

#### `organizations.get` — Query / orgProcedure

Get organization details

- **Input**: `{ organizationId: uuid }`
- **Returns**: Organization object (name, timezone, compliance mode)

#### `organizations.update` — Mutation / orgProcedure (owner)

Update organization settings

- **Input**: `{ organizationId, data: { name?, timezone?, complianceMode?, logoUrl? } }`
- **Returns**: Updated organization

#### `organizations.listMembers` — Query / orgProcedure

Get organization members with roles

- **Input**: `{ organizationId }`
- **Returns**: Array of members with emails, roles, join dates

#### `organizations.updateMemberRole` — Mutation / orgProcedure (admin+)

Update user role in organization

- **Input**: `{ organizationId, userId, role: 'owner'|'admin'|'manager'|'staff'|'viewer' }`
- **Returns**: `{ success: boolean }`

#### `organizations.removeMember` — Mutation / orgProcedure (admin+)

Remove user from organization

- **Input**: `{ organizationId, userId }`
- **Returns**: `{ success: boolean }`

#### `organizations.stats` — Query / orgProcedure

Get dashboard statistics

- **Input**: `{ organizationId }`
- **Returns**: Unit states, alert counts, compliance percentage

#### `organizations.listEmulatorSyncHistory` — Query / orgProcedure

Get recent emulator sync runs

- **Input**: `{ organizationId, limit?: 1-100 }`
- **Returns**: Array of sync runs with status and counts

### Sites, Areas, Units

#### `sites.list` — Query / orgProcedure

List all active sites

- **Returns**: Array with stats

#### `sites.get` — Query / orgProcedure

Get site by ID

- **Input**: `{ organizationId, siteId }`
- **Returns**: Site object

#### `sites.create` — Mutation / orgProcedure (admin+)

Create new site

- **Input**: `{ organizationId, data: { name, address?, city?, state?, postalCode? } }`
- **Returns**: Site object

#### `sites.update`, `sites.delete`, `sites.restore`, `sites.permanentlyDelete`

Standard CRUD pattern (admin+ for all mutations)

#### `areas.list`, `areas.get`, `areas.create`, etc.

Same pattern as sites, nested under sites

- Area operations use `{ organizationId, siteId, areaId }`

#### `units.list`, `units.get`, `units.create`, etc.

Same pattern as areas, nested under areas

- Unit operations use `{ organizationId, siteId, areaId, unitId }`
- Create requires: `{ unitType: 'fridge'|'freezer'|'walk_in_cooler'|'walk_in_freezer'|'display_case'|'blast_chiller' }`
- Manager+ for all mutations

#### `units.listByOrg` — Query / orgProcedure

List all organization units with hierarchy

- **Input**: `{ organizationId }`
- **Returns**: Array of units with site/area names

#### `units.getWithHierarchy` — Query / orgProcedure

Get unit with full hierarchy

- **Input**: `{ organizationId, unitId }`
- **Returns**: Unit with site, area, organization context

### Readings

#### `readings.list` — Query / orgProcedure

Query readings with pagination and filters

- **Input**: `{ organizationId, unitId, page?, limit?: 1-1000, start?: ISO date, end?: ISO date }`
- **Returns**: Paginated readings array

#### `readings.latest` — Query / orgProcedure

Get most recent reading for unit

- **Input**: `{ organizationId, unitId }`
- **Returns**: Reading or null

#### `readings.createManual` — Mutation / orgProcedure

Create manual temperature entry

- **Input**: `{ unitId, temperature: number, notes?: string, recordedAt: ISO date }`
- **Returns**: Created reading

#### `readings.listManual` — Query / orgProcedure

List manual temperature logs

- **Input**: `{ organizationId, unitId?, page?, limit?: 1-1000, start?, end? }`
- **Returns**: Array of manual logs

#### `readings.listDoorEvents` — Query / orgProcedure

List door open/close events

- **Input**: `{ organizationId, unitId?, limit?: 1-100 }`
- **Returns**: Array of door events

#### `readings.listEventLogs` — Query / orgProcedure

List annotations and event logs for unit

- **Input**: `{ organizationId, unitId, eventTypes?: string[], limit?: 1-100 }`
- **Returns**: Array with author profile info

#### `readings.createEventLog` — Mutation / orgProcedure

Create annotation

- **Input**: `{ organizationId, unitId, eventType: string, eventData: object, title?: string }`
- **Returns**: Created log

#### `readings.deleteEventLog` — Mutation / orgProcedure (manager+)

Delete annotation

- **Input**: `{ organizationId, eventLogId }`
- **Returns**: `{ success: boolean }`

#### `readings.logManualTemperature` — Mutation / orgProcedure

Complete temperature logging workflow with corrective action

- **Input**: `{ organizationId, unitId, temperature, notes?, correctiveAction?, isInRange }`
- **Returns**: `{ success, logId }`
- **Side Effects**: Resolves missed_manual_entry alerts if isInRange=true

### Reports

#### `reports.export` — Mutation / orgProcedure

Export temperature logs

- **Input**: `{ organizationId, startDate, endDate, reportType: 'daily'|'exceptions'|'manual'|'compliance', format: 'csv'|'html', siteId?, unitId? }`
- **Returns**: `{ content: string (CSV or HTML), contentType, filename }`

### Alerts

#### `alerts.list` — Query / orgProcedure

List alerts with filtering and pagination

- **Input**: `{ organizationId, status?: 'active'|'acknowledged'|'resolved', severity?, unitId?, siteId?, page?, limit?: 1-100, start?, end? }`
- **Returns**: Paginated alerts array

#### `alerts.get` — Query / orgProcedure

Get alert by ID

- **Input**: `{ organizationId, alertId }`
- **Returns**: Alert object

#### `alerts.acknowledge` — Mutation / orgProcedure (staff+)

Acknowledge alert

- **Input**: `{ organizationId, alertId, notes?: string }`
- **Returns**: Updated alert

#### `alerts.resolve` — Mutation / orgProcedure (staff+)

Resolve alert with notes

- **Input**: `{ organizationId, alertId, resolution: string (1-2000), correctiveAction?: string (0-2000) }`
- **Returns**: Updated alert

#### `alerts.listByOrg` — Query / orgProcedure

List alerts with hierarchy info (site, area, unit names)

- **Input**: Same as list
- **Returns**: Array with hierarchy

### Alert Rules, History & Configuration

#### `alertRules.get` — Query / orgProcedure

Get rules at scope (org, site, or unit)

- **Input**: `{ organizationId, siteId?, unitId? }`
- **Returns**: Alert rules object

#### `alertRules.upsert` — Mutation / orgProcedure

Create or update rules

- **Input**: `{ organizationId, siteId?, unitId?, data: { manualIntervalMinutes?, expectedReadingIntervalSeconds?, offlineTriggerMultiplier?, ... } }`
- **Returns**: Updated rules

#### `alertRules.delete`, `alertRules.clearField`

Delete or clear specific rule field

#### `alertHistory.get` — Query / orgProcedure

Get rule change history

- **Input**: `{ organizationId, siteId?, unitId?, limit?: 1-100 }`
- **Returns**: Array of changes

#### `alertHistory.create` — Mutation / orgProcedure

Log rule change

- **Input**: `{ alertRuleId, action: string, changes: object, oldValues?: object }`

### Preferences

#### `preferences.getDigest` — Query / protectedProcedure

Get digest email preferences

- **Returns**: `{ digestDaily, digestWeekly, digestDailyTime, digestSiteIds, timezone, emailEnabled }`

#### `preferences.updateDigest` — Mutation / protectedProcedure

Update digest preferences and schedulers

- **Input**: `{ digestDaily?, digestWeekly?, digestDailyTime?: 'HH:MM', digestSiteIds?, timezone? }`
- **Returns**: Updated preferences
- **Side Effects**: Syncs BullMQ schedulers (fire-and-forget)

#### `preferences.disableAllDigests` — Mutation / protectedProcedure

Disable all digests immediately

- **Returns**: `{ success: boolean, message }`
- **Side Effects**: Removes all schedulers

### SMS & Notifications

#### `smsConfig.get` — Query / orgProcedure

Get SMS configuration

- **Input**: `{ organizationId }`
- **Returns**: SMS config or `{ configured: false }`

#### `smsConfig.upsert` — Mutation / orgProcedure (admin+)

Create or update SMS config

- **Input**: `{ organizationId, data: { phoneNumber, displayName?, recipient, ... } }`
- **Returns**: SMS config object

#### `smsConfig.listAlertHistory` — Query / orgProcedure

List recent SMS alerts

- **Input**: `{ organizationId, limit?: 1-100 }`
- **Returns**: Array of SMS logs with status

#### `notificationPolicies.sendTestSms` — Mutation / protectedProcedure

Send test SMS

- **Input**: `{ to: E.164 phone, message }`
- **Returns**: `{ success, messageId?, error? }`

#### `notificationPolicies.listByOrg/BySite/ByUnit` — Query / orgProcedure

List policies at scope

- **Returns**: Array of notification policies

#### `notificationPolicies.getEffective` — Query / orgProcedure

Get effective policy for unit+alertType (inheritance: unit -> site -> org)

- **Input**: `{ organizationId, unitId, alertType }`
- **Returns**: Policy or null

#### `notificationPolicies.upsert` — Mutation / orgProcedure (admin+)

Create or update policy

- **Input**: `{ organizationId, scope: {organization_id?, site_id?, unit_id?}, alertType, policy: {...} }`
- **Returns**: Updated policy

#### `notificationPolicies.delete` — Mutation / orgProcedure (admin+)

Delete policy

- **Input**: `{ organizationId, scope, alertType }`
- **Returns**: `{ success }`

#### `notificationPolicies.getNotificationSettings`, `upsertNotificationSettings`

Organization-level notification settings (email recipients, enabled event types)

### Escalation Contacts

#### `escalationContacts.list` — Query / orgProcedure

List active escalation contacts

- **Input**: `{ organizationId }`
- **Returns**: Array of contacts

#### `escalationContacts.create` — Mutation / orgProcedure (manager+)

Create contact

- **Input**: `{ organizationId, data: { name, email?, phone?, priority, ... } }`
- **Returns**: Created contact

#### `escalationContacts.update` — Mutation / orgProcedure (manager+)

Update contact

- **Input**: `{ organizationId, contactId, data: { name?, email?, phone?, priority?, ... } }`
- **Returns**: `{ success }`

#### `escalationContacts.delete` — Mutation / orgProcedure (manager+)

Soft delete contact

- **Input**: `{ organizationId, contactId }`
- **Returns**: `{ success }`

### Payments

#### `payments.getSubscription` — Query / orgProcedure

Get subscription details

- **Input**: `{ organizationId }`
- **Returns**: Subscription object with sensor limits and usage, or null

#### `payments.createCheckoutSession` — Mutation / orgProcedure

Create Stripe checkout

- **Input**: `{ organizationId, data: { planId: string, ... } }`
- **Returns**: `{ sessionId, redirectUrl }`

#### `payments.createPortalSession` — Mutation / orgProcedure

Create Stripe billing portal

- **Input**: `{ organizationId, data: { returnUrl } }`
- **Returns**: `{ redirectUrl }`

### TTN (The Things Network)

#### `ttnGateways.list` — Query / orgProcedure

List TTN gateways

- **Returns**: Array of gateways

#### `ttnGateways.get/create/update/deregister/refreshStatus`

Standard CRUD (manager+ for mutations)

#### `ttnDevices.list` — Query / orgProcedure

List TTN devices

- **Returns**: Array of devices

#### `ttnDevices.get`, `ttnDevices.getByUnit`

Get device by ID or unit association

#### `ttnDevices.provision` — Mutation / sensorCapacityProcedure (manager+)

Provision device with manual credentials

- **Input**: `{ organizationId, data: { deviceId, name, devEui, joinEui, appKey, ... } }`
- **Returns**: Device object
- **Requires**: Available sensor capacity

#### `ttnDevices.bootstrap` — Mutation / sensorCapacityProcedure (manager+)

Provision device with auto-generated credentials

- **Input**: `{ organizationId, data: { name, unitId, ... } }`
- **Returns**: `{ deviceId, devEui, joinEui, appKey }` (secrets)
- **Requires**: Available sensor capacity

#### `ttnDevices.update/deprovision/restore/permanentlyDelete`

Standard mutations (manager+)

#### `ttnDevices.diagnose` — Mutation / orgProcedure

Run device connectivity diagnostics

- **Input**: `{ organizationId, sensorId }`
- **Returns**: `{ success, clusterBaseUrl, region, appId, checks[], diagnosis, hint }`

#### `ttnSettings.get` — Query / orgProcedure

Get TTN settings

- **Returns**: Settings object or null

#### `ttnSettings.getCredentials` — Query / orgProcedure (manager+)

Get decrypted TTN API keys

- **Returns**: Credentials with secret status tracking (encrypted, failed, etc.)

#### `ttnSettings.getStatus` — Query / orgProcedure

Get provisioning status

- **Returns**: Status, step, error, attempt count

#### `ttnSettings.update` — Mutation / orgProcedure (admin+)

Update settings

- **Input**: `{ organizationId, data: { ttnApplicationId?, ttnApiKey?, ttnRegion?, ... } }`
- **Returns**: `{ success }`

#### `ttnSettings.validateApiKey` — Mutation / orgProcedure

Validate API key without saving

- **Input**: `{ organizationId, apiKey, applicationId, cluster }`
- **Returns**: `{ valid, permissions, request_id, error? }`

#### `ttnSettings.saveAndConfigure` — Mutation / orgProcedure (admin+)

Save credentials and configure webhook

- **Input**: `{ organizationId, apiKey, applicationId, cluster }`
- **Returns**: `{ ok, ...provisioningStatus }`

#### `ttnSettings.updateWebhook`, `regenerateWebhookSecret`

Webhook management (admin+)

#### `ttnSettings.test` — Mutation / orgProcedure

Test TTN connection

- **Input**: `{ organizationId, deviceId? }`
- **Returns**: Test result

#### `ttnSettings.provision` — Mutation / orgProcedure (admin+)

Retry failed provisioning

- **Input**: `{ organizationId, action: 'retry' }`
- **Returns**: Result

#### `ttnSettings.startFresh` — Mutation / orgProcedure (admin+)

Deprovision and reset

- **Input**: `{ organizationId, region?: 'nam1' }`
- **Returns**: Result

#### `ttnSettings.deepClean` — Mutation / orgProcedure (admin+)

Delete all TTN resources (irreversible)

- **Input**: `{ organizationId }`
- **Returns**: Result

#### `ttnSettings.listProvisioningLogs` — Query / orgProcedure

Get provisioning activity logs

- **Input**: `{ organizationId, limit?: 1-100 }`
- **Returns**: Array of logs

### Telnyx (SMS Provider)

#### `telnyx.verificationStatus` — Query / Public

Get toll-free verification status

- **Returns**: `{ status: 'approved'|'pending'|'rejected'|'unknown', verificationId?, phoneNumber?, details?, lastChecked }`

#### `telnyx.configureWebhook` — Mutation / orgProcedure (admin+)

Configure webhook URL

- **Input**: `{ organizationId }`
- **Returns**: `{ success, webhookUrl?, error? }`

#### `telnyx.verifyPublicAsset` — Mutation / Public

Check URL is accessible

- **Input**: `{ url }`
- **Returns**: `{ accessible, status, contentType, isImage, error?, checkedAt }`

### Assets

#### `assets.getUploadUrl` — Mutation / orgProcedure

Generate pre-signed S3/MinIO URL for direct upload

- **Input**: `{ organizationId, filename, mimeType, assetType: 'profile'|'site'|'unit'|'area', entityId? }`
- **Returns**: `{ uploadUrl (1 hour expiry), publicUrl, key }`
- **Usage**: Client uploads directly to storage, bypassing tRPC body limits

### Users & Profiles

#### `users.me` — Query / protectedProcedure

Get current user profile

- **Returns**: `{ profile, role }`

#### `users.updateProfile` — Mutation / protectedProcedure

Update profile data

- **Input**: `{ fullName?, phone?, avatarUrl?, notificationPreferences: { push?, email?, sms? } }`
- **Returns**: `{ success }`

#### `users.getLastSyncLog` — Query / protectedProcedure

Get most recent user sync log

- **Returns**: Log object or null

#### `users.triggerEmulatorSync` — Mutation / protectedProcedure

Trigger emulator resync

- **Returns**: `{ success }`

#### `users.checkSuperAdminStatus` — Query / protectedProcedure

Check if user is super admin

- **Returns**: `{ isSuperAdmin }`

### Admin (Super Admin Only)

#### `admin.queueHealth` — Query / superAdminProcedure

Get Redis/BullMQ health

- **Returns**: `{ redisEnabled, queues: [{name, counts: {waiting, active, completed, failed, delayed}}], timestamp }`

#### `admin.systemStatus` — Query / superAdminProcedure

Get system status

- **Returns**: `{ queues: {enabled, count}, timestamp }`

#### `admin.systemStats` — Query / superAdminProcedure

Get record counts

- **Returns**: `{ organizations, users, sites, units, readings, alerts, timestamp }`

#### `admin.ttnConnections` — Query / superAdminProcedure

List all TTN connections

- **Returns**: Array across all organizations

#### `admin.listOrganizations` — Query / superAdminProcedure

List organizations with stats

- **Returns**: Array with user and site counts

#### `admin.listUsers` — Query / superAdminProcedure

List all users (max 200)

- **Returns**: Array with roles and organization context

#### `admin.searchUsers` — Query / superAdminProcedure

Search users by email/name (max 10)

- **Input**: `{ query: string (min 2) }`
- **Returns**: Matching users

#### `admin.logSuperAdminAction` — Mutation / superAdminProcedure

Log super admin action

- **Input**: `{ action, targetType?, targetId?, targetOrgId?, impersonatedUserId?, details? }`
- **Returns**: `{ success, reason? }`

#### `admin.listSuperAdminAuditLog` — Query / superAdminProcedure

Get super admin audit log

- **Input**: `{ limit?: 1-1000 }`
- **Returns**: Array of actions

#### `admin.findOrphanOrganizations` — Query / superAdminProcedure

Find orgs with no members

- **Returns**: Array of orphan organizations

#### `admin.getOrganization` — Query / superAdminProcedure

Get organization with details

- **Input**: `{ organizationId }`
- **Returns**: Organization with users, sites, and unit count

#### `admin.getUser` — Query / superAdminProcedure

Get user with roles

- **Input**: `{ userId }`
- **Returns**: User with all roles and super admin status

#### `admin.softDeleteOrganization` — Mutation / superAdminProcedure

Soft delete organization

- **Input**: `{ organizationId }`
- **Returns**: `{ success }`

#### `admin.hardDeleteOrganization` — Mutation / superAdminProcedure

Hard delete organization (irreversible)

- **Input**: `{ organizationId, confirmName: string }`
- **Returns**: `{ success }`
- **Requirements**: Org must be soft-deleted first, name must match exactly

### Onboarding

#### `onboarding.checkExistingOrg` — Query / protectedProcedure

Check if user already has organization

- **Returns**: `{ hasOrg, organizationId? }`

#### `onboarding.createOrganization` — Mutation / protectedProcedure

Create organization with owner

- **Input**: `{ name, slug (regex: ^[a-z0-9-]+$), timezone? }`
- **Returns**: `{ ok, organizationId?, slug?, code?, message?, suggestions?[] }`

#### `onboarding.createSite/Area/Unit` — Mutation / orgProcedure

Create hierarchy levels

- **Returns**: `{ siteId }`, `{ areaId }`, or `{ unitId }`

#### `onboarding.createGateway` — Mutation / orgProcedure (manager+)

Create TTN gateway

- **Input**: `{ organizationId, name, gatewayEui (16 hex), siteId? }`
- **Returns**: `{ gatewayId }`

### Availability (Public)

#### `availability.checkEmail` — Query / Public

Check email availability for registration

- **Input**: `{ email }`
- **Returns**: `{ available, message }`

#### `availability.checkPhone` — Query / Public

Check phone availability

- **Input**: `{ phone (10-20 chars) }`
- **Returns**: `{ available, message }`

### Dashboard Layouts

#### `dashboardLayout.list` — Query / orgProcedure

List layouts for entity

- **Input**: `{ organizationId, entityType: 'unit'|'site', entityId }`
- **Returns**: Array (max 3 per user per entity)

#### `dashboardLayout.create` — Mutation / orgProcedure

Create layout

- **Input**: `{ organizationId, entityType, entityId, slotNumber: 1-3, name, layoutJson?, widgetPrefsJson?, timelineStateJson? }`
- **Returns**: Created layout

#### `dashboardLayout.update`, `dashboardLayout.remove`, `dashboardLayout.setDefault`

Standard mutations

### Inspector Mode

#### `inspector.validateSession` — Mutation / protectedProcedure

Validate inspector token

- **Input**: `{ token }`
- **Returns**: `{ organizationId, allowedSiteIds? }`

#### `inspector.checkUserAccess` — Query / orgProcedure

Check inspector access

- **Input**: `{ organizationId }`
- **Returns**: `{ organizationId, role }`

#### `inspector.getOrgData` — Query / orgProcedure

Get organization and sites for inspector

- **Input**: `{ organizationId, allowedSiteIds?[] }`
- **Returns**: `{ name, timezone, sites: [{id, name, timezone}] }`

#### `inspector.getUnits` — Query / orgProcedure

Get units for filtering

- **Input**: `{ organizationId, siteId? }`
- **Returns**: Array of units (filtered by site if provided)

#### `inspector.getInspectionData` — Query / orgProcedure

Get all inspection data for date range

- **Input**: `{ organizationId, unitIds[], startDate: ISO, endDate: ISO }`
- **Returns**: `{ sensorReadings, manualLogs, alerts, correctiveActions, monitoringGaps }`

### Widget Health Metrics

#### `widgetHealth.trackHealthChange` — Mutation / orgProcedure

Track widget status change

- **Input**: `{ widgetId, entityId, entityType, orgId, previousStatus?, currentStatus, failingLayer?, payloadType?, metadata? }`
- **Returns**: `{ success }`

#### `widgetHealth.getHealthDistribution` — Query / orgProcedure

Get health distribution for org

- **Input**: `{ orgId }`

#### `widgetHealth.getFailuresByLayer` — Query / orgProcedure

Get failure counts by layer

- **Input**: `{ orgId }`

#### `widgetHealth.hasCriticalIssues` — Query / orgProcedure

Check for critical issues

- **Input**: `{ orgId }`
- **Returns**: `{ hasCritical }`

#### `widgetHealth.getBufferedEvents`, `flushHealthMetrics`, `resetOrgCounters`

Health metrics management

### Audit

#### `audit.logEvent` — Mutation / orgProcedure

Create audit log entry

- **Input**: `{ eventType, category?, severity?, title, organizationId, siteId?, areaId?, unitId?, eventData?, impersonationSessionId?, actingAdminId? }`
- **Returns**: `{ success }`

#### `audit.list` — Query / orgProcedure

List audit events

- **Input**: `{ organizationId, siteId?, areaId?, unitId?, page?, limit?: 1-1000, start?, end? }`
- **Returns**: Paginated audit log

### Pilot Feedback

#### `pilotFeedback.upsert` — Mutation / orgProcedure

Submit/update feedback for week

- **Input**: `{ organizationId, siteId?, weekStart, loggingSpeedRating: 1-5, alertFatigueRating: 1-5, reportUsefulnessRating: 1-5, notes? }`
- **Returns**: Created/updated feedback

#### `pilotFeedback.list` — Query / orgProcedure

Get feedback for organization

- **Returns**: Array of feedback entries

---

## REST Endpoints

### Health Check

#### `GET /health`

Comprehensive health check

- **Auth**: Public
- **Returns**: `{ status: 'healthy'|'degraded'|'unhealthy', uptime, timestamp, version, environment, checks: {database, redis?, ...} }`
- **HTTP Status**: 200 (healthy/degraded), 503 (unhealthy)

#### `GET /health/ready`

Kubernetes readiness probe (can service traffic?)

- **Auth**: Public
- **Returns**: `{ ready: boolean, reason? }`

#### `GET /health/live`

Kubernetes liveness probe (process alive?)

- **Auth**: Public
- **Returns**: `{ alive: true }`

#### `GET /health/realtime`

WebSocket connection status

- **Auth**: Public
- **Returns**: `{ websocket: {enabled, connections} }`

### Data Ingestion

#### `POST /api/ingest/readings`

Bulk sensor data ingestion

- **Auth**: API Key (`x-api-key` header)
- **Body**:
  ```json
  {
    "readings": [
      {
        "unitId": "uuid",
        "deviceId": "string",
        "temperature": 35.5,
        "humidity": 45.2,
        "battery": 85,
        "signalStrength": -80,
        "recordedAt": "2024-01-15T10:30:00Z",
        "source": "sensor|manual|simulated"
      }
    ]
  }
  ```
- **Returns**:
  ```json
  {
    "success": true,
    "insertedCount": 1,
    "readingIds": ["uuid"],
    "alertsTriggered": 0
  }
  ```
- **Side Effects**:
  - Stores readings in database
  - Adds to real-time streaming
  - Evaluates alert rules
  - May trigger new alerts or resolve existing ones

#### `GET /api/orgs/:organizationId/sites/:siteId/areas/:areaId/units/:unitId/readings`

Query readings with pagination

- **Auth**: JWT (requireAuth + requireOrgContext)
- **Query Params**:
  - `page`: 1-based pagination
  - `limit`: 1-1000 results per page
  - `start`: ISO datetime (filter from)
  - `end`: ISO datetime (filter to)
- **Returns**: Array of reading objects

---

## Error Handling

### tRPC Error Codes

tRPC errors use standard error codes that map to HTTP status:

| Code                  | HTTP Status | Description                                                             |
| --------------------- | ----------- | ----------------------------------------------------------------------- |
| UNAUTHORIZED          | 401         | JWT missing, invalid, or expired                                        |
| FORBIDDEN             | 403         | User lacks required permissions or role                                 |
| NOT_FOUND             | 404         | Resource not found                                                      |
| CONFLICT              | 409         | Resource conflict (e.g., duplicate, already acknowledged)               |
| BAD_REQUEST           | 400         | Invalid input or validation failure                                     |
| PRECONDITION_FAILED   | 412         | Prerequisite not met (e.g., no TTN connection for gateway registration) |
| INTERNAL_SERVER_ERROR | 500         | Server error                                                            |

### Error Response Format

All error responses follow this format:

```json
{
  "code": "error_code",
  "message": "Human-readable error message",
  "cause": {}
}
```

### Common Error Scenarios

#### Unauthorized (Missing/Invalid Token)

```
Status: 401 UNAUTHORIZED
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

#### Forbidden (Insufficient Role)

```
Status: 403 FORBIDDEN
{
  "code": "FORBIDDEN",
  "message": "Only admins and owners can delete sites"
}
```

#### Not Found

```
Status: 404 NOT_FOUND
{
  "code": "NOT_FOUND",
  "message": "Site not found"
}
```

#### Sensor Capacity Exceeded

```
Status: 403 FORBIDDEN
{
  "code": "FORBIDDEN",
  "message": "Sensor capacity exceeded. Upgrade your plan to add more sensors."
}
```

#### Invalid Input

```
Status: 400 BAD_REQUEST
{
  "code": "BAD_REQUEST",
  "message": "Invalid input: 'name' is required"
}
```

---

## Related Documentation

- [Architecture Overview](/docs/architecture/ARCHITECTURE.md)
- [Database Schema](/docs/database/SCHEMA.md)
- [Authentication & Security](/docs/security/AUTH.md)
- [Webhook Handlers](/docs/webhooks/README.md)
- [Background Jobs](/docs/jobs/QUEUES.md)
