# Phase 20: Backend API Migration - Core - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate sites, units, readings, and alerts domains from Supabase client queries to tRPC procedures. Frontend hooks call backend API instead of querying database directly. This enables removal of @supabase/supabase-js dependency (completed in Phase 21).

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy
- Cold cutover approach — replace Supabase with tRPC directly, no parallel run period
- All 4 domains migrated together in one release (all at once, not incremental)
- Delete old Supabase hooks immediately after tRPC replacements verified working
- No fallback mechanism — commit to clean migration

### Procedure Granularity
- Match current Supabase query patterns exactly — procedure structure mirrors existing hooks
- Readings treated same as other domains — no special high-volume handling required

### Validation Approach
- E2E tests required for all domain migrations
- Migrate existing Supabase-based tests to use tRPC instead of creating parallel test suite
- Old tests updated in place, not kept alongside

### Domain Ordering
- All domains follow strict patterns — same structure, naming conventions, error handling
- If one domain fails E2E tests, ship domains that pass and continue work on failed domain

### Claude's Discretion
- Hook implementation pattern (rewrite vs wrap) — Claude picks based on existing patterns
- Filtering/sorting in procedures vs client — Claude picks based on data volume
- Response shape (raw rows vs DTOs) — Claude picks based on existing patterns
- Domain migration order — Claude determines based on dependency analysis
- Cross-domain query handling (separate calls vs nested) — Claude picks based on performance
- Test coverage depth per domain — Claude determines based on criticality
- Type verification approach (TypeScript, Zod, snapshots) — Claude picks based on type safety requirements

</decisions>

<specifics>
## Specific Ideas

- Follow Phase 19 organizations router as the template for all domain routers
- Use same tRPC v11 patterns established: queryOptions pattern, useTRPC hook, orgProcedure middleware
- Maintain backward compatibility with existing component interfaces during migration

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 20-backend-api-migration-core*
*Context gathered: 2026-01-24*
