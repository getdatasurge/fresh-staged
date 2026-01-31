# What's Next — FreshTrack Pro v2.7

<original_task>
Fix the tRPC runtime crash (`TypeError: e[i] is not a function`) preventing React from mounting in production. The production infrastructure (14 Docker containers, API healthy, SSL via Caddy) works, but the SPA at https://192.168.4.181 never renders because the tRPC v11 proxy layer doesn't support `.mutate()`/`.query()` calls used across 30+ call sites.

Milestone: v2.7 tRPC Client Fix
Phases: 46 (Dependency Cleanup), 47 (tRPC Proxy Call Migration), 48 (Production Redeploy & Verification)
Requirements: DEP-01..03, TRPC-01..04, PROD-01..03 (10 total)
</original_task>

<work_completed>

## Phase 46: Dependency Cleanup (COMPLETE)

**Plan:** `.planning/phases/46-dependency-cleanup/46-01-PLAN.md`
**Summary:** `.planning/phases/46-dependency-cleanup/46-01-SUMMARY.md`

- Removed phantom `@trpc/react-query` from `package.json` (was bundled but never imported)
- Pinned all tRPC packages to exact `11.9.0`:
  - `@trpc/client`: `^11.8.1` → `11.9.0`
  - `@trpc/server`: `^11.8.1` → `11.9.0`
  - `@trpc/tanstack-react-query`: `^11.8.1` → `11.9.0`
- Upgraded frontend Zod from `^3.25.76` to `^4.3.6` (matches backend)
- Verified: `pnpm install` clean, `pnpm run build` succeeds (9.46s), 141 tests pass (129 passed, 12 skipped)
- Requirements satisfied: DEP-01 ✓, DEP-02 ✓, DEP-03 ✓

## Phase 47: tRPC Proxy Call Migration (COMPLETE — 3 plans)

**Plans and summaries in:** `.planning/phases/47-trpc-proxy-call-migration/`

### 47-01: Hook files

- Fixed `.mutate()`/`.query()` in: `useAlertRules.ts`, `useAlertRulesHistory.ts`, `useWidgetHealthMetrics.ts`, `useSiteLocationMutation.ts`
- Pattern: replaced `trpc.router.procedure.mutate(data)` with `const client = useTRPCClient(); client.router.procedure.mutate(data)`

### 47-02: Feature files

- Fixed: `useEntityLayoutStorage.ts`, `BillingTab.tsx`

### 47-03: Pages/widgets + full codebase verification

- Fixed: `Inspector.tsx`, `PilotSetup.tsx`, `SiteAlertsSummaryWidget.tsx`, `AlertHistoryWidget.tsx`
- Full codebase grep confirmed zero remaining `.mutate()`/`.query()` on `useTRPC()` proxy
- Requirements satisfied: TRPC-01 ✓, TRPC-02 ✓, TRPC-03 ✓, TRPC-04 ✓

## Phase 48: Partial Work Done

- Phase 48 plan created: `.planning/phases/48-production-redeploy-verification/48-01-PLAN.md`
- Smoke test strengthened: `e2e/production-smoke.spec.ts` now asserts `expect(rootChildren).toBeGreaterThan(0)` instead of just logging a warning
- Code committed locally:
  - `e56054b test(48-01): strengthen smoke test to assert React mount`
  - `52b35d6 fix(48-01): commit phase 46-47 dependency and tRPC migration changes`

## Git State

- Latest commit: `52b35d6 fix(48-01): commit phase 46-47 dependency and tRPC migration changes`
- Working tree: Has modified and deleted files (see `git status`). Many deleted files are from old tooling directories (`.beads/`, `.codex/`, `.gsd/`, `.kilocode/`, `.ralph*/`, `.gemini/`) plus modified `.planning/` docs. Also untracked files (`.npmrc`, `.omc/`, `.tldr/`, `e2e/screenshots/`, `fresh-staged1/`, `playwright.production.config.ts`, execution summaries, `scripts/.deploy-state/`, `test-results/`)
- **Not pushed to remote yet** — local commits only
  </work_completed>

<work_remaining>

## Phase 48: Production Redeploy & Verification (NOT STARTED)

