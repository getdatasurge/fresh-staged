# Phase 50: ServiceWorker Registration Fix - Research

**Researched:** 2026-01-30
**Domain:** vite-plugin-pwa ServiceWorker registration, SSL certificate error handling
**Confidence:** HIGH

## Summary

The FrostGuard application uses `vite-plugin-pwa` v1.2.0 with `registerType: "autoUpdate"` and the default `injectRegister: 'auto'` setting. This causes the plugin to generate a minimal `registerSW.js` script that is injected as a `<script>` tag into the built `index.html`. This auto-generated script has **zero error handling** -- it calls `navigator.serviceWorker.register('/sw.js')` without any `.catch()` handler. When the app runs on a self-signed SSL certificate (the current deployment at 192.168.4.181 via Caddy), the browser rejects the ServiceWorker registration with a `DOMException: Failed to register a ServiceWorker: An SSL certificate error occurred`, which becomes an uncaught promise rejection in the console.

The fix involves switching from the auto-generated registration script to the plugin's built-in **virtual module** (`virtual:pwa-register/react`), which provides a `useRegisterSW` React hook with an `onRegisterError` callback that properly catches registration failures. This is the plugin's recommended approach for React applications and provides proper error handling out of the box.

**Primary recommendation:** Set `injectRegister: false` in the VitePWA config and use the `virtual:pwa-register/react` hook with `onRegisterError` callback to gracefully handle registration failures.

## Standard Stack

### Core

| Library         | Version | Purpose                                  | Why Standard                   |
| --------------- | ------- | ---------------------------------------- | ------------------------------ |
| vite-plugin-pwa | 1.2.0   | PWA support for Vite (already installed) | De facto standard for Vite PWA |

### Supporting

| Library                    | Version                        | Purpose                        | When to Use                                 |
| -------------------------- | ------------------------------ | ------------------------------ | ------------------------------------------- |
| virtual:pwa-register/react | (bundled with vite-plugin-pwa) | React hook for SW registration | Always for React apps using vite-plugin-pwa |

### Alternatives Considered

| Instead of                     | Could Use                                   | Tradeoff                                                                             |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Virtual module hook            | Manual `navigator.serviceWorker.register()` | More control but loses auto-update, workbox integration, and offline-ready detection |
| `injectRegister: false` + hook | Completely remove VitePWA plugin            | Loses manifest generation, workbox caching, and future PWA capability                |
| `selfDestroying: true`         | Unregisters existing SW permanently         | Overkill -- we want SW to work when SSL is valid                                     |

**Installation:** No new packages needed. `vite-plugin-pwa` v1.2.0 is already installed and includes the React virtual module.

## Architecture Patterns

### Current State (BROKEN)

```
vite.config.ts
  VitePWA({ registerType: "autoUpdate" })
    ↓ (default injectRegister: 'auto' → resolves to 'script')
  Build injects: <script src="/registerSW.js"></script> into dist/index.html
    ↓
dist/registerSW.js contains:
  if('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
      // ← NO .catch() -- uncaught promise rejection on SSL error
    })
  }
```

### Target State (FIXED)

```
vite.config.ts
  VitePWA({ registerType: "autoUpdate", injectRegister: false })
    ↓ (no script injected into HTML)

src/main.tsx (or dedicated component)
  import { useRegisterSW } from 'virtual:pwa-register/react'
    ↓
  useRegisterSW({
    onRegisterError(error) {
      console.info('[SW] Registration failed:', error.message)
      // Graceful -- app continues working without SW
    }
  })
```

### Recommended Project Structure

Only 3 files change:

```
vite.config.ts          # Add injectRegister: false
src/vite-env.d.ts       # Add PWA client types reference
src/App.tsx             # Add useRegisterSW hook (or create dedicated component)
  OR
src/components/ServiceWorkerRegistration.tsx  # Dedicated component (preferred)
```

### Pattern: Dedicated ServiceWorker Registration Component

**What:** A small React component that handles SW registration via the plugin's virtual module hook, placed near the root of the component tree.
**When to use:** When you want clean separation of PWA lifecycle from app logic.

```typescript
// src/components/ServiceWorkerRegistration.tsx
import { useRegisterSW } from 'virtual:pwa-register/react';

export function ServiceWorkerRegistration() {
  useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      console.info('[SW] Registered:', swUrl);
    },
    onRegisterError(error) {
      // Graceful degradation -- app works fine without SW
      console.info('[SW] Registration unavailable:', error.message);
    },
  });

  return null; // Renders nothing -- pure side-effect component
}
```

Then in `App.tsx` (or layout root):

```typescript
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';

function App() {
  return (
    <>
      <ServiceWorkerRegistration />
      {/* ... rest of app ... */}
    </>
  );
}
```

### Anti-Patterns to Avoid

