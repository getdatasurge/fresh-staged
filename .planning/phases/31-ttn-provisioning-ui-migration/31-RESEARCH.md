# Phase 31: TTN Provisioning UI Migration - Research

**Researched:** 2026-01-28
**Domain:** React/tRPC UI migration - TTN provisioning flows
**Confidence:** HIGH

## Summary

This phase involves migrating the TTN provisioning UI components from Supabase edge function calls to the existing tRPC endpoints established in Phase 27. The migration is focused on **TTNCredentialsPanel.tsx** (6 edge function calls) and **useTTNSetupWizard.ts** (which already uses tRPC for most operations).

The existing tRPC infrastructure from Phase 27 provides a solid foundation with `ttnSettings.get`, `ttnSettings.update`, `ttnSettings.test`, `ttnSettings.validateApiKey`, `ttnSettings.saveAndConfigure`, `ttnSettings.updateWebhook`, and `ttnSettings.regenerateWebhookSecret`. However, the provisioning operations (provision, retry, start_fresh, deep_clean, status, get_credentials) require new tRPC procedures to be added.

The migration follows the established pattern from Phase 28: replace `supabase.functions.invoke()` calls with tRPC mutations, handle loading/error states with React Query, and leverage the existing authentication via `useTRPCClient`.

**Primary recommendation:** Add missing provisioning procedures to `ttn-settings.router.ts`, then systematically migrate each `supabase.functions.invoke()` call in TTNCredentialsPanel.tsx to use the corresponding tRPC mutation.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library               | Version | Purpose               | Why Standard                                        |
| --------------------- | ------- | --------------------- | --------------------------------------------------- |
| @trpc/client          | ^10.x   | Type-safe RPC client  | Project standard for frontend-backend communication |
| @trpc/react-query     | ^10.x   | React hooks for tRPC  | Provides useQuery/useMutation integration           |
| @tanstack/react-query | ^5.x    | Data fetching/caching | Automatic cache invalidation, optimistic updates    |
| zod                   | ^3.x    | Schema validation     | Type inference flows to both frontend and backend   |

### Supporting

| Library      | Version | Purpose             | When to Use                                  |
| ------------ | ------- | ------------------- | -------------------------------------------- |
| sonner       | ^1.x    | Toast notifications | User feedback on success/failure             |
| lucide-react | ^0.x    | Icons               | UI feedback (loading spinners, status icons) |

### Alternatives Considered

| Instead of  | Could Use    | Tradeoff                                           |
| ----------- | ------------ | -------------------------------------------------- |
| tRPC        | Direct fetch | Would lose type safety, requires manual validation |
| React Query | SWR          | React Query already established in project         |

**Installation:** No new packages required - all dependencies already present.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/settings/
│   └── TTNCredentialsPanel.tsx  # Main component to migrate
├── hooks/
│   ├── useTTNSetupWizard.ts     # Already mostly migrated
│   └── useTTNOperations.ts      # Existing tRPC hook patterns
└── lib/
    └── trpc.ts                  # tRPC client factory

backend/src/
├── routers/
│   └── ttn-settings.router.ts   # Add new procedures here
├── services/ttn/
│   ├── provisioning.ts          # Existing provisioning service
│   ├── settings.ts              # Existing settings service
│   └── webhook.ts               # Existing webhook service
└── schemas/
    └── ttn-settings.ts          # Add new schemas here
```

### Pattern 1: Edge Function to tRPC Migration

**What:** Replace `supabase.functions.invoke()` with tRPC mutations
**When to use:** Every edge function call in TTNCredentialsPanel.tsx
**Example:**

```typescript
// BEFORE: Edge function call
const { data, error } = await supabase.functions.invoke('manage-ttn-settings', {
  body: { action: 'get_credentials', organization_id: organizationId },
});

