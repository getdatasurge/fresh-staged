---
phase: 03-core-api-endpoints
plan: 03
subsystem: api
tags: [fastify, drizzle-orm, zod, rest-api, crud]

# Dependency graph
requires:
  - phase: 02-authentication-rbac
    provides: requireAuth, requireOrgContext, requireRole middleware for request protection
  - phase: 01-local-development-environment
    provides: sites table schema, Drizzle ORM client, PostgreSQL database
provides:
  - Site CRUD service layer (listSites, getSite, createSite, updateSite, deleteSite)
  - Site Zod validation schemas (SiteSchema, CreateSiteSchema, UpdateSiteSchema)
  - Site REST endpoints at /api/orgs/:organizationId/sites
  - Soft delete pattern for hierarchical data
affects: [03-04, 03-05, areas-endpoints, units-endpoints, location-hierarchy-features]

# Tech tracking
tech-stack:
  added: []
  patterns: [service-layer-crud, zod-validation, nested-rest-routes, soft-delete, organization-scoped-queries]

key-files:
  created:
    - backend/src/services/site.service.ts
    - backend/src/schemas/sites.ts
    - backend/src/routes/sites.ts
  modified:
    - backend/src/services/index.ts
    - backend/src/schemas/index.ts
    - backend/src/app.ts

key-decisions:
  - "Service layer returns null for not-found (routes decide 404 response)"
  - "Soft delete via isActive flag with cascading to child entities"
  - "List/Get routes require auth+org-context, mutating routes add admin role check"
  - "All site queries filter by organizationId AND isActive for tenant isolation"

patterns-established:
  - "Service layer pattern: Pure database operations returning domain types"
  - "Route handler pattern: Middleware → Service → Error handling → Response"
  - "Nested resource routes: /api/orgs/:organizationId/sites for hierarchy"
  - "Silent filtering: Services enforce org boundaries, no error on missing cross-org access"

# Metrics
duration: 4min 49s
completed: 2026-01-23
---

# Phase 03 Plan 03: Site CRUD Endpoints Summary

**Site management API with organization-scoped CRUD operations, Zod validation, admin-gated mutations, and soft delete cascading to child entities**

## Performance

- **Duration:** 4 minutes 49 seconds
- **Started:** 2026-01-23T16:49:37Z
- **Completed:** 2026-01-23T16:54:26Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Site service layer with 5 CRUD operations enforcing organization isolation and active status filtering
- Zod schemas for site validation with database-aligned constraints (name max 256, address max 500, etc.)
- REST endpoints at /api/orgs/:organizationId/sites with full CRUD (GET list, GET single, POST, PUT, DELETE)
- Admin-only access for create/update/delete operations via requireRole middleware
- Soft delete implementation using isActive flag with database cascade to areas/units

## Task Commits

Each task was committed atomically:

1. **Task 1: Create site service** - `d395a2f` (feat)
2. **Task 2: Create site Zod schemas** - `dbe0e8b` (feat)
3. **Task 3: Create site routes and register in app** - `1294aed` (feat)

## Files Created/Modified

- `backend/src/services/site.service.ts` - Site CRUD operations with organization filtering and soft delete
- `backend/src/services/index.ts` - Added siteService to barrel export
- `backend/src/schemas/sites.ts` - Zod schemas for site request/response validation
- `backend/src/schemas/index.ts` - Added sites schemas to barrel export
- `backend/src/routes/sites.ts` - Fastify route handlers for site endpoints with ZodTypeProvider
- `backend/src/app.ts` - Registered site routes at /api/orgs/:organizationId/sites prefix

## Decisions Made

**Service layer null returns:** Services return `null` for not-found entities instead of throwing. Route handlers decide whether to return 404 or handle gracefully. Enables reuse in contexts where missing entity is not an error.

**Soft delete pattern:** Site deletion sets `isActive = false` rather than removing rows. Database cascade constraints propagate this to areas and units. Preserves referential integrity and enables potential "undelete" features.

**Silent filtering:** All site queries filter by `organizationId AND isActive`. Cross-org attempts return empty results (403 from org-context middleware) rather than explicit errors. Prevents information disclosure about whether sites exist in other orgs.

**RBAC granularity:** List and GET operations require authentication + org membership. Create, update, delete add `requireRole('admin')` middleware. Aligns with principle: viewing data needs membership, modifying needs elevated permissions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all TypeScript compilation passed, existing tests remain green (10/10 passing).

**Note:** Pre-existing TypeScript errors in `backend/src/routes/organizations.ts` are unrelated to this plan and do not affect site functionality.

## Next Phase Readiness

**Ready for Area CRUD (Plan 03-04):** Site service and routes provide the foundation for areas, which sit below sites in the hierarchy. Area routes will follow the pattern `/api/orgs/:organizationId/sites/:siteId/areas`.

**Ready for Unit CRUD (Plan 03-05):** Once areas are implemented, units can be built as `/api/orgs/:organizationId/sites/:siteId/areas/:areaId/units`, completing the location hierarchy.

**Service layer pattern established:** Other entity endpoints (devices, alerts, telemetry) can follow the same service → schema → routes → app registration pattern for consistency.

---
*Phase: 03-core-api-endpoints*
*Completed: 2026-01-23*