Full plan at: `.planning/phases/48-production-redeploy-verification/48-01-PLAN.md`

### Task 1: Push code to VM, rebuild and redeploy frontend container

1. **Push local commits to remote** (if not already done):

   ```bash
   git push
   ```

2. **SSH to VM and pull latest code:**

   ```bash
   ssh root@192.168.4.181 "cd /opt/fresh-staged && git pull"
   ```

   - If local changes conflict: `git stash && git pull`

3. **Rebuild frontend container (no cache):**

   ```bash
   ssh root@192.168.4.181 "cd /opt/fresh-staged && export \$(grep -v '^#' .env.production | xargs) && docker compose -f docker-compose.yml -f compose.production.yaml build --no-cache frontend"
   ```

4. **Restart frontend container:**

   ```bash
   ssh root@192.168.4.181 "cd /opt/fresh-staged && export \$(grep -v '^#' .env.production | xargs) && docker compose -f docker-compose.yml -f compose.production.yaml up -d frontend"
   ```

5. **Wait ~10s, verify container healthy:**

   ```bash
   ssh root@192.168.4.181 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep frontend"
   ```

6. **Quick HTTP check:**
   ```bash
   curl -k -s -o /dev/null -w '%{http_code}' https://192.168.4.181/
   ```
   Expected: 200 or 308

### Task 2: Run Playwright smoke tests

```bash
cd /home/swoop/swoop-claude-projects/fresh-staged
npx playwright test --config=playwright.production.config.ts
```

4 tests in `e2e/production-smoke.spec.ts`:

1. "frontend serves HTML successfully" — HTTP response + title + #root
2. "API health endpoint responds" — /api/health returns healthy
3. "React app renders successfully" — **THE KEY TEST** — asserts `#root` has children
4. "no critical resources fail to load" — no JS/CSS failures

If Playwright not installed: `npx playwright install chromium`

### Task 3: Human verification checkpoint (BLOCKING)

User must manually:

1. Open `https://192.168.4.181` in browser (accept self-signed cert)
2. Confirm dashboard loads (not blank white page)
3. Check DevTools console — no `TypeError: e[i] is not a function`
4. Click around briefly to confirm navigation works

### Post-completion

After all 3 tasks pass:

1. Create summary: `.planning/phases/48-production-redeploy-verification/48-01-SUMMARY.md`
2. Update `.planning/ROADMAP.md` — mark Phase 48 complete, v2.7 100%
3. Update `.planning/STATE.md` — milestone v2.7 shipped
4. Update `.planning/REQUIREMENTS.md` — mark PROD-01..03 as Complete
5. Git commit with summary and state updates
6. v2.7 milestone complete — all 10 requirements satisfied

### Requirements to satisfy

- [ ] **PROD-01**: Frontend rebuilt and redeployed to 192.168.4.181
- [ ] **PROD-02**: App renders in browser (React mounts, `#root` has children)
- [ ] **PROD-03**: Playwright smoke tests pass with React rendering verified
      </work_remaining>

<attempted_approaches>

## This Session

This session invoked three skill commands but did not execute any implementation work:

1. **`/harness:create-roadmap`** — Loaded the harness roadmap creation workflow. Found that the project already has a complete ROADMAP.md for v2.7 with all phases defined and traceability complete. No new roadmap needed.

2. **`/tdd-migration-pipeline`** — Loaded the TDD migration pipeline skill. Not applicable to current work (Phase 48 is deployment, not migration/rewrite).

3. **`/whats-next`** — This handoff document (current).

## Previous Sessions (from STATE.md)

- **Root cause identified:** `TypeError: e[i] is not a function` caused by `.mutate()`/`.query()` on `useTRPC()` proxy which only supports `.mutationOptions()`/`.queryOptions()` in tRPC v11
- **Fix pattern established:** Replace `useTRPC()` proxy calls with `useTRPCClient()` which provides vanilla client supporting `.mutate()`/`.query()` directly
- **All code changes are committed locally** — no code work remains, only deployment

## Known Issues

- ServiceWorker registration fails due to self-signed cert (non-blocking, cosmetic console warning)
- 12 frontend tests skipped (pre-existing, not related to v2.7 changes)
- 15 pre-existing failures in `tests/api/ttn-devices.test.ts` (unrelated to migration)
  </attempted_approaches>

