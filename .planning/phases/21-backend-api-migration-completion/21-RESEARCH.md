# Phase 21: Backend API Migration - Completion - Research

**Researched:** 2026-01-24
**Domain:** tRPC router completion, Supabase client removal, feature flag cleanup
**Confidence:** HIGH

## Summary

This research investigated completing the backend API migration by migrating the remaining Settings and Admin domains to tRPC, removing all feature flags for the parallel REST/tRPC period, and finally removing the `@supabase/supabase-js` dependency from the frontend package.json.

The codebase analysis reveals that Phases 19-20 have already migrated the core domains (organizations, sites, areas, units, readings, alerts) to tRPC. Phase 21 needs to migrate approximately 8 additional REST route files covering Settings and Admin functionality, migrate ~100 frontend files still using direct Supabase client access, and clean up the migration infrastructure.

Key findings: (1) The Supabase client is used in ~100 frontend files, primarily for direct database queries and edge function calls, (2) Several REST routes need tRPC migration: preferences, sms-config, payments, ttn-gateways, ttn-devices, admin, assets, and availability, (3) External webhooks (TTN, Telnyx, Stripe, unsubscribe) should remain as REST endpoints since they use external authentication not JWT, (4) The frontend has already established tRPC patterns in Phase 19-20 that can be followed.

**Primary recommendation:** Create 8 new tRPC routers for Settings/Admin domains, migrate all frontend Supabase usages to tRPC hooks, verify with e2e tests, then remove @supabase/supabase-js from package.json.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @trpc/server | ^11.8.1 | Backend tRPC routers | Already installed in Phase 19, domain routers pattern proven |
| @trpc/client | ^11.8.1 | Frontend tRPC client | Already installed, TRPCProvider established |
| @trpc/tanstack-react-query | ^11.8.1 | React Query integration | Already installed, useTRPC() pattern proven |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 (backend) | Input/output validation | Existing schemas in backend/src/schemas/ |
| Drizzle ORM | Current | Database layer | Service layer uses Drizzle, routers call services |

### To Be Removed
| Library | Version | Reason |
|---------|---------|--------|
| @supabase/supabase-js | ^2.89.0 | Replaced by tRPC - AUTH-02 completion |

**Installation:**
```bash
# No new packages needed
# REMOVAL at end of phase:
npm uninstall @supabase/supabase-js
```

## Architecture Patterns

### Domains to Migrate

Based on existing REST routes analysis:

| REST Route | tRPC Router | Priority | Complexity |
|------------|-------------|----------|------------|
| `routes/preferences.ts` | `preferencesRouter` | HIGH | LOW - 3 endpoints |
| `routes/sms-config.ts` | `smsConfigRouter` | HIGH | LOW - 2 endpoints |
| `routes/payments.ts` | `paymentsRouter` | HIGH | LOW - 3 endpoints |
| `routes/ttn-gateways.ts` | `ttnGatewaysRouter` | MEDIUM | MEDIUM - 6 endpoints |
| `routes/ttn-devices.ts` | `ttnDevicesRouter` | MEDIUM | MEDIUM - 6 endpoints |
| `routes/admin.ts` | `adminRouter` | MEDIUM | LOW - 2 endpoints |
| `routes/assets.ts` | `assetsRouter` | LOW | LOW - 1 endpoint (file upload) |
| `routes/availability.ts` | `availabilityRouter` | LOW | LOW - 2 public endpoints |

### Routes to KEEP as REST (External Webhooks)

These routes should NOT be migrated to tRPC:

| REST Route | Reason |
|------------|--------|
| `routes/ttn-webhooks.ts` | External webhook with API key auth (not JWT) |
| `routes/telnyx-webhooks.ts` | External webhook, no auth |
| `routes/stripe-webhooks.ts` | External webhook with signature verification |
| `routes/unsubscribe.ts` | Public token-based auth (email links) |
| `routes/health.ts` | Public health check endpoint |
| `routes/dev.ts` | Development-only routes (NODE_ENV protected) |

