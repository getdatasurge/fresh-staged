# Phase 5: Frontend Migration - Research

**Researched:** 2026-01-23
**Domain:** React frontend API integration, authentication, and migration patterns
**Confidence:** HIGH

## Summary

Phase 5 migrates the React frontend from direct Supabase SDK calls to a typed API client consuming the self-hosted backend built in phases 1-4. The codebase has 44 hooks with 27 using Supabase, making this a significant migration. The project already uses TanStack Query v5 for caching and has established query key patterns, which must be preserved during migration.

The standard approach combines: (1) a typed API client built with Ky (lightweight fetch wrapper), (2) Stack Auth React SDK for token management, (3) TanStack Query patterns preserved with new fetch functions, (4) incremental hook-by-hook migration allowing Supabase and new API to coexist temporarily, and (5) comprehensive testing at hook, integration, and E2E levels.

**Primary recommendation:** Use Ky as HTTP client with zod-to-ts for type generation from backend Zod schemas. Leverage Stack Auth's `useUser().getAuthJson()` for token access. Migrate hooks by dependency order (core entities first, then features depending on them). Test each hook individually before proceeding.

## Standard Stack

### Core

| Library               | Version | Purpose            | Why Standard                                                                                                                  |
| --------------------- | ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| ky                    | ^1.7.x  | HTTP client        | Built on fetch, 157KB, automatic error handling, retry logic, TypeScript-first. Better DX than raw fetch without Axios bloat. |
| @stackframe/stack     | Latest  | Auth SDK           | Official Stack Auth React SDK with token management, auth hooks, and automatic token refresh.                                 |
| @tanstack/react-query | 5.83.0  | State management   | Already in project. Industry standard for server state caching, invalidation, and mutations.                                  |
| zod                   | 3.25.76 | Runtime validation | Already in project for backend schemas. Enables type-safe API contracts via z.infer.                                          |

### Supporting

| Library                | Version | Purpose           | When to Use                                                              |
| ---------------------- | ------- | ----------------- | ------------------------------------------------------------------------ |
| zod-to-ts              | ^1.3.x  | Type generation   | Generate TypeScript types from backend Zod schemas for API client types. |
| vitest                 | 2.1.8   | Testing           | Already in project (frontend). Unit tests for hooks and API client.      |
| @testing-library/react | 16.3.1  | Component testing | Already in project. Test hooks with React Query integration.             |

### Alternatives Considered

| Instead of     | Could Use           | Tradeoff                                                                                                                   |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ky             | Axios               | Axios is 5x larger (800KB vs 157KB), has more features but unnecessary complexity for this use case.                       |
| Ky             | Fetch API           | Native fetch requires manual retry logic, error handling, and request/response interceptors. Ky provides these out-of-box. |
| zod-to-ts      | OpenAPI codegen     | Backend doesn't expose OpenAPI spec. Zod schemas already exist - reuse them vs new tooling.                                |
| Stack Auth SDK | Custom JWT handling | SDK handles token refresh, storage, and expiry automatically. Manual JWT handling error-prone.                             |

**Installation:**

```bash
pnpm add ky zod-to-ts
# Stack Auth SDK already installed: @stackframe/stack
# TanStack Query already installed: @tanstack/react-query
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── api-client.ts          # Ky HTTP client with auth interceptor
│   ├── api/                    # Typed API endpoint functions
│   │   ├── organizations.ts    # Org CRUD operations
│   │   ├── sites.ts            # Site CRUD operations
│   │   ├── areas.ts            # Area CRUD operations
│   │   ├── units.ts            # Unit CRUD operations
│   │   ├── readings.ts         # Sensor readings API
│   │   └── alerts.ts           # Alerts API
│   ├── api-types.ts            # Generated types from backend Zod schemas
│   └── queryKeys.ts            # Existing - preserve as-is
├── hooks/                      # Existing hooks - migrate one by one
│   ├── useOrganizations.ts     # Migrate: use api.organizations.*
│   ├── useSites.ts             # Migrate: use api.sites.*
│   └── ...                     # 44 total hooks
└── components/                 # No changes needed
```

### Pattern 1: API Client with Auth Interceptor

**What:** Centralized Ky instance with Stack Auth token injection and error handling.

**When to use:** All API calls should go through this client for consistent auth and error handling.

**Example:**