// AFTER: tRPC mutation
const credentialsMutation = trpc.ttnSettings.getCredentials.useMutation();
const fetchCredentials = async () => {
  const data = await credentialsMutation.mutateAsync({ organizationId });
  setCredentials(data);
};
```

### Pattern 2: Loading State Migration

**What:** Replace manual `isLoading` state with React Query states
**When to use:** All async operations
**Example:**

```typescript
// BEFORE: Manual state
const [isLoading, setIsLoading] = useState(false);
setIsLoading(true);
try { ... } finally { setIsLoading(false); }

// AFTER: React Query state
const mutation = trpc.ttnSettings.provision.useMutation();
// Use mutation.isPending for loading state
<Button disabled={mutation.isPending}>
  {mutation.isPending ? "Provisioning..." : "Start Provisioning"}
</Button>
```

### Pattern 3: Error Handling Migration

**What:** Replace manual error handling with tRPC error boundaries
**When to use:** All tRPC calls
**Example:**

```typescript
// BEFORE: Manual error handling
if (error) throw error;
if (data?.error) throw new Error(data.error);

// AFTER: tRPC error handling
const mutation = trpc.ttnSettings.provision.useMutation({
  onError: (err) => {
    toast.error(err.message);
  },
  onSuccess: (data) => {
    if (!data.success) {
      toast.error(data.error || 'Operation failed');
      return;
    }
    toast.success('Provisioning complete');
  },
});
```

### Anti-Patterns to Avoid

- **Mixing supabase and tRPC calls:** Migrate entire flows, not partial operations
- **Creating new hooks when mutations suffice:** For one-off operations, inline mutations are fine
- **Ignoring existing patterns:** Follow useTTNOperations.ts patterns for consistency

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem            | Don't Build           | Use Instead                    | Why                   |
| ------------------ | --------------------- | ------------------------------ | --------------------- |
| Loading states     | Manual useState       | React Query mutation.isPending | Automatic, consistent |
| Error handling     | Try/catch + setState  | tRPC onError callbacks         | Type-safe errors      |
| Cache invalidation | Manual refetch        | queryClient.invalidateQueries  | Automatic cascade     |
| Auth token passing | Manual header setting | tRPC httpBatchLink headers     | Already configured    |

**Key insight:** The tRPC client factory already handles authentication via the `x-stack-access-token` header - no manual token passing needed.

## Common Pitfalls

### Pitfall 1: Forgetting to Add Backend Procedures First

**What goes wrong:** Frontend migration fails because tRPC procedure doesn't exist
**Why it happens:** Starting with frontend changes before backend is ready
**How to avoid:** Add all required procedures to ttn-settings.router.ts first, verify they work via tests or curl, then migrate frontend
**Warning signs:** TypeScript errors about missing procedure, 404 errors on tRPC calls

### Pitfall 2: Not Handling Structured Error Responses

**What goes wrong:** Edge functions return `{ success: false, error: "..." }` with HTTP 200 - must check data.success
**Why it happens:** Assuming HTTP success means operation success
**How to avoid:** Check `data.success` field even on successful HTTP responses
**Warning signs:** Silent failures, UI shows success but operation failed

### Pitfall 3: Losing User Session Context

**What goes wrong:** Edge functions used `Authorization` header, tRPC uses `x-stack-access-token`
**Why it happens:** Different auth mechanisms between Supabase and Stack Auth
**How to avoid:** Use `useTRPCClient` which automatically handles auth via createTRPCClientInstance
**Warning signs:** 401 errors on tRPC calls, "Invalid user session" errors

### Pitfall 4: Breaking Existing tRPC Usage in useTTNSetupWizard

**What goes wrong:** useTTNSetupWizard.ts already uses tRPC for most operations - mixing approaches causes issues
**Why it happens:** Not recognizing the hook is already partially migrated
**How to avoid:** Only migrate the remaining edge function calls, preserve existing tRPC usage
**Warning signs:** Duplicate API calls, state inconsistencies

### Pitfall 5: Not Porting Edge Function Business Logic

**What goes wrong:** Frontend works but backend doesn't implement the same logic
**Why it happens:** Edge functions have significant logic (sensor reset, event logging, rate limiting)
**How to avoid:** Review edge function code carefully, ensure backend procedures port all critical logic
**Warning signs:** Missing sensor resets, no audit trail, rate limits not enforced

## Code Examples

Verified patterns from official sources and existing codebase:

### Creating tRPC Client in Component

```typescript
// Source: src/hooks/useTTNOperations.ts
import { useTRPCClient, createTRPCClientInstance } from '@/lib/trpc';
import { useUser } from '@stackframe/react';

