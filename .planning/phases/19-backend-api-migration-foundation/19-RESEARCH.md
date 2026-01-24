# Phase 19: Backend API Migration - Foundation - Research

**Researched:** 2026-01-24
**Domain:** tRPC infrastructure, Fastify integration, TanStack Query migration
**Confidence:** HIGH

## Summary

This research investigated the tRPC ecosystem for migrating the FreshTrack backend from REST to tRPC, focusing on Fastify integration, React Query compatibility, and authentication patterns. The project uses Fastify 5, TanStack Query 5, Zod validation, and an existing auth middleware stack that can be adapted for tRPC.

The standard approach is to use tRPC v11 with the official Fastify adapter (`@trpc/server/adapters/fastify`), domain-based router organization matching the existing REST structure, and the new `@trpc/tanstack-react-query` integration that works natively with existing TanStack Query setup. The project's existing Zod schemas in `backend/src/schemas/` can be directly reused for tRPC input validation.

Key findings: (1) tRPC v11.8.1 is the current stable version requiring TypeScript 5.7+, (2) the new TanStack React Query integration is recommended over the classic `@trpc/react-query` for new projects, (3) existing Fastify middleware patterns map cleanly to tRPC's middleware/context system, and (4) Zod version mismatch between frontend (v3) and backend (v4) requires type inference via `z.infer<>` rather than direct schema sharing.

**Primary recommendation:** Install `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query` on frontend; use Fastify adapter with domain-based routers; create `protectedProcedure` middleware reusing existing auth logic.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @trpc/server | ^11.8.1 | Backend tRPC router/procedures | Official tRPC server package, Fastify adapter included |
| @trpc/client | ^11.8.1 | Frontend tRPC client | Official client for type-safe API calls |
| @trpc/tanstack-react-query | ^11.8.1 | React Query integration | New native integration, replaces classic @trpc/react-query |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 (backend) | Input validation | Already installed, reuse existing schemas |
| @tanstack/react-query | ^5.83.0 | Query state management | Already installed on frontend |
| @fastify/websocket | ^11.x | WebSocket support | If subscriptions needed (not in Phase 19 scope) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @trpc/tanstack-react-query | @trpc/react-query (classic) | Classic is stable but won't receive new features; new integration is TanStack Query-native |
| Domain routers | Flat merged router | Domain routers match existing REST structure, better for large codebases |

**Installation:**
```bash
# Backend
cd backend && npm install @trpc/server@^11.8.1

# Frontend
npm install @trpc/client@^11.8.1 @trpc/tanstack-react-query@^11.8.1
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── trpc/                    # tRPC infrastructure
│   ├── index.ts            # t instance, base procedures
│   ├── context.ts          # createContext function
│   ├── router.ts           # appRouter (merges domain routers)
│   └── procedures.ts       # protectedProcedure, orgProcedure
├── routers/                 # Domain routers (parallel to routes/)
│   ├── organizations.router.ts
│   ├── sites.router.ts
│   └── ...
├── routes/                  # Existing REST routes (kept during migration)
└── schemas/                 # Existing Zod schemas (reused)

frontend/src/
├── lib/
│   ├── trpc.ts             # tRPC client setup, hooks export
│   └── api/                # Existing Ky-based API (deprecated after migration)
└── hooks/                  # Migrate to use tRPC procedures
```

### Pattern 1: Fastify Plugin Registration
**What:** Register tRPC as a Fastify plugin alongside existing REST routes
**When to use:** During migration phase, allows both REST and tRPC to coexist
**Example:**
```typescript
// Source: https://trpc.io/docs/server/adapters/fastify
import { fastifyTRPCPlugin, FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createContext } from './trpc/context.js';
import { appRouter, type AppRouter } from './trpc/router.js';

// In buildApp():
app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      app.log.error({ path, error: error.message }, 'tRPC error');
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});
```

