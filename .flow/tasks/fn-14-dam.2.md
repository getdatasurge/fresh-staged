# fn-14-dam.2 Configure Vite manualChunks and add rollup-plugin-visualizer

## Description
TBD

## Acceptance
- [ ] TBD

## Done summary
# fn-14-dam.2: Configure Vite manualChunks and add rollup-plugin-visualizer

## Note

This work was completed as part of fn-14-dam.1 since both tasks are tightly coupled — code splitting requires the Vite config changes.

## Changes (in vite.config.ts)

### rollup-plugin-visualizer

- Added `pnpm add -D rollup-plugin-visualizer`
- Production-only plugin outputs `dist/stats.html` with gzip size analysis

### manualChunks (12 vendor groups)

1. vendor-ui (@radix-ui/\*) — 154 KB
2. vendor-charts (recharts + d3-\*) — 405 KB
3. vendor-query (@tanstack/react-query) — 44 KB
4. vendor-forms (react-hook-form + zod) — 96 KB
5. vendor-date (date-fns) — 28 KB
6. vendor-icons (lucide-react) — 68 KB
7. vendor-realtime (socket.io + engine.io) — 41 KB
8. vendor-motion (framer-motion) — 120 KB
9. vendor-auth (@stackframe) — 818 KB
10. vendor-trpc (@trpc/\*) — 35 KB
11. vendor-grid (react-grid-layout + resizable) — 84 KB
12. vendor-react (react + react-dom + router + scheduler) — 160 KB

## Verification

- `pnpm build` succeeds
- `pnpm test` passes: 159/159
- `dist/stats.html` generated for visual analysis
## Evidence
- Commits:
- Tests:
- PRs: