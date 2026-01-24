# Phase 5: Frontend Migration - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate React frontend from Supabase client to new self-hosted backend API. Replace all Supabase SDK calls with typed API client calls. Preserve existing UI behavior and React Query caching patterns. This is a migration phase — no new features, just infrastructure swap.

</domain>

<decisions>
## Implementation Decisions

### API Client Architecture
- Organization: Claude's discretion (choose based on existing codebase patterns)
- HTTP client: Claude's discretion (choose based on existing dependencies)
- Type safety: Full type generation from backend Zod schemas or OpenAPI spec
- Error handling: Claude's discretion, but errors must appear in console log AND DOM for visibility

### Auth Token Flow
- Token refresh: Let Stack Auth SDK manage token lifecycle entirely
- Session expiry: Silent re-auth attempt first, only prompt user if truly expired
- Token storage: Use Stack Auth SDK default storage mechanism
- Post-login redirect: Always go to dashboard home after successful login

### Migration Approach
- Strategy: Incremental hook-by-hook migration (Supabase and new API coexist temporarily)
- Verification: Manual testing + unit tests per hook + E2E smoke tests (comprehensive coverage)
- Migration order: Claude's discretion based on codebase analysis (dependency order, complexity)
- Old code handling: Keep Supabase code until entire phase complete, then bulk delete

### Error & Loading States
- Error display: Both contextually — inline for form validation, toasts for server/network errors
- Loading states: Claude's discretion per context (skeletons, spinners, etc.)
- Offline handling: Show offline banner when network unavailable, disable mutations
- Retry logic: Automatic retry for failed requests (3 attempts with backoff) for transient errors

### Claude's Discretion
- API client organization (single vs domain modules)
- HTTP client choice (fetch, axios, ky, etc.)
- Error class structure (typed classes vs union types)
- Loading state patterns per component type
- Hook migration order
- Specific implementation details within above constraints

</decisions>

<specifics>
## Specific Ideas

- Errors must be visible both in browser console AND in the DOM (user mentioned console log / dom visibility)
- Dashboard home is the canonical post-login destination
- Comprehensive testing at every level — don't skip any verification step

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-frontend-migration*
*Context gathered: 2026-01-23*
