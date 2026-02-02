# Phase 2: Authentication & RBAC - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement JWT-based authentication using Stack Auth and role-based access control middleware. Users authenticate externally via Stack Auth; this phase validates tokens, enforces roles, and ensures tenant isolation. User management UI and invitation flows are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User delegated all implementation decisions to Claude. The following areas should be researched and implemented using best practices for this codebase:

**JWT Validation:**

- Token validation strategy (signature, expiration, claims)
- Handling expired/invalid tokens
- Clock skew tolerance
- Refresh token handling (if applicable)

**Role Hierarchy:**

- Role definitions and hierarchy (owner > admin > manager > viewer)
- Permission mapping per role
- Role inheritance behavior
- Middleware enforcement pattern

**Organization Context:**

- How requests identify target organization
- Multi-org user handling
- Tenant isolation enforcement
- Cross-org request prevention

**Error Responses:**

- Auth error verbosity (security vs debugging balance)
- Rate limiting on auth failures
- Audit logging for security events

</decisions>

<specifics>
## Specific Ideas

- Use Stack Auth as the external auth provider (already decided in Phase 1)
- Align with existing codebase patterns and tech stack decisions from Phase 1
- Reference `profiles.userId` pattern established in schema (external user ID, no FK)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 02-authentication-rbac_
_Context gathered: 2026-01-23_