- **Wrapping registration in try/catch at the vite.config level:** The config file runs at build time, not runtime. The error happens in the browser.
- **Using `selfDestroying: true`:** This permanently unregisters the SW. We want it to work when SSL is valid (future domain setup).
- **Conditionally removing VitePWA plugin based on mode:** This prevents the SW and manifest from being generated at all, breaking future PWA capability.
- **Editing `dist/registerSW.js` directly:** This file is auto-generated and overwritten on every build.

## Don't Hand-Roll

| Problem                             | Don't Build                                         | Use Instead                                            | Why                                                                                                              |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| SW registration with error handling | Custom `navigator.serviceWorker.register()` wrapper | `virtual:pwa-register/react` hook                      | Hook handles workbox-window import, auto-update lifecycle, offline-ready detection, and error callbacks properly |
| SW update prompts                   | Custom update detection logic                       | `useRegisterSW` with `onNeedRefresh` callback          | Plugin handles installed/waiting/activated event lifecycle correctly                                             |
| SW unregistration                   | Custom unregister logic                             | `selfDestroying: true` config option (if needed later) | Plugin generates correct self-destroying SW with cache cleanup                                                   |

**Key insight:** The vite-plugin-pwa virtual module already solves the error handling problem. The bug exists only because the default `injectRegister: 'auto'` mode generates a minimal script without the virtual module's error handling capabilities. Switching to the virtual module is the intended React integration path.

## Common Pitfalls

### Pitfall 1: TypeScript Cannot Find Virtual Module

**What goes wrong:** `Cannot find module 'virtual:pwa-register/react' or its corresponding type declarations`
**Why it happens:** TypeScript does not know about vite-plugin-pwa's virtual modules by default.
**How to avoid:** Add `/// <reference types="vite-plugin-pwa/client" />` to `src/vite-env.d.ts`, or add `"vite-plugin-pwa/client"` to `compilerOptions.types` in `tsconfig.app.json`.
**Warning signs:** TypeScript build errors mentioning `virtual:pwa-register`.

### Pitfall 2: Forgetting `injectRegister: false`

**What goes wrong:** Both the auto-generated script AND the virtual module hook try to register the SW, causing double registration.
**Why it happens:** `injectRegister` defaults to `'auto'`, and if `auto` detects no virtual module import (e.g., tree-shaking, dynamic import), it falls back to script injection.
**How to avoid:** Explicitly set `injectRegister: false` in the VitePWA config when using the virtual module.
**Warning signs:** Two SW registration attempts in network tab, or the uncaught promise rejection persists alongside the caught one.

### Pitfall 3: Using `registerType: false` Instead of Keeping `"autoUpdate"`

**What goes wrong:** The `registerType` controls the SW update strategy (auto-update vs prompt). Setting it to `false` disables the update mechanism.
**Why it happens:** Confusion between `registerType` (update strategy) and `injectRegister` (how registration code is delivered).
**How to avoid:** Keep `registerType: "autoUpdate"` (the current setting). Only change `injectRegister`.
**Warning signs:** SW never auto-updates after deployment.

### Pitfall 4: The `onRegisterError` Callback Uses Stale Reference

**What goes wrong:** If the callback references React state, it captures the initial render's state, not the latest.
**Why it happens:** vite-plugin-pwa docs explicitly warn: "The options provided to hooks are not reactive."
**How to avoid:** Use a stable function reference (no state dependencies) for the error callback. For this use case, just `console.info()` is sufficient -- no state needed.
**Warning signs:** Unexpected behavior if trying to set state from within the callback.

### Pitfall 5: E2E Test Already Filters SW Errors

**What goes wrong:** The existing e2e test at `e2e/production-smoke.spec.ts` already filters `sw.js` and `registerSW` from failed requests (lines 86-87). After the fix, these filters remain valid but the test should also verify no uncaught promise rejections.
**Why it happens:** The test was written to tolerate the SW failure as a known issue.
**How to avoid:** After fixing, consider adding a positive assertion that no `pageerror` events related to ServiceWorker occur.

## Code Examples

### Example 1: vite.config.ts Change (The Key Config Change)

```typescript
// Source: Official vite-plugin-pwa docs - https://vite-pwa-org.netlify.app/guide/register-service-worker.html
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: false, // ← ADD THIS: Disable auto-generated registerSW.js script
  includeAssets: ['favicon.ico', 'robots.txt', 'icon.svg'],
  manifest: {
    /* ... existing manifest config unchanged ... */
  },
  workbox: {
    /* ... existing workbox config unchanged ... */
  },
});
```

### Example 2: TypeScript Type Declaration

```typescript
// src/vite-env.d.ts
// Source: https://github.com/vite-pwa/vite-plugin-pwa/issues/277
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

### Example 3: React Hook Registration with Error Handling

```typescript
// src/components/ServiceWorkerRegistration.tsx
// Source: https://vite-pwa-org.netlify.app/frameworks/react
import { useRegisterSW } from 'virtual:pwa-register/react';

