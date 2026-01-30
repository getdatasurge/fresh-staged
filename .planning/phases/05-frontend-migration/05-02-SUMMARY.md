---
phase: 05
plan: 02
subsystem: frontend-api-client
status: complete
completed: 2026-01-23
duration: 5 minutes

tags:
  - frontend
  - api-client
  - typescript
  - ky
  - crud

depends_on:
  - 05-01

provides:
  - organizations-api-module
  - sites-api-module
  - areas-api-module
  - units-api-module
  - api-barrel-export

affects:
  - 05-04 # Hooks will consume these API modules
  - 05-05 # Settings hooks depend on org/site/area/unit APIs

tech-stack:
  added: []
  patterns:
    - typed-api-functions
    - authenticated-client-factory
    - hierarchical-resource-routing

key-files:
  created:
    - src/lib/api/organizations.ts
    - src/lib/api/sites.ts
    - src/lib/api/areas.ts
    - src/lib/api/units.ts
    - src/lib/api/index.ts
  modified: []

decisions:
  - slug: accessToken-parameter-pattern
    what: API functions accept accessToken as final parameter
    why: Enables token injection from hooks without global state
    alternatives: Global interceptor would require React context in non-component code
    impact: All API functions follow consistent signature pattern

  - slug: delete-void-return
    what: DELETE operations return Promise<void> and use .text() not .json()
    why: Backend returns 204 No Content with empty body
    alternatives: Return boolean success flag - adds unnecessary complexity
    impact: Simpler error handling, matches HTTP spec

  - slug: hierarchical-params
    what: Functions accept full hierarchy params (orgId, siteId, areaId, unitId)
    why: Matches backend route structure and enables proper URL construction
    alternatives: Flatten params - loses semantic meaning and route clarity
    impact: Function signatures mirror backend API structure exactly
---

# Phase 05 Plan 02: API Functions for Core Entities Summary

**One-liner:** Type-safe CRUD API functions for organizations, sites, areas, and units using Ky HTTP client with Stack Auth token injection.

## What Was Built

Created typed API functions for all core entity CRUD operations. These functions serve as the bridge between React hooks and the self-hosted backend API, replacing direct Supabase SDK calls.

### Organizations API Module

- `getOrganization(orgId, accessToken)` - GET /api/orgs/:orgId
- `updateOrganization(orgId, updates, accessToken)` - PUT /api/orgs/:orgId (owner role)
- `listMembers(orgId, accessToken)` - GET /api/orgs/:orgId/members

### Sites API Module

- `listSites(orgId, accessToken)` - GET /api/orgs/:orgId/sites
- `getSite(orgId, siteId, accessToken)` - GET /api/orgs/:orgId/sites/:siteId
- `createSite(orgId, data, accessToken)` - POST /api/orgs/:orgId/sites (admin role)
- `updateSite(orgId, siteId, data, accessToken)` - PUT /api/orgs/:orgId/sites/:siteId (admin role)
- `deleteSite(orgId, siteId, accessToken)` - DELETE /api/orgs/:orgId/sites/:siteId (admin role, soft delete)

### Areas API Module

- `listAreas(orgId, siteId, accessToken)` - GET /api/orgs/:orgId/sites/:siteId/areas
- `getArea(orgId, siteId, areaId, accessToken)` - GET /api/orgs/:orgId/sites/:siteId/areas/:areaId
- `createArea(orgId, siteId, data, accessToken)` - POST /api/orgs/:orgId/sites/:siteId/areas (admin role)
- `updateArea(orgId, siteId, areaId, data, accessToken)` - PUT /api/orgs/:orgId/sites/:siteId/areas/:areaId (admin role)
- `deleteArea(orgId, siteId, areaId, accessToken)` - DELETE /api/orgs/:orgId/sites/:siteId/areas/:areaId (admin role, soft delete)

### Units API Module

- `listUnits(orgId, siteId, areaId, accessToken)` - GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units
- `getUnit(orgId, siteId, areaId, unitId, accessToken)` - GET /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId
- `createUnit(orgId, siteId, areaId, data, accessToken)` - POST /api/orgs/:orgId/sites/:siteId/areas/:areaId/units (manager role)
- `updateUnit(orgId, siteId, areaId, unitId, data, accessToken)` - PUT /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId (manager role)
- `deleteUnit(orgId, siteId, areaId, unitId, accessToken)` - DELETE /api/orgs/:orgId/sites/:siteId/areas/:areaId/units/:unitId (manager role, soft delete)

### Barrel Export

- `src/lib/api/index.ts` exports all API modules and re-exports types from api-types.ts
- Enables clean imports: `import { organizationsApi, sitesApi } from '@/lib/api'`

## Accomplishments

### Consistency

- **All functions follow identical pattern:** Accept hierarchy params, data (if applicable), and accessToken as final parameter
- **All functions properly typed:** Request/response types match backend Zod schemas exactly
- **All errors handled:** Ky client logs to console and throws typed errors for component handling

### Authentication Integration

- Functions use `createAuthenticatedClient(accessToken)` factory from plan 05-01
- Token injected per-request via `x-stack-access-token` header
- No global state - token passed explicitly from hooks

### Backend Alignment

- URL patterns match backend routes exactly (verified against backend/src/routes/)
- DELETE operations correctly handle 204 No Content responses using `.text()`
- RBAC requirements documented in JSDoc comments (owner, admin, manager roles)

### Type Safety

