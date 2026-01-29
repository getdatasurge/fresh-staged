# Project State: FreshTrack Pro Migration

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-25)

**Core value:** Reliable food safety data flow.
**Current focus:** v2.2 Technical Debt - Gap Closure

## Current Position

Milestone: v2.2 Technical Debt & Stabilization
Phase: 31 of 33 (TTN Provisioning UI Migration)
Plan: Not yet created
Status: Ready for planning
Last activity: 2026-01-28 - Added gap closure phases from audit

Progress: ███████░░░ 75% (30/33 phases, 3 gap closure phases pending)

## Progress
- [x] **27. TTN SDK Integration**: Complete.
- [~] **28. Supabase Removal**: Partial. Edge function calls remain (25 in 9 files).
- [x] ~~**29. Production Data Migration**~~: SKIPPED - No access to Supabase production database.
- [x] **30. System Hardening**: Complete. All 4 plans executed and verified.
- [ ] **31. TTN Provisioning UI Migration**: Pending. Wire TTN UI to tRPC endpoints.
- [ ] **32. Remaining Edge Function Migration**: Pending. Migrate remaining edge function calls.
- [ ] **33. Error Handling UI Integration**: Pending. Wire SupabaseMigrationError to UI.

## Recent Achievements
- Removed Supabase client and integration files with placeholder fallbacks.
- Updated TTN/Telnyx webhook URLs to backend endpoints.
- Stubbed legacy Supabase-backed flows pending backend replacements.
- Enhanced supabase-placeholder.ts with SupabaseMigrationError class and structured error responses.
- Added @fastify/helmet security headers, 1MB body limit, and 30s request timeout to backend.
- Applied non-breaking security patches via npm audit fix (no HIGH/CRITICAL vulnerabilities).
- Verified all hardening changes work together: 1030 backend tests pass, security headers present, frontend builds.

## Next Steps
1. Plan Phase 31 (TTN Provisioning UI Migration) - `/gsd:plan-phase 31`
2. Execute gap closure phases 31-33
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

## Blockers/Concerns Carried Forward
- Placeholder TTN/layout/restore/health flows need backend replacements.
- 15 pre-existing test failures in ttn-devices.test.ts need subscription middleware mocks added.

## Session Continuity

Last session: 2026-01-28
Stopped at: Created gap closure phases 31-33 from audit
Resume file: None
Next action: `/gsd:plan-phase 31`
