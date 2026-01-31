# fn-14-dam Route-Level Code Splitting

## Overview

Add React.lazy() to all page imports in App.tsx. Currently all 30+ pages are statically imported producing a ~3.2 MB single JS chunk. The Suspense wrapper and PageSkeleton fallback already exist from fn-9-1f4. Configure Vite manualChunks to split vendor dependencies.

## Scope

- Convert all page imports in App.tsx to React.lazy()
- Keep critical-path pages (Login, Index) as static imports
- Configure Vite manualChunks for vendor splitting (react, radix, recharts, tanstack)
- Bundle Radix primitives together with React (shared dependency)
- Add rollup-plugin-visualizer for bundle analysis
- Do NOT change routing structure or page components
- Do NOT add React.lazy() to non-page components (premature optimization)

## Approach

1. Install rollup-plugin-visualizer as dev dependency
2. Measure current bundle size with `pnpm build` (baseline)
3. Convert page imports in App.tsx to React.lazy() (except Login/Index)
4. Configure manualChunks in vite.config.ts: vendor-react, vendor-ui, vendor-charts, vendor-query
5. Build and verify chunk sizes (target 50-200 KB per chunk)
6. Verify all routes load correctly in dev and production build
7. Verify PageSkeleton fallback shows during lazy loading

## Quick commands

- `pnpm build`
- `pnpm dev`
- `pnpm test`

## Acceptance

- [ ] All non-critical pages use React.lazy() in App.tsx
- [ ] Login and Index pages remain static imports
- [ ] Vite manualChunks configured for vendor splitting
- [ ] Initial bundle size reduced by 30%+ from baseline
- [ ] No chunk exceeds 300 KB
- [ ] All routes load correctly with PageSkeleton fallback visible
- [ ] rollup-plugin-visualizer configured for analysis
- [ ] All tests pass, build succeeds

## Dependencies

- None (independent, PageSkeleton already exists from fn-9-1f4)

## References

- Practice scout: 3.2 MB single chunk, zero React.lazy() usage
- Practice scout: Radix primitives MUST be bundled with React (initialization order)
- Repo scout: App.tsx:19-50 has 30+ static imports
- Repo scout: PageSkeleton exists from fn-9-1f4 error boundary work
- Practice scout: Vite manualChunks guidance -- group by dependency, target 50-200 KB