```typescript
// src/lib/api-client.ts
import ky from 'ky';
import { useUser } from '@stackframe/stack';

// Base API URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const apiClient = ky.create({
  prefixUrl: API_BASE_URL,
  timeout: 30000,
  retry: {
    limit: 3,
    methods: ['get', 'post', 'put', 'patch', 'delete'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 30000,
  },
  hooks: {
    beforeRequest: [
      async (request) => {
        // Note: Cannot use hooks in non-component context
        // Token must be passed per-request or via factory function
        // See Pattern 2 for hook-based usage
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Unknown error' }));
          console.error('[API Error]', {
            url: request.url,
            status: response.status,
            error,
          });
          throw new Error(error.message || `API error: ${response.status}`);
        }
        return response;
      },
    ],
  },
});
```

### Pattern 2: Hook-Based API Functions with Token Injection

**What:** API functions that accept token parameter from Stack Auth hook.

**When to use:** All query and mutation functions that need authentication.

**Example:**

```typescript
// src/lib/api/organizations.ts
import { apiClient } from '../api-client';
import type { OrganizationResponse, UpdateOrganizationRequest } from '../api-types';

export const organizationsApi = {
  getOrganization: async (orgId: string, accessToken: string) => {
    return apiClient
      .get(`api/orgs/${orgId}`, {
        headers: { 'x-stack-access-token': accessToken },
      })
      .json<OrganizationResponse>();
  },

  updateOrganization: async (
    orgId: string,
    updates: UpdateOrganizationRequest,
    accessToken: string,
  ) => {
    return apiClient
      .put(`api/orgs/${orgId}`, {
        json: updates,
        headers: { 'x-stack-access-token': accessToken },
      })
      .json<OrganizationResponse>();
  },

  listMembers: async (orgId: string, accessToken: string) => {
    return apiClient
      .get(`api/orgs/${orgId}/members`, {
        headers: { 'x-stack-access-token': accessToken },
      })
      .json<MemberResponse[]>();
  },
};
```

### Pattern 3: Migrated Hook with Preserved Query Keys

**What:** Convert Supabase-based hook to use new API client while keeping existing query keys.

**When to use:** For every hook migration to maintain cache behavior.

**Example:**

```typescript
// src/hooks/useOrganizations.ts - BEFORE (Supabase)
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { qk } from '@/lib/queryKeys';

export function useOrganization(orgId: string) {
  return useQuery({
    queryKey: qk.org(orgId).profile(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

// src/hooks/useOrganizations.ts - AFTER (New API)
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@stackframe/stack';
import { organizationsApi } from '@/lib/api/organizations';
import { qk } from '@/lib/queryKeys';

export function useOrganization(orgId: string) {
  const user = useUser();

  return useQuery({
    queryKey: qk.org(orgId).profile(), // SAME query key - cache preserved
    queryFn: async () => {
      const { accessToken } = await user.getAuthJson();
      return organizationsApi.getOrganization(orgId, accessToken);
    },
    enabled: !!orgId && !!user,
  });
}
```

### Pattern 4: Mutation with Optimistic Updates

**What:** Mutations with cache invalidation and optimistic UI updates.

**When to use:** All create/update/delete operations.

**Example:**

```typescript
// src/hooks/useOrganizations.ts - Mutation
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@stackframe/stack';
import { organizationsApi } from '@/lib/api/organizations';
import { qk } from '@/lib/queryKeys';

export function useUpdateOrganization(orgId: string) {
  const queryClient = useQueryClient();
  const user = useUser();

  return useMutation({
    mutationFn: async (updates: UpdateOrganizationRequest) => {
      const { accessToken } = await user.getAuthJson();
      return organizationsApi.updateOrganization(orgId, updates, accessToken);
    },
    onSuccess: (data) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: qk.org(orgId).all });
    },
    onError: (error) => {
      console.error('[Update Org Error]', error);
      // Error will appear in DOM via error state
    },
  });
}
```

### Pattern 5: Type Generation from Backend Schemas

**What:** Generate TypeScript types from backend Zod schemas for type-safe API contracts.

**When to use:** Before implementing API client to ensure type alignment.

**Example:**

```typescript
// Script: scripts/generate-api-types.ts
import { printNode, zodToTs } from 'zod-to-ts';
import * as fs from 'fs';
import * as path from 'path';

// Import backend Zod schemas
import { OrganizationSchema } from '../backend/src/schemas/organizations';
import { SiteSchema } from '../backend/src/schemas/sites';
// ... import all schemas

const schemas = {
  OrganizationResponse: OrganizationSchema,
  SiteResponse: SiteSchema,
  // ... map all schemas
};

let output = '// Auto-generated from backend Zod schemas\n\n';

for (const [name, schema] of Object.entries(schemas)) {
  const { node } = zodToTs(schema, name);
  output += printNode(node) + '\n\n';
}

fs.writeFileSync(path.join(__dirname, '../src/lib/api-types.ts'), output);
```

