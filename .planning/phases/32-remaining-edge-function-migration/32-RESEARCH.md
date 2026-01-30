# Phase 32: Remaining Edge Function Migration - Research

**Researched:** 2026-01-28
**Domain:** Frontend edge function migration to tRPC
**Confidence:** HIGH

## Summary

This phase involves migrating all remaining `supabase.functions.invoke` calls from frontend components to existing or new tRPC procedures. A complete audit identified **15 calls in 10 files** after Phase 31 removed TTNCredentialsPanel's 6 calls. These calls span multiple functional domains: TTN provisioning/testing, compliance report exports, Telnyx SMS configuration, sensor simulation, and edge function diagnostics.

The migration follows the established pattern from Phase 31: replace `supabase.functions.invoke()` with tRPC mutations/queries, leverage React Query for loading/error states, and use the existing tRPC client factory for authentication. Many backend procedures already exist (especially TTN-related), making this primarily a frontend wiring task.

Key groupings emerge:

- **TTN Domain (4 calls):** EmulatorTTNRoutingCard, SensorManager, Onboarding - backend procedures mostly exist
- **Reports Domain (3 calls):** Reports, Inspector, ComplianceReportCard - need new tRPC procedure
- **Telnyx Domain (3 calls):** TollFreeVerificationCard, WebhookStatusCard, OptInImageStatusCard, UploadTelnyxImage - need new tRPC procedures
- **Admin/Debug Domain (2 calls):** SensorSimulatorPanel, EdgeFunctionDiagnostics - need evaluation

**Primary recommendation:** Migrate in functional domain groups, starting with TTN (most backend already exists), then Reports (single new procedure), then Telnyx (2-3 new procedures). EdgeFunctionDiagnostics may be deprecated entirely.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library               | Version | Purpose               | Why Standard                                        |
| --------------------- | ------- | --------------------- | --------------------------------------------------- |
| @trpc/client          | ^10.x   | Type-safe RPC client  | Project standard for frontend-backend communication |
| @trpc/react-query     | ^10.x   | React hooks for tRPC  | Provides useQuery/useMutation integration           |
| @tanstack/react-query | ^5.x    | Data fetching/caching | Automatic cache invalidation, loading states        |
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

## Complete Edge Function Inventory

### Files with `supabase.functions.invoke` Calls

| File                                                   | Count | Edge Functions                        | Backend Status                                   |
| ------------------------------------------------------ | ----- | ------------------------------------- | ------------------------------------------------ |
| `src/components/admin/EmulatorTTNRoutingCard.tsx`      | 2     | manage-ttn-settings (get, test)       | tRPC EXISTS: ttnSettings.get, ttnSettings.test   |
| `src/components/settings/SensorManager.tsx`            | 1     | ttn-provision-device (diagnose)       | tRPC EXISTS: ttnDevices.\*                       |
| `src/pages/Onboarding.tsx`                             | 2     | ttn-provision-org (provision, status) | tRPC EXISTS: ttnSettings.\*, provision not wired |
| `src/pages/Reports.tsx`                                | 1     | export-temperature-logs               | tRPC NEEDED: reports.export                      |
| `src/pages/Inspector.tsx`                              | 1     | export-temperature-logs               | tRPC NEEDED: reports.export                      |
| `src/components/reports/ComplianceReportCard.tsx`      | 1     | export-temperature-logs               | tRPC NEEDED: reports.export                      |
| `src/components/settings/TollFreeVerificationCard.tsx` | 1     | telnyx-verification-status            | tRPC NEEDED: telnyx.verificationStatus           |
| `src/components/settings/WebhookStatusCard.tsx`        | 1     | telnyx-configure-webhook              | tRPC NEEDED: telnyx.configureWebhook             |
| `src/components/settings/OptInImageStatusCard.tsx`     | 1     | verify-public-asset                   | tRPC NEEDED: telnyx.verifyPublicAsset            |
| `src/pages/UploadTelnyxImage.tsx`                      | 1     | verify-public-asset                   | tRPC NEEDED: telnyx.verifyPublicAsset            |
| `src/components/admin/SensorSimulatorPanel.tsx`        | 1     | sensor-simulator                      | EVALUATE: Admin-only, may keep as-is             |
| `src/components/debug/EdgeFunctionDiagnostics.tsx`     | 1     | Multiple (GET health check)           | DEPRECATE: Dead code, edge functions removed     |

