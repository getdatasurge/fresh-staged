# Unused Legacy Supabase Code Report

## Overview

This report identifies unused legacy Supabase code in the FreshTrack Pro codebase. The codebase has been migrated from Supabase to a new backend with tRPC, but many legacy files and functions remain unused.

## 1. API Modules Analysis

### Used API Modules

The following API modules are currently being used:

1. **`authApi`** - [`src/lib/api/auth.ts`](src/lib/api/auth.ts)
   - Used in: [`useEffectiveIdentity.ts`](src/hooks/useEffectiveIdentity.ts:16), [`useUserRole.ts`](src/hooks/useUserRole.ts:12)
   - Purpose: Fetching user profile and organization memberships from `/api/auth/me` endpoint

2. **`alertsApi`** - [`src/lib/api/alerts.ts`](src/lib/api/alerts.ts)
   - Used in: [`useUnitAlerts.ts`](src/hooks/useUnitAlerts.ts:6)
   - Purpose: Fetching and managing alerts via REST API

3. **`sitesApi`, `areasApi`, `unitsApi`** - [`src/lib/api/sites.ts`](src/lib/api/sites.ts), [`src/lib/api/areas.ts`](src/lib/api/areas.ts), [`src/lib/api/units.ts`](src/lib/api/units.ts)
   - Used in: [`useNavTree.ts`](src/hooks/useNavTree.ts:5)
   - Purpose: Fetching navigation tree data (sites > areas > units)

4. **`paymentsApi`** - [`src/lib/api/payments.ts`](src/lib/api/payments.ts)
   - Used in: [`BillingTab.tsx`](src/components/billing/BillingTab.tsx:21)
   - Purpose: Stripe payment integration

### Unused API Modules

1. **`readingsApi`** - [`src/lib/api/readings.ts`](src/lib/api/readings.ts)
   - Marked as deprecated
   - Not used anywhere in the codebase
   - Replacement: [`useReadings.ts`](src/hooks/useReadings.ts) (tRPC-based)

2. **`organizationsApi`** - [`src/lib/api/organizations.ts`](src/lib/api/organizations.ts)
   - Marked as deprecated
   - Not used anywhere in the codebase
   - Replacement: Direct tRPC calls using `useTRPC().organizations`

## 2. Supabase Client Analysis

### Supabase Client File

- **File**: `src/integrations/supabase/client.ts`
- **Status**: Not found - likely removed during migration
- **Replacement**: `src/lib/supabase-placeholder.ts` (dummy implementation)

### Supabase Placeholder

- **File**: [`src/lib/supabase-placeholder.ts`](src/lib/supabase-placeholder.ts)
- **Purpose**: Provides a minimal, non-functional supabase-like client for existing call sites to fail gracefully
- **Usage**: Only referenced in comments and as a placeholder

### Supabase References

1. **`src/hooks/useGatewayProvisioningPreflight.ts`** - Line 85: Hardcoded `request_id: "supabase-removed"`
2. **`src/lib/registry/capabilityRegistry.ts`** - Line 51: Comment referencing Supabase functions
3. **`src/hooks/useAuditedWrite.ts`** - Lines 14-16: Example code in JSDoc comment

## 3. tRPC Hooks vs. Legacy API Usage

### Available tRPC Hooks

The codebase has new tRPC-based hooks that should replace the legacy API:

1. **`useAlerts()`** - [`src/hooks/useAlerts.ts`](src/hooks/useAlerts.ts)
2. **`useAreas()`** - [`src/hooks/useAreas.ts`](src/hooks/useAreas.ts)
3. **`useSites()`** - [`src/hooks/useSites.ts`](src/hooks/useSites.ts)
4. **`useUnits()`** - [`src/hooks/useUnits.ts`](src/hooks/useUnits.ts)
5. **`useReadings()`** - [`src/hooks/useReadings.ts`](src/hooks/useReadings.ts)

### Current Usage Pattern

- **Legacy API still in use**: Most components still use the Ky-based API modules
- **tRPC hooks not adopted**: The new tRPC hooks are only used in tests
- **Migration in progress**: All API modules are marked as deprecated with migration instructions

## 4. Deprecation Status Summary

| File                           | Status | Deprecation Warning |
| ------------------------------ | ------ | ------------------- |
| `src/lib/api/alerts.ts`        | In use | ✅                  |
| `src/lib/api/areas.ts`         | In use | ✅                  |
| `src/lib/api/auth.ts`          | In use | ❌                  |
| `src/lib/api/organizations.ts` | Unused | ✅                  |
| `src/lib/api/payments.ts`      | In use | ❌                  |
| `src/lib/api/readings.ts`      | Unused | ✅                  |
| `src/lib/api/sites.ts`         | In use | ✅                  |
| `src/lib/api/units.ts`         | In use | ✅                  |

## 5. Recommendations

### Immediate Actions

1. **Remove unused API modules**: Delete `readingsApi` and `organizationsApi`
2. **Migrate remaining API usage**: Replace Ky-based API calls with tRPC hooks
3. **Remove Supabase placeholder**: Delete `src/lib/supabase-placeholder.ts` once all references are gone

### Migration Priority

1. **High priority**: Migrate `useNavTree.ts` to use tRPC hooks (affects sidebar navigation)
2. **Medium priority**: Migrate `useUnitAlerts.ts` to use tRPC hooks (affects alert management)
3. **Low priority**: Migrate `BillingTab.tsx` (payments integration may stay as REST)

### Benefits of Migration

- Type safety with tRPC
- Reduced bundle size
- Improved error handling
- Better developer experience with auto-generated hooks
- Unified API pattern across the codebase
