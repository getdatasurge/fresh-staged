---
phase: 03
plan: 01
subsystem: api-foundation
tags: [validation, zod, fastify, type-safety, error-handling]
requires:
  - phase: 02
    plan: all
    reason: Authentication and RBAC middleware used by API endpoints
provides:
  - Zod schema validation infrastructure
  - Common validation schemas (UUID, params, timestamps)
  - Structured error response format and utilities
  - Fastify app configured with type-safe Zod type provider
affects:
  - phase: 03
    plans: [02, 03, 04, 05, 06]
    reason: All API route files will use these common schemas and error utilities
tech-stack:
  added:
    - zod: TypeScript-first schema validation library
    - fastify-type-provider-zod: Bridges Zod with Fastify for type-safe routing
  patterns:
    - Reusable Zod schemas for common validation patterns
    - Structured error responses with code, message, and field-level details
    - Hierarchy-aware param schemas (org, site, area, unit)
key-files:
  created:
    - backend/src/schemas/common.ts: Common Zod schemas for validation
    - backend/src/schemas/index.ts: Schemas barrel export
    - backend/src/utils/errors.ts: Error response helper functions
    - backend/src/utils/index.ts: Utils barrel export
  modified:
    - backend/package.json: Added Zod dependencies
    - backend/src/app.ts: Configured Zod type provider
    - backend/src/middleware/org-context.ts: Fixed type compatibility with ZodTypeProvider
decisions:
  - decision: Use Zod for schema validation
    rationale: TypeScript-first, excellent type inference, better DX than JSON Schema
    impact: All API endpoints will use Zod schemas for request/response validation
  - decision: Structured error response format
    rationale: Consistent error handling across all endpoints with code, message, and optional field-level details
    impact: All error responses follow ErrorResponseSchema structure
  - decision: Hierarchy-aware param schemas
    rationale: Multi-tenant architecture requires validating organization/site/area/unit context in route params
    impact: Each endpoint validates appropriate level of hierarchy access
  - decision: Generic middleware for type provider compatibility
    rationale: Middleware must work with both ZodTypeProvider and default type provider
    impact: Removed explicit type parameters from middleware for flexibility
metrics:
  duration: 3m 49s
  commits: 4
  tests-added: 0
  tests-passing: 10/10
completed: 2026-01-23
---

# Phase 03 Plan 01: Zod Validation Infrastructure Summary

**One-liner:** Established Zod validation infrastructure with common schemas, error utilities, and Fastify type provider integration for type-safe API development.

## What Was Built

### 1. Zod Dependencies (Task 1)

- Installed `zod` 4.3.6 for TypeScript-first schema validation
- Installed `fastify-type-provider-zod` 6.1.0 for Fastify integration
- Enables type-safe request/response validation with excellent DX

### 2. Common Validation Schemas (Task 2)

Created `backend/src/schemas/common.ts` with reusable Zod schemas:

**Primitive Types:**

- `UuidSchema`: RFC 4122 UUID validation
- `TimestampSchema`: ISO 8601 timestamp with coercion to Date

**Hierarchical Param Schemas:**

- `OrgParamsSchema`: Organization-scoped routes
- `SiteParamsSchema`: Site-scoped routes (includes org)
- `AreaParamsSchema`: Area-scoped routes (includes org + site)
- `UnitParamsSchema`: Unit-scoped routes (full hierarchy)

**Error Response Schemas:**

- `ErrorDetailSchema`: Field-level error details with path and message
- `ErrorResponseSchema`: Structured error format with code, message, optional details
- TypeScript type exports for `ErrorResponse` and `ErrorDetail`

### 3. Error Response Utilities (Task 3)

Created `backend/src/utils/errors.ts` with helper functions:

**Error Codes:**

- `NOT_FOUND`, `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`

**Helper Functions:**

