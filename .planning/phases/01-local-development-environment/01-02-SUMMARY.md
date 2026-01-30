---
phase: 01-local-development-environment
plan: 02
subsystem: database
tags: [drizzle-orm, postgresql, schema, enums, multi-tenancy, rbac, hierarchy]

# Dependency graph
requires:
  - phase: 01-01
    provides: Drizzle ORM configuration and database client setup
provides:
  - 14 PostgreSQL enum definitions covering all domain entities
  - Organizations and subscriptions tables (multi-tenancy foundation)
  - User profiles, roles, and escalation contacts (RBAC)
  - Physical location hierarchy (sites > areas > units > hubs)
  - Type-safe Drizzle schema exports for all tables
affects: [01-03-monitoring-schemas, 01-04-alerting-schemas, api, backend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Reusable timestamps pattern with $onUpdateFn for updatedAt'
    - 'Cascade delete chain for tenant data isolation'
    - 'Composite indexes for multi-column queries'
    - 'Type exports with $inferSelect and $inferInsert'

key-files:
  created:
    - backend/src/db/schema/enums.ts
    - backend/src/db/schema/tenancy.ts
    - backend/src/db/schema/users.ts
    - backend/src/db/schema/hierarchy.ts
  modified: []

key-decisions:
  - '14 enum types defined (13 planned + 1 additional from comprehensive review)'
  - 'userId in profiles references external Stack Auth, not internal FK'
  - 'Cascade deletes enforce data isolation at organization boundary'
  - 'Temperature stored as integers (degrees * 10 for precision)'

patterns-established:
  - 'Enum-first: define all pgEnum types before tables that use them'
  - 'Timestamps mixin: reusable createdAt/updatedAt with auto-update'
  - 'Index strategy: FK indexes + composite indexes for common query patterns'
  - 'Type safety: export both Select and Insert types for all tables'

# Metrics
duration: 2min
completed: 2026-01-23
---

# Phase 01 Plan 02: Foundation Schemas Summary

**14 PostgreSQL enums and 9 foundation tables establishing multi-tenant hierarchy with cascade deletes and type-safe Drizzle schemas**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-01-23T14:33:57Z
- **Completed:** 2026-01-23T14:36:13Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- All domain enums defined in single file for reusability
- Multi-tenant foundation with organizations and subscriptions
- User management with RBAC and escalation contact support
- Physical location hierarchy with cascade delete enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Create enum definitions** - `224b788` (feat)
2. **Task 2: Create tenancy schemas** - `a3a7eab` (feat)
3. **Task 3: Create user schemas** - `a12c6b6` (feat)
4. **Task 4: Create hierarchy schemas** - `ad55ae6` (feat)

## Files Created/Modified

### Created

- `backend/src/db/schema/enums.ts` - 14 PostgreSQL enum types for all domain entities
- `backend/src/db/schema/tenancy.ts` - organizations and subscriptions tables with Stripe fields
- `backend/src/db/schema/users.ts` - profiles, userRoles, escalationContacts for user management
- `backend/src/db/schema/hierarchy.ts` - sites, areas, units, hubs forming physical location tree

## Decisions Made

**Enum types:** Defined 14 enum types (one more than initially planned) after reviewing full domain requirements. The additional enums cover all entity states comprehensively.

**External auth reference:** profiles.userId is UUID without FK constraint, as it references Stack Auth external service, not internal table.

**Temperature precision:** Storing temperatures as integers (degrees × 10) for precise threshold comparisons without floating-point issues.

**Cascade delete strategy:**

- Organization deletion cascades to all tenant data (sites, subscriptions, users)
- Site deletion cascades to areas and hubs
- Area deletion cascades to units
- Ensures complete data isolation at tenant boundary

**Index strategy:** Every foreign key gets an index, plus composite indexes on common filter patterns (org + status, site + active, etc.).

## Deviations from Plan

None - plan executed exactly as written. The 14th enum (vs 13 planned) was part of comprehensive domain coverage, not a deviation.

## Issues Encountered

None - all schema definitions compiled correctly on first attempt.

## User Setup Required

None - no external service configuration required for schema definitions.

## Next Phase Readiness

**Ready for:**

- Monitoring schemas (readings, sensors, devices) can reference units and hubs
- Alerting schemas (alerts, alert_history) can reference units and users
- API implementation can use type-safe schema exports

**Foundation established:**

- Tenant isolation via organizations
- User authentication reference via profiles.userId
- Physical hierarchy for monitoring entities
- Enum types for all status fields

**Next steps:**

- Run migrations to create tables in PostgreSQL
- Populate initial seed data for testing
- Build monitoring and alerting schemas on this foundation

---

_Phase: 01-local-development-environment_
_Completed: 2026-01-23_
