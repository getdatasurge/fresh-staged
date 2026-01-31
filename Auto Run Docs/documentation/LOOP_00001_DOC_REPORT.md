---
type: report
title: Documentation Coverage Report - Loop 00001
created: 2026-01-30
tags:
  - documentation
  - coverage
  - analysis
related:
  - '[[1_ANALYZE]]'
---

# Documentation Coverage Report - Loop 00001

## Summary

- **Overall Coverage:** 42.5%
- **Target:** 90%
- **Gap to Target:** 47.5%
- **Documentation Style:** JSDoc/TSDoc block comments (`/** ... */`)

| Area                       | Documented | Total     | Coverage  |
| -------------------------- | ---------- | --------- | --------- |
| **Frontend (src/)**        | 449        | 1,077     | 41.7%     |
| **Backend (backend/src/)** | 341        | 784       | 43.5%     |
| **Combined**               | **790**    | **1,861** | **42.5%** |

## Coverage by Category

| Category                            | Documented | Total     | Coverage  |
| ----------------------------------- | ---------- | --------- | --------- |
| Functions (services, utils, hooks)  | 380        | 583       | 65.2%     |
| Classes                             | 5          | 8         | 62.5%     |
| Interfaces/Types                    | 78         | 376       | 20.7%     |
| Modules (routers, routes, plugins)  | 19         | 81        | 23.5%     |
| Constants (schemas, configs, enums) | 74         | 463       | 16.0%     |
| React Components                    | 17         | 170       | 10.0%     |
| Database Schema Definitions         | 3          | 113       | 2.7%      |
| Email Templates                     | 0          | 3         | 0.0%      |
| **Total**                           | **790**    | **1,861** | **42.5%** |

## Coverage by Module/Directory

### Frontend (src/)

| Module                  | Documented | Total | Coverage | Status                |
| ----------------------- | ---------- | ----- | -------- | --------------------- |
| hooks/                  | 141        | 232   | 60.8%    | NEEDS WORK            |
| features/               | 113        | 203   | 55.7%    | NEEDS WORK            |
| lib/                    | 165        | 379   | 43.5%    | NEEDS WORK            |
| types/                  | 10         | 26    | 38.5%    | NEEDS WORK            |
| contexts/               | 3          | 12    | 25.0%    | NEEDS WORK            |
| components/ (custom)    | 16         | 133   | 12.0%    | NEEDS WORK            |
| pages/                  | 1          | 35    | 2.9%     | NEEDS WORK            |
| components/ui/ (shadcn) | 0          | 55    | 0.0%     | SKIP (auto-generated) |
| providers/              | 0          | 2     | 0.0%     | NEEDS WORK            |

### Backend (backend/src/)

| Module      | Documented | Total | Coverage | Status     |
| ----------- | ---------- | ----- | -------- | ---------- |
| config/     | 20         | 20    | 100.0%   | OK         |
| middleware/ | 14         | 14    | 100.0%   | OK         |
| trpc/       | 12         | 12    | 100.0%   | OK         |
| types/      | 9          | 9     | 100.0%   | OK         |
| utils/      | 17         | 18    | 94.4%    | OK         |
| services/   | 218        | 283   | 77.0%    | NEEDS WORK |
| workers/    | 4          | 6     | 66.7%    | NEEDS WORK |
| routes/     | 7          | 21    | 33.3%    | NEEDS WORK |
| jobs/       | 5          | 17    | 29.4%    | NEEDS WORK |
| schemas/    | 27         | 230   | 11.7%    | NEEDS WORK |
| routers/    | 3          | 31    | 9.7%     | NEEDS WORK |
| db/         | 3          | 113   | 2.7%     | NEEDS WORK |
| plugins/    | 2          | 7     | 28.6%    | NEEDS WORK |
| emails/     | 0          | 3     | 0.0%     | NEEDS WORK |

## Lowest Coverage Areas

Modules with coverage below 30%:

### Backend