- All request/response types imported from `api-types.ts` (plan 05-01)
- TypeScript compilation passes with zero errors
- Function signatures provide autocomplete and type checking in IDEs

## Tasks Completed

### Task 1: Create organizations API module ✓

- Created `src/lib/api/organizations.ts`
- Implemented get, update, listMembers functions
- All functions accept accessToken parameter
- Returns properly typed responses

### Task 2: Create sites, areas, units API modules ✓

- Created `src/lib/api/sites.ts` with full CRUD (list, get, create, update, delete)
- Created `src/lib/api/areas.ts` with full CRUD
- Created `src/lib/api/units.ts` with full CRUD
- All modules follow hierarchical parameter patterns
- DELETE operations use `.text()` for 204 No Content handling

### Task 3: Create API barrel export ✓

- Created `src/lib/api/index.ts`
- Exports all API modules (organizationsApi, sitesApi, areasApi, unitsApi)
- Re-exports all types from api-types.ts for convenience
- Enables single import point: `import { organizationsApi, SiteResponse } from '@/lib/api'`

## Verification Results

- ✅ TypeScript compiles with zero errors (`pnpm tsc --noEmit`)
- ✅ All API modules export their respective functions
- ✅ Barrel export re-exports all modules
- ✅ Import paths resolve correctly with `@/` alias
- ✅ All functions properly typed with request/response types

## Deviations from Plan

None - plan executed exactly as written.

**Note:** These API modules were initially created in plan 05-03 as a blocking dependency (Rule 3), then re-validated and documented here for plan 05-02. The implementation matches plan 05-02 requirements exactly.

## Decisions Made

### 1. AccessToken Parameter Pattern

**Decision:** API functions accept accessToken as the final parameter rather than using a global interceptor.

**Rationale:**

- Enables explicit token injection from React hooks
- Avoids global state or React context in API layer
- Makes token flow visible and testable
- Hooks call `useUser().getAuthJson()` and pass token directly

**Impact:** All API functions follow consistent signature: `(...params, data?, accessToken)`

### 2. DELETE Returns void

**Decision:** DELETE operations return `Promise<void>` and use `.text()` to handle responses.

**Rationale:**

- Backend returns 204 No Content with empty body
- Calling `.json()` on empty body throws error
- `.text()` correctly handles empty response
- void return type matches HTTP spec (DELETE success = resource gone)

**Alternatives Considered:**

- Return boolean success flag - adds unnecessary complexity
- Return deleted resource - backend doesn't return it (204 No Content)

**Impact:** DELETE functions have signature: `async (...params, accessToken): Promise<void>`

### 3. Hierarchical Parameters

**Decision:** Functions accept full resource hierarchy as separate parameters.

**Examples:**

- Sites: `(orgId, siteId, ...)`
- Areas: `(orgId, siteId, areaId, ...)`
- Units: `(orgId, siteId, areaId, unitId, ...)`

**Rationale:**

- Matches backend route structure exactly
- Makes hierarchy relationships explicit
- Enables type-safe URL construction
- Prevents errors from missing parent IDs

**Alternatives Considered:**

- Flatten params into single object - loses semantic meaning
- Only pass leaf ID (unitId) - loses context, harder to debug

**Impact:** Function signatures mirror backend API structure, making integration obvious

## Next Phase Readiness

### Blockers

None - plan complete and verified.

### Concerns

None identified.

### For Plan 05-04 (Migrate Core Hooks)

- ✅ organizationsApi ready for useOrganizations migration
- ✅ sitesApi ready for useSites migration
- ✅ areasApi ready for useAreas migration
- ✅ unitsApi ready for useUnits migration
- ✅ All CRUD operations available
- ✅ Type-safe request/response handling

### For Plan 05-05 (Migrate Settings Hooks)

- ✅ All entity APIs available for settings forms
- ✅ Update operations ready for settings mutations
- ✅ RBAC requirements documented (owner for org, admin for sites/areas, manager for units)

## Integration Points

### Upstream Dependencies

- **Plan 05-01:** api-client.ts and api-types.ts (createAuthenticatedClient, type definitions)
- **Backend Zod Schemas:** Route patterns and response types (backend/src/schemas/)
- **Backend Routes:** API endpoints (backend/src/routes/organizations.ts, sites.ts, areas.ts, units.ts)

### Downstream Consumers

- **Plan 05-04:** Core entity hooks (useOrganizations, useSites, useAreas, useUnits)
- **Plan 05-05:** Settings hooks (org settings, site settings, etc.)
- **Plan 05-06+:** Feature-specific hooks depending on entity APIs

## Metrics

- **Files Created:** 5 (organizations.ts, sites.ts, areas.ts, units.ts, index.ts)
- **API Functions:** 18 total
  - Organizations: 3 (get, update, listMembers)
  - Sites: 5 (list, get, create, update, delete)
  - Areas: 5 (list, get, create, update, delete)
  - Units: 5 (list, get, create, update, delete)
- **Lines of Code:** ~200 (excluding types)
- **TypeScript Errors:** 0
- **Duration:** 5 minutes

## Code Quality

- ✅ All functions have JSDoc comments with HTTP method and route
- ✅ Role requirements documented in comments (owner, admin, manager)
- ✅ Consistent code formatting (Prettier/ESLint)
- ✅ Type-safe throughout (no `any` types)
- ✅ Error handling via Ky client (automatic retry, logging)

---

**Status:** Complete and ready for hook migration (plan 05-04)