export function ServiceWorkerRegistration() {
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      console.info('[SW] Registered successfully:', swUrl);
    },
    onRegisterError(error) {
      // Graceful degradation for self-signed SSL or other failures
      console.info('[SW] Registration unavailable:', error.message);
    },
  });

  // Optional: Could show toast for offlineReady or needRefresh
  // For now, just handle registration lifecycle silently

  return null;
}
```

### Example 4: Integration in App.tsx

```typescript
// src/App.tsx (add near the root)
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';

function App() {
  return (
    <>
      <ServiceWorkerRegistration />
      {/* ... existing app content ... */}
    </>
  );
}
```

### Example 5: Minimal Approach (No Separate Component)

```typescript
// Alternative: directly in src/main.tsx using non-React virtual module
// Source: https://vite-pwa-org.netlify.app/guide/register-service-worker.html
import { registerSW } from 'virtual:pwa-register';

registerSW({
  onRegisterError(error) {
    console.info('[SW] Registration unavailable:', error.message);
  },
});
```

## State of the Art

| Old Approach                                          | Current Approach                                | When Changed                                     | Impact                                                     |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `injectRegister: 'auto'` (default, no error handling) | `injectRegister: false` + virtual module import | Available since vite-plugin-pwa 0.12+            | Virtual module provides callbacks for all lifecycle events |
| `injectRegister: 'script'` generating external JS     | `virtual:pwa-register/react` hook               | Available since framework-specific modules added | React-idiomatic integration with hooks                     |
| No `onRegisteredSW` callback                          | `onRegisteredSW(swUrl, registration)`           | vite-plugin-pwa 0.12.8+                          | More info about registration available                     |

**Current (installed):** vite-plugin-pwa v1.2.0 -- all features described above are available.

## Open Questions

1. **Should the SW registration component show UI for offline-ready or update-needed?**
   - What we know: The `useRegisterSW` hook provides `offlineReady` and `needRefresh` state, plus `updateServiceWorker()` function. Currently the app has no UI for these states.
   - What's unclear: Whether the user wants an update prompt toast/banner when new versions deploy.
   - Recommendation: For Phase 50, implement silent registration only (just error handling). Update prompts can be added later as a separate enhancement. The hook architecture supports this without rework.

2. **Should the e2e test be updated to verify the fix?**
   - What we know: `e2e/production-smoke.spec.ts` already filters `sw.js` and `registerSW` from "failed requests" checks. The "React app renders" test collects `pageerror` events but does not specifically check for SW-related uncaught rejections.
   - What's unclear: Whether a specific SW error assertion should be added.
   - Recommendation: The existing test filtering is sufficient. The fix eliminates the uncaught promise rejection, which would have showed up in `pageerror` events if not already filtered. No test changes strictly needed, but adding a comment noting the SW fix resolves the filtered items would be good.

## Sources

### Primary (HIGH confidence)

- vite-plugin-pwa official docs: [Register Service Worker](https://vite-pwa-org.netlify.app/guide/register-service-worker.html) - injectRegister options, virtual module usage
- vite-plugin-pwa official docs: [React Framework](https://vite-pwa-org.netlify.app/frameworks/react) - useRegisterSW hook API, RegisterSWOptions interface
- vite-plugin-pwa source code: `node_modules/vite-plugin-pwa/dist/client/build/register.js` - Verified registerSW() has onRegisterError callback with .catch() handlers
- vite-plugin-pwa official docs: [Unregister Service Worker](https://vite-pwa-org.netlify.app/guide/unregister-service-worker.html) - selfDestroying option details
- Codebase verification: `dist/registerSW.js` - Confirmed auto-generated script has NO error handling
- Codebase verification: `vite.config.ts` - Confirmed current config uses registerType: "autoUpdate" with no injectRegister setting

### Secondary (MEDIUM confidence)

- [W3C ServiceWorker Issue #1159](https://github.com/w3c/ServiceWorker/issues/1159) - SSL certificate error is by spec design, not a bug
- [vite-pwa/vite-plugin-pwa Issue #277](https://github.com/vite-pwa/vite-plugin-pwa/issues/277) - TypeScript virtual module type resolution
- [vite-pwa/vite-plugin-pwa Issue #314](https://github.com/vite-pwa/vite-plugin-pwa/issues/314) - injectRegister default behavior confusion

### Tertiary (LOW confidence)

- None -- all findings verified with primary sources.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Verified against installed package version and official docs
- Architecture: HIGH - Verified virtual module source code, confirmed .catch() exists in hook path but NOT in auto-generated script path
- Pitfalls: HIGH - TypeScript issue verified by checking tsconfig (no PWA types configured); double-registration documented in official docs; stale callback warning from official React docs page

**Research date:** 2026-01-30
**Valid until:** 2026-03-30 (stable -- vite-plugin-pwa v1.x is mature)
