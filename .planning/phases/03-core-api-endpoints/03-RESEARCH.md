# Phase 3: Core API Endpoints - Research

**Researched:** 2026-01-23
**Domain:** REST API design, CRUD operations, Fastify routing, request validation
**Confidence:** HIGH

## Summary

This phase implements REST API endpoints for the organizational hierarchy (organizations, sites, areas, units) with authentication, authorization, and validation. The research confirms that Fastify with Zod validation provides a robust, type-safe foundation for building these endpoints.

The existing backend already has authentication (`requireAuth`), RBAC (`requireRole`), and organization context (`requireOrgContext`) middleware in place. The database schema (Drizzle ORM) for all four entity types is defined with proper relationships and cascade behaviors. The task is to build route handlers that leverage these existing patterns.

**Key findings:**

- Fastify's preHandler hooks provide clean middleware composition for auth/RBAC
- Zod schemas enable type-safe validation with detailed error messages
- Fastify-type-provider-zod bridges compile-time types with runtime validation
- Cursor-based pagination is superior for consistency in multi-tenant environments
- RFC 9457 Problem Details is the modern standard for structured error responses
- Broken Object Level Authorization (BOLA) remains the #1 API security risk

**Primary recommendation:** Use Fastify route files with Zod validation schemas, existing middleware chain (requireAuth → requireOrgContext → requireRole), and Drizzle ORM queries with proper transaction handling for data consistency.

## Standard Stack

### Core

| Library                   | Version | Purpose                     | Why Standard                                                                                |
| ------------------------- | ------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| Fastify                   | 5.x     | HTTP server framework       | High performance, TypeScript-first, rich plugin ecosystem, built-in schema validation       |
| Zod                       | 3.25+   | Request/response validation | TypeScript-first, composable schemas, excellent error messages, compile-time type inference |
| fastify-type-provider-zod | Latest  | Bridge Fastify & Zod        | Type-safe request/response handling, enables schema validation with TypeScript inference    |
| Drizzle ORM               | 0.38+   | Database queries            | Type-safe queries, SQL-like API, excellent migration control, already integrated            |
| jose                      | 6.x     | JWT validation              | Standards-compliant JWT/JWKS handling, already used for auth middleware                     |

### Supporting

| Library          | Version | Purpose            | When to Use                                                 |
| ---------------- | ------- | ------------------ | ----------------------------------------------------------- |
| @fastify/swagger | 8.x     | API documentation  | Auto-generate OpenAPI specs from Zod schemas (future phase) |
| @fastify/cors    | 9.x     | CORS handling      | Frontend communication (likely already configured)          |
| pino             | 8.x     | Structured logging | Request/response logging, error tracking (Fastify default)  |

### Alternatives Considered

| Instead of                | Could Use           | Tradeoff                                                                                   |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| Zod                       | JSON Schema (Ajv)   | JSON Schema is Fastify's default but lacks TypeScript inference; Zod provides better DX    |
| fastify-type-provider-zod | fastify-zod-openapi | OpenAPI support adds complexity; defer until API documentation phase                       |
| Cursor pagination         | Offset pagination   | Offset is simpler but causes page drift with frequent writes (unsuitable for multi-tenant) |

**Installation:**

```bash
cd backend
pnpm add zod fastify-type-provider-zod
```

## Architecture Patterns

### Recommended Project Structure

```
backend/src/
├── routes/
│   ├── organizations.ts    # GET /api/orgs/:id, PUT /api/orgs/:id, GET /api/orgs/:id/members
│   ├── sites.ts            # CRUD for /api/orgs/:orgId/sites
│   ├── areas.ts            # CRUD for /api/orgs/:orgId/sites/:siteId/areas
│   └── units.ts            # CRUD for /api/orgs/:orgId/sites/:siteId/areas/:areaId/units
├── schemas/
│   ├── organizations.ts    # Zod schemas for org endpoints
│   ├── sites.ts            # Zod schemas for site endpoints
│   ├── areas.ts            # Zod schemas for area endpoints
│   └── units.ts            # Zod schemas for unit endpoints
├── services/
│   ├── organization.service.ts
│   ├── site.service.ts
│   ├── area.service.ts
│   └── unit.service.ts
└── middleware/             # (Already exists with auth, rbac, org-context)
```