1. **db/schema/** - 2.7% coverage
   - 110 undocumented exports (tables, inferred types, enums)
   - Key exports: All `pgTable` definitions (organizations, sites, areas, units, devices, alerts, users, telemetry, billing, notifications), 15 `pgEnum` definitions, all inferred insert/select types
   - **Impact:** Foundational data layer - every service depends on these schemas

2. **routers/** - 9.7% coverage
   - 28 undocumented exports (tRPC router constants)
   - Key exports: organizationsRouter, alertsRouter, sitesRouter, unitsRouter, readingsRouter, usersRouter, paymentsRouter
   - **Impact:** API layer - these define the type-safe RPC surface area

3. **schemas/** (Zod) - 11.7% coverage
   - 203 undocumented exports (validation schemas and inferred types)
   - Key exports: AlertSchema, PaymentSchemas, ReadingsSchema, OrganizationSchema, SiteSchema, UnitSchema, plus all inferred TypeScript types
   - **Impact:** API contract definitions - every request/response is validated against these

4. **jobs/** - 29.4% coverage
   - 12 undocumented exports (job data types, queue names, job names)
   - Key exports: QueueNames, JobNames, BaseJobData, SmsNotificationJobData, EmailDigestJobData, MeterReportJobData
   - **Impact:** Background processing infrastructure

5. **plugins/** - 28.6% coverage
   - 5 undocumented exports (Fastify plugin registrations)
   - Key exports: authPlugin, socketPlugin, queuePlugin, emailPlugin
   - **Impact:** Server infrastructure - plugin initialization and configuration

### Frontend

6. **pages/** - 2.9% coverage
   - 34 undocumented exports (page components)
   - Key exports: Dashboard, Settings (1422 lines), UnitDetail, SiteDetail, Onboarding, AlertsPage, DevicesPage
   - **Impact:** Top-level route destinations - the primary user-facing views

7. **components/** (custom) - 12.0% coverage
   - 117 undocumented exports (React components)
   - Key exports: DashboardLayout (app shell), Sidebar, TopBar, AlertCard, DeviceCard, SettingsPanel, all form components
   - **Impact:** UI building blocks used across the entire application

8. **providers/** - 0.0% coverage
   - 2 undocumented exports
   - Key exports: RealtimeProvider, useRealtimeStatus
   - **Impact:** WebSocket connection management for all real-time features

9. **contexts/** - 25.0% coverage
   - 9 undocumented exports
   - Key exports: SuperAdminProvider, useSuperAdmin, useImpersonation, DebugContext, TTNConfigContext
   - **Impact:** Application-wide state management for admin and IoT features

## Existing Documentation Patterns

### Style Guide Observations

- **Comment style:** JSDoc/TSDoc block comments (`/** ... */`)
- **Parameter format:** Inconsistent - some use `@param`, most use prose descriptions
- **Return format:** Rarely documented explicitly with `@returns`
- **Example usage:** Present in some hooks (useOrgScope, queryKeys) | Absent in most components
- **Error/exception documentation:** Rare - only found in a few service files

### Common Patterns Found

- **Backend services are the best-documented code** - Most exported functions in `services/` have JSDoc with purpose descriptions
- **Backend infrastructure is fully documented** - config/, middleware/, trpc/, types/, utils/ are at 94-100% coverage
- **tRPC routers have file-level JSDoc but not export-level JSDoc** - Every router file starts with `/** Router description */` but the `export const xxxRouter` line lacks its own JSDoc
- **Database schema has zero documentation discipline** - All Drizzle table definitions, enum definitions, and inferred types lack JSDoc
- **Zod schemas use section comments (`// ---`) instead of JSDoc** - These inline comments don't provide IDE tooltips or API documentation
- **Frontend components almost never have JSDoc** - React components rely on prop types for documentation rather than JSDoc
- **Hooks directory is the frontend's strongest documentation area** - 60.8% coverage with detailed usage examples in key hooks
- **Widget components have 0% coverage** - All 43 dashboard widget components lack any JSDoc documentation
- **shadcn/ui components are auto-generated** - 0% coverage is expected and acceptable (55 components)

### Documentation Style Examples

**Well-documented (backend service):**

```typescript
/**
 * EmailService for digest email delivery via Resend API
 *
 * Wraps the Resend SDK with a typed interface for sending
 * daily and weekly digest emails to organization members.
 *
 * Features:
 * - Environment-based configuration
 * - Typed sendDigest method
 * - Error handling with structured logging
 */
export class EmailService { ... }
```

**Well-documented (frontend hook):**

```typescript
/**
 * useOrgScope - THE canonical hook for org-scoped data fetching
 *
 * This is the single source of truth for determining which organization
 * and user context should be used for data queries. It correctly handles
 * impersonation scenarios where a Super Admin is viewing as another user.
 *
 * USAGE: Replace all patterns of:
 * - profiles.organization_id lookups for data queries
 * - session.user.id for org derivation
 *
 * With:
 *   const { orgId, userId, isReady, isImpersonating } = useOrgScope();
 */
```

**Undocumented (typical pattern):**

```typescript
// No JSDoc at all
export const alertsRouter = router({ ... })

// Section comment (not JSDoc)
// --- Alert Response Schema ---
export const AlertSchema = z.object({ ... })

// No documentation
export const organizations = pgTable('organizations', { ... })
```

## High-Value Documentation Targets

### Quick Wins (Easy to document, high visibility)

1. **tRPC router exports** (28 in routers/) - Each already has file-level JSDoc; just needs the `export const` to have its own `/** */` block. Copy from existing file header.
2. **RealtimeProvider** in providers/RealtimeProvider.tsx - Only 2 exports, critical for real-time features
3. **SuperAdminContext** exports in contexts/SuperAdminContext.tsx - 5 exports, central to admin functionality
4. **Page components** (35 in pages/) - Each is a single default export; one-line JSDoc describing the page purpose
5. **db/schema/enums.ts** (15 enums) - Each enum is 2-5 values; a one-line JSDoc explaining what it constrains

### High Priority (Heavily used, undocumented)

1. **db/schema/ table definitions** (all 12 files, 96 table/type exports) - Every service queries these; they define the data model
2. **Zod validation schemas** (schemas/, 203 exports) - API contracts used by both frontend and backend via tRPC
3. **Dashboard widget components** (43 in features/dashboard-layout/widgets/) - Primary data visualization layer
4. **Core frontend components** (DashboardLayout, Sidebar, AlertCard, DeviceCard) - App shell and key UI elements
5. **jobs/index.ts** (12 exports) - BullMQ job infrastructure types and names
6. **TTN integration services** (ttn.service.ts, ttn-device.service.ts, ttn-gateway.service.ts) - Complex external API integration

### Skip for Now (Low priority)

1. **components/ui/** (55 shadcn exports) - Auto-generated, documented upstream
2. **services/index.ts** barrel exports - Just re-exports, no logic to document
3. **trpc/index.ts** barrel - Already at 100% coverage
4. **Simple type aliases** that mirror Drizzle inferred types (e.g., `export type Unit = typeof units.$inferSelect`)
