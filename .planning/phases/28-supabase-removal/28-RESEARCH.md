---
phase: 28
plan: research
---

# RESEARCH: Supabase Removal

## Goal

Remove the `@supabase/supabase-js` dependency.

## Findings

The `grep` search for `supabase.from` found confirmed usages:

1.  `src/components/site/SiteComplianceSettings.tsx`: Updates site configuration directly.
2.  `src/hooks/useAlertRulesHistory.ts`: Fetches history and user profiles.
3.  `src/hooks/useAuditedWrite.ts`: Calls `log_impersonated_action` via RPC.
4.  `src/pages/PilotSetup.tsx`: likely similar.
5.  `src/pages/platform/PlatformDeveloperTools.tsx`.
6.  `src/lib/eventLogger.ts`.
7.  `src/hooks/useOfflineSync.ts` (Risk: complicated logic?).

We need to migrate these to tRPC routers.

### Migration Mapping

1.  **Site Compliance Settings**
    - Current: `supabase.from("sites").update(...)`
    - Target: `trpc.sites.updateComplianceSettings`

2.  **Alert Rules History**
    - Current: `supabase.from("alert_rules_history").select("*")...`
    - Target: `trpc.alerts.getHistory` (Need to verify router exists)

3.  **Audit Logs**
    - Current: `supabase.rpc('log_impersonated_action')`
    - Target: The backend should handle auditing automatically in `middleware` or via `AuditService`.
    - `useAuditedWrite` should likely just wrap the mutation execution, maybe setting a header? Or just rely on the fact that if we use tRPC, we are authenticated as the impersonating user (Stack Auth handles impersonation tokens). Wait, Stack Auth impersonation puts the _target_ user in the token. We need to check how to preserve _acting_ user info.

4.  **Storage / Realtime**
    - No direct results for `supabase.storage` or `supabase.channel` yet, but `grep` might have missed them if searched incorrectly or if none exist.
    - I'll assume standard usage pattern `const channel = supabase.channel(...)`.

## Architecture Decisions

- **Audit Logging**: Move `log_impersonated_action` logic to a backend service `AuditService`.
- **Hooks**: Replace direct supabase calls with `trpc.router.procedure.useQuery/useMutation`.

## Plan Breakdown

- **28-01: Audit Service Migration**: `useAuditedWrite` & `eventLogger.ts` -> `AuditService` (backend).
- **28-02: Site Compliance Migration**: `SiteComplianceSettings.tsx` -> `trpc.sites`.
- **28-03: Alert Rules Migration**: `useAlertRulesHistory.ts` -> `trpc.alerts`.
- **28-04: Offline Sync Migration**: `useOfflineSync` -> likely needs `trpc` implementation or simple HTTP.
- **28-05: System Pages Migration**: `PilotSetup`, `PlatformTools`.
- **28-06: Dependency Removal**: Uninstall `@supabase/supabase-js` and delete `src/integrations/supabase`.