export function useTTNOperations(organizationId: string | null) {
  const user = useUser();
  const client = useMemo(
    () =>
      createTRPCClientInstance(async () => {
        const { accessToken } = await user.getAuthJson();
        return accessToken;
      }),
    [user],
  );

  const testConnection = async () => {
    if (!organizationId) return null;
    const result = await client.ttnSettings.test.mutate({ organizationId });
    return result;
  };

  return { testConnection };
}
```

### Using tRPC Hooks (Preferred Pattern)

```typescript
// Source: src/hooks/useTTNSetupWizard.ts
import { useTRPC } from '@/lib/trpc';

function useTTNSetupWizard(organizationId: string | null) {
  const trpc = useTRPC();

  const ttnSettingsQuery = trpc.ttnSettings.get.useQuery(
    { organizationId: organizationId || '' },
    { enabled: !!organizationId, staleTime: 0 },
  );

  const updateSettingsMutation = trpc.ttnSettings.update.useMutation();

  const setRegion = async (region: TTNRegion) => {
    await updateSettingsMutation.mutateAsync({
      organizationId,
      data: { ttn_region: region },
    });
  };
}
```

### Backend Procedure Example

```typescript
// Source: backend/src/routers/ttn-settings.router.ts
import { orgProcedure } from '../trpc/procedures.js';
import { z } from 'zod';