- `notFound(reply, message)`: Send 404 with structured error
- `validationError(reply, message, details?)`: Send 400 with field-level validation errors
- `forbidden(reply, message)`: Send 403 for authorization failures
- `conflict(reply, message)`: Send 409 for duplicate/conflict errors

All helpers return consistent `ErrorResponse` format with proper HTTP status codes.

### 4. Fastify Zod Type Provider (Task 4)

Configured `backend/src/app.ts` with Zod validation:

**Configuration:**

- Imported `serializerCompiler`, `validatorCompiler`, `ZodTypeProvider` from fastify-type-provider-zod
- Set validator compiler for request validation
- Set serializer compiler for response validation
- Enables type-safe routes with Zod schema integration

**Middleware Type Compatibility Fix:**

- Removed explicit type parameter from `requireOrgContext` middleware
- Changed from `FastifyRequest<{ Params: OrgParams }>` to `FastifyRequest`
- Middleware now works with both `ZodTypeProvider` and default type provider
- Fixed import path to use services barrel export correctly

## Verification Completed

✅ `pnpm list zod fastify-type-provider-zod` shows both packages installed
✅ `npx tsc --noEmit` passes with no TypeScript errors
✅ `pnpm test` passes (10/10 tests - all existing auth and RBAC tests)
✅ Common validation schemas exported and available
✅ Error response utilities provide consistent error format
✅ Fastify app configured with Zod type provider

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed middleware type compatibility with ZodTypeProvider**

- **Found during:** Task 4 TypeScript verification
- **Issue:** `requireOrgContext` middleware had explicit type parameter `FastifyRequest<{ Params: OrgParams }>` which was incompatible with routes using `ZodTypeProvider`. TypeScript compilation failed with type assignment errors.
- **Root cause:** Routes created by `fastify.withTypeProvider<ZodTypeProvider>()` pass different generic types to preHandler hooks than the old default type provider.
- **Fix:**
  - Removed explicit type parameter from `requireOrgContext` function signature
  - Changed from `FastifyRequest<{ Params: OrgParams }>` to `FastifyRequest`
  - Added type assertion `as { organizationId?: string }` when accessing params
  - Fixed import to use services barrel export: `import { userService } from '../services/index.js'`
- **Files modified:** `backend/src/middleware/org-context.ts`
- **Commit:** 1294aed (part of Task 4 commit)
- **Why this qualifies as auto-fix:** Middleware type incompatibility prevented TypeScript compilation, which blocked task verification. This is a correctness bug - the middleware needs to work with the new type provider for the Zod infrastructure to be usable.

## Next Phase Readiness

**Phase 03 Plans 02-06 are now unblocked:**

All subsequent API endpoint plans can now:

- Use common Zod schemas (UuidSchema, param schemas, error schemas)
- Return consistent error responses via helper functions
- Define type-safe routes with Zod schema validation
- Leverage TypeScript type inference from Zod schemas

**Infrastructure Dependencies Met:**

- ✅ Zod validation library available
- ✅ Common schemas for UUIDs, params, timestamps, errors
- ✅ Error response utilities for consistent error handling
- ✅ Fastify configured with Zod type provider
- ✅ Middleware compatible with both type providers

**Ready for:** Plan 03-02 (Organizations API), 03-03 (Sites API), and all subsequent endpoint implementations.

**No blockers or concerns.**

## Key Commits

| Commit  | Task | Description                                                            |
| ------- | ---- | ---------------------------------------------------------------------- |
| 9ba5e44 | 1    | Install Zod and fastify-type-provider-zod                              |
| 9c16101 | 2    | Create common validation schemas (UUID, params, errors)                |
| a65984f | 3    | Create error response utilities (notFound, validationError, etc.)      |
| 1294aed | 4    | Configure Fastify with Zod type provider, fix middleware compatibility |

**Total commits:** 4 (one per task)
**Duration:** 3 minutes 49 seconds
**Tests:** 10/10 passing (no new tests required - infrastructure only)

---

_Summary completed: 2026-01-23 after executing 03-01-PLAN.md_