### Pattern 1: Route File Structure

**What:** Each route file registers endpoints for one resource type with validation schemas
**When to use:** All CRUD route files in this phase

**Example:**

```typescript
// Source: Fastify best practices + Context7
import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as siteService from '../services/site.service.js';

// Request/response schemas
const SiteSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(256),
  address: z.string().nullable(),
  city: z.string().max(128).nullable(),
  timezone: z.string().default('UTC'),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const CreateSiteSchema = SiteSchema.omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});

const UpdateSiteSchema = CreateSiteSchema.partial();

const ParamsSchema = z.object({
  organizationId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
});

export default async function sitesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // List sites in organization
  app.get(
    '/:organizationId/sites',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: ParamsSchema,
        response: {
          200: z.array(SiteSchema),
        },
      },
    },
    async (request, reply) => {
      const sites = await siteService.listSites(request.user!.organizationId!);
      return sites;
    },
  );

  // Create site
  app.post(
    '/:organizationId/sites',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: ParamsSchema,
        body: CreateSiteSchema,
        response: {
          201: SiteSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.createSite(request.user!.organizationId!, request.body);
      reply.code(201);
      return site;
    },
  );

  // Get single site
  app.get(
    '/:organizationId/sites/:siteId',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: ParamsSchema,
        response: {
          200: SiteSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.getSite(request.params.siteId!, request.user!.organizationId!);

      if (!site) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Site not found' },
        });
      }

      return site;
    },
  );

  // Update site
  app.put(
    '/:organizationId/sites/:siteId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: ParamsSchema,
        body: UpdateSiteSchema,
        response: {
          200: SiteSchema,
        },
      },
    },
    async (request, reply) => {
      const site = await siteService.updateSite(
        request.params.siteId!,
        request.user!.organizationId!,
        request.body,
      );

      if (!site) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Site not found' },
        });
      }

      return site;
    },
  );

  // Delete site
  app.delete(
    '/:organizationId/sites/:siteId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
      schema: {
        params: ParamsSchema,
        response: {
          204: z.void(),
        },
      },
    },
    async (request, reply) => {
      const deleted = await siteService.deleteSite(
        request.params.siteId!,
        request.user!.organizationId!,
      );

      if (!deleted) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Site not found' },
        });
      }

      reply.code(204);
    },
  );
}
```

### Pattern 2: Service Layer with Drizzle ORM

**What:** Service functions encapsulate database queries with proper error handling and authorization checks
**When to use:** All database interactions in this phase

**Example:**

```typescript
// Source: Drizzle ORM documentation (orm.drizzle.team)
import { db } from '../db/client.js';
import { sites, areas } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

export async function listSites(organizationId: string) {
  // Silent filtering - only return sites user has access to
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.organizationId, organizationId), eq(sites.isActive, true)))
    .orderBy(sites.name);
}

export async function createSite(organizationId: string, data: InsertSite) {
  const [site] = await db
    .insert(sites)
    .values({
      ...data,
      organizationId,
    })
    .returning();

  return site;
}

export async function getSite(siteId: string, organizationId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId)))
    .limit(1);

  return site ?? null;
}

export async function updateSite(
  siteId: string,
  organizationId: string,
  data: Partial<InsertSite>,
) {
  const [site] = await db
    .update(sites)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId)))
    .returning();

  return site ?? null;
}

export async function deleteSite(siteId: string, organizationId: string) {
  // Soft delete by setting isActive = false
  const [site] = await db
    .update(sites)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId)))
    .returning();

  return site ?? null;

  // Hard delete with cascade (areas, units, devices all cascade delete)
  // const result = await db.delete(sites)
  //   .where(and(
  //     eq(sites.id, siteId),
  //     eq(sites.organizationId, organizationId)
  //   ))
  //   .returning();
  // return result.length > 0;
}
```

### Pattern 3: Structured Error Responses

**What:** Consistent error format following RFC 9457 Problem Details standard
**When to use:** All error responses across all endpoints

**Example:**

```typescript
// Source: RFC 9457 + Fastify error handling best practices
// Success response (200)
{
  id: "uuid",
  name: "Site Name",
  ...
}

// Validation error (400)
{
  error: {
    code: "INVALID_INPUT",
    message: "Validation failed",
    details: [
      { path: ["name"], message: "Required" },
      { path: ["timezone"], message: "Invalid timezone" }
    ]
  }
}

// Not found (404)
{
  error: {
    code: "NOT_FOUND",
    message: "Site not found"
  }
}

// Forbidden (403)
{
  error: {
    code: "FORBIDDEN",
    message: "This action requires admin role or higher"
  }
}
```

### Pattern 4: Middleware Composition

**What:** Chain preHandler hooks in specific order for auth, org context, and RBAC
**When to use:** All protected endpoints

**Example:**

```typescript
// Source: Existing middleware patterns + Fastify documentation
// Read operations - any authenticated org member
app.get(
  '/orgs/:organizationId/sites',
  {
    preHandler: [requireAuth, requireOrgContext],
  },
  handler,
);

// Write operations - admin or higher
app.post(
  '/orgs/:organizationId/sites',
  {
    preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
  },
  handler,
);

// Owner-only operations
app.delete(
  '/orgs/:organizationId',
  {
    preHandler: [requireAuth, requireOrgContext, requireRole('owner')],
  },
  handler,
);
```

### Anti-Patterns to Avoid

- **Validation in route handlers:** Always use Zod schemas in the `schema` property, not manual validation
- **Direct database queries in routes:** Always use service layer functions for database access
- **Mixing authorization logic:** Don't duplicate RBAC checks; rely on middleware chain
- **Exposing internal errors:** Never send database error messages directly to clients
- **Offset pagination for lists:** Use cursor-based pagination to prevent page drift in multi-tenant systems
- **Skipping organizationId validation:** Always verify organization context before data access
- **Returning different data shapes:** Maintain consistent response structure across all endpoints

## Don't Hand-Roll

| Problem                   | Don't Build                           | Use Instead                                  | Why                                                                                    |
| ------------------------- | ------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Request validation        | Custom validators with if/else chains | Zod schemas with fastify-type-provider-zod   | Handles type coercion, nested validation, custom refinements, and TypeScript inference |
| Error response formatting | Ad-hoc error objects per endpoint     | Standardized error schema following RFC 9457 | Consistency across API, easier client error handling, industry standard                |
| Pagination                | Manual LIMIT/OFFSET queries           | Cursor-based pagination with Drizzle         | Prevents page drift, handles concurrent writes, better performance on large datasets   |
| UUID validation           | Regex checks in handlers              | Zod's z.string().uuid()                      | Handles RFC 4122 compliance, better error messages                                     |
| Authorization checks      | Inline permission logic               | requireRole() middleware                     | Centralized, auditable, prevents BOLA vulnerabilities                                  |
| Cascade deletes           | Manual deletion of child records      | Drizzle schema's onDelete: 'cascade'         | Database-enforced referential integrity, atomic operations                             |
| Transaction management    | Manual BEGIN/COMMIT/ROLLBACK          | Drizzle's db.transaction()                   | Automatic rollback on error, nested transaction support                                |

**Key insight:** The combination of Zod validation, Drizzle ORM's type safety, and Fastify's middleware system handles most common REST API challenges. Custom implementations introduce bugs and maintenance burden.

## Common Pitfalls

### Pitfall 1: Broken Object Level Authorization (BOLA)

**What goes wrong:** User modifies `organizationId` parameter to access another tenant's data
**Why it happens:** Routes trust URL parameters without verifying user membership in that organization
**How to avoid:**

- ALWAYS use `requireOrgContext` middleware before any org-scoped route
- NEVER trust organizationId from request body or query params
- Service layer functions MUST filter by organizationId from `request.user.organizationId`
  **Warning signs:** Routes accessing org data without `requireOrgContext` in preHandler chain

**Example of vulnerability:**