### Pattern 2: Protected Procedure with Auth Context
**What:** Reusable procedure that enforces authentication and provides typed user context
**When to use:** All procedures requiring authentication (most of them)
**Example:**
```typescript
// Source: https://trpc.io/docs/server/authorization
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: { user: opts.ctx.user }, // Type narrows to non-null
  });
});

export const orgProcedure = protectedProcedure.use(async (opts) => {
  if (!opts.ctx.user.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization context required' });
  }
  return opts.next({
    ctx: {
      user: opts.ctx.user,
      organizationId: opts.ctx.user.organizationId,
    },
  });
});
```

### Pattern 3: Domain Router Organization
**What:** Group procedures by domain (organizations, sites, units) matching existing REST structure
**When to use:** All routers - maintains consistency with current API design
**Example:**
```typescript
// Source: https://trpc.io/docs/server/merging-routers
// backend/src/routers/organizations.router.ts
import { z } from 'zod';
import { orgProcedure, protectedProcedure } from '../trpc/procedures.js';
import { router } from '../trpc/index.js';
import { OrganizationSchema, UpdateOrganizationSchema } from '../schemas/organizations.js';
import * as orgService from '../services/organization.service.js';

export const organizationsRouter = router({
  get: orgProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .output(OrganizationSchema)
    .query(async ({ ctx, input }) => {
      const org = await orgService.getOrganization(input.organizationId);
      if (!org) throw new TRPCError({ code: 'NOT_FOUND' });
      return org;
    }),

  update: orgProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      data: UpdateOrganizationSchema,
    }))
    .output(OrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check (requireRole equivalent)
      if (ctx.user.role !== 'owner') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return orgService.updateOrganization(input.organizationId, input.data);
    }),

  listMembers: orgProcedure
    .input(z.object({ organizationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return orgService.listMembers(input.organizationId);
    }),
});
```

