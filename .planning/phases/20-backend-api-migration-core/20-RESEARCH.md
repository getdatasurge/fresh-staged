# Phase 20: Backend API Migration - Core - Research

**Researched:** 2026-01-24
**Domain:** tRPC router migration, REST-to-tRPC conversion, domain API patterns
**Confidence:** HIGH

## Summary

This research investigated migrating four core domains (sites, units, readings, alerts) from REST endpoints to tRPC procedures, following the patterns established in Phase 19's organizations router. The project has existing REST routes using Fastify with Zod validation, service layer logic that can be reused directly, and a frontend using Ky HTTP client for API calls.

The migration approach is straightforward: create tRPC routers that call the same service layer methods as existing REST routes, maintain identical input/output schemas, and replace frontend API client calls with tRPC hooks. Phase 19 established all necessary infrastructure (context, middleware, procedures, client setup), so this phase focuses purely on domain router creation and frontend migration.

Key findings: (1) All four domains follow identical CRUD patterns with org-scoped access control, (2) Existing Zod schemas in `backend/src/schemas/` can be reused directly for tRPC procedures, (3) Service layer is already decoupled from HTTP layer, making router creation mechanical, (4) Frontend currently uses typed API wrappers in `src/lib/api/` that need migration to tRPC hooks, and (5) Phase 19's organizations router provides a complete template to follow.

**Primary recommendation:** Create domain routers following organizations.router.ts pattern, reuse existing service methods and Zod schemas, migrate frontend to direct useTRPC() hook usage (not wrapper pattern), test with createCallerFactory like organizations.router.test.ts.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library                    | Version | Purpose                        | Why Standard                                   |
| -------------------------- | ------- | ------------------------------ | ---------------------------------------------- |
| @trpc/server               | ^11.8.1 | Backend tRPC router/procedures | Already installed in Phase 19, proven pattern  |
| @trpc/client               | ^11.8.1 | Frontend tRPC client           | Already installed in Phase 19, type-safe calls |
| @trpc/tanstack-react-query | ^11.8.1 | React Query integration        | Already installed in Phase 19, hook-based API  |

### Supporting

| Library                   | Version          | Purpose                 | When to Use                                       |
| ------------------------- | ---------------- | ----------------------- | ------------------------------------------------- |
| zod                       | ^4.3.6 (backend) | Input/output validation | Reuse existing schemas from backend/src/schemas/  |
| Drizzle ORM               | Current          | Database layer          | Service layer uses Drizzle, routers call services |
| Fastify Type Provider Zod | Current          | REST route typing       | Keep existing REST routes during migration        |

### Alternatives Considered

| Instead of          | Could Use               | Tradeoff                                                           |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| Direct tRPC hooks   | API wrapper pattern     | Phase 19 deprecated wrapper pattern - direct hooks are preferred   |
| Service layer reuse | Inline database queries | Services already tested and validated, no reason to duplicate      |
| Cold cutover        | Parallel run            | Context specifies cold cutover - no parallel run complexity needed |

**Installation:**

```bash
# No new packages needed - Phase 19 installed all dependencies
# Verify versions:
cd backend && npm list @trpc/server
cd ../frontend && npm list @trpc/client @trpc/tanstack-react-query
```

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── trpc/                    # tRPC infrastructure (from Phase 19)
│   ├── index.ts            # t instance, base procedures
│   ├── context.ts          # createContext function
│   ├── router.ts           # appRouter (ADD new domain routers here)
│   └── procedures.ts       # protectedProcedure, orgProcedure
├── routers/                 # Domain routers
│   ├── organizations.router.ts  # Phase 19 template
│   ├── sites.router.ts          # CREATE in Phase 20
│   ├── units.router.ts          # CREATE in Phase 20
│   ├── readings.router.ts       # CREATE in Phase 20
│   └── alerts.router.ts         # CREATE in Phase 20
├── routes/                  # Existing REST routes (KEEP during Phase 20)
│   ├── sites.ts            # Keep until Phase 21
│   ├── units.ts            # Keep until Phase 21
│   ├── readings.ts         # Keep until Phase 21
│   └── alerts.ts           # Keep until Phase 21
└── services/                # Service layer (REUSE unchanged)

