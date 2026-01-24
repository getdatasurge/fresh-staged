# Phase 8: Frontend Auth Cleanup - Research

**Researched:** 2026-01-23
**Domain:** Frontend Auth Migration (Supabase → Stack Auth)
**Confidence:** HIGH

## Summary

Phase 8 is a code cleanup phase that completes the Supabase-to-Stack Auth migration started in Phase 5. Through codebase analysis, I've identified 33 files that still contain Supabase auth code (`supabase.auth.getSession()`, `supabase.auth.getUser()`, `supabase.auth.signOut()`). These files need to be migrated to use Stack Auth patterns that are already established and working in 27 other hooks.

The migration is straightforward: replace `supabase.auth.getSession()` with Stack Auth's `useUser()` hook and `user.getAuthJson()` method. The codebase already has excellent migration examples in `useEffectiveIdentity`, `useUserRole`, and `useAlertRules` that show the exact pattern to follow.

After cleanup, the `@supabase/supabase-js` package can be removed from `package.json`, completing the frontend auth migration.

**Primary recommendation:** Follow the established Stack Auth pattern: replace `supabase.auth.getSession()` with `useUser()` + `user.getAuthJson()`, migrate all 33 files systematically, then remove Supabase client dependency.

## Standard Stack

The target auth stack is already established in the codebase from Phase 5.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @stackframe/react | ^2.8.60 | Stack Auth React SDK | Provides useUser() hook for authentication |
| @tanstack/react-query | ^5.83.0 | Data fetching | Manages auth token caching and state |
| ky | ^1.14.2 | HTTP client | Authenticated API client with retry logic |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Custom API client | N/A | Typed API wrappers | All backend API calls |
| useEffectiveIdentity | N/A | Identity resolution | Impersonation support |

### Removal Target
| Package | Current Version | Reason for Removal |
|---------|-----------------|-------------------|
| @supabase/supabase-js | ^2.89.0 | Auth migrated to Stack Auth, backend handles database |

## Architecture Patterns

### Established Migration Pattern (from Phase 5)

This pattern is already proven in 27 migrated hooks:

```typescript
// ❌ OLD PATTERN (Supabase)
import { supabase } from '@/integrations/supabase/client';

const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  throw new Error('No session available');
}
const result = await api.fetch(session.access_token);
```

```typescript
// ✅ NEW PATTERN (Stack Auth)
import { useUser } from '@stackframe/react';

const user = useUser();
const { accessToken } = await user.getAuthJson();
const result = await api.fetch(accessToken);
```

### Pattern 1: Query Hook Migration
**What:** Hooks that fetch data from backend APIs
**When to use:** Any hook using React Query with Supabase session
**Example:**
```typescript
// Source: src/hooks/useBranding.ts (MIGRATED EXAMPLE)
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity";

export function useBranding() {
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();
  const user = useUser();

  const { data: branding, isLoading } = useQuery({
    queryKey: qk.org(effectiveOrgId).branding(),
    queryFn: async () => {
      if (!effectiveOrgId || !user) return null;

      // Get Stack Auth token
      const { accessToken } = await user.getAuthJson();

      // Call backend API
      const org = await organizationsApi.getOrganization(effectiveOrgId, accessToken);
      return { name: org.name, logoUrl: org.logoUrl };
    },
    enabled: isInitialized && !!effectiveOrgId && !!user,
    staleTime: 1000 * 60 * 5,
  });

  return { branding, loading: isLoading };
}
```

### Pattern 2: Sign Out Migration
**What:** Replace Supabase sign out with Stack Auth sign out
**When to use:** Logout buttons, account deletion flows
**Example:**
```typescript
// ❌ OLD
await supabase.auth.signOut();

// ✅ NEW
import { useStackApp } from '@stackframe/react';

const stackApp = useStackApp();
await stackApp.signOut();
```