### Recommended Project Structure
```
backend/src/
├── trpc/
│   ├── router.ts           # UPDATE: Add new domain routers
│   └── procedures.ts       # KEEP: Existing procedures work for new domains
├── routers/
│   ├── organizations.router.ts  # Phase 19
│   ├── sites.router.ts          # Phase 20
│   ├── areas.router.ts          # Phase 20
│   ├── units.router.ts          # Phase 20
│   ├── readings.router.ts       # Phase 20
│   ├── alerts.router.ts         # Phase 20
│   ├── preferences.router.ts    # Phase 21 - CREATE
│   ├── sms-config.router.ts     # Phase 21 - CREATE
│   ├── payments.router.ts       # Phase 21 - CREATE
│   ├── ttn-gateways.router.ts   # Phase 21 - CREATE
│   ├── ttn-devices.router.ts    # Phase 21 - CREATE
│   ├── admin.router.ts          # Phase 21 - CREATE
│   ├── assets.router.ts         # Phase 21 - CREATE
│   └── availability.router.ts   # Phase 21 - CREATE
└── routes/                  # CLEANUP: Delete migrated routes, keep webhooks

src/
├── integrations/supabase/   # DELETE: Entire directory
│   └── client.ts            # DELETE
├── hooks/                   # UPDATE: ~50 files need Supabase removal
└── lib/
    └── api/                 # DEPRECATED: Remove if not already deleted
```

### Pattern 1: Preferences Router (Settings Domain)
**What:** Migrate user digest preferences to tRPC
**When to use:** User settings that operate on authenticated user context
**Example:**
```typescript
// backend/src/routers/preferences.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { protectedProcedure } from '../trpc/procedures.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/users.js';
import { syncUserDigestSchedulers, removeUserDigestSchedulers } from '../jobs/schedulers/digest-schedulers.js';

const DigestPreferencesSchema = z.object({
  digestDaily: z.boolean(),
  digestWeekly: z.boolean(),
  digestDailyTime: z.string(),
  digestSiteIds: z.array(z.string()).nullable(),
  timezone: z.string(),
  emailEnabled: z.boolean(),
});

const UpdateDigestPreferencesSchema = z.object({
  digestDaily: z.boolean().optional(),
  digestWeekly: z.boolean().optional(),
  digestDailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  digestSiteIds: z.array(z.string().uuid()).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export const preferencesRouter = router({
  // GET /api/preferences/digest
  getDigest: protectedProcedure
    .output(DigestPreferencesSchema.nullable())
    .query(async ({ ctx }) => {
      const [profile] = await db
        .select({...})
        .from(profiles)
        .where(eq(profiles.userId, ctx.user.id))
        .limit(1);

      if (!profile) return null;
      return profile;
    }),

  // PATCH /api/preferences/digest
  updateDigest: protectedProcedure
    .input(UpdateDigestPreferencesSchema)
    .output(DigestPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      // ... update logic, same as REST route
    }),

  // POST /api/preferences/digest/disable-all
  disableAllDigests: protectedProcedure
    .output(z.object({ success: z.boolean(), message: z.string() }))
    .mutation(async ({ ctx }) => {
      // ... disable logic
    }),
});
```

### Pattern 2: TTN Devices Router (Complex Admin Domain)
**What:** Migrate TTN device management with subscription middleware
**When to use:** Admin features with additional middleware (requireSensorCapacity)
**Example:**
```typescript
// backend/src/routers/ttn-devices.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import { checkSensorCapacity } from '../services/checkout.service.js';
import * as ttnDeviceService from '../services/ttn-device.service.js';

// Custom procedure with sensor capacity check
const sensorCapacityProcedure = orgProcedure.use(async (opts) => {
  const hasCapacity = await checkSensorCapacity(opts.ctx.user.organizationId);
  if (!hasCapacity) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Sensor capacity exceeded. Upgrade your plan.',
    });
  }
  return opts.next();
});

export const ttnDevicesRouter = router({
  list: orgProcedure
    .input(OrgInput)
    .output(TTNDevicesListSchema)
    .query(async ({ ctx }) => {
      return ttnDeviceService.listTTNDevices(ctx.user.organizationId);
    }),

  provision: sensorCapacityProcedure
    .input(ProvisionTTNDeviceInput)
    .output(TTNDeviceResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check
      if (!['manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ttnDeviceService.provisionTTNDevice(ctx.user.organizationId, input.data);
    }),
  // ... other procedures
});
```