frontend/src/
├── lib/
│   ├── trpc.ts             # tRPC client (from Phase 19)
│   └── api/                # API client wrappers
│       ├── organizations.ts     # Phase 19 deprecated pattern
│       ├── sites.ts             # MIGRATE to direct tRPC hooks
│       ├── units.ts             # MIGRATE to direct tRPC hooks
│       ├── readings.ts          # MIGRATE to direct tRPC hooks
│       └── alerts.ts            # MIGRATE to direct tRPC hooks
└── hooks/                  # Custom hooks (UPDATE to use tRPC)
```

### Pattern 1: Domain Router Creation (Sites Example)

**What:** Create tRPC router that mirrors existing REST endpoints
**When to use:** All four domain routers (sites, units, readings, alerts)
**Example:**

```typescript
// backend/src/routers/sites.router.ts
// Based on: backend/src/routers/organizations.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as siteService from '../services/site.service.js';
import {
  SiteSchema,
  SitesListSchema,
  CreateSiteSchema,
  UpdateSiteSchema,
} from '../schemas/sites.js';

// Input requires organizationId for orgProcedure middleware
const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

const SiteInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
});

const CreateSiteInput = z.object({
  organizationId: z.string().uuid(),
  data: CreateSiteSchema,
});

const UpdateSiteInput = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid(),
  data: UpdateSiteSchema,
});

export const sitesRouter = router({
  // GET /api/orgs/:orgId/sites → sites.list
  list: orgProcedure
    .input(OrgInput)
    .output(SitesListSchema)
    .query(async ({ ctx }) => {
      return siteService.listSites(ctx.user.organizationId);
    }),

  // GET /api/orgs/:orgId/sites/:siteId → sites.get
  get: orgProcedure
    .input(SiteInput)
    .output(SiteSchema)
    .query(async ({ ctx, input }) => {
      const site = await siteService.getSite(input.siteId, ctx.user.organizationId);
      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }
      return site;
    }),

  // POST /api/orgs/:orgId/sites → sites.create
  create: orgProcedure
    .input(CreateSiteInput)
    .output(SiteSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check from REST route: requireRole('admin')
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin role required to create sites',
        });
      }
      return siteService.createSite(ctx.user.organizationId, input.data);
    }),

  // PUT /api/orgs/:orgId/sites/:siteId → sites.update
  update: orgProcedure
    .input(UpdateSiteInput)
    .output(SiteSchema)
    .mutation(async ({ ctx, input }) => {
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin role required to update sites',
        });
      }
      const site = await siteService.updateSite(input.siteId, ctx.user.organizationId, input.data);
      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }
      return site;
    }),

  // DELETE /api/orgs/:orgId/sites/:siteId → sites.delete
  delete: orgProcedure
    .input(SiteInput)
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      if (!['admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin role required to delete sites',
        });
      }
      const site = await siteService.deleteSite(input.siteId, ctx.user.organizationId);
      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }
    }),
});
```

### Pattern 2: Router Registration in App Router

**What:** Add domain routers to appRouter in trpc/router.ts
**When to use:** After creating each domain router
**Example:**

```typescript
// backend/src/trpc/router.ts
import { router, publicProcedure } from './index.js';
import { organizationsRouter } from '../routers/organizations.router.js';
import { sitesRouter } from '../routers/sites.router.js';
import { unitsRouter } from '../routers/units.router.js';
import { readingsRouter } from '../routers/readings.router.js';
import { alertsRouter } from '../routers/alerts.router.js';

export const appRouter = router({
  health: publicProcedure
    .output(z.object({ status: z.string(), timestamp: z.string() }))
    .query(() => ({ status: 'ok', timestamp: new Date().toISOString() })),

  organizations: organizationsRouter,
  sites: sitesRouter, // ADD
  units: unitsRouter, // ADD
  readings: readingsRouter, // ADD
  alerts: alertsRouter, // ADD
});

export type AppRouter = typeof appRouter;
```

### Pattern 3: Frontend Direct tRPC Hook Usage

**What:** Replace API wrapper calls with direct tRPC hooks in components
**When to use:** All component migrations (do NOT create new wrapper functions)
**Example:**

```typescript
// BEFORE (REST API wrapper):
import { sitesApi } from '@/lib/api/sites';
import { useUser } from '@stackframe/react';
import { useQuery } from '@tanstack/react-query';

