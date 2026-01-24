# Phase 19: Backend API Migration - Foundation - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up tRPC infrastructure on Fastify backend and pilot migration with organizations domain. This phase establishes patterns that Phase 20-21 will follow. Frontend currently uses Supabase client (@supabase/supabase-js) for database queries — migration enables AUTH-02 completion.

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy
- Big bang cutover approach (not incremental with feature flags)
- Comprehensive test suite required before switching
- Delete old Supabase client code immediately — git history sufficient for rollback
- Pilot domain: Claude's discretion (organizations specified in roadmap, may include settings if beneficial)

### tRPC Router Design
- Domain-based router organization (organizationsRouter, sitesRouter, etc.) — matches existing REST structure
- CRUD-style procedure naming: list, get, create, update, delete (e.g., organizations.list, organizations.get)

### Type Sharing
- No specific requirements — Claude determines best approach based on project structure
- May use direct imports (monorepo) or generated types package

### Rollout & Testing
- No specific requirements — Claude determines appropriate coverage and approach

### Claude's Discretion
- tRPC-Fastify integration approach (likely @trpc/server/adapters/fastify)
- Auth context implementation (reuse existing middleware vs rebuild for tRPC)
- Type sharing mechanism (direct import vs generated package)
- React Query integration (likely @trpc/react-query given existing TanStack Query usage)
- Hook migration strategy (replace entirely vs wrap existing)
- Zod schema reuse (likely reuse existing schemas)
- Test coverage level (at least match existing 91+ tests)
- Error handling pattern (likely standard TRPCError codes)
- REST endpoint retention during migration
- Rollback strategy (likely git revert given big bang approach)

</decisions>

<specifics>
## Specific Ideas

- Frontend already uses TanStack Query extensively — tRPC integration should leverage this
- 91+ existing backend tests provide baseline coverage to match or exceed
- Existing Zod schemas in routes can likely be reused for tRPC input validation
- Current Ky-based API client (frontend/src/lib/api.ts) will be replaced

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-backend-api-migration-foundation*
*Context gathered: 2026-01-24*