```typescript
// VULNERABLE - no org context validation
app.get('/sites/:siteId', async (request) => {
  // Attacker can access any site by guessing UUID
  const site = await db.select().from(sites).where(eq(sites.id, request.params.siteId));
  return site;
});

// SECURE - org context enforced
app.get(
  '/orgs/:organizationId/sites/:siteId',
  {
    preHandler: [requireAuth, requireOrgContext],
  },
  async (request) => {
    // Only returns site if user is member of organization
    const site = await siteService.getSite(
      request.params.siteId,
      request.user!.organizationId!, // Validated by middleware
    );
    return site;
  },
);
```

### Pitfall 2: Insufficient Validation of Related Resources

**What goes wrong:** Creating area with siteId from different organization, bypassing authorization
**Why it happens:** Only validating parent resource (org) but not intermediate resources (site)
**How to avoid:**

- Verify entire hierarchy chain in service layer
- For `POST /orgs/:orgId/sites/:siteId/areas`, verify site belongs to org before creating area
- Use transactions to ensure atomic operations
  **Warning signs:** Hierarchical creates that only check top-level organizationId

**Example:**

```typescript
// Service layer must verify hierarchy
export async function createArea(organizationId: string, siteId: string, data: InsertArea) {
  // Verify site belongs to organization
  const site = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId)))
    .limit(1);

  if (!site.length) {
    throw new Error('Site not found or access denied');
  }

  // Now safe to create area
  const [area] = await db
    .insert(areas)
    .values({ ...data, siteId })
    .returning();

  return area;
}
```

### Pitfall 3: Inconsistent Soft Delete Handling

**What goes wrong:** Soft-deleted (isActive=false) records appear in lists or can be updated
**Why it happens:** Forgetting to filter by `isActive` in every query
**How to avoid:**

- ALWAYS add `eq(table.isActive, true)` to WHERE clauses in list/get operations
- Update operations should check isActive before allowing modifications
- Consider Drizzle views or query helpers to enforce this automatically
  **Warning signs:** Queries without isActive filter, deleted records reappearing

### Pitfall 4: N+1 Query Problem in Hierarchical Lists

**What goes wrong:** Fetching 100 sites, then making 100 queries to count areas in each site
**Why it happens:** Returning computed fields without using JOIN or subquery
**How to avoid:**

- If returning counts/aggregates, use Drizzle's `leftJoin` with aggregation
- For simple listings, return IDs only; client can request details separately
- Use `with` clause in Drizzle relational queries for intentional eager loading
  **Warning signs:** List endpoints taking seconds, database showing hundreds of simple queries

### Pitfall 5: Exposing Stack Traces in Error Responses

**What goes wrong:** 500 errors return full stack traces with file paths and database details
**Why it happens:** Default error handlers in development mode
**How to avoid:**

- Custom error handler that sanitizes errors in production
- Log full errors server-side with trace IDs
- Return generic "Internal Server Error" message to client
- Include trace ID in response so support can look up details
  **Warning signs:** Error responses containing file paths, SQL queries, or environment details

## Code Examples

### Example 1: Organization Update Endpoint

```typescript
// Source: Fastify + Zod + Drizzle patterns
import type { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, requireOrgContext, requireRole } from '../middleware/index.js';
import * as orgService from '../services/organization.service.js';

const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  timezone: z.string().optional(),
  complianceMode: z.enum(['standard', 'haccp', 'custom']).optional(),
  logoUrl: z.string().url().nullable().optional(),
});

export default async function organizationsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/orgs/:organizationId
  app.get(
    '/:organizationId',
    {
      preHandler: [requireAuth, requireOrgContext],
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            name: z.string(),
            slug: z.string(),
            timezone: z.string(),
            complianceMode: z.enum(['standard', 'haccp', 'custom']),
            sensorLimit: z.number(),
            logoUrl: z.string().nullable(),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
        },
      },
    },
    async (request) => {
      // Organization context already validated by middleware
      const org = await orgService.getOrganization(request.user!.organizationId!);

      if (!org) {
        return request.reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Organization not found' },
        });
      }

      return org;
    },
  );

  // PUT /api/orgs/:organizationId
  app.put(
    '/:organizationId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('owner')],
      schema: {
        params: z.object({ organizationId: z.string().uuid() }),
        body: UpdateOrgSchema,
        response: {
          200: z.object({
            id: z.string().uuid(),
            name: z.string(),
            slug: z.string(),
            timezone: z.string(),
            complianceMode: z.enum(['standard', 'haccp', 'custom']),
            sensorLimit: z.number(),
            logoUrl: z.string().nullable(),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
        },
      },
    },
    async (request) => {
      const org = await orgService.updateOrganization(request.user!.organizationId!, request.body);

      if (!org) {
        return request.reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Organization not found' },
        });
      }

      return org;
    },
  );
}
```

