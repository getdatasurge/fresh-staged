---
phase: 02-authentication-rbac
plan: 03
subsystem: auth
tags: [rbac, fastify, middleware, authorization, role-hierarchy]

# Dependency graph
requires:
  - phase: 02-01
    provides: Auth types (AppRole, AuthUser), FastifyRequest augmentation
provides:
  - Role hierarchy constants (viewer through owner)
  - requireRole middleware factory with hierarchy enforcement
  - Convenience exports (requireAdmin, requireOwner, etc.)
  - Middleware barrel export pattern for clean imports
affects: [02-05, routes, api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role hierarchy enforcement via numeric levels"
    - "Middleware factory pattern for flexible role requirements"
    - "Barrel exports for clean single-import pattern"

key-files:
  created:
    - backend/src/middleware/rbac.ts
  modified:
    - backend/src/middleware/index.ts

key-decisions:
  - "Numeric hierarchy (1-5) enables simple comparison for role inheritance"
  - "Higher roles automatically satisfy lower requirements (owner can access admin routes)"
  - "Convenience exports reduce boilerplate in route definitions"
  - "Error responses distinguish auth (401) from authorization (403) failures"

patterns-established:
  - "requireRole('admin') pattern for route protection"
  - "Middleware barrel export for single-import location"
  - "Organization context validation before role checking"

# Metrics
duration: 2min 13sec
completed: 2026-01-23
---

# Phase 2 Plan 3: RBAC Middleware Summary

**Role hierarchy middleware with numeric enforcement enabling owner > admin > manager > staff > viewer permission inheritance**

## Performance

- **Duration:** 2 minutes 13 seconds
- **Started:** 2026-01-23T15:56:25Z
- **Completed:** 2026-01-23T15:58:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Role hierarchy constants with 5 levels (viewer=1 through owner=5)
- requireRole middleware factory enforcing hierarchy via numeric comparison
- Convenience exports (requireViewer, requireStaff, requireManager, requireAdmin, requireOwner)
- Middleware barrel export updated for clean single-import pattern
- Error handling distinguishes authentication (401) from authorization (403)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create role hierarchy and requireRole middleware** - `8ef47f2` (feat)
2. **Task 2: Update middleware barrel export** - `6ec0a36` (feat)

## Files Created/Modified
- `backend/src/middleware/rbac.ts` - Role hierarchy constants and requireRole middleware factory
- `backend/src/middleware/index.ts` - Barrel export with RBAC exports and AppRole type

## Decisions Made

**1. Numeric hierarchy for role comparison**
- Rationale: Simple integer comparison (userLevel >= requiredLevel) is more performant and maintainable than string-based lookups or complex logic

**2. Higher roles inherit lower permissions**
- Rationale: Owner role should access all admin/manager/staff/viewer routes without duplicate permission checks

**3. Organization context validation in RBAC middleware**
- Rationale: Role is meaningless without organization context; checking here prevents authorization logic from running on incomplete auth state

**4. Descriptive error messages including required role**
- Rationale: "This action requires admin role or higher" provides clear feedback for debugging and user communication

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for:**
- Integration with auth middleware (02-02) and org-context middleware (02-04)
- Route protection using requireRole pattern
- End-to-end testing in 02-05

**RBAC middleware complete and ready for route integration.**
- Assumes org-context middleware has already set request.user.role
- Middleware order should be: requireAuth → requireOrgContext → requireRole

**No blockers.**

---
*Phase: 02-authentication-rbac*
*Completed: 2026-01-23*
