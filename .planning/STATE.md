# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Reliable food safety data flow.
**Current focus:** v2.2 Technical Debt - Gap Closure

## Current Position

Milestone: v2.2 Technical Debt & Stabilization
Phase: 32 of 33 (Remaining Edge Function Migration)
Plan: 5 of 6 complete (gap closure plans)
Status: Executing gap closure plans
Last activity: 2026-01-29 - Completed 32-05-PLAN.md (Reports export implementation)

Progress: ████████░░ 97% (32/33 phases)

## Progress
- [x] **27. TTN SDK Integration**: Complete.
- [~] **28. Supabase Removal**: Partial. Edge function calls remain in other files.
- [x] ~~**29. Production Data Migration**~~: SKIPPED - No access to Supabase production database.
- [x] **30. System Hardening**: Complete. All 4 plans executed and verified.
- [x] **31. TTN Provisioning UI Migration**: VERIFIED. All tRPC procedures + frontend migration complete.
- [x] **32. Remaining Edge Function Migration**: COMPLETE. All 4 plans executed.
- [ ] **33. Error Handling UI Integration**: Pending. Wire SupabaseMigrationError to UI.

## Recent Achievements
- **Phase 32 Plan 05 Complete** - Reports export implementation (gap closure)
- Implemented real database queries for reports.export procedure
- Added CSV/HTML export formatting for sensor readings
- Added unit filtering by unitId, siteId, or organizationId hierarchy

## Next Steps
1. Execute 32-06-PLAN.md (Manual temperature logging - Gap 2 closure)
2. Re-audit Phase 32 after gap closure
3. Plan and execute Phase 33: Error Handling UI Integration

## Decisions
| Phase | Decision | Rationale |
| --- | --- | --- |
| 28-06 | Resolve unit hierarchy via units.listByOrg before units.get | Unit routes provide unitId only |
| 28-06 | Placeholder Recently Deleted list while tRPC endpoint is pending | Supabase reads removed from UI |
| 28-07 | Use placeholder client for removed Supabase calls | Keep UI stable while backend replacements are pending |
| 29 | Skip Phase 29 entirely | No access to Supabase production database credentials - will never be available |
| 30-03 | Use TypeScript class for error with isSupabaseMigration flag | Cross-module error detection (instanceof can fail across module boundaries) |
| 30-01 | CSP allows 'unsafe-inline' for scripts/styles | Required for React SPA hydration |
| 30-01 | HSTS disabled at app level | Handled by reverse proxy (Caddy/nginx) in production |
| 30-02 | Accept moderate dev-only vulnerabilities | esbuild/vite only affect dev environment, not production |
| 30-02 | Accept elliptic transitive vulnerability | No fix available, must wait for upstream @stackframe update |
| 30-04 | Document pre-existing TTN test failures | Missing subscription middleware mocks in ttn-devices.test.ts, unrelated to hardening |
| 31-01 | Use Drizzle schema extension for ttn_connections columns | Type-safe access to provisioning state fields |
| 31-01 | SafeDecrypt pattern returns { value, status } | Track empty vs decrypted vs failed states |
| 31-01 | Role-based access: manager read-only, admin/owner write | Match edge function permissions |
| 31-02 | Use useQuery with enabled:false + refetch() for imperative data loading | Manual control over when credentials are fetched |
| 31-02 | Dual error display (toast + inline) | Per CONTEXT.md for actionable guidance |
| 32-02 | Shared export mutation across all 3 components | Single tRPC procedure replaces 3 identical edge function calls |
| 32-03 | verificationStatus uses publicProcedure | Read-only status check, no auth needed |
| 32-03 | configureWebhook uses orgProcedure with admin/owner check | Webhook configuration requires elevated permissions |
| 32-03 | verifyPublicAsset uses publicProcedure | Public URL HEAD check, no auth needed |
| 32-01 | Database trigger handles initial TTN provisioning | Frontend only polls for status, trigger queues job on org creation |
| 32-01 | Interval-based polling with cleanup for Onboarding status | Consistent with other polling patterns, prevents memory leaks |
| 32-04 | Keep SensorSimulatorPanel edge function as-is | Admin-only dev tool, migration to tRPC not required |
| 32-04 | Map tRPC diagnose response to TtnDiagnoseResult format | Modal compatibility with existing UI |
| 32-05 | Filter exceptions in-memory after DB query | Avoid complex SQL CAST for numeric comparison |

## Blockers/Concerns Carried Forward
- Placeholder TTN/layout/restore/health flows need backend replacements.
- 15 pre-existing test failures in ttn-devices.test.ts need subscription middleware mocks added.

## Session Continuity

Last session: 2026-01-29
Stopped at: Completed 32-05-PLAN.md
Resume file: None
Next action: Execute 32-06-PLAN.md (Gap 2 closure)