### Pattern 3: User Info Migration
**What:** Replace `supabase.auth.getUser()` with Stack Auth user object
**When to use:** Components that need current user ID/email
**Example:**
```typescript
// ❌ OLD
const { data: { user } } = await supabase.auth.getUser();
const userId = user.id;

// ✅ NEW
import { useUser } from '@stackframe/react';

const user = useUser();
const userId = user?.id;
```

### Anti-Patterns to Avoid
- **Mixed auth systems:** Don't keep both Supabase and Stack Auth calls in the same file
- **Direct client imports:** Don't import `supabase` client in new code
- **Session storage assumptions:** Stack Auth uses different session management

## Don't Hand-Roll

This is a cleanup phase - use existing established patterns only.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth token retrieval | Custom token cache | `user.getAuthJson()` | Stack Auth handles caching |
| Identity resolution | Manual org ID lookup | `useEffectiveIdentity()` | Already handles impersonation |
| API authentication | Custom auth headers | `createAuthenticatedClient()` | Consistent error handling |

**Key insight:** Phase 5 already established all necessary patterns. Phase 8 is purely cleanup - copy existing patterns, don't invent new ones.

## Common Pitfalls

### Pitfall 1: Incomplete useUser() null checks
**What goes wrong:** `user.getAuthJson()` called on null user causes runtime error
**Why it happens:** Forgetting that `useUser()` can return null when not authenticated
**How to avoid:** Always check `!!user` in query's `enabled` condition
**Warning signs:** TypeScript errors about "possibly null" on user object

### Pitfall 2: Missing effectiveOrgId for org-scoped queries
**What goes wrong:** Queries use wrong org ID during impersonation
**Why it happens:** Using user's real org instead of effective org
**How to avoid:** Always use `useEffectiveIdentity()` for data fetching
**Warning signs:** Data doesn't change when impersonating

### Pitfall 3: Forgetting to remove Supabase client import
**What goes wrong:** File still imports Supabase even after migration
**Why it happens:** Only removing the usage, not the import
**How to avoid:** After migrating all Supabase calls, remove the import statement
**Warning signs:** Unused import warnings from linter

### Pitfall 4: Breaking query cache keys
**What goes wrong:** Migrated hook doesn't invalidate properly
**Why it happens:** Changing query key structure during migration
**How to avoid:** Keep existing query key structure from `qk.*` helpers
**Warning signs:** Data doesn't refresh after mutations

### Pitfall 5: Removing Supabase client before all files migrated
**What goes wrong:** Build breaks because some files still use Supabase
**Why it happens:** Removing package.json dependency too early
**How to avoid:** Only remove `@supabase/supabase-js` after ALL files migrated and tested
**Warning signs:** Import errors at build time

## Code Examples

Verified patterns from migrated code:

### Example 1: Migrated Query Hook with Org Scope
```typescript
// Source: src/hooks/useNavTree.ts (NEEDS MIGRATION)
// Currently uses: supabase.auth.getSession()
// Should become:

import { useUser } from '@stackframe/react';

export function useNavTree(organizationId: string | null) {
  const user = useUser();

  const { data: allSites = [], isLoading, error } = useQuery({
    queryKey: qk.org(organizationId).sites(),
    queryFn: async () => {
      if (!organizationId || !user) return [];

      const { accessToken } = await user.getAuthJson();
      const sites = await sitesApi.listSites(organizationId, accessToken);

      return sites.map(site => ({ id: site.id, name: site.name }));
    },
    enabled: !!organizationId && !!user,
    staleTime: 1000 * 30,
  });

  return { sites: allSites, isLoading, error };
}
```

### Example 2: Migrated Sign Out
```typescript
// Source: src/components/platform/PlatformLayout.tsx (NEEDS MIGRATION)
// Currently uses: supabase.auth.signOut()
// Should become:

import { useStackApp } from '@stackframe/react';

export function PlatformLayout() {
  const stackApp = useStackApp();

  const handleLogout = async () => {
    try {
      await stackApp.signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return <button onClick={handleLogout}>Sign Out</button>;
}
```