<critical_context>

## Deployment Architecture

- **VM**: 192.168.4.181 (IP-based, no domain)
- **SSL**: Self-signed via Caddy auto-TLS
- **Docker Compose**: base `docker-compose.yml` + overlay `compose.production.yaml`
- **Env vars**: `.env.production` on VM (must `export $(grep -v '^#' .env.production | xargs)` before docker compose commands)
- **Code path on VM**: `/opt/fresh-staged`
- **Frontend container name**: `frostguard-frontend`
- **VITE\_ env vars** must be passed as build args during `docker compose build` (Vite embeds them at build time, not runtime)

## Fix Pattern Applied (30+ call sites)

```typescript
// BEFORE (broken in tRPC v11)
const trpc = useTRPC();
trpc.router.procedure.mutate(data);
trpc.router.procedure.query(params);

// AFTER (working)
const client = useTRPCClient();
client.router.procedure.mutate(data);
client.router.procedure.query(params);
```

`useTRPCClient()` returns the vanilla tRPC client which supports `.mutate()`/`.query()` directly. `useTRPC()` returns the proxy that only supports `.mutationOptions()`/`.queryOptions()` (for use with TanStack Query hooks).

## Project Scale

- 9 milestones shipped (v1.0 through v2.6), 45 phases, 187 plans
- Backend: ~55K LOC TypeScript (Fastify, Drizzle, PostgreSQL, tRPC, Socket.io, BullMQ)
- Frontend: ~100K LOC TypeScript/TSX (React, TanStack Query, tRPC client)
- 1,050+ backend tests, 141 frontend tests
- 14+ Docker containers in production

## Harness Workflow

This project uses the orchestration harness with:

- `.planning/ROADMAP.md` — phase definitions with success criteria
- `.planning/STATE.md` — machine-managed state tracking
- `.planning/REQUIREMENTS.md` — requirement traceability with phase mapping
- `.planning/phases/{NN}-{name}/` — plan and summary files per phase
- Phases numbered sequentially across milestones (currently at 48)
- Config: `.planning/config.json` — `model_profile: "quality"`, research + plan_check + verifier enabled

## Git Working Tree

Large number of deleted files in git status from old tooling directories (`.beads/`, `.codex/`, `.gsd/`, `.kilocode/`, `.ralph*/`, `.gemini/`). These are not related to v2.7 work. Modified files in `.planning/` reflect milestone documentation updates. Untracked files include execution artifacts, screenshots, and new config files.
</critical_context>

<current_state>

## Deliverable Status

| Item                            | Status                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Phase 46 (Dependency Cleanup)   | **Complete** — 1/1 plans done                                                  |
| Phase 47 (tRPC Proxy Migration) | **Complete** — 3/3 plans done                                                  |
| Phase 48 (Production Redeploy)  | **Not Started** — plan exists, smoke test strengthened, code committed locally |
| v2.7 Milestone                  | **90% complete** — all code changes done, deployment pending                   |

## Files Ready for Deployment

All code changes from phases 46-47 are committed locally:

- `package.json` — phantom dep removed, versions pinned, Zod upgraded
- 12+ frontend source files — `.mutate()`/`.query()` calls migrated to `useTRPCClient()`
- `e2e/production-smoke.spec.ts` — strengthened to assert React mount

## What's Finalized vs. Draft

- **Finalized:** All code changes (phases 46-47), phase plans, phase summaries for 46-47
- **Draft/Pending:** Phase 48 execution, phase 48 summary, final state/roadmap/requirements updates

## Resume Command

```
/harness:execute-plan 48
```

Or manually follow the 3 tasks in `.planning/phases/48-production-redeploy-verification/48-01-PLAN.md`:

1. Push to VM + rebuild + redeploy frontend
2. Run Playwright smoke tests
3. User verifies in browser

## Open Questions

- None — Phase 48 plan is complete and unambiguous. Execution is straightforward deployment + verification.
  </current_state>

---

_Generated: 2026-01-29_
_Resume: `/harness:execute-plan 48` or `/clear` first for fresh context_