### Anti-Patterns to Avoid

- **Mixed Supabase + API calls in same hook:** Migrate completely or not at all. Partial migration creates confusion about data source.
- **Directly mutating query cache:** Always use `invalidateQueries` or `setQueryData`. Direct mutations break React Query's state tracking.
- **Hardcoded tokens:** Never store tokens in localStorage manually. Use Stack Auth SDK's default storage.
- **Missing error boundaries:** API errors must be caught at hook level AND displayed in UI. Silent failures hide bugs.
- **Changing query keys during migration:** Breaks cache continuity. Keep exact same keys as Supabase version.

## Don't Hand-Roll

| Problem                  | Don't Build                     | Use Instead                     | Why                                                                                   |
| ------------------------ | ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| HTTP retry logic         | Custom exponential backoff      | Ky's built-in `retry` option    | Handles edge cases: network failures, rate limits, jitter to prevent thundering herd. |
| Token refresh            | useEffect checking expiry       | Stack Auth SDK                  | Handles refresh timing, storage, concurrent requests, token rotation.                 |
| Request deduplication    | Custom pending request tracking | TanStack Query                  | Built-in deduplication prevents race conditions and redundant network calls.          |
| Optimistic updates       | Manual cache mutations          | TanStack Query `optimisticData` | Handles rollback on error, merge strategies, race conditions.                         |
| Network status detection | Custom online/offline state     | Existing `useOfflineSync` hook  | Already implemented with proper event listeners and cleanup.                          |
| Type generation          | Manual TypeScript interfaces    | zod-to-ts + z.infer             | Auto-generates types from Zod schemas, prevents drift between FE/BE.                  |

**Key insight:** API client infrastructure is deceptively complex. Token management, retries, error handling, and caching all have subtle edge cases. Use proven libraries that handle these correctly rather than reinventing solutions.

## Common Pitfalls

### Pitfall 1: Token Race Conditions on Multiple Concurrent Requests

**What goes wrong:** Multiple API calls triggered simultaneously each call `user.getAuthJson()`, potentially fetching token multiple times or racing on refresh.

**Why it happens:** Stack Auth SDK isn't designed for high-concurrency token access. Each hook independently requests token.

**How to avoid:**

- Stack Auth SDK handles token caching internally - calling `getAuthJson()` multiple times is safe.
- For extreme concurrency, create token cache wrapper with promise deduplication.
- Monitor for 401 responses - if seeing many, investigate token refresh timing.

**Warning signs:**

```
- Multiple 401 responses in rapid succession
- "Token refresh in progress" logs
- Inconsistent authentication state across components
```

### Pitfall 2: Query Key Drift Breaking Cache Invalidation

**What goes wrong:** Migrated hooks use different query keys than original, breaking invalidation chains. Example: Old hook uses `['org', orgId, 'sites']`, new uses `['sites', orgId]` - invalidating org no longer clears sites.

**Why it happens:** Developer forgets to check existing `queryKeys.ts` structure and invents new pattern.

**How to avoid:**

- ALWAYS reference `qk.*` from `src/lib/queryKeys.ts` for keys
- Never hardcode query keys in hooks
- Before migrating hook, read current implementation's query key
- Use exact same key structure in migrated version
- Test invalidation chains after migration

**Warning signs:**

```typescript
// BAD - hardcoded key
queryKey: ['organization', orgId];

// GOOD - reuses factory
queryKey: qk.org(orgId).profile();
```

### Pitfall 3: Error Messages Hidden from Users

**What goes wrong:** API errors logged to console but not displayed in UI. User sees loading spinner forever or stale data.

**Why it happens:** Hook returns error state but component doesn't render it, or error boundary swallows it.

**How to avoid:**

- Every hook consuming component must handle `error` state
- Use toast notifications for transient errors (network, 5xx)
- Use inline error messages for validation errors (4xx)
- Add error boundaries at route level for unhandled errors
- Log errors to console AND show in UI

**Warning signs:**

```typescript
// BAD - error ignored
const { data } = useQuery(...);
return <div>{data?.name}</div>; // Shows nothing on error

// GOOD - error displayed
const { data, error, isError } = useQuery(...);
if (isError) return <ErrorAlert error={error} />;
return <div>{data?.name}</div>;
```

### Pitfall 4: Testing Against Stale Backend Schema

**What goes wrong:** Frontend tests pass but runtime fails because backend API changed (field renamed, validation added, response structure changed).

**Why it happens:** Type generation script not run after backend schema updates.

**How to avoid:**

