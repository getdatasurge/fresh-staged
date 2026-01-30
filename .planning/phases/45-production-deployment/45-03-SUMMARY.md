---
phase: 45
plan: 03
status: complete
completed: 2026-01-29T22:30:00Z
commits:
  - c4de768 fix(45-03): fix TTNCredentialsPanel infinite refetch loop causing 429 errors
  - 1d14d4b fix(45-03): remove excessive useEffectiveIdentity debug logging
  - a1c9cbf fix(45-03): reduce Socket.io reconnection spam on server error
---

# 45-03 Summary: Post-Deployment Validation

## What Was Done

### Task 1: Verify SSL and Core Services (auto) — PASS
- TLS 1.3 confirmed via `curl -vI`
- All 14 Docker containers running, 10 with passing health checks
- API health endpoint returns `{"status":"healthy"}` with database and redis pass (1ms latency)
- Caddy reverse proxy serving HTTPS on port 443

### Task 2: Configure External Service Webhooks (checkpoint) — PASS
- User confirmed webhooks configured for external services

### Task 3: End-to-End User Flow Validation (checkpoint) — PARTIAL
User tested the E2E flow in browser and discovered 3 bugs:

**Bugs Found & Fixed:**
1. **TTNCredentialsPanel infinite refetch loop** — `useUser()` returned new object reference each render, causing useCallback/useEffect chain to loop infinitely, hitting 429 rate limits. Fixed with stable `userRef` pattern. (commit c4de768)
2. **Excessive useEffectiveIdentity logging** — Removed render-level console.log and 4 debug logs from queryFn. (commit 1d14d4b)
3. **Socket.io reconnection spam** — Limited reconnection to 5 attempts, increased delays, throttled error logging. (commit a1c9cbf)

All fixes deployed to VM via git push → pull → docker compose rebuild.

**Playwright E2E Smoke Tests Created (Quick 004):**
- `playwright.production.config.ts` — config targeting https://192.168.4.181
- `e2e/production-smoke.spec.ts` — 4 smoke tests, all pass
- Tests confirm: HTML serves, API healthy, JS bundle loads, no critical resource failures

## Critical Issue Discovered

**React fails to mount in production** — `TypeError: e[i] is not a function`

Root cause analysis (architect investigation):
1. **PRIMARY**: 30+ call sites use `.mutate()` and `.query()` on the `useTRPC()` proxy, which only supports `.mutationOptions()` and `.queryOptions()` in `@trpc/tanstack-react-query` v11. The proxy's `contextMap` doesn't contain `"mutate"` or `"query"` keys, so `contextMap["mutate"]` is `undefined` → `undefined()` throws TypeError.
2. **CONTRIBUTING**: Phantom `@trpc/react-query` dependency in package.json (not imported anywhere, but bundled and creates module conflicts)
3. **CONTRIBUTING**: tRPC version mismatch — `@trpc/server` at 11.9.0, `@trpc/client` at 11.8.1, `@trpc/tanstack-react-query` at 11.8.1
4. **CONTRIBUTING**: Zod major version mismatch — frontend uses Zod 3, backend uses Zod 4

**Fix required (separate phase):**
- Remove `@trpc/react-query` from package.json
- Fix all 30+ `.mutate()`/`.query()` calls to use `useTRPCClient()` or `.mutationOptions()`/`.queryOptions()`
- Pin all tRPC packages to same version (11.9.0)
- Align Zod versions

## Deployment State

| Metric | Value |
|--------|-------|
| Containers | 14 running, 10 healthy |
| API health | healthy, DB 1ms, Redis 1ms |
| Disk usage | 17% (16GB of 96GB) |
| Frontend | Serves HTML/CSS/JS correctly |
| App render | BLOCKED by tRPC crash |
| Uptime | ~4 hours since initial deployment |
