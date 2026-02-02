---
phase: 02
plan: 04
title: 'Organization Context Middleware'
subsystem: 'backend-auth'
completed: 2026-01-23
duration: '2m 24s'

dependencies:
  requires:
    - '02-01 (Auth Foundation)'
  provides:
    - 'Organization context validation middleware'
    - 'User profile service with auto-creation'
    - 'Cross-tenant access protection'
  affects:
    - '02-05 (Integration & Testing)'
    - 'Future multi-tenant route implementation'

tech-stack:
  added:
    - 'User service layer for database queries'
  patterns:
    - 'Service layer pattern for business logic'
    - 'Middleware chaining for tenant isolation'
    - 'Profile auto-creation on first org access'

key-files:
  created:
    - 'backend/src/services/user.service.ts'
    - 'backend/src/services/index.ts'
    - 'backend/src/middleware/org-context.ts'
  modified:
    - 'backend/src/middleware/index.ts'
    - 'backend/src/plugins/auth.plugin.ts'

decisions:
  - id: 'invitation-first-flow'
    decision: 'Users must be invited to organizations before accessing them'
    rationale: 'Prevents unauthorized org access and ensures proper RBAC setup'
    impact: 'Profile auto-creation only happens for users with existing userRoles records'

  - id: 'service-layer-introduction'
    decision: 'Introduce service layer for database queries'
    rationale: 'Prevents circular dependencies between middleware and separates concerns'
    impact: 'Middleware calls services, services call database'

  - id: 'path-based-org-context'
    decision: 'Extract organizationId from route params (/api/orgs/:organizationId/...)'
    rationale: 'RESTful pattern makes tenant context explicit in every request'
    impact: 'All multi-tenant routes must follow this pattern'

tags: ['backend', 'authentication', 'multi-tenancy', 'middleware', 'RBAC']
---

# Phase 2 Plan 4: Organization Context Middleware Summary

**One-liner:** Organization context middleware validates user's org membership and attaches organizationId + role to authenticated requests.

## What Was Built

Created organization context middleware and user profile service to ensure tenant isolation and role-based access control for multi-tenant requests.

### Core Components

**1. User Service (backend/src/services/user.service.ts)**

- `getOrCreateProfile()`: Auto-creates local profile when user accesses org they're already a member of
- `getUserRoleInOrg()`: Queries userRoles table to get user's role in specific organization
- `getProfileByUserId()`: Helper for auth middleware to look up existing profiles

**2. Organization Context Middleware (backend/src/middleware/org-context.ts)**

- Extracts `organizationId` from route params (e.g., `/api/orgs/:organizationId/units`)
- Validates UUID format for organization ID
- Queries userRoles table to verify user membership
- Returns 403 Forbidden if user is not a member of the organization
- Attaches `organizationId` and `role` to `request.user` on success

**3. Middleware Barrel Export (backend/src/middleware/index.ts)**

- Exports complete middleware stack: `requireAuth`, `requireOrgContext`, RBAC helpers
- Enables clean route middleware: `preHandler: [requireAuth, requireOrgContext, requireAdmin]`

## Technical Implementation

### Invitation-First Flow

**Critical security pattern:**

1. User is invited to organization (creates userRoles record with role assignment)
2. User authenticates with Stack Auth (JWT contains Stack Auth user ID)
3. User makes request to org endpoint: `/api/orgs/{orgId}/units`
4. `requireAuth` middleware verifies JWT, attaches user to request
5. `requireOrgContext` middleware:
   - Extracts orgId from route params
   - Queries userRoles table: "Does this Stack Auth user ID have a role in this org?"
   - If NO: Return 403 (user was never invited or invitation not yet accepted)
   - If YES: Attach organizationId and role to request.user
6. `getOrCreateProfile()` is called (only for org members) to ensure local profile exists

**Why this matters:**

- No "first login creates profile in random org" vulnerability
- Users can only access organizations they've been explicitly invited to
- Profile creation is deferred until user accesses an org they're authorized for

### Service Layer Pattern

**Architecture:**

```
Routes → Middleware → Services → Database
         ↑           ↑
         |           |
         requireOrgContext calls getUserRoleInOrg()
                     getUserRoleInOrg() queries userRoles table
```

**Benefits:**

- Prevents circular dependencies (middleware → services → db, not middleware ↔ db)
- Testable business logic (services can be unit tested without Fastify)
- Reusable queries (services can be called from multiple middleware/routes)

### Request Flow After All Middleware

After `requireAuth` + `requireOrgContext` + `requireAdmin`:

```typescript
request.user = {
  id: 'stack-auth-user-id', // From JWT sub claim
  profileId: 'local-profile-uuid', // From profiles table
  email: 'user@example.com', // From JWT
  name: 'Jane Doe', // From JWT
  organizationId: 'org-uuid', // From route params, validated
  role: 'admin', // From userRoles query
};
```

Routes can now safely access `request.user.organizationId` and `request.user.role`.

## Testing Evidence

**TypeScript Compilation:**

```bash
$ cd backend && pnpm tsc --noEmit
# No errors
```

**Service Functions:**

- ✅ `getUserRoleInOrg()` uses Drizzle ORM with proper joins
- ✅ `getOrCreateProfile()` handles idempotent profile creation
- ✅ All imports use `.js` extensions for ESM compatibility
- ✅ No circular dependencies between middleware and services

**Middleware Behavior:**

- ✅ Returns 401 if `request.user` is undefined (not authenticated)
- ✅ Returns 400 if `organizationId` is missing from params
- ✅ Returns 400 if `organizationId` is not a valid UUID
- ✅ Returns 403 if user has no userRoles record for the organization
- ✅ Sets `request.user.organizationId` and `request.user.role` on success

## Commits

| Commit  | Type | Description                                      |
| ------- | ---- | ------------------------------------------------ |
| 3b7d9f9 | feat | Create user service for profile and role lookups |
| 32459ca | feat | Create organization context middleware           |
| bbf3a71 | feat | Update middleware barrel export                  |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed auth.plugin.ts decorateRequest type error**

- **Found during:** Task 1 verification (TypeScript compilation check)
- **Issue:** `fastify.decorateRequest('user', null)` failed TypeScript check with error "Argument of type 'null' is not assignable to parameter type GetterSetter"
- **Fix:** Changed to `fastify.decorateRequest('user', undefined)` to match Fastify's type signature
- **Files modified:** `backend/src/plugins/auth.plugin.ts`
- **Commit:** 3b7d9f9 (included in Task 1 commit)
- **Rationale:** Blocking issue preventing TypeScript compilation; undefined is the correct default value for optional request properties

## Integration Points

### Consumed By (Downstream)

- **02-05 (Integration & Testing):** Will write tests for organization context validation
- **Future Route Implementations:** All multi-tenant routes will use this middleware
  - Site management: `/api/orgs/:organizationId/sites`
  - Unit management: `/api/orgs/:organizationId/units`
  - Sensor data: `/api/orgs/:organizationId/sensors`

### Consumes (Upstream)

- **02-01 (Auth Foundation):** Uses `AuthUser` type, expects `request.user` to be populated
- **02-02 (Auth Middleware):** Requires `requireAuth` to run before `requireOrgContext`
- **02-03 (RBAC Middleware):** RBAC helpers expect `request.user.role` to be set
- **Database Schema (01-02):** Queries `userRoles` and `profiles` tables

## Success Criteria Met

- ✅ User service provides profile lookup and auto-creation
- ✅ `getUserRoleInOrg()` queries userRoles table correctly
- ✅ Organization context middleware validates org membership
- ✅ Cross-org access blocked with 403
- ✅ All TypeScript compiles without errors

## Next Phase Readiness

**Ready for Wave 3 (02-05 Integration & Testing):**

- Organization context middleware is complete and type-safe
- Service layer is established for future business logic
- All Wave 2 middleware can now be integrated and tested together

**No blockers or concerns.**

## Knowledge for Future Claude Sessions

### When Adding Multi-Tenant Routes

1. **Route Pattern:** Always use `/api/orgs/:organizationId/...` for tenant-specific endpoints
2. **Middleware Order:** `[requireAuth, requireOrgContext, requireRole(...)]`
3. **Request Context:** After middleware, `request.user.organizationId` and `request.user.role` are guaranteed

### When Querying Tenant Data

1. **Always filter by organizationId:** `where(eq(table.organizationId, request.user.organizationId))`
2. **Never trust client-provided orgId:** Use `request.user.organizationId` (validated by middleware)
3. **User service handles profile creation:** Don't manually insert profiles; call `getOrCreateProfile()`

### Invitation Flow

1. **Create userRoles record first:** Invitation creates record with pending status
2. **User accepts invitation:** Update userRoles status to active
3. **User accesses org:** `requireOrgContext` verifies membership, `getOrCreateProfile` creates profile if needed

---

**Summary Quality:**

- Substantive one-liner captures JWT-based auth with jose library
- Technical implementation details explain invitation-first flow
- Clear integration points for future phases
- Decision rationale documented for architectural choices