function SitesList() {
  const user = useUser();
  const orgId = user?.selectedOrganization?.id;

  const { data: sites } = useQuery({
    queryKey: ['sites', orgId],
    queryFn: async () => {
      const token = await user?.getAuthJson().then((j) => j.accessToken);
      return sitesApi.listSites(orgId, token);
    },
    enabled: !!orgId && !!user,
  });
  // ...
}

// AFTER (tRPC direct hook):
import { useTRPC } from '@/lib/trpc';
import { useUser } from '@stackframe/react';

function SitesList() {
  const trpc = useTRPC();
  const user = useUser();
  const orgId = user?.selectedOrganization?.id;

  const { data: sites } = trpc.sites.list.useQuery(
    { organizationId: orgId! },
    { enabled: !!orgId },
  );
  // ...
}
```

### Pattern 4: Nested Resource Routing (Units Example)

**What:** Handle deeply nested resources (units under areas under sites) in tRPC
**When to use:** Units domain which has nested REST path but flat tRPC namespace
**Example:**

```typescript
// REST: GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units
// tRPC: units.list({ organizationId, areaId })

export const unitsRouter = router({
  list: orgProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        areaId: z.string().uuid(),
        // Note: siteId validation happens in service layer via hierarchy check
      }),
    )
    .output(UnitsListSchema)
    .query(async ({ ctx, input }) => {
      // Service validates area belongs to org via site hierarchy
      const units = await unitService.listUnits(
        input.areaId,
        undefined, // siteId not needed - service validates via hierarchy
        ctx.user.organizationId,
      );
      if (units === null) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Area not found',
        });
      }
      return units;
    }),

  // Frontend usage:
  // const { data: units } = trpc.units.list.useQuery({
  //   organizationId: orgId,
  //   areaId: areaId
  // });
});
```

### Pattern 5: Query Parameters and Filters (Alerts/Readings Example)

**What:** Convert REST query params to tRPC input schemas
**When to use:** Alerts (status filters) and Readings (pagination, date range)
**Example:**

```typescript
// REST: GET /api/orgs/:orgId/alerts?status=pending&unitId=xyz&page=1&limit=50
// tRPC: alerts.list({ organizationId, status: 'pending', unitId: 'xyz', page: 1, limit: 50 })

const AlertListInput = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(['pending', 'acknowledged', 'resolved']).optional(),
  unitId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const alertsRouter = router({
  list: orgProcedure
    .input(AlertListInput)
    .output(AlertsListSchema)
    .query(async ({ ctx, input }) => {
      const { organizationId, ...filters } = input;
      return alertService.listAlerts(ctx.user.organizationId, filters);
    }),

  // Frontend usage:
  // const { data: alerts } = trpc.alerts.list.useQuery({
  //   organizationId: orgId,
  //   status: 'pending',
  //   page: 1,
  //   limit: 50
  // });
});
```

### Pattern 6: Test Migration Pattern

**What:** Convert existing REST endpoint tests to tRPC router tests
**When to use:** All domain router testing
**Example:**

```typescript
// Based on: backend/tests/trpc/organizations.router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { sitesRouter } from '../../src/routers/sites.router.js';
import { createCallerFactory } from '../../src/trpc/index.js';

// Mock services
vi.mock('../../src/services/user.service.ts', () => ({
  getUserRoleInOrg: vi.fn(),
  getOrCreateProfile: vi.fn(),
}));

vi.mock('../../src/services/site.service.js', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}));