### Pattern 3: File Upload in tRPC (Assets)
**What:** Handle multipart file uploads through tRPC
**When to use:** Asset uploads that need org context
**Example:**
```typescript
// backend/src/routers/assets.router.ts
// NOTE: File uploads are complex in tRPC. Consider keeping as REST or using:
// 1. Pre-signed URL pattern (tRPC returns upload URL, client uploads directly)
// 2. Base64 encoding (for small files only)

// Recommended: Pre-signed URL pattern
export const assetsRouter = router({
  getUploadUrl: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      filename: z.string(),
      mimeType: z.string(),
      assetType: z.enum(['profile', 'site', 'unit', 'area']),
      entityId: z.string().uuid().optional(),
    }))
    .output(z.object({
      uploadUrl: z.string().url(),
      publicUrl: z.string().url(),
      key: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return assetStorageService.getPresignedUploadUrl({ ... });
    }),
});
```

### Pattern 4: Public Procedures (Availability)
**What:** Public endpoints that don't require authentication
**When to use:** Registration flow validation
**Example:**
```typescript
// backend/src/routers/availability.router.ts
import { router, publicProcedure } from '../trpc/index.js';

export const availabilityRouter = router({
  checkEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .output(z.object({ available: z.boolean(), message: z.string() }))
    .query(async ({ input }) => {
      return checkEmailAvailability(input.email);
    }),

  checkPhone: publicProcedure
    .input(z.object({ phone: z.string() }))
    .output(z.object({ available: z.boolean(), message: z.string() }))
    .query(async ({ input }) => {
      return checkPhoneAvailability(input.phone);
    }),
});
```

### Anti-Patterns to Avoid
- **Migrating external webhooks to tRPC:** Webhooks use API key/signature auth, not JWT
- **Breaking existing REST during migration:** Keep REST routes until frontend fully migrated
- **Removing Supabase before frontend migrated:** All 100 frontend files must migrate first
- **Creating wrapper functions:** Phase 19 established direct useTRPC() pattern
- **Forgetting to test edge functions replacement:** TTN settings use Supabase edge functions

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Subscription checking | Custom middleware per route | Single sensorCapacityProcedure | Consistent across all TTN endpoints |
| Scheduler sync | Inline database + scheduler | Existing syncUserDigestSchedulers | Service already handles complexity |
| File upload auth | Manual token verification | Pre-signed URL pattern | S3/R2 standard, offloads processing |
| Edge function replacement | New edge functions | tRPC procedures | Consolidate to single deployment |
| Role checking | Per-procedure role checks | Role-aware procedure middleware | DRY, consistent with Phase 19-20 |

**Key insight:** The migration should reuse Phase 19-20 patterns exactly. No new infrastructure needed.

## Common Pitfalls

### Pitfall 1: Supabase Edge Function Dependencies
**What goes wrong:** Frontend calls edge functions that don't exist after migration
**Why it happens:** Edge functions (ttn-*, manage-ttn-settings) are Supabase-specific
**How to avoid:**
1. Identify all supabase.functions.invoke() calls
2. Create equivalent tRPC procedures
3. Update frontend before removing edge functions
**Warning signs:** 403/404 errors on TTN operations

### Pitfall 2: Premature package.json Changes
**What goes wrong:** Build fails or runtime errors from missing Supabase
**Why it happens:** Removing @supabase/supabase-js before all code migrated
**How to avoid:**
1. Migrate all 100 frontend files first
2. Run full test suite
3. Only then remove package dependency
**Warning signs:** Import errors, "Cannot find module" at build time

### Pitfall 3: Breaking Webhook Routes
**What goes wrong:** TTN sensors stop sending data, Stripe payments fail
**Why it happens:** Accidentally migrating webhook routes that use non-JWT auth
**How to avoid:**
1. Leave all *-webhooks.ts routes as REST
2. Keep routes/unsubscribe.ts as REST (token auth)
3. Only migrate user-facing endpoints
**Warning signs:** External service integration failures

### Pitfall 4: Notification Policy Migration Complexity
**What goes wrong:** Supabase RPC functions (get_effective_notification_policy) unavailable
**Why it happens:** RPC functions are Supabase-specific, need backend equivalent
**How to avoid:**
1. Create equivalent service method in backend
2. Port SQL logic to Drizzle ORM query
3. Test inheritance logic thoroughly (unit -> site -> org)
**Warning signs:** Incorrect notification routing, missing escalations

### Pitfall 5: TTN Settings Tied to Edge Functions
**What goes wrong:** TTN configuration stops working
**Why it happens:** useTTNSettings hooks call supabase.functions.invoke
**How to avoid:**
1. Map all edge functions to tRPC procedures
2. Update frontend hooks atomically
3. Keep edge functions until fully migrated
**Warning signs:** TTN setup wizard fails, connection tests fail

