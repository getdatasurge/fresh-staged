# Phase 3: Core API Endpoints - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

REST API for organizational hierarchy CRUD operations. Endpoints for organizations (GET/PUT), sites (CRUD), areas (CRUD), and units (CRUD). Authorization rules enforced. Request validation with detailed errors.

</domain>

<decisions>
## Implementation Decisions

### Response format
- Direct data responses (no envelope wrapper)
- Structured errors with code: `{ error: { code: "INVALID_INPUT", message: "...", details: [...] } }`
- Include DOM context for debugging in error responses

### Endpoint design
- POST/create endpoints return the full created resource (saves extra GET)

### Authorization behavior
- List endpoints filter silently — return only what user can access, no indication of hidden items

### Claude's Discretion
- Pagination style (offset vs cursor) based on data characteristics
- Related data embedding strategy (IDs only vs embed vs ?expand param)
- Nested vs flat route structure based on API clarity
- Query param filtering style (simple vs namespaced)
- Update method (PUT vs PATCH vs both) based on typical usage
- Role requirements for read vs write operations
- Soft delete visibility rules
- Cascade behavior when deleting parents with children
- Validation error granularity (field-level vs single message)
- Unknown field handling (strip vs reject)
- Enum error message style
- String length validation strategy

</decisions>

<specifics>
## Specific Ideas

- Error responses should be useful for debugging — include enough context to understand what went wrong
- Direct data responses preferred for simplicity over envelope wrappers

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-core-api-endpoints*
*Context gathered: 2026-01-23*