describe('Sites tRPC Router', () => {
  const createCaller = createCallerFactory(sitesRouter);

  const createTestContext = (role: string = 'admin') => ({
    req: {} as any,
    res: {} as any,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Setup middleware mocks
    const userService = await import('../../src/services/user.service.js');
    userService.getUserRoleInOrg.mockResolvedValue('admin');
    userService.getOrCreateProfile.mockResolvedValue({ id: 'profile-789' });
  });

  it('should list sites for organization', async () => {
    const siteService = await import('../../src/services/site.service.js');
    siteService.listSites.mockResolvedValue([{ id: 'site-1', name: 'Site 1' /* ... */ }]);

    const caller = createCaller(createTestContext());
    const result = await caller.list({ organizationId: 'org-123' });

    expect(result).toHaveLength(1);
    expect(siteService.listSites).toHaveBeenCalledWith('org-123');
  });

  it('should throw FORBIDDEN when non-admin tries to create site', async () => {
    const userService = await import('../../src/services/user.service.js');
    userService.getUserRoleInOrg.mockResolvedValue('staff');

    const caller = createCaller(createTestContext('staff'));

    await expect(
      caller.create({
        organizationId: 'org-123',
        data: { name: 'New Site', timezone: 'UTC' },
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin role required to create sites',
    });
  });
});
```

### Anti-Patterns to Avoid

- **Creating API wrapper functions:** Phase 19 deprecated this pattern - use direct tRPC hooks
- **Duplicating service logic in routers:** Routers call services, don't reimplement logic
- **Forgetting organizationId in input:** orgProcedure middleware requires it
- **Not checking null service returns:** Service layer returns null for not found, must throw TRPCError
- **Removing REST routes prematurely:** Keep until Phase 21 confirms full migration
- **Inconsistent role checks:** Match existing REST route requirements exactly
- **Testing against live API:** Use createCallerFactory for unit tests, not HTTP calls

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                    | Don't Build                | Use Instead                                    | Why                                                            |
| -------------------------- | -------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| API wrapper layer          | New API client abstraction | Direct useTRPC() hooks                         | Phase 19 deprecated wrapper pattern, direct hooks are standard |
| Input validation           | Custom validators          | Existing Zod schemas from backend/src/schemas/ | Already validated in REST routes, reuse                        |
| Service layer changes      | New database queries       | Existing service methods                       | Services are tested and working, no changes needed             |
| Role checking              | Custom auth logic          | Copy from existing REST routes                 | REST routes have correct role requirements                     |
| Query key management       | Manual cache keys          | tRPC automatic keys                            | tRPC generates optimal cache keys                              |
| Error handling             | Custom error types         | TRPCError codes                                | Standard codes map to HTTP status correctly                    |
| Nested resource validation | Complex input schemas      | Service layer hierarchy checks                 | Services already validate site→area→unit hierarchy             |

**Key insight:** This phase is primarily plumbing work - connect existing services to tRPC procedures using patterns from Phase 19. Don't rebuild, reuse.

## Common Pitfalls

### Pitfall 1: Inconsistent Role Requirements

**What goes wrong:** tRPC procedure allows operation that REST route blocked, or vice versa
**Why it happens:** Copying wrong role check or forgetting to check at all
**How to avoid:**

1. For each procedure, find equivalent REST route in backend/src/routes/
2. Copy exact role requirements from requireRole() middleware
3. Map: requireRole('admin') → check for ['admin', 'owner'].includes(ctx.user.role)
4. Map: requireRole('manager') → check for ['manager', 'admin', 'owner'].includes(ctx.user.role)
5. Map: requireRole('staff') → check for ['staff', 'manager', 'admin', 'owner'].includes(ctx.user.role)
   **Warning signs:** Security tests fail, users can perform operations they shouldn't

### Pitfall 2: Forgetting to Handle Service null Returns

**What goes wrong:** Procedure returns null instead of throwing NOT_FOUND error
**Why it happens:** Service layer returns null for not found, REST routes use notFound() helper
**How to avoid:**

```typescript
// Service returns: Promise<Site | null>
const site = await siteService.getSite(input.siteId, ctx.user.organizationId);
if (!site) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });
}
return site;
```

**Warning signs:** Frontend receives null instead of error, error handling breaks

### Pitfall 3: Missing organizationId in Input Schema

**What goes wrong:** orgProcedure middleware throws BAD_REQUEST "organizationId is required"
**Why it happens:** Input schema doesn't include organizationId field
**How to avoid:** ALL procedures using orgProcedure must have organizationId in input:

```typescript
// WRONG:
.input(z.object({ siteId: z.string().uuid() }))

