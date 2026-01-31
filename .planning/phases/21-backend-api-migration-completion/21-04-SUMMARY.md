---
phase: 21
plan: 04
subsystem: api-notifications
tags: [tRPC, notification-policies, backend, service-layer]

# Dependency Graph
requires:
  - '19-01: tRPC infrastructure'
  - '20-01: Domain router patterns'
provides:
  - 'notificationPoliciesRouter for frontend migration'
  - 'getEffectiveNotificationPolicy service replacing Supabase RPC'
affects:
  - '21-05: Frontend hook migration'
  - 'Phase 22: Supabase client removal'

# Tech Tracking
tech-stack:
  added: []
  patterns:
    - 'Raw SQL queries for unmigrated tables'
    - 'Unit->Site->Org inheritance chain'
    - 'Effective policy resolution with source flags'

# File Tracking
key-files:
  created:
    - backend/src/services/notification-policy.service.ts
    - backend/src/routers/notification-policies.router.ts
    - backend/tests/services/notification-policy.service.test.ts
    - backend/tests/trpc/notification-policies.router.test.ts
  modified:
    - backend/src/trpc/router.ts

# Decisions
decisions:
  - id: POLICY-01
    decision: 'Use raw SQL for notification_policies queries'
    rationale: 'Table exists in Supabase but not Drizzle schema, avoids schema migration'

# Metrics
duration: '6 minutes'
completed: '2026-01-25'
tests_added: 44
---

# Phase 21 Plan 04: Notification Policies tRPC Router Summary

**One-liner:** Notification policy service with unit->site->org inheritance chain and 6 tRPC procedures for full CRUD operations.

## Tasks Completed

| #   | Task                                                           | Commit  | Key Files                                                                 |
| --- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| 1   | Create notification policy service with effective policy logic | 8316ece | notification-policy.service.ts                                            |
| 2   | Create notification policies tRPC router                       | 2b9681d | notification-policies.router.ts, router.ts                                |
| 3   | Add tests for service and router                               | cc92692 | notification-policy.service.test.ts, notification-policies.router.test.ts |

## What Was Built

### Notification Policy Service

New service implementing hierarchical policy resolution:

- **listNotificationPolicies(scope)**: Query policies by org/site/unit scope
- **getNotificationPolicy(id, orgId)**: Get single policy with org verification
- **upsertNotificationPolicy(scope, alertType, policy)**: Create/update with conflict handling
- **deleteNotificationPolicy(scope, alertType)**: Delete by scope and alert type
- **getEffectiveNotificationPolicy(unitId, alertType)**: Replaces Supabase RPC function

The effective policy lookup implements inheritance chain:

1. Check for unit-level policy
2. Fall back to site-level policy
3. Fall back to org-level policy
4. Return null if no policy at any level

Each level returns source flags (source_unit, source_site, source_org) indicating where the policy was found.

### Notification Policies tRPC Router

6 procedures covering all frontend hook use cases:

| Procedure    | Auth                       | Description                            |
| ------------ | -------------------------- | -------------------------------------- |
| listByOrg    | orgProcedure               | List org-level policies                |
| listBySite   | orgProcedure               | List site-level policies               |
| listByUnit   | orgProcedure               | List unit-level policies               |
| getEffective | orgProcedure               | Get effective policy with source flags |
| upsert       | orgProcedure + admin/owner | Create/update policy                   |
| delete       | orgProcedure + admin/owner | Delete policy                          |

### Test Coverage

44 tests added:

**Service tests (22 cases):**

- listNotificationPolicies: org/site/unit scope filtering
- getEffectiveNotificationPolicy: unit->site->org inheritance chain
- upsertNotificationPolicy: create/update with scope handling
- deleteNotificationPolicy: parameterized deletion

**Router tests (22 cases):**

- All 6 procedures with happy path testing
- Role-based access control (admin/owner for mutations)
- FORBIDDEN error testing for non-admin roles
- Source flag verification for effective policy

## Decisions Made

| ID        | Decision                                      | Rationale                                                                                            |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| POLICY-01 | Use raw SQL for notification_policies queries | Table exists in Supabase but not Drizzle schema - avoids schema migration during API migration phase |

## Verification Results

- TypeScript compiles without errors
- Router registered in appRouter as `notificationPolicies`
- All 44 tests passing
- Effective policy logic matches Supabase RPC behavior

## Frontend Migration Path

Frontend hooks in `src/hooks/useNotificationPolicies.ts` can now migrate:

| Current Supabase Usage                                                  | tRPC Replacement                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `supabase.from("notification_policies").select().eq("organization_id")` | `trpc.notificationPolicies.listByOrg.useQuery()`    |
| `supabase.from("notification_policies").select().eq("site_id")`         | `trpc.notificationPolicies.listBySite.useQuery()`   |
| `supabase.from("notification_policies").select().eq("unit_id")`         | `trpc.notificationPolicies.listByUnit.useQuery()`   |
| `supabase.rpc("get_effective_notification_policy")`                     | `trpc.notificationPolicies.getEffective.useQuery()` |
| `supabase.from("notification_policies").upsert()`                       | `trpc.notificationPolicies.upsert.useMutation()`    |
| `supabase.from("notification_policies").delete()`                       | `trpc.notificationPolicies.delete.useMutation()`    |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- Ready for frontend hook migration
- notificationPolicies router exported and registered
- All procedures match frontend hook requirements
- Test coverage ensures reliability during migration
