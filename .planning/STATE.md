# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Reliable food safety data flow.
**Current focus:** v2.2 Technical Debt - Gap Closure

## Current Position

Milestone: v2.2 Technical Debt & Stabilization
Phase: 31 of 33 (TTN Provisioning UI Migration)
Plan: 1 of 1 complete
Status: In progress
Last activity: 2026-01-29 - Completed 31-01-PLAN.md (backend procedures)

Progress: ███████░░░ 76% (30.3/33 phases)

## Progress
- [x] **27. TTN SDK Integration**: Complete.
- [~] **28. Supabase Removal**: Partial. Edge function calls remain (25 in 9 files).
- [x] ~~**29. Production Data Migration**~~: SKIPPED - No access to Supabase production database.
- [x] **30. System Hardening**: Complete. All 4 plans executed and verified.
- [~] **31. TTN Provisioning UI Migration**: In progress. Plan 01 complete (backend procedures).
- [ ] **32. Remaining Edge Function Migration**: Pending. Migrate remaining edge function calls.
- [ ] **33. Error Handling UI Integration**: Pending. Wire SupabaseMigrationError to UI.

## Recent Achievements
- Added 5 new tRPC procedures to ttn-settings router: getCredentials, getStatus, provision, startFresh, deepClean
- Extended TtnProvisioningService with retryProvisioning, startFresh, and deepClean methods
- Added Zod schemas for credentials and provisioning response types
- Extended Drizzle ttnConnections schema with provisioning state columns
- Added 18 new tests (35 total) for TTN settings router

## Next Steps
1. Plan next phase (31-02 if frontend wiring needed, or move to phase 32)
2. Execute remaining gap closure phases 31-33
3. Re-audit milestone with `/gsd:audit-milestone`
4. Complete milestone when audit passes

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

## Blockers/Concerns Carried Forward
- Placeholder TTN/layout/restore/health flows need backend replacements.
- 15 pre-existing test failures in ttn-devices.test.ts need subscription middleware mocks added.

## Session Continuity

Last session: 2026-01-29
Stopped at: Completed 31-01-PLAN.md
Resume file: None
Next action: Plan next phase or execute 31-02 if needed