// RIGHT:
.input(z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid()
}))
```

**Warning signs:** Runtime error on first procedure call, middleware validation fails

### Pitfall 4: Not Updating Frontend Import Paths

**What goes wrong:** Components still import from old API wrappers instead of using tRPC
**Why it happens:** Search/replace misses some files, or developer adds wrapper functions
**How to avoid:**

1. Grep for `from '@/lib/api/sites'` after migration
2. Replace all with `from '@/lib/trpc'` and use useTRPC()
3. Don't create new wrapper functions - Phase 19 established direct hook pattern
   **Warning signs:** TypeScript errors about missing exports, runtime errors about undefined functions

### Pitfall 5: Deleting Service Layer Methods

**What goes wrong:** Router tries to call service method that was removed
**Why it happens:** Misunderstanding phase scope - services stay unchanged
**How to avoid:** Phase 20 is router creation only - zero changes to:

- backend/src/services/\*.service.ts
- backend/src/db/
- backend/src/schemas/ (except exports if needed)
  **Warning signs:** Build errors about missing service methods

### Pitfall 6: Breaking Existing REST Routes

**What goes wrong:** REST endpoints stop working during migration
**Why it happens:** Accidentally modifying service signatures or breaking imports
**How to avoid:**

1. Keep backend/src/routes/ completely unchanged
2. Run existing REST endpoint tests after each router creation
3. Both REST and tRPC should work simultaneously
   **Warning signs:** Existing API calls fail, integration tests break

## Code Examples

Verified patterns from Phase 19 and existing codebase:

### Complete Domain Router (Alerts Example)

```typescript
// backend/src/routers/alerts.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as alertService from '../services/alert.service.js';
import {
  AlertSchema,
  AlertsListSchema,
  AlertAcknowledgeSchema,
  AlertResolveSchema,
} from '../schemas/alerts.js';

const OrgInput = z.object({
  organizationId: z.string().uuid(),
});

const AlertInput = z.object({
  organizationId: z.string().uuid(),
  alertId: z.string().uuid(),
});

const AlertListInput = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(['pending', 'acknowledged', 'resolved']).optional(),
  unitId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const AlertAcknowledgeInput = z.object({
  organizationId: z.string().uuid(),
  alertId: z.string().uuid(),
  notes: z.string().optional(),
});

const AlertResolveInput = z.object({
  organizationId: z.string().uuid(),
  alertId: z.string().uuid(),
  resolution: z.string(),
  correctiveAction: z.string().optional(),
});

export const alertsRouter = router({
  // GET /api/orgs/:orgId/alerts
  list: orgProcedure
    .input(AlertListInput)
    .output(AlertsListSchema)
    .query(async ({ ctx, input }) => {
      const { organizationId, ...filters } = input;
      return alertService.listAlerts(ctx.user.organizationId, filters);
    }),

  // GET /api/orgs/:orgId/alerts/:alertId
  get: orgProcedure
    .input(AlertInput)
    .output(AlertSchema)
    .query(async ({ ctx, input }) => {
      const alert = await alertService.getAlert(input.alertId, ctx.user.organizationId);
      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }
      return alert;
    }),

  // POST /api/orgs/:orgId/alerts/:alertId/acknowledge
  acknowledge: orgProcedure
    .input(AlertAcknowledgeInput)
    .output(AlertSchema)
    .mutation(async ({ ctx, input }) => {
      // Role check from REST: requireRole('staff')
      if (!['staff', 'manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Staff role required to acknowledge alerts',
        });
      }

      const result = await alertService.acknowledgeAlert(
        input.alertId,
        ctx.user.organizationId,
        ctx.user.profileId,
        input.notes,
      );

      if (result === null) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      if (result === 'already_acknowledged') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Alert is already acknowledged',
        });
      }

      return result;
    }),

  // POST /api/orgs/:orgId/alerts/:alertId/resolve
  resolve: orgProcedure
    .input(AlertResolveInput)
    .output(AlertSchema)
    .mutation(async ({ ctx, input }) => {
      if (!['staff', 'manager', 'admin', 'owner'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Staff role required to resolve alerts',
        });
      }

      const alert = await alertService.resolveAlert(
        input.alertId,
        ctx.user.organizationId,
        ctx.user.profileId,
        input.resolution,
        input.correctiveAction,
      );

      if (!alert) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Alert not found',
        });
      }

      return alert;
    }),
});
```

### Frontend Component Migration (Before/After)

```typescript
// BEFORE: Using REST API wrapper
// src/components/SiteManagement.tsx
import { sitesApi } from '@/lib/api/sites';
import { useUser } from '@stackframe/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function SiteManagement() {
  const user = useUser();
  const queryClient = useQueryClient();
  const orgId = user?.selectedOrganization?.id;

  // Query
  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites', orgId],
    queryFn: async () => {
      const token = await user?.getAuthJson().then((j) => j.accessToken);
      return sitesApi.listSites(orgId!, token);
    },
    enabled: !!orgId && !!user,
  });

  // Mutation
  const createSite = useMutation({
    mutationFn: async (data: CreateSiteRequest) => {
      const token = await user?.getAuthJson().then((j) => j.accessToken);
      return sitesApi.createSite(orgId!, data, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', orgId] });
    },
  });

  // ...
}

