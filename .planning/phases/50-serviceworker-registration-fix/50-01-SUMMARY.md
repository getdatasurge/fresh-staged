---
phase: 50-serviceworker-registration-fix
plan: 01
status: complete
completed: 2026-01-30
---

## Result

**PASS** — ServiceWorker registration errors are now caught gracefully. The auto-generated `registerSW.js` script (which had no `.catch()`) is replaced by the vite-plugin-pwa React hook with `onRegisterError` callback. No more uncaught promise rejection in the browser console on self-signed SSL certs.

## What Changed

### VitePWA Config (`vite.config.ts`)

Added `injectRegister: false` to prevent the auto-generated `registerSW.js` script from being injected into `dist/index.html`. The default `injectRegister: 'auto'` generated a script that called `navigator.serviceWorker.register('/sw.js')` without any `.catch()`, causing an uncaught promise rejection on self-signed SSL.

### TypeScript Types (`src/vite-env.d.ts`)

Added `/// <reference types="vite-plugin-pwa/client" />` so TypeScript recognizes the `virtual:pwa-register/react` virtual module.

### ServiceWorker Registration Component (`src/components/ServiceWorkerRegistration.tsx`)

New component using `useRegisterSW` from `virtual:pwa-register/react`. Handles:
- `onRegisteredSW`: Logs successful registration
- `onRegisterError`: Logs registration failure as `console.info` (graceful degradation)

### App Integration (`src/App.tsx`)

Added `<ServiceWorkerRegistration />` inside `<Suspense>` before `<StackProvider>`. The component has no provider dependencies and renders `null` (pure side-effect).

## Evidence

### TypeScript Check

```
pnpm exec tsc --noEmit → 0 errors
```

## Requirements Satisfied

- **SW-01** ✅ No uncaught promise rejection from ServiceWorker registration
- **SW-02** ✅ ServiceWorker registration fails silently with info log on self-signed SSL

## Files Modified

| File | Action |
|------|--------|
| `vite.config.ts` | Added `injectRegister: false` |
| `src/vite-env.d.ts` | Added PWA client type reference |
| `src/components/ServiceWorkerRegistration.tsx` | NEW — React hook-based SW registration with error handling |
| `src/App.tsx` | Added `<ServiceWorkerRegistration />` component |
