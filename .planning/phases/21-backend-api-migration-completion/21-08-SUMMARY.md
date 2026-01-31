---
phase: 21-backend-api-migration-completion
plan: 08
subsystem: frontend-hooks
tags: [tRPC, hooks, migration, supabase-removal]
dependency_graph:
  requires: ['21-06', '21-07']
  provides: ['tRPC-based TTN settings hooks', 'tRPC-based escalation contacts hooks']
  affects: ['21-09']
tech_stack:
  added: []
  patterns: ['useTRPCClient for imperative mutations', 'snake_case field mapping']
key_files:
  created: []
  modified:
    - src/hooks/useTTNSettings.ts
    - src/hooks/useTTNOperations.ts
    - src/hooks/useEscalationContacts.ts
decisions:
  - id: HOOKS-03
    summary: 'Use useTRPCClient for callback-based queries (not reactive hooks)'
    context: 'useTTNSettings needs to call query in loadSettings callback'
  - id: HOOKS-04
    summary: 'Keep TTN provisioning edge function for now'
    context: 'Provisioning requires BullMQ job migration in future phase'
  - id: HOOKS-05
    summary: 'Backend escalation contacts schema uses snake_case'
    context: 'Frontend interface already uses snake_case, no mapping needed'
metrics:
  duration: '~5 minutes'
  completed: '2026-01-25'
---

# Phase 21 Plan 08: Migrate TTN and Escalation Hooks to tRPC Summary

**One-liner:** Migrated useTTNSettings, useTTNOperations, and useEscalationContacts hooks from Supabase to tRPC.

## What Was Built

Migrated three frontend hooks from Supabase edge functions and direct queries to use the tRPC routers created in 21-06 and 21-07.

### useTTNSettings (Task 1)

- Removed Supabase edge function call (`manage-ttn-settings` GET action)
- Now uses `client.ttnSettings.get.query()` via tRPC
- Kept `checkBootstrapHealth` as direct fetch (still using edge function endpoint)

### useTTNOperations (Task 2)

- Migrated `handleTest` to `client.ttnSettings.test.mutate()`
- Migrated `handleToggleEnabled` to `client.ttnSettings.update.mutate()`
- Kept `handleProvision` using edge function (requires BullMQ job migration in future phase)

### useEscalationContacts (Task 3)

- Removed all direct Supabase queries
- `useEscalationContacts` uses `client.escalationContacts.list.query()`
- `useCreateEscalationContact` uses `client.escalationContacts.create.mutate()`
- `useUpdateEscalationContact` uses `client.escalationContacts.update.mutate()`
- `useDeleteEscalationContact` uses `client.escalationContacts.delete.mutate()`

## Key Implementation Details

### Pattern Used

Used `useTRPCClient()` for all hooks because:

- Settings hooks need to call queries imperatively in callbacks
- Mutation hooks need the client for `mutate()` calls
- Consistent pattern across all migrated hooks

### Field Name Mapping

Backend escalation contacts schema uses snake_case field names which match the frontend `EscalationContact` interface. No field name translation was needed.

## Commits

| Hash    | Type     | Description                                        |
| ------- | -------- | -------------------------------------------------- |
| 69665d7 | refactor | migrate useTTNSettings hook to tRPC                |
| d5ba2ef | refactor | migrate useTTNOperations hook to tRPC (partial)    |
| c68a24e | refactor | migrate useEscalationContacts hook to tRPC         |
| c0666a5 | fix      | correct useEscalationContacts field names for tRPC |

## Files Changed

| File                               | Change                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| src/hooks/useTTNSettings.ts        | Replaced Supabase edge function with tRPC query             |
| src/hooks/useTTNOperations.ts      | Replaced test/toggle with tRPC mutations, kept provisioning |
| src/hooks/useEscalationContacts.ts | Replaced all Supabase queries with tRPC CRUD                |

## Decisions Made

| ID       | Decision                                           | Rationale                                                                         |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| HOOKS-03 | Use useTRPCClient for callback-based queries       | useTTNSettings needs to call query in loadSettings callback, not as reactive hook |
| HOOKS-04 | Keep TTN provisioning edge function for now        | Provisioning is complex and requires BullMQ job migration                         |
| HOOKS-05 | Backend escalation contacts schema uses snake_case | Frontend interface already matches, no mapping needed                             |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect field name mapping**

- **Found during:** Task 3 verification
- **Issue:** Initial implementation used camelCase field names (notificationChannels, isActive) but backend schema uses snake_case
- **Fix:** Updated to use snake_case field names matching backend schema
- **Files modified:** src/hooks/useEscalationContacts.ts
- **Commit:** c0666a5

## Verification Results

- [x] TypeScript compilation passes (no errors in migrated hook files)
- [x] No Supabase imports in useTTNSettings.ts
- [x] No Supabase imports in useEscalationContacts.ts
- [x] useTTNOperations.ts only imports Supabase for provisioning (documented as TEMPORARY)
- [x] Frontend builds successfully

## Next Phase Readiness

Plan 21-08 provides migrated hooks that:

- Use tRPC routers from 21-06 (ttnSettings) and 21-07 (escalationContacts)
- Follow established patterns from Phase 20 hook migrations
- Maintain backward compatibility with existing component interfaces

Ready for 21-09 to continue hook migration (TTN wizard, provisioning, API key hooks).