**Total: 15 calls in 12 files** (2 files share same function)

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── settings/
│   │   ├── SensorManager.tsx          # Migrate diagnose to tRPC
│   │   ├── TollFreeVerificationCard.tsx
│   │   ├── WebhookStatusCard.tsx
│   │   └── OptInImageStatusCard.tsx
│   ├── admin/
│   │   ├── EmulatorTTNRoutingCard.tsx # Migrate get/test to tRPC
│   │   └── SensorSimulatorPanel.tsx   # Evaluate
│   ├── reports/
│   │   └── ComplianceReportCard.tsx   # Migrate export to tRPC
│   └── debug/
│       └── EdgeFunctionDiagnostics.tsx # DELETE (dead code)
├── pages/
│   ├── Onboarding.tsx                  # Migrate provision/status to tRPC
│   ├── Reports.tsx                     # Migrate export to tRPC
│   ├── Inspector.tsx                   # Migrate export to tRPC
│   └── UploadTelnyxImage.tsx          # Migrate verify to tRPC

backend/src/
├── routers/
│   ├── ttn-settings.router.ts         # EXISTS - complete
│   ├── ttn-devices.router.ts          # EXISTS - add diagnose
│   ├── reports.router.ts              # CREATE - export procedure
│   └── telnyx.router.ts               # CREATE - verification, webhook, asset procedures
```

### Pattern 1: Edge Function to tRPC Migration (Standard)

**What:** Replace `supabase.functions.invoke()` with tRPC mutations
**When to use:** Every edge function call
**Example:**

```typescript
// BEFORE: Edge function call
const { data, error } = await supabase.functions.invoke('manage-ttn-settings', {
  body: { action: 'get', organization_id: organizationId },
});

