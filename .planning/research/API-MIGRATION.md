# API Migration Research: Frontend Database Queries to Backend API

**Research Date:** 2026-01-24
**Project:** FreshTrack Pro v2.0
**Researcher:** GSD Project Researcher
**Confidence:** HIGH

## Executive Summary

This research addresses AUTH-02: migrating 100+ frontend files from direct Supabase database queries (`@supabase/supabase-js`) to backend API calls. The goal is to remove the Supabase client dependency while maintaining type safety, TanStack Query caching patterns, and minimizing disruption to the existing codebase.

**Recommendation:** Use **Strangler Fig Pattern** with **tRPC** for incremental migration, leveraging TanStack Query's existing patterns and achieving end-to-end type safety without code generation.

**Key Findings:**
- Incremental migration via Strangler Fig pattern reduces risk and enables continuous delivery
- tRPC provides automatic type sharing between frontend/backend, eliminating manual type sync
- TanStack Query patterns remain unchanged, only `queryFn` implementations need updates
- Parallel run testing validates new endpoints against existing Supabase queries
- Feature flags enable gradual rollout with instant rollback capability

---

## Table of Contents

1. [Migration Strategies](#migration-strategies)
2. [API Design Patterns](#api-design-patterns)
3. [Type Safety Across Boundary](#type-safety-across-boundary)
4. [Incremental Migration Patterns](#incremental-migration-patterns)
5. [Testing & Validation](#testing--validation)
6. [Rollback Safety](#rollback-safety)
7. [Implementation Roadmap](#implementation-roadmap)

---

## Migration Strategies

### 1. Big-Bang Migration (NOT RECOMMENDED)

**Description:** Migrate all queries in one release.

**Pros:**
- Clean cutover, no dual systems
- Shorter migration calendar time

**Cons:**
- High risk, all-or-nothing deployment
- Long freeze period for migration work
- Difficult to test comprehensively
- No learning curve from initial migrations
- Rollback requires reverting entire release

**Verdict:** ❌ **Rejected** — Too risky for 100+ files

---

### 2. Strangler Fig Pattern (RECOMMENDED) ⭐

**Description:** Incrementally replace Supabase queries with backend API calls, running both systems in parallel during transition.

**How It Works:**
```
┌────────────────────────────────────────┐
│         Frontend Component             │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│   TanStack Query Hook (useQuery)      │
│   queryFn: OLD or NEW (feature flag)   │
└────┬───────────────────────┬───────────┘
     │                       │
     ▼                       ▼
┌─────────────┐      ┌──────────────────┐
│  Supabase   │      │   Backend API    │
│  (OLD)      │      │   (NEW - tRPC)   │
└─────────────┘      └──────────────────┘
```

**Pros:**
- Low risk — migrate one domain/feature at a time
- Immediate rollback via feature flag
- Learn from early migrations, adjust strategy
- Continuous delivery — ship incremental progress
- Both systems coexist during transition
- Real-world testing with production traffic

**Cons:**
- Longer calendar time (weeks vs. days)
- Temporary code duplication in hooks
- Requires feature flag infrastructure

**Sources:**
- [AWS Strangler Fig Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html)
- [Azure Strangler Fig Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig)
- [Microservices.io Strangler Fig](https://microservices.io/post/refactoring/2023/06/21/strangler-fig-application-pattern-incremental-modernization-to-services.md.html)

**Migration Order (Example):**
1. **Phase 1:** Read-only queries (organizations, sites, areas, units)
2. **Phase 2:** Sensor readings (time-series data)
3. **Phase 3:** Alerts (read + acknowledge/resolve)
4. **Phase 4:** Settings & configuration
5. **Phase 5:** User management
6. **Phase 6:** Edge cases & cleanup

**Verdict:** ✅ **RECOMMENDED** — Industry-proven pattern for incremental modernization

---

### 3. Dual-Write Pattern (NOT APPLICABLE)

**Description:** Write to both old and new systems simultaneously.

**Verdict:** ❌ **Not Applicable** — We're migrating **read** paths (queries), not writes. This pattern applies to data migration scenarios.

---

## API Design Patterns

### Comparison: REST vs GraphQL vs tRPC

| Criterion | REST | GraphQL | tRPC |
|-----------|------|---------|------|
| **Type Safety** | Manual (OpenAPI + codegen) | Manual (schema + codegen) | **Automatic** |
| **Learning Curve** | Low | Medium-High | Low (if TypeScript familiar) |
| **Bundle Size** | Varies | ~150KB (client) | **~10KB** |
| **Boilerplate** | Medium | High | **Minimal** |
| **Overfetching** | Common | Solved | N/A (RPC model) |
| **Public API** | ✅ Excellent | ✅ Good | ❌ Internal only |
| **Existing Stack Fit** | Good (Fastify + Ky) | Medium (new paradigm) | **Perfect (TS+Fastify)** |
| **Type Drift Risk** | High | Medium | **None** |
| **IDE Autocomplete** | Partial | Partial | **Full** |
| **Migration Effort** | Medium | High | **Low** |

**Sources:**
- [REST vs GraphQL vs tRPC Guide 2026](https://dev.to/dataformathub/rest-vs-graphql-vs-trpc-the-ultimate-api-design-guide-for-2026-8n3)
- [tRPC vs REST Analysis](https://www.wisp.blog/blog/when-to-choose-rest-over-trpc-a-comparative-analysis)

---

### tRPC: Recommended Choice ⭐

**Why tRPC for this migration:**

1. **Zero Code Generation**
   Export `AppRouter` type from backend, import on frontend — instant type safety.

   ```typescript
   // Backend: src/trpc/router.ts
   export const appRouter = router({
     sites: {
       list: publicProcedure
         .input(z.object({ orgId: z.string() }))
         .query(async ({ input }) => {
           return await db.query.sites.findMany({
             where: eq(sites.organizationId, input.orgId)
           });
         })
     }
   });
   export type AppRouter = typeof appRouter;
   ```

   ```typescript
   // Frontend: src/lib/trpc.ts
   import type { AppRouter } from '@backend/trpc/router';
   export const trpc = createTRPCReact<AppRouter>();
   ```

2. **TanStack Query Integration**
   tRPC provides `@trpc/react-query` — drop-in replacement for TanStack Query hooks.

   ```typescript
   // BEFORE (Supabase)
   const { data: sites } = useQuery({
     queryKey: qk.org(orgId).sites(),
     queryFn: async () => {
       const { data } = await supabase
         .from('sites')
         .select('*')
         .eq('organization_id', orgId);
       return data;
     },
   });

   // AFTER (tRPC)
   const { data: sites } = trpc.sites.list.useQuery({ orgId });
   ```

3. **Fastify Adapter Available**
   tRPC has official Fastify adapter — no framework change needed.

   ```typescript
   import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';

   await fastify.register(fastifyTRPCPlugin, {
     prefix: '/trpc',
     trpcOptions: { router: appRouter, createContext },
   });
   ```

4. **Incremental Adoption**
   Per tRPC docs: *"A common strategy is to initially use tRPC only for new endpoints and migrate existing ones later."*

   Source: [tRPC: Adding to Existing Project](https://trpc.io/docs/getting-started)

5. **Real-World Success (2026 Data)**
   - "Type mismatches went to zero after migration — not reduced, but completely eliminated."
   - "Team velocity increased by 40%, not because of coding faster, but because teams weren't debugging type mismatches at 11 PM anymore."
   - "Teams stopped writing API documentation that's outdated before it's published."

   Source: [Building Type-Safe APIs with tRPC](https://dev.to/eva_clari_289d85ecc68da48/building-type-safe-apis-with-trpc-a-practical-migration-guide-from-rest-3l4j)

**Cons:**
- Internal APIs only (not suitable for public API)
- Requires TypeScript on both frontend and backend (already met ✅)
- Adds dependency on tRPC ecosystem

**Verdict:** ✅ **RECOMMENDED** — Best fit for FreshTrack Pro's TypeScript-first stack

---

### REST Alternative (If tRPC Not Chosen)

**If tRPC is rejected**, use **REST + Zod + TypeScript codegen**:

1. Define schemas with Zod (already in use)
2. Export types from backend
3. Use Ky (already in use) for HTTP client
4. Manually maintain type sync or use OpenAPI generator

**Pros:**
- More conventional
- Works with existing Fastify routes
- Public API ready

**Cons:**
- Manual type sync (risk of drift)
- More boilerplate
- No autocomplete for API calls

---

## Type Safety Across Boundary

### Current State: Type Duplication Risk

```typescript
// Frontend duplicates backend types
interface Site {
  id: string;
  name: string;
  organization_id: string;
  // ... if backend schema changes, frontend breaks silently
}
```

**Problem:** Manual type synchronization between 22 tables + enums.

---

### tRPC Solution: Single Source of Truth

```typescript
// Backend: Drizzle schema is SSOT
export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  organizationId: uuid('organization_id').notNull(),
  // ...
});

// Backend: tRPC procedure infers types from Drizzle
export const appRouter = router({
  sites: {
    list: publicProcedure
      .input(z.object({ orgId: z.string() }))
      .query(async ({ input }) => {
        return await db.query.sites.findMany({ /* ... */ });
      })
  }
});

// Frontend: Import AppRouter type
import type { AppRouter } from '@backend/trpc/router';
export const trpc = createTRPCReact<AppRouter>();

// Usage: Full autocomplete + compile-time errors
const { data } = trpc.sites.list.useQuery({ orgId: 'abc' });
//     ^? data: Site[] | undefined (inferred from backend)
```

**Benefits:**
- ✅ Zero manual type definitions on frontend
- ✅ Compile errors if backend API changes
- ✅ IDE autocomplete for all procedures
- ✅ Zod validation for inputs/outputs

**Source:** [tRPC Type Inference](https://trpc.io/docs/client/react/infer-types)

---

### Alternative: REST + Shared Types

If using REST, publish types via npm package:

```json
// packages/shared-types/package.json
{
  "name": "@freshtrack/types",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

```typescript
// Backend generates types, frontend imports
import type { Site, Unit, Alert } from '@freshtrack/types';
```

**Cons:**
- Requires build step
- Version sync between packages
- No runtime validation

---

## Incremental Migration Patterns

### Feature Flag Strategy

```typescript
// src/lib/featureFlags.ts
export const FEATURES = {
  USE_API_FOR_SITES: import.meta.env.VITE_USE_API_SITES === 'true',
  USE_API_FOR_UNITS: import.meta.env.VITE_USE_API_UNITS === 'true',
  USE_API_FOR_ALERTS: import.meta.env.VITE_USE_API_ALERTS === 'true',
} as const;
```

```typescript
// src/hooks/useSites.ts (migration in progress)
import { FEATURES } from '@/lib/featureFlags';

export function useSites(orgId: string) {
  // OLD: Supabase query
  const supabaseQuery = useQuery({
    queryKey: qk.org(orgId).sites(),
    queryFn: async () => {
      const { data } = await supabase
        .from('sites')
        .select('*')
        .eq('organization_id', orgId);
      return data;
    },
    enabled: !FEATURES.USE_API_FOR_SITES,
  });

  // NEW: tRPC query
  const apiQuery = trpc.sites.list.useQuery(
    { orgId },
    { enabled: FEATURES.USE_API_FOR_SITES }
  );

  // Return active query
  return FEATURES.USE_API_FOR_SITES ? apiQuery : supabaseQuery;
}
```

**Migration Steps:**
1. Deploy backend endpoint
2. Add feature flag (default: false)
3. Test with flag enabled in dev/staging
4. Enable for 10% of users (canary)
5. Monitor metrics (latency, errors)
6. Roll out to 100%
7. Remove Supabase path + feature flag

---

### TanStack Query Pattern Preservation

**Good news:** TanStack Query usage patterns don't change, only `queryFn` implementation.

```typescript
// Query keys remain identical
const queryKey = qk.org(orgId).sites();

// Cache invalidation works the same
queryClient.invalidateQueries({ queryKey });

// Optimistic updates work the same
queryClient.setQueryData(queryKey, (old) => [...old, newSite]);
```

**tRPC provides TanStack Query-compatible hooks:**

```typescript
// Standard TanStack Query
const { data, isLoading, error } = useQuery({
  queryKey: ['sites', orgId],
  queryFn: () => fetchSites(orgId),
});

// tRPC (wraps TanStack Query)
const { data, isLoading, error } = trpc.sites.list.useQuery({ orgId });
//                                  ↑ Returns standard useQuery result
```

**Source:** [TanStack Query v5 Docs](https://tanstack.com/query/v5/docs)

---

### Migration by Domain (Example)

**Phase 1: Sites (Read-Only)**
- Files: `src/hooks/useSites.ts`, `src/pages/Sites.tsx`
- API: `GET /trpc/sites.list`, `GET /trpc/sites.byId`
- Risk: Low (read-only)
- Rollback: Feature flag

**Phase 2: Units (Read-Only)**
- Files: `src/hooks/useUnits.ts`, `src/pages/UnitDetail.tsx`
- API: `GET /trpc/units.list`, `GET /trpc/units.byId`
- Risk: Low (read-only)

**Phase 3: Sensor Readings (Read-Only)**
- Files: `src/hooks/useReadings.ts`, chart widgets
- API: `GET /trpc/readings.byUnit`, `GET /trpc/readings.timeSeries`
- Risk: Medium (high volume, performance-sensitive)

**Phase 4: Alerts (Read + Write)**
- Files: `src/hooks/useAlerts.ts`, alert components
- API: `GET /trpc/alerts.list`, `POST /trpc/alerts.acknowledge`
- Risk: Medium (critical path)

**Phase 5: Settings & Config**
- Files: `src/hooks/useAlertRules.ts`, settings pages
- API: `POST /trpc/alertRules.upsert`
- Risk: Low (admin features)

---

## Testing & Validation

### Parallel Run Testing

**Strategy:** Run both Supabase and API queries in parallel, compare results.

```typescript
// src/lib/parallelRun.ts
export async function testParallelRun<T>(
  supabaseQuery: () => Promise<T>,
  apiQuery: () => Promise<T>,
  compareFn: (a: T, b: T) => boolean
) {
  const [supabaseResult, apiResult] = await Promise.allSettled([
    supabaseQuery(),
    apiQuery(),
  ]);

  if (supabaseResult.status === 'fulfilled' && apiResult.status === 'fulfilled') {
    const match = compareFn(supabaseResult.value, apiResult.value);

    // Log to analytics/monitoring
    logMetric('api_migration.parallel_run', {
      endpoint: 'sites.list',
      match,
      supabaseLatency: /* ... */,
      apiLatency: /* ... */,
    });

    if (!match) {
      console.error('[Parallel Run] Data mismatch', {
        supabase: supabaseResult.value,
        api: apiResult.value,
      });
    }
  }

  // Return new API result (even in parallel run mode)
  return apiResult.status === 'fulfilled'
    ? apiResult.value
    : supabaseResult.value;
}
```

**Sources:**
- [Zalando Parallel Run Pattern](https://engineering.zalando.com/posts/2021/11/parallel-run.html)
- [Parallel Run Strategy](https://medium.com/@sahayneeta72/parallel-run-strategy-7ff64078d864)

**Benefits:**
- Real-world traffic testing
- Detect data inconsistencies early
- Validate performance parity
- Builds confidence before full rollout

**Considerations:**
- Only for idempotent read operations
- Adds latency (parallel requests)
- Remove after validation

---

### E2E Test Updates

**Before:**
```typescript
// tests/sites.spec.ts
test('should list sites', async () => {
  const sites = await supabase
    .from('sites')
    .select('*')
    .eq('organization_id', testOrgId);
  expect(sites.data).toHaveLength(2);
});
```

**After:**
```typescript
test('should list sites via API', async () => {
  const response = await fetch(`${API_URL}/trpc/sites.list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId: testOrgId }),
  });
  const sites = await response.json();
  expect(sites.result.data).toHaveLength(2);
});
```

**Or with tRPC client:**
```typescript
import { createTRPCClient } from '@trpc/client';

const client = createTRPCClient<AppRouter>({ url: API_URL });

test('should list sites via tRPC client', async () => {
  const sites = await client.sites.list.query({ orgId: testOrgId });
  expect(sites).toHaveLength(2);
});
```

---

### Performance Benchmarks

**Metrics to track:**

| Metric | Target | Monitoring |
|--------|--------|------------|
| API latency (p50) | < 100ms | Prometheus |
| API latency (p95) | < 300ms | Prometheus |
| Error rate | < 0.1% | Sentry |
| Cache hit rate | > 80% | Redis metrics |
| Query key invalidation | No regressions | TanStack Query Devtools |

**Comparison Testing:**
```bash
# Before migration (Supabase)
ab -n 1000 -c 10 https://supabase.example.com/rest/v1/sites

# After migration (Backend API)
ab -n 1000 -c 10 https://api.freshtrack.com/trpc/sites.list
```

---

## Rollback Safety

### Instant Rollback via Feature Flag

```typescript
// Emergency rollback: flip environment variable
VITE_USE_API_FOR_SITES=false
```

**No code deployment needed** — restart frontend service or clear CDN cache.

---

### Gradual Rollout with Percentage

```typescript
// src/lib/featureFlags.ts
export function shouldUseAPI(feature: string, userId: string): boolean {
  const rolloutPercent = parseFloat(import.meta.env[`VITE_${feature}_ROLLOUT`] || '0');
  const userHash = hashCode(userId);
  return (userHash % 100) < rolloutPercent;
}

// Usage
const useAPI = shouldUseAPI('SITES', user.id);
```

**Rollout stages:**
- 0% → Deploy backend, no traffic
- 10% → Canary (monitor closely)
- 50% → Majority traffic
- 100% → Full rollout

---

### Database State Unchanged

**Critical advantage:** Migration doesn't touch database schema or data.

- ✅ PostgreSQL schema stays identical
- ✅ No data migration required
- ✅ Rollback has zero data loss risk
- ✅ Can switch back and forth during testing

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Tasks:**
1. Install tRPC dependencies
   ```bash
   npm install @trpc/server @trpc/client @trpc/react-query
   ```

2. Create tRPC router in backend
   ```typescript
   // backend/src/trpc/router.ts
   import { initTRPC } from '@trpc/server';
   import { z } from 'zod';

   const t = initTRPC.create();
   export const router = t.router;
   export const publicProcedure = t.procedure;
   ```

3. Set up Fastify plugin
   ```typescript
   import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
   await fastify.register(fastifyTRPCPlugin, {
     prefix: '/trpc',
     trpcOptions: { router: appRouter },
   });
   ```

4. Configure frontend tRPC client
   ```typescript
   // src/lib/trpc.ts
   import { createTRPCReact } from '@trpc/react-query';
   import type { AppRouter } from '@backend/trpc/router';
   export const trpc = createTRPCReact<AppRouter>();
   ```

5. Add feature flag system
   ```typescript
   // src/lib/featureFlags.ts
   export const FEATURES = { /* ... */ };
   ```

**Deliverable:** tRPC infrastructure ready, zero frontend usage

---

### Phase 2: Pilot Migration (Week 3)

**Domain:** Organizations (read-only, low risk)

**Tasks:**
1. Create `organizations.list` tRPC procedure
2. Migrate `useOrganizations` hook with feature flag
3. Deploy to staging
4. Enable parallel run testing
5. Enable for 10% production users
6. Monitor metrics for 48 hours
7. Roll out to 100%

**Success Criteria:**
- Zero errors in logs
- Latency p95 < 300ms
- Cache invalidation working

---

### Phase 3: Scale Migration (Week 4-8)

**Migrate domains in order:**
1. Sites (week 4)
2. Areas (week 5)
3. Units (week 5)
4. Sensor Readings (week 6)
5. Alerts (week 7)
6. Settings (week 8)

**Per domain:**
- Backend procedures (1-2 days)
- Frontend hook migration (1 day)
- Testing + parallel run (1-2 days)
- Staged rollout (2-3 days)

---

### Phase 4: Cleanup (Week 9)

**Tasks:**
1. Remove all feature flags
2. Delete Supabase query paths
3. Remove `@supabase/supabase-js` dependency
4. Update documentation
5. Remove parallel run code

**Deliverable:** AUTH-02 resolved ✅

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type mismatch between DB and API | Medium | High | Use Drizzle types for tRPC outputs |
| Performance regression | Low | Medium | Parallel run benchmarks before rollout |
| Breaking existing TanStack Query patterns | Low | High | Use tRPC's `@trpc/react-query` wrapper |
| Feature flag complexity | Medium | Low | Keep flags simple, remove aggressively |
| Long migration calendar time | High | Low | Accept trade-off for reduced risk |

---

## Open Questions

1. **Should we migrate all 100+ files, or can some stay on Supabase?**
   → Recommendation: Migrate all for consistency, but defer low-priority admin features.

2. **Do we need parallel run testing for every domain?**
   → Recommendation: Required for critical paths (alerts, readings), optional for admin features.

3. **What's the rollback SLA?**
   → Recommendation: < 5 minutes via feature flag, < 15 minutes via deployment.

4. **How do we handle authentication in tRPC context?**
   → Use Stack Auth middleware to inject `user` into tRPC context:
   ```typescript
   export const createContext = async ({ req }: FastifyRequest) => {
     const user = req.user; // From auth middleware
     return { user };
   };
   ```

---

## Recommended Next Steps

1. **Decision:** Approve tRPC as migration target (vs REST)
2. **Spike:** 2-day tRPC proof-of-concept with one hook
3. **Plan:** Break migration into 8-week roadmap
4. **Execute:** Start with Phase 1 (foundation)

---

## Sources

### tRPC Documentation
- [tRPC Official Docs](https://trpc.io/docs)
- [Adding tRPC to Existing Project](https://trpc.io/docs/getting-started)
- [tRPC React Query Integration](https://trpc.io/docs/client/react/infer-types)
- [tRPC Fastify Adapter](https://trpc.io/docs/server/adapters/fastify)

### Migration Patterns
- [AWS Strangler Fig Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html)
- [Azure Strangler Fig Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig)
- [Microservices.io Strangler Application](https://microservices.io/patterns/refactoring/strangler-application.html)
- [Zalando Parallel Run Pattern](https://engineering.zalando.com/posts/2021/11/parallel-run.html)
- [Martin Fowler: Parallel Change](https://martinfowler.com/bliki/ParallelChange.html)
- [Legacy Modernization: Parallel Run](https://legacy-modernization.io/patterns/migration/parallel-run/)

### API Design Comparisons
- [REST vs GraphQL vs tRPC Guide 2026](https://dev.to/dataformathub/rest-vs-graphql-vs-trpc-the-ultimate-api-design-guide-for-2026-8n3)
- [Building Type-Safe APIs with tRPC (2026)](https://dev.to/eva_clari_289d85ecc68da48/building-type-safe-apis-with-trpc-a-practical-migration-guide-from-rest-3l4j)
- [tRPC vs REST Analysis](https://www.wisp.blog/blog/when-to-choose-rest-over-trpc-a-comparative-analysis)
- [From REST to tRPC: Type-Safe APIs](https://betterstack.com/community/guides/scaling-nodejs/trpc-explained/)
- [SD Times: tRPC vs GraphQL vs REST](https://sdtimes.com/graphql/trpc-vs-graphql-vs-rest-choosing-the-right-api-design-for-modern-web-applications/)

### TanStack Query
- [TanStack Query v5 Official Docs](https://tanstack.com/query/v5/docs)
- [TanStack Query Migration Guide](https://tanstack.com/query/v5/docs/framework/react/guides/migrating-to-v5)
- [TanStack Query Default Query Function](https://tanstack.com/query/v5/docs/framework/react/guides/default-query-function)

### Testing Strategies
- [Parallel Run Strategy (Medium)](https://medium.com/@sahayneeta72/parallel-run-strategy-7ff64078d864)
- [Zero-Downtime Migration Strategies](https://umatechnology.org/zero-downtime-migration-strategies-for-global-api-endpoints-trusted-by-devops-teams/)
- [Resilient REST APIs: Parallel Change](https://artificial.io/company/blog/resilient-rest-apis-the-case-for-parallel-change/)

---

**Research Status:** ✅ COMPLETE
**Confidence Level:** HIGH
**Recommended Action:** Proceed with tRPC + Strangler Fig migration strategy
**Estimated Timeline:** 8-9 weeks for full migration