// AFTER: Using tRPC hooks
// src/components/SiteManagement.tsx
import { useTRPC } from '@/lib/trpc';
import { useUser } from '@stackframe/react';

function SiteManagement() {
  const trpc = useTRPC();
  const user = useUser();
  const orgId = user?.selectedOrganization?.id;

  // Query - automatic caching and type safety
  const { data: sites, isLoading } = trpc.sites.list.useQuery(
    { organizationId: orgId! },
    { enabled: !!orgId },
  );

  // Mutation - automatic invalidation via tRPC
  const createSite = trpc.sites.create.useMutation({
    onSuccess: () => {
      // tRPC automatically invalidates related queries
      trpc.sites.list.invalidate();
    },
  });

  // Usage is identical:
  // createSite.mutate({ organizationId: orgId!, data: { name: 'New Site', ... } })

  // ...
}
```

### Readings Router with Pagination

```typescript
// backend/src/routers/readings.router.ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc/index.js';
import { orgProcedure } from '../trpc/procedures.js';
import * as readingsService from '../services/readings.service.js';
import { ReadingResponseSchema } from '../schemas/readings.js';

const ReadingsListInput = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  start: z.string().datetime().optional(), // ISO 8601 datetime
  end: z.string().datetime().optional(),
});

const ReadingLatestInput = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
});