### Pitfall 6: Incomplete Frontend Hook Migration
**What goes wrong:** Runtime errors after Supabase removal
**Why it happens:** Not all 100 frontend files updated
**How to avoid:**
1. Use grep to find ALL supabase imports
2. Migrate systematically (by feature area)
3. Remove imports only after tRPC equivalent verified
**Warning signs:** Console warnings "Using Supabase - TODO: migrate"

## Code Examples

Verified patterns from Phase 19-20 and existing codebase:

### SMS Config Router
```typescript
// backend/src/routers/sms-config.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as smsConfigService from '../services/sms-config.service.js';
import {
  SmsConfigCreateSchema,
  SmsConfigResponseSchema,
  SmsConfigGetResponseSchema,
} from '../schemas/sms-config.js';

const OrgInput = z.object({ organizationId: z.string().uuid() });

export const smsConfigRouter = router({
  // GET /api/alerts/sms/config
  get: orgProcedure
    .input(OrgInput)
    .output(SmsConfigGetResponseSchema)
    .query(async ({ ctx }) => {
      const config = await smsConfigService.getSmsConfig(ctx.user.organizationId);

      if (!config) {
        return {
          configured: false as const,
          message: 'SMS configuration not set up. Use POST to configure.',
        };
      }

      return config;
    }),

  // POST /api/alerts/sms/config
  upsert: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      data: SmsConfigCreateSchema,
    }))
    .output(SmsConfigResponseSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check from REST: requireRole('admin')
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin role required to configure SMS',
        });
      }

      try {
        return await smsConfigService.upsertSmsConfig(
          ctx.user.organizationId,
          input.data
        );
      } catch (error) {
        if (error instanceof smsConfigService.SmsConfigError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
```

### Payments Router
```typescript
// backend/src/routers/payments.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as checkoutService from '../services/checkout.service.js';
import {
  CreateCheckoutSessionSchema,
  CheckoutSessionResponseSchema,
  CreatePortalSessionSchema,
  PortalSessionResponseSchema,
  SubscriptionResponseSchema,
} from '../schemas/payments.js';

const OrgInput = z.object({ organizationId: z.string().uuid() });

export const paymentsRouter = router({
  // GET /api/orgs/:orgId/payments/subscription
  getSubscription: orgProcedure
    .input(OrgInput)
    .output(SubscriptionResponseSchema.nullable())
    .query(async ({ ctx }) => {
      const subscription = await checkoutService.getSubscription(
        ctx.user.organizationId
      );
      return subscription;
    }),

  // POST /api/orgs/:orgId/payments/checkout
  createCheckoutSession: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      data: CreateCheckoutSessionSchema,
    }))
    .output(CheckoutSessionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await checkoutService.createCheckoutSession(
          ctx.user.organizationId,
          ctx.user.id,
          input.data
        );
      } catch (error) {
        if (error instanceof Error &&
            (error.name === 'StripeConfigError' || error.name === 'CheckoutError')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  // POST /api/orgs/:orgId/payments/portal
  createPortalSession: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      data: CreatePortalSessionSchema,
    }))
    .output(PortalSessionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await checkoutService.createPortalSession(
          ctx.user.organizationId,
          input.data
        );
      } catch (error) {
        if (error instanceof Error &&
            (error.name === 'StripeConfigError' || error.name === 'PortalError')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
```

### Frontend Hook Migration (Before/After)
```typescript
// BEFORE: useNotificationPolicies.ts using Supabase
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY

export function useOrgNotificationPolicies(orgId: string | null) {
  return useQuery({
    queryKey: qk.org(orgId).notificationPolicies(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_policies")
        .select("*")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data.map(mapDbRowToPolicy);
    },
    enabled: !!orgId && !!user,
  });
}

// AFTER: Using tRPC
import { useTRPC } from "@/lib/trpc";

export function useOrgNotificationPolicies(orgId: string | null) {
  const trpc = useTRPC();

  return trpc.notificationPolicies.listByOrg.useQuery(
    { organizationId: orgId! },
    { enabled: !!orgId }
  );
}
```