### Pattern 4: Frontend TanStack React Query Integration (New Style)
**What:** Use new @trpc/tanstack-react-query with createTRPCContext
**When to use:** All frontend tRPC usage
**Example:**
```typescript
// Source: https://trpc.io/docs/client/tanstack-react-query/setup
// frontend/src/lib/trpc.ts
import { createTRPCContext, createTRPCClient, httpBatchLink } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../backend/src/trpc/router';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export function createTRPCClientInstance(getAccessToken: () => Promise<string>) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${import.meta.env.VITE_API_URL}/trpc`,
        async headers() {
          const token = await getAccessToken();
          return { 'x-stack-access-token': token };
        },
      }),
    ],
  });
}
```

### Anti-Patterns to Avoid
- **Calling procedures from procedures:** Use `createCallerFactory` only for testing, not runtime - it re-executes context/middleware unnecessarily
- **Mixing Zod versions in shared schemas:** Backend uses Zod 4, frontend Zod 3 - use `z.infer<typeof Schema>` for type sharing, not schema sharing
- **Large monolithic routers:** Split by domain to avoid TypeScript performance issues at scale
- **Skipping output validation:** Use `.output()` for runtime validation of service return values
- **Not setting maxParamLength:** Large batch requests fail without `routerOptions: { maxParamLength: 5000 }`

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type-safe API calls | Custom fetch wrappers with manual types | tRPC client | End-to-end type safety, automatic inference |
| Input validation | Manual type guards | Zod schemas with `.input()` | Compile-time + runtime validation |
| Auth middleware | Per-procedure auth checks | `protectedProcedure` middleware | DRY, consistent, type-safe context narrowing |
| Query key management | Manual string keys | tRPC's automatic query keys | Prevents key mismatches, auto-invalidation |
| Error responses | Custom error formats | TRPCError codes | Standardized HTTP mapping, typed on client |
| Batch requests | Multiple individual requests | httpBatchLink | Built-in request batching |

**Key insight:** tRPC provides the entire type-safe data layer - don't rebuild any part of it manually. The value is in the integrated system, not individual pieces.

## Common Pitfalls

### Pitfall 1: Zod Version Mismatch
**What goes wrong:** Importing Zod schemas directly from backend to frontend fails due to v3/v4 incompatibility
**Why it happens:** Project evolved with different Zod versions (backend v4, frontend v3)
**How to avoid:** Share types via `z.infer<>`, not schema objects. Export types from a shared location.
**Warning signs:** "Cannot find module" or type inference failures when importing schemas

### Pitfall 2: Context Not Available in Tests
**What goes wrong:** Tests fail with "Cannot read property of undefined" on ctx.user
**Why it happens:** Test setup doesn't provide proper context to createCallerFactory
**How to avoid:** Create test utilities that properly mock context matching auth middleware behavior
**Warning signs:** Tests pass individually but fail in suite, or auth-related tests all fail
```typescript
// Test helper pattern
const createTestCaller = (userOverrides?: Partial<AuthUser>) => {
  const ctx = {
    user: { id: 'test-user', organizationId: 'test-org', role: 'owner', ...userOverrides },
    req: {} as FastifyRequest,
    res: {} as FastifyReply,
  };
  return createCallerFactory(appRouter)(ctx);
};
```

### Pitfall 3: Missing maxParamLength Configuration
**What goes wrong:** Large batch requests fail with Fastify parameter length errors
**Why it happens:** Default Fastify maxParamLength is 100, tRPC batches encode in URL
**How to avoid:** Set `routerOptions: { maxParamLength: 5000 }` in Fastify config
**Warning signs:** Batch requests with many procedures fail; single requests work fine

### Pitfall 4: Forgetting to Export AppRouter Type
**What goes wrong:** Frontend has no type information, procedures show as `any`
**Why it happens:** AppRouter type not exported or import path wrong
**How to avoid:** Export `export type AppRouter = typeof appRouter;` and use `import type` on frontend
**Warning signs:** No autocomplete on `trpc.organizations.get`, no type errors on wrong inputs

### Pitfall 5: Mixing REST and tRPC Auth Patterns
**What goes wrong:** Inconsistent auth behavior between REST and tRPC routes
**Why it happens:** Different auth implementations instead of shared logic
**How to avoid:** Extract auth verification to shared utility, use in both REST middleware and tRPC context
**Warning signs:** Auth works on REST but not tRPC, or vice versa; token handling differs

## Code Examples

Verified patterns from official sources:

### Context Creation (Fastify Adapter)
```typescript
// Source: https://trpc.io/docs/server/adapters/fastify
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import type { AuthUser } from '../types/auth.js';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  // Extract token - same logic as existing requireAuth middleware
  const token = req.headers['x-stack-access-token'] as string | undefined
    ?? req.headers.authorization?.slice(7);

  let user: AuthUser | null = null;

  if (token) {
    try {
      const { payload, userId } = await verifyAccessToken(token);
      user = {
        id: userId,
        email: payload.email,
        name: payload.name,
        // organizationId and role populated by orgProcedure middleware
      };
    } catch {
      // Invalid token - user remains null, protectedProcedure will reject
    }
  }

  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

### App Router Composition
```typescript
// Source: https://trpc.io/docs/server/merging-routers
import { router } from './index.js';
import { organizationsRouter } from '../routers/organizations.router.js';

export const appRouter = router({
  organizations: organizationsRouter,
  // Future phases add:
  // sites: sitesRouter,
  // areas: areasRouter,
  // units: unitsRouter,
});

export type AppRouter = typeof appRouter;
```

### Frontend Provider Setup
```typescript
// Source: https://trpc.io/docs/client/tanstack-react-query/setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TRPCProvider, createTRPCClientInstance } from '@/lib/trpc';
import { useUser } from '@stackframe/react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000 },
  },
});

function App() {
  const user = useUser();

  const trpcClient = useMemo(() => {
    return createTRPCClientInstance(async () => {
      const authJson = await user?.getAuthJson();
      return authJson?.accessToken ?? '';
    });
  }, [user]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AppRoutes />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### Testing with createCallerFactory
```typescript
// Source: https://trpc.io/docs/v10/server/server-side-calls
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '../trpc/index.js';
import { appRouter } from '../trpc/router.js';

const createCaller = createCallerFactory(appRouter);