// AFTER: tRPC query (for read operations)
const trpc = useTRPC();
const { data, isLoading, error } = trpc.ttnSettings.get.useQuery(
  { organizationId },
  { enabled: !!organizationId },
);
```

### Pattern 2: File Download via tRPC

**What:** Export operations that return files
**When to use:** Report exports (CSV, PDF)
**Example:**

```typescript
// AFTER: tRPC mutation with file handling
const exportMutation = trpc.reports.export.useMutation({
  onSuccess: (data) => {
    // data is base64-encoded or raw string
    const blob = new Blob([data.content], { type: data.contentType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success('Export complete');
  },
  onError: (err) => toast.error(err.message),
});
```

### Pattern 3: Imperative Query with useQuery + refetch()

**What:** Manual control over when queries execute
**When to use:** User-triggered refresh, status polling
**Example (from Phase 31):**

```typescript
const statusQuery = trpc.ttnSettings.getStatus.useQuery(
  { organizationId },
  { enabled: false }, // Don't auto-fetch
);

const checkStatus = async () => {
  const result = await statusQuery.refetch();
  return result.data;
};
```

### Anti-Patterns to Avoid

- **Mixing supabase and tRPC calls:** Migrate entire flows, not partial operations
- **Creating new hooks when mutations suffice:** For one-off operations, inline mutations are fine
- **Keeping dead code:** EdgeFunctionDiagnostics should be deleted, not migrated

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem            | Don't Build           | Use Instead                    | Why                   |
| ------------------ | --------------------- | ------------------------------ | --------------------- |
| Loading states     | Manual useState       | React Query mutation.isPending | Automatic, consistent |
| Error handling     | Try/catch + setState  | tRPC onError callbacks         | Type-safe errors      |
| Cache invalidation | Manual refetch        | queryClient.invalidateQueries  | Automatic cascade     |
| Auth token passing | Manual header setting | tRPC httpBatchLink headers     | Already configured    |
| File downloads     | Custom fetch          | tRPC mutation + Blob API       | Type-safe response    |

**Key insight:** The tRPC client factory already handles authentication via the `x-stack-access-token` header - no manual token passing needed.

## Common Pitfalls

### Pitfall 1: Trying to Migrate Admin-Only Features

**What goes wrong:** Spending time migrating features only used by developers
**Why it happens:** Treating all edge function calls equally
**How to avoid:** Evaluate EdgeFunctionDiagnostics and SensorSimulatorPanel - may be simpler to keep as-is or delete
**Warning signs:** Edge function only used in debug/admin context

### Pitfall 2: Not Creating Backend Procedures First

**What goes wrong:** Frontend migration fails because tRPC procedure doesn't exist
**Why it happens:** Starting with frontend changes before backend is ready
**How to avoid:** For each domain (Reports, Telnyx), create backend procedures first, then migrate frontend
**Warning signs:** TypeScript errors about missing procedure, 404 errors on tRPC calls

### Pitfall 3: Breaking File Export Flow

**What goes wrong:** Report exports fail or produce corrupted files
**Why it happens:** tRPC serialization differs from edge function binary response
**How to avoid:** Use base64 encoding for binary data, ensure contentType is preserved
**Warning signs:** PDF files won't open, CSV files show garbled text

### Pitfall 4: Duplicating export-temperature-logs Migrations

**What goes wrong:** Same procedure implemented differently in 3 files
**Why it happens:** Reports.tsx, Inspector.tsx, ComplianceReportCard.tsx all use same edge function
**How to avoid:** Create single `reports.export` procedure, share across all components
**Warning signs:** Multiple implementations with slight differences

### Pitfall 5: Not Handling Provisioning Polling

**What goes wrong:** Onboarding.tsx provisioning status polling breaks
**Why it happens:** Edge function used polling interval, tRPC doesn't auto-poll
**How to avoid:** Use React Query's refetchInterval or implement manual polling with useEffect
**Warning signs:** Status never updates, users stuck on "provisioning" screen

## Code Examples

Verified patterns from project codebase:

### Creating tRPC Client in Component (Pattern from Phase 31)

```typescript
// Source: src/components/settings/TTNCredentialsPanel.tsx
import { useTRPC } from '@/lib/trpc';

function TTNCredentialsPanel({ organizationId }: Props) {
  const trpc = useTRPC();

  // Query for read operations
  const credentialsQuery = trpc.ttnSettings.getCredentials.useQuery(
    { organizationId },
    { enabled: !!organizationId, staleTime: 0 },
  );

  // Mutation for write operations
  const testMutation = trpc.ttnSettings.test.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Connection test passed');
      } else {
        toast.error(result.error || 'Connection test failed');
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTest = () => {
    testMutation.mutate({ organizationId });
  };
}
```

### EmulatorTTNRoutingCard Migration

```typescript
// BEFORE:
const { data, error } = await supabase.functions.invoke('manage-ttn-settings', {
  body: { action: 'get', organization_id: organizationId },
});

// AFTER:
const trpc = useTRPC();
const settingsQuery = trpc.ttnSettings.get.useQuery(
  { organizationId: organizationId! },
  { enabled: !!organizationId },
);

// For test action:
const testMutation = trpc.ttnSettings.test.useMutation({
  onSuccess: (result) => {
    if (result.success) {
      toast.success('TTN connection verified!');
    } else {
      toast.error(result.error || 'Connection test failed');
    }
  },
});
```

### Report Export Backend Procedure (New)

```typescript
// backend/src/routers/reports.router.ts
export const reportsRouter = router({
  export: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        startDate: z.string(),
        endDate: z.string(),
        reportType: z.enum(['daily', 'exceptions', 'manual', 'compliance']),
        format: z.enum(['csv', 'pdf']).default('csv'),
        siteId: z.string().uuid().optional(),
        unitId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Port logic from export-temperature-logs edge function
      const content = await generateReport(input);
      return {
        content, // base64 for binary, string for text
        contentType: input.format === 'pdf' ? 'application/pdf' : 'text/csv',
        filename: `${input.reportType}-report-${input.startDate}.${input.format}`,
      };
    }),
});
```

## New Procedures Required

### 1. reports.export

**Purpose:** Replace export-temperature-logs edge function
**Used by:** Reports.tsx, Inspector.tsx, ComplianceReportCard.tsx
**Input:** startDate, endDate, reportType, format, siteId?, unitId?
**Output:** { content: string, contentType: string, filename: string }

### 2. telnyx.verificationStatus

**Purpose:** Replace telnyx-verification-status edge function
**Used by:** TollFreeVerificationCard.tsx
**Input:** (none - global status)
**Output:** { status, verificationId, phoneNumber, details, lastChecked }

### 3. telnyx.configureWebhook

**Purpose:** Replace telnyx-configure-webhook edge function
**Used by:** WebhookStatusCard.tsx
**Input:** { organizationId, action: 'configure' }
**Output:** { success: boolean, error?: string }

### 4. telnyx.verifyPublicAsset

**Purpose:** Replace verify-public-asset edge function
**Used by:** OptInImageStatusCard.tsx, UploadTelnyxImage.tsx
**Input:** { url: string }
**Output:** { accessible, status, contentType, contentLength, isImage, error }

### 5. ttnDevices.diagnose (ADD to existing router)

**Purpose:** Replace ttn-provision-device diagnose action
**Used by:** SensorManager.tsx
**Input:** { sensorId, organizationId }
**Output:** { success, clusterBaseUrl, region, appId, deviceId, checks, diagnosis, hint }

## Migration Priority

### Phase 1: TTN Domain (Easy - backend exists)

1. EmulatorTTNRoutingCard.tsx (2 calls) - Direct swap to existing ttnSettings.get/test
2. Onboarding.tsx (2 calls) - Use existing ttnSettings.getStatus, need provision wiring

### Phase 2: Reports Domain (Medium - one new procedure)

3. Create reports.router.ts with export procedure
4. Reports.tsx, Inspector.tsx, ComplianceReportCard.tsx - All share same procedure

### Phase 3: Telnyx Domain (Medium - new router)

5. Create telnyx.router.ts with 3 procedures
6. TollFreeVerificationCard.tsx, WebhookStatusCard.tsx, OptInImageStatusCard.tsx, UploadTelnyxImage.tsx

### Phase 4: Cleanup/Evaluate

7. SensorManager.tsx - Add diagnose to ttnDevices router
8. EdgeFunctionDiagnostics.tsx - DELETE (dead code)
9. SensorSimulatorPanel.tsx - EVALUATE (admin-only, may keep as-is)

## Open Questions

1. **SensorSimulatorPanel Migration Decision**
   - What we know: Admin-only tool for testing sensor simulation
   - What's unclear: Is it worth migrating or keep edge function for dev convenience?
   - Recommendation: If edge function still exists and works, may keep as-is

2. **Provisioning in Onboarding.tsx**
   - What we know: Calls ttn-provision-org with provision/status actions
   - What's unclear: Is there a tRPC provision action or only retry/startFresh?
   - Recommendation: Check if saveAndConfigure covers initial provisioning

3. **Report PDF Generation**
   - What we know: Edge function returns HTML labeled as "pdf"
   - What's unclear: Is actual PDF generation needed or is HTML acceptable?
   - Recommendation: Maintain current behavior (HTML export), document limitation

## Sources

### Primary (HIGH confidence)

- `/home/swoop/swoop-claude-projects/fresh-staged/src/` - Complete grep of all edge function calls
- `/home/swoop/swoop-claude-projects/fresh-staged/backend/src/routers/ttn-settings.router.ts` - Existing tRPC procedures
- `/home/swoop/swoop-claude-projects/fresh-staged/backend/src/trpc/router.ts` - App router structure
- `/home/swoop/swoop-claude-projects/fresh-staged/.planning/phases/31-ttn-provisioning-ui-migration/31-RESEARCH.md` - Phase 31 patterns
- `/home/swoop/swoop-claude-projects/fresh-staged/.planning/v2.2-MILESTONE-AUDIT.md` - Gap analysis

### Secondary (MEDIUM confidence)

- Individual component files analyzed for call patterns

### Tertiary (LOW confidence)

- None - all findings from codebase inspection

## Metadata

**Confidence breakdown:**

- Edge function inventory: HIGH - complete grep of src/ directory
- Backend procedure availability: HIGH - verified router files
- Migration patterns: HIGH - based on successful Phase 31 patterns
- New procedure design: MEDIUM - based on edge function signatures

**Research date:** 2026-01-28
**Valid until:** 2026-02-28 (stable patterns, project-specific)