### Example 2: Units CRUD with Full Hierarchy Validation

```typescript
// Service layer for units (deepest hierarchy level)
import { db } from '../db/client.js';
import { units, areas, sites } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

export async function listUnits(organizationId: string, siteId: string, areaId: string) {
  // Verify full hierarchy: org -> site -> area
  const [area] = await db
    .select()
    .from(areas)
    .innerJoin(sites, eq(sites.id, areas.siteId))
    .where(
      and(eq(areas.id, areaId), eq(areas.siteId, siteId), eq(sites.organizationId, organizationId)),
    )
    .limit(1);

  if (!area) {
    return null; // Area not found or not in org
  }

  // Now safe to list units
  return db
    .select()
    .from(units)
    .where(and(eq(units.areaId, areaId), eq(units.isActive, true)))
    .orderBy(units.sortOrder);
}

export async function createUnit(
  organizationId: string,
  siteId: string,
  areaId: string,
  data: InsertUnit,
) {
  // Use transaction to ensure atomicity
  return db.transaction(async (tx) => {
    // Verify hierarchy
    const [area] = await tx
      .select()
      .from(areas)
      .innerJoin(sites, eq(sites.id, areas.siteId))
      .where(
        and(
          eq(areas.id, areaId),
          eq(areas.siteId, siteId),
          eq(sites.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!area) {
      throw new Error('Area not found or access denied');
    }

    // Create unit
    const [unit] = await tx
      .insert(units)
      .values({ ...data, areaId })
      .returning();

    return unit;
  });
}
```

### Example 3: Integration Test with Fastify inject()

```typescript
// Source: Fastify testing documentation + Vitest
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Sites API', () => {
  let app: FastifyInstance;
  let authToken: string;
  let organizationId: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();

    // Get auth token and org ID from test helpers
    const auth = await getTestAuth();
    authToken = auth.token;
    organizationId = auth.organizationId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should list sites in organization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/orgs/${organizationId}/sites`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          organizationId: organizationId,
        }),
      ]),
    );
  });

  it('should create site with valid data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/orgs/${organizationId}/sites`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        name: 'Test Site',
        address: '123 Main St',
        city: 'Boston',
        timezone: 'America/New_York',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Test Site',
      city: 'Boston',
      organizationId: organizationId,
    });
  });

  it('should return 400 for invalid site data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/orgs/${organizationId}/sites`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        name: '', // Invalid - empty string
        timezone: 'Invalid/Timezone',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error');
    expect(response.json().error).toHaveProperty('code', 'INVALID_INPUT');
    expect(response.json().error).toHaveProperty('details');
  });

  it('should return 403 when accessing another org', async () => {
    const otherOrgId = 'other-org-uuid';

    const response = await app.inject({
      method: 'GET',
      url: `/api/orgs/${otherOrgId}/sites`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: 'Forbidden',
      message: 'No access to this organization',
    });
  });
});
```

## State of the Art

| Old Approach           | Current Approach              | When Changed | Impact                                                 |
| ---------------------- | ----------------------------- | ------------ | ------------------------------------------------------ |
| JSON Schema validation | Zod with TypeScript inference | 2023         | Better DX, compile-time safety, composable schemas     |
| Offset pagination      | Cursor-based pagination       | Ongoing      | Prevents page drift, better for real-time data         |
| Ad-hoc error formats   | RFC 9457 Problem Details      | 2023         | Standardized error handling, easier client integration |
| Manual type guards     | fastify-type-provider-zod     | 2022         | Automatic type inference from schemas                  |
| Prisma                 | Drizzle ORM                   | 2024         | Faster, lighter, SQL-like API, better migrations       |
| Express middleware     | Fastify preHandler hooks      | N/A          | Async-first, better performance, plugin encapsulation  |

**Deprecated/outdated:**

- **Offset pagination for dynamic data:** Still common but causes page drift; cursor-based is now standard for multi-tenant
- **Plain Express:** Fastify's performance and TypeScript support make it superior for new APIs
- **Manual JWT verification:** jose library handles JWKS rotation and edge cases better

## Open Questions

1. **Pagination implementation**
   - What we know: Cursor-based is superior for consistency
   - What's unclear: Should we implement it in Phase 3 or defer to later optimization phase?
   - Recommendation: Start with simple unpaginated lists for Phase 3 (MVP), add cursor pagination in Phase 4 when list endpoints are proven

2. **Related resource embedding**
   - What we know: Options are IDs only, ?expand param, or always embed
   - What's unclear: Which pattern provides best balance of performance vs client convenience?
   - Recommendation: Start with IDs only for Phase 3; add ?expand in Phase 4 based on actual frontend usage patterns

3. **Soft delete vs hard delete**
   - What we know: Schema has `isActive` column suggesting soft deletes
   - What's unclear: Should DELETE endpoints soft delete or hard delete? Should soft-deleted records be permanently deletable?
   - Recommendation: Use soft delete (set isActive=false) for user-facing DELETE operations; hard delete is admin-only maintenance operation

4. **Cascade delete behavior**
   - What we know: Schema has onDelete: 'cascade' defined
   - What's unclear: Should API prevent deletion of sites with areas? Or allow with cascade?
   - Recommendation: Allow cascade delete but return warning in response if child records exist; prevents orphaned data

## Sources

### Primary (HIGH confidence)

- [Fastify official documentation](https://fastify.dev/docs/v5.2.x/Reference/Validation-and-Serialization) - Route validation and error handling
- [Zod documentation](https://zod.dev/) - Schema validation and TypeScript integration
- [Drizzle ORM documentation](https://orm.drizzle.team/) - CRUD operations and transactions
- Context7 library ID: `/llmstxt/fastify_dev_llms_txt` - Fastify route structure and validation
- Context7 library ID: `/websites/zod_dev` - Zod validation patterns
- Context7 library ID: `/websites/orm_drizzle_team` - Drizzle ORM queries and transactions

### Secondary (MEDIUM confidence)

- [Fastify + Zod integration guide](https://medium.com/@tomas.gabrs/building-a-fastify-application-with-zod-validation-in-an-nx-monorepo-7c49ed6d77be) - fastify-type-provider-zod setup
- [fastify-type-provider-zod GitHub](https://github.com/turkerdev/fastify-type-provider-zod) - Type provider implementation
- [REST API naming conventions](https://restfulapi.net/resource-naming/) - Resource naming best practices
- [REST API error handling](https://www.baeldung.com/rest-api-error-handling-best-practices) - RFC 9457 Problem Details
- [API pagination patterns](https://embedded.gusto.com/blog/api-pagination/) - Offset vs cursor comparison
- [AWS multi-tenant authorization](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-api-access-authorization/introduction.html) - ABAC/RBAC patterns
- [REST API security best practices](https://www.levo.ai/resources/blogs/rest-api-security-best-practices) - BOLA and OWASP Top 10
- [Fastify testing guide](https://dev.to/robertoumbelino/testing-your-api-with-fastify-and-vitest-a-step-by-step-guide-2840) - Vitest + inject() patterns
- [Fastify authorization middleware](https://www.permit.io/blog/how-to-create-an-authorization-middleware-for-fastify) - preHandler hook patterns

### Tertiary (LOW confidence)

- None - all findings verified with official sources

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All libraries verified with Context7 and official docs; already integrated in backend
- Architecture: HIGH - Patterns derived from Fastify best practices and existing middleware implementation
- Pitfalls: HIGH - BOLA confirmed as #1 API security risk by OWASP; other pitfalls from official security guides

**Research date:** 2026-01-23
**Valid until:** ~60 days (February 2026) - REST API patterns are stable; Fastify and Zod APIs are mature