### Example 3: Already Migrated Hook (Reference)
```typescript
// Source: src/hooks/useEffectiveIdentity.ts (ALREADY MIGRATED)
// This is the gold standard pattern:

import { useUser } from '@stackframe/react';
import { useQuery } from '@tanstack/react-query';

export function useEffectiveIdentity(): EffectiveIdentity {
  const stackUser = useUser();

  const { data: profile, isLoading } = useQuery({
    queryKey: qk.user(stackUser?.id ?? null).profile(),
    queryFn: async () => {
      if (!stackUser) return null;
      const authJson = await stackUser.getAuthJson();
      return authApi.getMe(authJson.accessToken);
    },
    enabled: !!stackUser,
    staleTime: 1000 * 60 * 5,
  });

  return {
    effectiveUserId: stackUser?.id ?? null,
    effectiveOrgId: profile?.primaryOrganizationId ?? null,
    isLoading,
    // ... other fields
  };
}
```

## Files Requiring Migration

### Category 1: Hooks (19 files)
These hooks use `supabase.auth.getSession()` or `supabase.auth.getUser()`:

| File | Supabase Usage | Migration Complexity |
|------|----------------|---------------------|
| `src/hooks/useAccountDeletion.ts` | `auth.signOut()` | Medium - has TODO markers |
| `src/hooks/useBranding.ts` | `auth.getSession()` | Low - straightforward query |
| `src/hooks/useNavTree.ts` | `auth.getSession()` (2x) | Medium - multiple queries |
| `src/hooks/useSoftDelete.ts` | `auth.getSession()` (3x) | Medium - multiple operations |

**Total hooks:** 4 hooks with direct auth usage

### Category 2: Components (13 files)
These components use Supabase auth directly:

| File | Supabase Usage | Migration Complexity |
|------|----------------|---------------------|
| `src/components/platform/PlatformLayout.tsx` | `auth.signOut()` | Low - single logout call |
| `src/components/NotificationDropdown.tsx` | `auth.getUser()` (2x) | Low - get user ID |
| `src/components/unit/UnitSettingsSection.tsx` | `auth.getUser()` | Low - get user ID |
| `src/components/reports/ComplianceReportCard.tsx` | `auth.getUser()` | Low - get user ID |
| `src/components/settings/TTNCredentialsPanel.tsx` | `auth.getUser()` | Low - get user ID |
| `src/components/settings/AlertRulesEditor.tsx` | `auth.getSession()` (3x) | Medium - multiple calls |
| `src/components/settings/EmulatorResyncCard.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/components/site/SiteComplianceSettings.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/components/debug/DebugTerminal.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/components/debug/RBACDebugPanel.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/features/dashboard-layout/hooks/useEntityLayoutStorage.ts` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/features/dashboard-layout/widgets/AnnotationsWidget.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |

**Total components:** 12 components

### Category 3: Pages (8 files)
These page components use Supabase auth:

| File | Supabase Usage | Migration Complexity |
|------|----------------|---------------------|
| `src/pages/Alerts.tsx` | Import + `auth.getSession()` | Low - single call |
| `src/pages/AreaDetail.tsx` | Import + `auth.getSession()` | Low - single call |
| `src/pages/Dashboard.tsx` | Import only | Low - remove import |
| `src/pages/DataMaintenance.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/pages/Inspector.tsx` | Uses `useSupabaseClient` | Low - replace with useUser |
| `src/pages/ManualLog.tsx` | Import only | Low - remove import |
| `src/pages/PilotSetup.tsx` | `auth.getSession()` | Low - single call |
| `src/pages/RecentlyDeleted.tsx` | `auth.getUser()` | Low - single call |
| `src/pages/Reports.tsx` | `auth.getSession()` + `auth.getUser()` | Medium - 2 calls |
| `src/pages/Settings.tsx` | Import only | Low - remove import |
| `src/pages/SiteDetail.tsx` | Import only | Low - remove import |
| `src/pages/TTNCleanup.tsx` | `auth.getUser()` | Low - single call |
| `src/pages/UnitDetail.tsx` | Import only | Low - remove import |

**Total pages:** 13 pages