export const readingsRouter = router({
  // GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId/readings
  list: orgProcedure
    .input(ReadingsListInput)
    .output(z.array(ReadingResponseSchema))
    .query(async ({ ctx, input }) => {
      const { organizationId, ...queryParams } = input;

      try {
        return await readingsService.queryReadings({
          ...queryParams,
          organizationId: ctx.user.organizationId,
        });
      } catch (error: any) {
        if (error.message?.includes('Unit not found or access denied')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Unit not found',
          });
        }
        throw error;
      }
    }),

  // GET /api/orgs/:orgId/.../readings?limit=1
  latest: orgProcedure
    .input(ReadingLatestInput)
    .output(ReadingResponseSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        const readings = await readingsService.queryReadings({
          unitId: input.unitId,
          organizationId: ctx.user.organizationId,
          limit: 1,
        });
        return readings[0] || null;
      } catch (error: any) {
        if (error.message?.includes('Unit not found or access denied')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Unit not found',
          });
        }
        throw error;
      }
    }),
});
```

## State of the Art

| Old Approach                  | Current Approach                     | When Changed       | Impact                                 |
| ----------------------------- | ------------------------------------ | ------------------ | -------------------------------------- |
| REST endpoints with Ky client | tRPC procedures with type-safe hooks | Phase 19 (2026-01) | Type safety across full stack          |
| Manual query key management   | tRPC automatic query keys            | Phase 19 (2026-01) | Simpler cache invalidation             |
| API wrapper functions         | Direct useTRPC() hooks               | Phase 19 (2026-01) | Less boilerplate, better DX            |
| Duplicate type definitions    | Single source of truth from router   | Phase 19 (2026-01) | No type drift between frontend/backend |

**Deprecated/outdated:**

- `src/lib/api/*.ts` wrapper pattern: Phase 19 deprecated this for direct tRPC hooks
- Manual TanStack Query setup: tRPC integration handles it automatically
- Separate type files: Types now inferred from AppRouter

## Open Questions

Things that couldn't be fully resolved:

1. **Readings Bulk Ingestion Endpoint**
   - What we know: POST /api/ingest/readings uses API key auth (requireApiKey), not JWT
   - What's unclear: Whether to migrate to tRPC (would need publicProcedure with custom auth) or keep as REST
   - Recommendation: Keep bulk ingestion as REST endpoint - API key auth doesn't fit tRPC patterns well, only frontend query endpoints need tRPC

2. **Test Coverage Depth**
   - What we know: Context allows Claude to determine test coverage depth based on criticality
   - What's unclear: What "critical" means for each domain
   - Recommendation: Sites and Units are core entities (high criticality) - comprehensive tests. Alerts are user-facing safety feature (high criticality) - comprehensive tests. Readings are high-volume but read-only (medium criticality) - basic happy path tests sufficient.

3. **Migration Ordering Strategy**
   - What we know: Context allows Claude to determine domain order based on dependencies
   - What's unclear: Dependency graph between the four domains
   - Recommendation: Order by dependency: (1) Sites (no dependencies), (2) Units (depends on areas which depend on sites), (3) Readings (depends on units), (4) Alerts (depends on units). However, all services are independent so actual implementation order doesn't matter.

4. **Cross-Domain Query Performance**
   - What we know: Context allows Claude to decide separate calls vs nested queries
   - What's unclear: Current usage patterns that might benefit from nested loading
   - Recommendation: Keep separate calls initially (matches REST API). If component loads units + readings together, can add composite procedure later (e.g., units.getWithLatestReading). Don't optimize prematurely.

## Sources

### Primary (HIGH confidence)

- Phase 19 Research Document - tRPC infrastructure patterns
- `backend/src/routers/organizations.router.ts` - Template for domain routers
- `backend/src/trpc/procedures.ts` - orgProcedure middleware pattern
- `backend/src/routes/sites.ts` - REST endpoint to migrate
- `backend/src/routes/units.ts` - REST endpoint to migrate
- `backend/src/routes/readings.ts` - REST endpoint to migrate
- `backend/src/routes/alerts.ts` - REST endpoint to migrate
- `backend/src/schemas/sites.ts` - Zod schemas to reuse
- `backend/src/schemas/units.ts` - Zod schemas to reuse
- `backend/src/schemas/readings.ts` - Zod schemas to reuse
- `backend/src/schemas/alerts.ts` - Zod schemas to reuse
- `src/lib/api/organizations.ts` - Deprecated wrapper pattern to avoid
- `src/lib/trpc.ts` - Frontend tRPC client setup
- `backend/tests/trpc/organizations.router.test.ts` - Test pattern to follow

### Secondary (MEDIUM confidence)

- [From REST to tRPC: Type-Safe APIs with Node.js](https://betterstack.com/community/guides/scaling-nodejs/trpc-explained/) - Migration guidance
- [Building Type-Safe APIs with tRPC: A Practical Migration Guide from REST](https://dev.to/eva_clari_289d85ecc68da48/building-type-safe-apis-with-trpc-a-practical-migration-guide-from-rest-3l4j) - Migration patterns
- [REST vs GraphQL vs tRPC: The Ultimate API Design Guide for 2026](https://dev.to/dataformathub/rest-vs-graphql-vs-trpc-the-ultimate-api-design-guide-for-2026-8n3) - When to use tRPC
- [Mastering tRPC with React Server Components: The Definitive 2026 Guide](https://dev.to/christadrian/mastering-trpc-with-react-server-components-the-definitive-2026-guide-1i2e) - Modern patterns

### Tertiary (LOW confidence)

- None - all research based on verified codebase patterns and official docs

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All packages installed in Phase 19, no new dependencies
- Architecture: HIGH - Organizations router provides complete template, service layer proven
- Pitfalls: HIGH - Based on Phase 19 learnings and existing REST route patterns
- Migration strategy: HIGH - Cold cutover specified in context, straightforward replacement

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable patterns, proven approach from Phase 19)