- Add pre-commit hook running type generation script
- Include type generation in CI pipeline
- Version API types file and track in git
- Document type generation workflow in README
- Consider monorepo setup for true type sharing

**Warning signs:**

```
- TypeScript errors on API response fields
- Runtime errors: "Cannot read property X of undefined"
- Unexpected validation errors from backend
- Tests pass but production fails
```

### Pitfall 5: Incremental Migration State Confusion

**What goes wrong:** During migration, some hooks use Supabase, some use API. Data inconsistency and cache invalidation breaks.

**Why it happens:** Invalidating `qk.org(orgId).all` only refetches migrated hooks, Supabase hooks show stale data.

**How to avoid:**

- Migrate by domain (all org-related hooks together)
- Document migration status in STATE.md
- Add `// TODO: Migrate to API client` comments on unmigrated hooks
- Test cross-hook interactions after each domain migration
- Consider feature flags to toggle between implementations

**Warning signs:**

```
- Data shows correctly in one component, stale in another
- Mutations succeed but UI doesn't update
- Invalidation logs show some queries refetching, others not
```

## Code Examples

Verified patterns from official sources:

### TanStack Query with Type-Safe Options

Source: [TanStack Query Type-Safe Query Options](https://context7.com/tanstack/query/llms.txt)

```typescript
import { queryOptions } from '@tanstack/react-query';

// Define reusable query options with full type inference
const orgOptions = (orgId: string, accessToken: string) => queryOptions({
  queryKey: qk.org(orgId).profile(),
  queryFn: async () => organizationsApi.getOrganization(orgId, accessToken),
  staleTime: 1000 * 60 * 5, // 5 minutes
});

// Use in component
function OrgProfile({ orgId }: { orgId: string }) {
  const user = useUser();
  const { data } = useQuery(orgOptions(orgId, user.accessToken));
  return <div>{data.name}</div>; // data is fully typed
}
```

### Stack Auth Token Access in React

Source: [Stack Auth React Client Integration](https://context7.com/stack-auth/stack-auth/llms.txt)

```typescript
"use client";
import { useUser } from "@stackframe/stack";

export default function CallProtectedAPI() {
  const user = useUser({ or: "redirect" });

  const callAPI = async () => {
    const { accessToken } = await user.getAuthJson();

    const response = await fetch('/api/protected-endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-stack-access-token': accessToken,
      },
      body: JSON.stringify({ action: 'do-something' }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('API response:', data);
    }
  };

  return <button onClick={callAPI}>Call Protected API</button>;
}
```

### Ky HTTP Client with Retry Configuration

```typescript
// Based on: https://github.com/sindresorhus/ky
import ky from 'ky';

const api = ky.create({
  prefixUrl: 'https://api.example.com',
  timeout: 30000,
  retry: {
    limit: 3,
    methods: ['get', 'post', 'put', 'delete'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 30000, // Max delay between retries
  },
  hooks: {
    afterResponse: [
      async (request, options, response) => {
        if (!response.ok) {
          const error = await response.json();
          console.error('[API Error]', error);
          throw new Error(error.message);
        }
      },
    ],
  },
});
```

### React Network Status Detection

Based on: [React Network Status Detection](https://dev.to/thelamina/handling-network-status-in-your-react-app-4222)

```typescript
// Already exists in project: src/hooks/useOfflineSync.ts
import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

### React Query Retry with Network Error Detection

Based on: [React Query Retry Strategies](https://dayvster.com/blog/react-query-retry/)

```typescript
import { useQuery } from '@tanstack/react-query';

const orgQuery = useQuery({
  queryKey: qk.org(orgId).profile(),
  queryFn: () => fetchOrg(orgId),
  retry: (failureCount, error) => {
    // Don't retry on 4xx client errors
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }
    // Retry up to 3 times on network errors and 5xx
    return failureCount < 3;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
});
```

## State of the Art

| Old Approach            | Current Approach            | When Changed | Impact                                                                                               |
| ----------------------- | --------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| Axios for HTTP          | Ky (fetch-based)            | 2024-2025    | Lighter bundle (157KB vs 800KB), modern fetch API, better TypeScript support                         |
| Manual JWT handling     | Auth SDK management         | 2024+        | Token refresh, rotation, and storage handled by SDK. Eliminates custom refresh logic.                |
| Supabase client         | REST API + TanStack Query   | 2024+        | Decouples frontend from database vendor, enables self-hosted backend, clearer separation of concerns |
| Manual type definitions | Type generation (zod-to-ts) | 2024+        | Types auto-generated from backend schemas, eliminates drift between FE/BE contracts                  |
| navigator.fetch retries | Built-in retry in Ky        | 2023+        | No manual retry logic needed, exponential backoff with jitter out-of-box                             |

**Deprecated/outdated:**

- **Axios**: Still works but losing ground to lighter fetch-based clients. Bundle size bloat for simple use cases.
- **react-query v3**: Should use v4+ (or v5 in this project). Key features: simplified API, better TypeScript inference.
- **Custom token storage**: Auth SDKs now handle storage securely. Manual localStorage patterns error-prone.
- **Separate type files**: Type generation from schemas is now standard. Manual sync causes bugs.

## Open Questions

1. **Backend API versioning strategy**
   - What we know: Backend doesn't currently version API routes (no `/v1/` prefix)
   - What's unclear: How to handle breaking changes during migration
   - Recommendation: Version API routes in Phase 5 planning (`/api/v1/orgs/...`). Allows old and new versions to coexist during migration.

2. **Error class hierarchy vs union types**
   - What we know: Decision left to Claude's discretion per CONTEXT.md
   - What's unclear: Team preference for error patterns
   - Recommendation: Use discriminated union types for better TypeScript narrowing:
     ```typescript
     type ApiError =
       | { type: 'network'; message: string }
       | { type: 'validation'; field: string; message: string }
       | { type: 'auth'; code: 401 | 403 }
       | { type: 'server'; status: number; message: string };
     ```

3. **Hook migration order priority**
   - What we know: Decision left to Claude's discretion based on dependency analysis
   - What's unclear: Which hooks are most critical to migrate first
   - Recommendation:
     1. Core entities (orgs, sites, areas, units) - foundational
     2. Auth-related (useOrgScope, useEffectiveIdentity) - used everywhere
     3. Sensor data (readings, alerts) - business-critical
     4. Features (layouts, reports, settings) - least risk

4. **E2E test coverage scope**
   - What we know: "E2E smoke tests" required per CONTEXT.md
   - What's unclear: Which flows to cover, test framework choice
   - Recommendation: Use Playwright for E2E. Cover critical paths: login → view dashboard → navigate hierarchy → view sensor data → create alert. 5-10 smoke tests sufficient.

## Sources

### Primary (HIGH confidence)

- [/tanstack/query](https://context7.com/tanstack/query/llms.txt) - TanStack Query v5 patterns, type-safe query options, retry configuration
- [/stack-auth/stack-auth](https://context7.com/stack-auth/stack-auth/llms.txt) - Stack Auth React SDK, token management, authentication hooks
- Project codebase analysis - Existing hooks, query keys, React Query usage patterns

### Secondary (MEDIUM confidence)

- [Ky vs Axios vs Fetch comparison](https://leapcell.io/blog/choosing-the-right-http-client-in-javascript-node-fetch-axios-and-ky) - HTTP client selection rationale
- [React Query retry strategies](https://dayvster.com/blog/react-query-retry/) - Exponential backoff patterns
- [React error handling best practices](https://www.developerway.com/posts/how-to-handle-errors-in-react) - Error display patterns
- [Building API clients with TypeScript and Zod](https://leapcell.io/blog/building-robust-api-clients-with-typescript-and-zod) - Type generation approaches
- [React network status detection](https://dev.to/thelamina/handling-network-status-in-your-react-app-4222) - Offline handling patterns

### Tertiary (LOW confidence)

- [OpenAPI React Query codegen](https://github.com/7nohe/openapi-react-query-codegen) - Alternative type generation approach (not using OpenAPI but relevant patterns)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - TanStack Query and Stack Auth SDK are authoritative official tools with verified documentation
- Architecture: HIGH - Patterns verified in Context7 docs and existing codebase analysis
- Pitfalls: MEDIUM - Based on common patterns observed in issue trackers and blog posts, not official docs

**Research date:** 2026-01-23
**Valid until:** 2026-04-23 (90 days - stable ecosystem, slow-moving libraries)

---

**Codebase Context:**

- 44 existing hooks with established TanStack Query patterns
- 27 hooks currently using Supabase SDK (identified for migration)
- Existing `queryKeys.ts` with hierarchical structure (org/unit/site scopes)
- Backend API complete with Zod schemas in `backend/src/schemas/`
- Vitest + React Testing Library already configured
- Stack Auth integration already exists (mentioned in requirements)

**Migration Scope:**

- Replace Supabase client calls with API client calls in 27 hooks
- Preserve existing query key structure and caching behavior
- Integrate Stack Auth SDK for token management
- Add error visibility in both console and DOM
- Maintain React Query patterns (optimistic updates, invalidation)
- Support offline handling via existing `useOfflineSync` hook
