---
phase: 48-production-redeploy-verification
plan: 01
status: complete
completed: 2026-01-30
---

## Result

**PASS** — Frontend redeployed with tRPC proxy fixes and component tree ordering fix. React mounts successfully. No `TypeError: e[i] is not a function`. Dashboard loads for authenticated users. All 4 Playwright smoke tests pass.

## What Changed

### Frontend URL Configuration (Bug Fix)

Three frontend files used `import.meta.env.VITE_API_URL || 'http://localhost:3000'` which fell back to `localhost:3000` in production (because `VITE_API_URL` was passed as empty string, which is falsy in JavaScript). Fixed to use relative URLs in production:

| File                             | Change |
| -------------------------------- | ------ | --- | -------------------------- | --- | ------------------------------------------------------------------------- |
| `src/lib/trpc.ts:15`             | `      |     | 'http://localhost:3000'`→` |     | (import.meta.env.DEV ? 'http://localhost:3000' : '')`                     |
| `src/lib/socket.ts:24`           | `      |     | 'http://localhost:3000'`→` |     | (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin)` |
| `src/hooks/useTTNSettings.ts:64` | `      |     | 'http://localhost:3000'`→` |     | (import.meta.env.DEV ? 'http://localhost:3000' : '')`                     |

### Caddy Reverse Proxy (Missing Routes + TLS Fix)

| File                     | Change                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `docker/caddy/Caddyfile` | Added `/trpc/*` route → `backend:3000` (tRPC API)                                                          |
| `docker/caddy/Caddyfile` | Added `/socket.io/*` route → `backend:3000` (WebSocket)                                                    |
| `docker/caddy/Caddyfile` | Changed server block from `https://{$DOMAIN:localhost}` to `:443` (port-based matching for IP deployments) |
| `docker/caddy/Caddyfile` | Changed HTTP redirect from `http://{$DOMAIN:localhost}` to `:80`                                           |
| `docker/caddy/Caddyfile` | Changed TLS from env-var cert paths to hardcoded `/etc/caddy/certs/server.crt` and `server.key`            |

### Component Tree Ordering (Blank Page Fix)

`RealtimeProvider` was positioned above `SuperAdminProvider` in `src/App.tsx`. Its internal `RealtimeHandlers` component calls `useOrgScope()` → `useEffectiveIdentity()` → `useSuperAdmin()`, which threw because the SuperAdmin context was not yet provided. With no error boundary, React 18 unmounted the entire tree → blank dashboard page.

| File                                    | Change                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `src/App.tsx`                           | Moved `RealtimeProvider` inside `SuperAdminProvider` (below it in the tree) |
| `src/components/DashboardLayout.tsx:69` | Fixed `limit: 0` → `limit: 1` (Zod validation required `>= 1`)              |

### Production VM

- Regenerated self-signed SSL certs for IP `192.168.4.181`
- Rebuilt frontend container (zero `localhost:3000` references in built assets)
- Rebuilt frontend container again with component tree fix (commit `f67be4b`)
- Restarted Caddy with new routes and TLS config

## Evidence

### Playwright Smoke Tests (4/4 pass)

```
Running 4 tests using 1 worker

  ✓  1 frontend serves HTML successfully (754ms)
  ✓  2 API health endpoint responds (37ms)
  ✓  3 React app renders successfully (1.2s)
  ✓  4 no critical resources fail to load (1.1s)

  4 passed (3.9s)
```

### Health Endpoint

```json
{
  "status": "healthy",
  "uptime": 504.86,
  "timestamp": "2026-01-30T00:47:32.557Z",
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": { "status": "pass", "latency_ms": 2 },
    "redis": { "status": "pass", "latency_ms": 1 }
  }
}
```

### React Mount

- `#root` children: **5** (React mounted successfully)
- Zero "is not a function" errors in pageerror collection
- Zero `localhost:3000` references in built JS bundle

### Browser Console (User Verified)

- ✅ Dashboard loads — org context, sidebar populated
- ✅ Socket.io connected (through Caddy `/socket.io/*` route)
- ✅ No `TypeError: e[i] is not a function`
- ✅ No `Fetch API cannot load http://localhost:3000` errors
- ✅ No `useSuperAdmin must be used within a SuperAdminProvider` error (fixed by tree reorder)
- ⚠️ ServiceWorker SSL error (known, non-blocking — self-signed cert)
- ⚠️ WebSocket reconnection flicker (Caddy routing works, connection establishes)

## Requirements Satisfied

- **PROD-01** ✅ Frontend rebuilt and redeployed to 192.168.4.181
- **PROD-02** ✅ App renders in browser (React mounts, `#root` has 5 children)
- **PROD-03** ✅ Playwright smoke tests pass with React rendering verified

## Files Modified

| File                                 | Action                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| `src/lib/trpc.ts`                    | Fixed production URL fallback                                     |
| `src/lib/socket.ts`                  | Fixed production URL fallback                                     |
| `src/hooks/useTTNSettings.ts`        | Fixed production URL fallback                                     |
| `docker/caddy/Caddyfile`             | Added tRPC/socket.io routes, fixed TLS and host matching          |
| `src/App.tsx`                        | Moved RealtimeProvider inside SuperAdminProvider (blank page fix) |
| `src/components/DashboardLayout.tsx` | Fixed alerts query limit: 0 → 1                                   |
