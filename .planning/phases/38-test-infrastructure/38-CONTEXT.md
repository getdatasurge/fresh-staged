# Phase 38: Test Infrastructure - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix all 60 failing tests (38 frontend, 22 backend) by establishing proper mocking patterns for tRPC and BullMQ. This is infrastructure work that enables subsequent migration phases to have working tests.

**Specific failures:**

- Frontend (38 tests): `trpc.X.Y.queryOptions is not a function` — mock doesn't implement queryOptions pattern
- Backend (22 tests): `queue.service.test.ts` — BullMQ/Redis mock issues

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

This is a technical infrastructure phase. Claude has full discretion on:

- tRPC mock implementation approach (vi.mock, custom mock factory, or MSW)
- BullMQ mock strategy (in-memory queue or mock objects)
- Test utility structure and organization
- Mock pattern documentation format
- Whether to create shared test utilities or inline mocks

### Constraints

- Must work with existing test patterns in codebase
- Must support `trpc.X.Y.queryOptions()` pattern used by TanStack Query integration
- Must be reusable for subsequent migration phases (39-42)
- Don't break the 107 passing frontend tests or 1050 passing backend tests

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

**Key pattern to support:**

```typescript
// This pattern must work in tests:
const query = useQuery(trpc.sites.list.queryOptions({ organizationId }));
```

</specifics>

<deferred>
## Deferred Ideas

None — discussion skipped for technical phase.

</deferred>

---

_Phase: 38-test-infrastructure_
_Context gathered: 2026-01-29_