### Router Registration
```typescript
// backend/src/trpc/router.ts - UPDATE
import { router, publicProcedure } from './index.js';
// ... existing imports
import { preferencesRouter } from '../routers/preferences.router.js';
import { smsConfigRouter } from '../routers/sms-config.router.js';
import { paymentsRouter } from '../routers/payments.router.js';
import { ttnGatewaysRouter } from '../routers/ttn-gateways.router.js';
import { ttnDevicesRouter } from '../routers/ttn-devices.router.js';
import { adminRouter } from '../routers/admin.router.js';
import { assetsRouter } from '../routers/assets.router.js';
import { availabilityRouter } from '../routers/availability.router.js';

export const appRouter = router({
  health: publicProcedure...

  // Existing (Phase 19-20)
  organizations: organizationsRouter,
  sites: sitesRouter,
  areas: areasRouter,
  units: unitsRouter,
  readings: readingsRouter,
  alerts: alertsRouter,

  // New (Phase 21)
  preferences: preferencesRouter,
  smsConfig: smsConfigRouter,
  payments: paymentsRouter,
  ttnGateways: ttnGatewaysRouter,
  ttnDevices: ttnDevicesRouter,
  admin: adminRouter,
  assets: assetsRouter,
  availability: availabilityRouter,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase client for queries | tRPC procedures | Phase 19 (2026-01) | Type safety, single API layer |
| Edge functions for operations | tRPC mutations | Phase 21 | Consolidated deployment |
| Multiple auth patterns | JWT via Stack Auth | Phase 2 (2025) | Single auth source |
| REST + Supabase parallel | tRPC only | Phase 21 | Simplified architecture |

**Deprecated/outdated:**
- `src/integrations/supabase/client.ts`: Remove after migration
- `supabase.functions.invoke()`: Replace with tRPC procedures
- `supabase.rpc()`: Implement as backend service methods
- All "TODO Phase 6" comments: This IS the completion phase

## Open Questions

Things that couldn't be fully resolved:

1. **Notification Policies RPC Function**
   - What we know: Uses `supabase.rpc("get_effective_notification_policy")` - Supabase-specific
   - What's unclear: Whether to port SQL logic to Drizzle or create equivalent service
   - Recommendation: Create `notificationPolicyService.getEffective()` that implements the inheritance chain (unit -> site -> org) using Drizzle queries

2. **TTN Edge Functions Scope**
   - What we know: Multiple edge functions: ttn-bootstrap, ttn-provision-gateway, manage-ttn-settings, ttn-webhook
   - What's unclear: Which are called by external services vs frontend
   - Recommendation: ttn-webhook stays REST (external), others become tRPC procedures

3. **Asset Upload Strategy**
   - What we know: Current uses multipart form upload through Fastify
   - What's unclear: Whether to keep REST for file uploads or use pre-signed URL pattern
   - Recommendation: Use pre-signed URL pattern - tRPC returns upload URL, client uploads directly to storage

4. **Feature Flag Cleanup Scope**
   - What we know: Context mentions "remove all feature flags (100% tRPC)"
   - What's unclear: What feature flags exist for REST/tRPC parallel operation
   - Recommendation: Grep for feature flag patterns, document and remove after verification

## Sources

### Primary (HIGH confidence)
- Phase 19 Research Document (`19-RESEARCH.md`) - tRPC infrastructure patterns
- Phase 20 Research Document (`20-RESEARCH.md`) - Domain router patterns
- `backend/src/routers/*.router.ts` - 6 existing router implementations
- `backend/src/routes/*.ts` - 21 REST routes to analyze
- `src/hooks/*.ts` - 100 files with Supabase imports
- `src/integrations/supabase/client.ts` - Supabase client to remove

### Secondary (MEDIUM confidence)
- [tRPC Server-Side Calls](https://trpc.io/docs/v10/server/server-side-calls) - createCallerFactory for testing
- [tRPC File Uploads Discussion](https://github.com/trpc/trpc/discussions/1937) - Community patterns

### Tertiary (LOW confidence)
- None - all research based on verified codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new packages, proven patterns from Phase 19-20
- Architecture: HIGH - Clear migration path from existing REST routes to tRPC
- Pitfalls: HIGH - Based on codebase analysis of actual Supabase usage patterns
- Migration strategy: HIGH - Systematic approach with verification gates

**Scope Analysis:**
- Backend routers to create: 8
- Frontend files to migrate: ~100
- REST routes to keep: 6 (webhooks)
- REST routes to delete: 14 (after migration)
- Packages to remove: 1 (@supabase/supabase-js)

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable patterns, proven approach)