export const ttnSettingsRouter = router({
  getCredentials: orgProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // Port logic from manage-ttn-settings get_credentials action
      const settings = await ttnSettingsService.getCredentialsForOrg(input.organizationId);
      return settings;
    }),

  provision: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        action: z.enum(['provision', 'retry', 'start_fresh', 'deep_clean', 'status']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Port logic from ttn-provision-org edge function
      return TtnProvisioningService.executeAction(input.action, input.organizationId);
    }),
});
```

## State of the Art

| Old Approach            | Current Approach         | When Changed | Impact                         |
| ----------------------- | ------------------------ | ------------ | ------------------------------ |
| Supabase edge functions | tRPC procedures          | Phase 27     | Type-safe, monorepo-friendly   |
| Manual auth headers     | Stack Auth via tRPC link | Phase 28     | Automatic token refresh        |
| useState for async      | React Query mutations    | Phase 28     | Automatic loading/error states |

**Deprecated/outdated:**

- `supabase.functions.invoke()` - replaced by tRPC mutations
- `supabase-placeholder.ts` - returns SupabaseMigrationError for unmigrated calls

## Edge Function to tRPC Mapping

### TTNCredentialsPanel.tsx Calls (6 total)

| Line | Edge Function       | Action             | tRPC Equivalent               | Status                  |
| ---- | ------------------- | ------------------ | ----------------------------- | ----------------------- |
| 129  | manage-ttn-settings | get_credentials    | ttnSettings.getCredentials    | **NEEDS NEW PROCEDURE** |
| 183  | manage-ttn-settings | retry_provisioning | ttnSettings.retryProvisioning | **NEEDS NEW PROCEDURE** |
| 189  | ttn-provision-org   | retry              | ttnSettings.provision         | **NEEDS NEW PROCEDURE** |
| 238  | ttn-provision-org   | start_fresh        | ttnSettings.startFresh        | **NEEDS NEW PROCEDURE** |
| 284  | ttn-provision-org   | deep_clean         | ttnSettings.deepClean         | **NEEDS NEW PROCEDURE** |
| 341  | ttn-provision-org   | status             | ttnSettings.getStatus         | **NEEDS NEW PROCEDURE** |

### Additional Files with TTN Edge Function Calls

| File                       | Edge Function        | Action    | Impact                        |
| -------------------------- | -------------------- | --------- | ----------------------------- |
| EmulatorTTNRoutingCard.tsx | manage-ttn-settings  | get, test | Low priority - admin tool     |
| SensorManager.tsx          | ttn-provision-device | provision | Separate migration (Phase 32) |

## New Procedures Required

Based on edge function analysis, these procedures need to be added to `ttn-settings.router.ts`:

### 1. getCredentials

```typescript
getCredentials: orgProcedure.input(OrgInput).query(async ({ input }) => {
  // Port from manage-ttn-settings get_credentials action
  // Returns decrypted secrets with status fields
});
```

### 2. getStatus

```typescript
getStatus: orgProcedure.input(OrgInput).query(async ({ input }) => {
  // Port from ttn-provision-org status action
  // Returns provisioning_status, step, error, etc.
});
```

### 3. provision (or split into multiple)

```typescript
provision: orgProcedure
  .input(
    z.object({
      organizationId: z.string().uuid(),
      action: z.enum(['provision', 'retry']),
      region: z.string().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    // Port from ttn-provision-org provision/retry actions
  });
```

### 4. startFresh

```typescript
startFresh: orgProcedure
  .input(
    z.object({
      organizationId: z.string().uuid(),
      region: z.string().default('nam1'),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    // Port from ttn-provision-org start_fresh action
    // Deprovision and re-provision all TTN resources
  });
```

### 5. deepClean

```typescript
deepClean: orgProcedure.input(OrgInput).mutation(async ({ input, ctx }) => {
  // Port from ttn-provision-org deep_clean action
  // Delete ALL TTN resources (devices, app, org)
});
```

## Open Questions

Things that couldn't be fully resolved:

1. **Provisioning service completeness**
   - What we know: TtnProvisioningService exists with validateConfiguration and provisionOrganization
   - What's unclear: Does it implement retry, start_fresh, deep_clean actions?
   - Recommendation: Review service, add missing methods before frontend migration

2. **Event logging implementation**
   - What we know: Edge functions log to event_logs table extensively
   - What's unclear: Does backend have equivalent audit logging?
   - Recommendation: Add event logging service calls to new procedures

3. **Rate limiting for regenerate_all**
   - What we know: Edge function has rate limit (max 3 regenerations per hour)
   - What's unclear: Is this enforced in backend?
   - Recommendation: Implement rate limiting in backend procedure

## Sources

### Primary (HIGH confidence)

- `/home/swoop/swoop-claude-projects/fresh-staged/src/components/settings/TTNCredentialsPanel.tsx` - Source file with 6 edge function calls
- `/home/swoop/swoop-claude-projects/fresh-staged/backend/src/routers/ttn-settings.router.ts` - Existing tRPC procedures
- `/home/swoop/swoop-claude-projects/fresh-staged/backend/src/services/ttn/provisioning.ts` - Existing provisioning service
- `/home/swoop/swoop-claude-projects/fresh-staged/supabase/functions/manage-ttn-settings/index.ts` - Edge function logic to port
- `/home/swoop/swoop-claude-projects/fresh-staged/supabase/functions/ttn-provision-org/index.ts` - Provisioning logic to port

### Secondary (MEDIUM confidence)

- `/home/swoop/swoop-claude-projects/fresh-staged/src/hooks/useTTNSetupWizard.ts` - Already migrated patterns to follow
- `/home/swoop/swoop-claude-projects/fresh-staged/src/hooks/useTTNOperations.ts` - tRPC client usage patterns

### Tertiary (LOW confidence)

- None - all findings from codebase inspection

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - established project patterns, no new libraries
- Architecture: HIGH - follows existing Phase 28 migration patterns
- Pitfalls: HIGH - based on actual codebase analysis and prior phase learnings

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (stable patterns, project-specific)