describe('Organizations Router', () => {
  const mockContext = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      organizationId: 'org-456',
      role: 'owner' as const,
    },
    req: {} as any,
    res: {} as any,
  };

  it('should get organization', async () => {
    const caller = createCaller(mockContext);
    const result = await caller.organizations.get({ organizationId: 'org-456' });
    expect(result.id).toBe('org-456');
  });

  it('should reject unauthorized user', async () => {
    const caller = createCaller({ ...mockContext, user: null });
    await expect(
      caller.organizations.get({ organizationId: 'org-456' })
    ).rejects.toThrow('UNAUTHORIZED');
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @trpc/react-query (classic) | @trpc/tanstack-react-query | Feb 2025 | Native TanStack Query integration, better DX |
| Wrapped useQuery/useMutation | queryOptions/mutationOptions factories | Feb 2025 | Simpler, follows TanStack Query patterns |
| router.createCaller() | t.createCallerFactory(router) | v11 | Deprecated method removed |
| TypeScript 5.0+ | TypeScript 5.7.2+ | v11 | Required for tRPC v11 |

**Deprecated/outdated:**
- `@trpc/react-query`: Still maintained but stable/no new features; use `@trpc/tanstack-react-query` for new projects
- `router.createCaller()`: Deprecated; use `t.createCallerFactory(router)` instead
- Wrapping useQuery: The new integration uses factories (`.queryOptions()`) instead of custom hooks

## Open Questions

Things that couldn't be fully resolved:

1. **Zod Schema Sharing Strategy**
   - What we know: Backend uses Zod 4, frontend uses Zod 3; direct schema imports won't work
   - What's unclear: Whether to upgrade frontend to Zod 4 or use type inference only
   - Recommendation: Use `z.infer<typeof Schema>` for type sharing; defer Zod upgrade to future phase

2. **REST Endpoint Retention Timeline**
   - What we know: Context says "big bang cutover" but doesn't specify when to remove REST
   - What's unclear: Whether REST routes should be removed in Phase 19 or after Phase 21
   - Recommendation: Keep REST routes during Phase 19; remove after all domains migrated (Phase 21)

3. **Error Formatting Customization**
   - What we know: tRPC has error formatting via `errorFormatter` in t.create()
   - What's unclear: Whether to match existing REST error shape or use tRPC defaults
   - Recommendation: Start with tRPC defaults; customize only if frontend needs existing error shape

## Sources

### Primary (HIGH confidence)
- [tRPC Fastify Adapter](https://trpc.io/docs/server/adapters/fastify) - Plugin setup, context creation, WebSocket support
- [tRPC TanStack React Query Setup](https://trpc.io/docs/client/tanstack-react-query/setup) - New integration pattern
- [tRPC Authorization](https://trpc.io/docs/server/authorization) - Protected procedures, middleware
- [tRPC Error Handling](https://trpc.io/docs/server/error-handling) - Error codes, HTTP mapping
- [tRPC Merging Routers](https://trpc.io/docs/server/merging-routers) - Domain router organization
- [tRPC Server-Side Calls](https://trpc.io/docs/v10/server/server-side-calls) - createCallerFactory for testing

### Secondary (MEDIUM confidence)
- [GitHub tRPC Releases](https://github.com/trpc/trpc/releases) - Version info (v11.8.1 current)
- [tRPC Blog: Introducing TanStack React Query Integration](https://trpc.io/blog/introducing-tanstack-react-query-client) - Migration rationale

### Tertiary (LOW confidence)
- [DEV.to: Mastering tRPC with React Server Components 2026](https://dev.to/christadrian/mastering-trpc-with-react-server-components-the-definitive-2026-guide-1i2e) - Community patterns
- [Better Stack: From REST to tRPC](https://betterstack.com/community/guides/scaling-nodejs/trpc-explained/) - Migration guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official tRPC documentation verified all packages and versions
- Architecture: HIGH - Patterns from official docs, verified against existing codebase structure
- Pitfalls: HIGH - Documented in official sources + verified Zod version mismatch in project

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - tRPC ecosystem is stable, v11 mature)