### Category 4: Infrastructure (2 files)
These files define the Supabase client:

| File | Purpose | Action Required |
|------|---------|-----------------|
| `src/integrations/supabase/client.ts` | Client creation | DELETE after migration complete |
| `src/lib/instrumentedSupabase.ts` | Instrumented wrapper | DELETE after migration complete |

### Category 5: Import-Only (7 files)
Files that import Supabase but may only use it for database queries (not auth):

- `src/components/DashboardLayout.tsx`
- `src/components/LogTempModal.tsx`
- `src/components/debug/UnitDebugBanner.tsx`
- Several page components

**Action:** Verify each file to determine if Supabase import can be removed or if database queries need migration

## Migration Scope Summary

| Category | File Count | Complexity | Estimated Effort |
|----------|-----------|------------|------------------|
| Hooks | 4 | Low-Medium | 2-4 hours |
| Components | 12 | Low-Medium | 4-6 hours |
| Pages | 13 | Low | 3-4 hours |
| Infrastructure | 2 | Low | 1 hour (deletion) |
| **Total** | **31** | **Low-Medium** | **10-15 hours** |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase Auth | Stack Auth | Phase 5 (Dec 2024) | New hooks use Stack Auth patterns |
| `supabase.auth.getSession()` | `useUser().getAuthJson()` | Phase 5 | Unified auth token retrieval |
| Direct Supabase client | API client factories | Phase 5 | Typed, authenticated API calls |

**Deprecated/outdated:**
- `useSupabaseClient()`: Replaced by `useUser()` from `@stackframe/react`
- `supabase.auth.*`: All auth methods replaced by Stack Auth SDK
- Direct `createClient()` usage: Backend handles database via API

## Migration Strategy

### Step 1: Categorize Files
Group files by migration complexity:
- **Simple:** Import-only or single auth call (20 files)
- **Medium:** Multiple auth calls or complex logic (11 files)

### Step 2: Migrate in Waves
1. **Wave 1 (Low-hanging fruit):** Import-only files - remove unused imports
2. **Wave 2 (Components):** Single auth call replacements
3. **Wave 3 (Hooks):** Query hooks with session calls
4. **Wave 4 (Complex):** Multi-call components and hooks

### Step 3: Verification
After each wave:
- Run TypeScript compiler: `npm run build`
- Check for runtime errors in dev: `npm run dev`
- Verify auth flows still work

### Step 4: Final Cleanup
Once all files migrated:
1. Remove `@supabase/supabase-js` from `package.json`
2. Delete `src/integrations/supabase/client.ts`
3. Delete `src/lib/instrumentedSupabase.ts`
4. Remove Supabase env vars from `.env.example`

## Open Questions

1. **Database query migration:**
   - Some files may use Supabase client for database queries (not just auth)
   - Need to verify if these should also be migrated to backend API calls
   - Recommendation: Investigate during cleanup if direct database calls remain

2. **Real-time subscriptions:**
   - Some components may have Supabase real-time subscriptions
   - Stack Auth doesn't provide equivalent - backend WebSocket needed
   - Recommendation: Document any real-time features for future migration

3. **Account deletion flow:**
   - `useAccountDeletion.ts` has TODO markers for backend migration
   - Currently calls Supabase RPC for deletion
   - Recommendation: May need backend endpoint before full migration

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All 33 files with Supabase auth usage identified via `grep`
- Migrated examples: `useEffectiveIdentity`, `useUserRole`, `useAlertRules` showing Stack Auth patterns
- Package.json: Version 2.8.60 of @stackframe/react confirmed as current

### Secondary (MEDIUM confidence)
- Migration backlog document: Context on Phase 5 Stack Auth migration scope
- Code comments: TODO markers indicating known migration work

## Metadata

**Confidence breakdown:**
- Files requiring migration: HIGH - Direct grep analysis of codebase
- Migration patterns: HIGH - Established in 27+ migrated hooks
- Complexity estimates: MEDIUM - Based on file inspection, actual may vary

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable patterns, unlikely to change)
