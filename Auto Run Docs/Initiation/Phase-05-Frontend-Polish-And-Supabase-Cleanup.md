# Phase 05: Frontend Polish & Remaining Supabase Reference Cleanup

The frontend migration is nearly complete — only 4 files still reference "supabase" (text strings, not imports), and `@supabase/supabase-js` has already been removed from `package.json`. However, several frontend quality issues remain: the remaining Supabase text references need cleanup, the offline sync mechanism (`useOfflineSync`) needs verification against the new backend, and the build should produce zero TypeScript errors and zero ESLint warnings. This phase polishes the frontend to production quality, removes all vestiges of the Supabase era, and ensures the build pipeline is clean.

## Tasks

- [ ] Remove all remaining Supabase references from frontend source code:
  - Clean up `src/contexts/SuperAdminContext.tsx` — remove any Supabase text references (comments, variable names)
  - Clean up `src/components/debug/RBACDebugPanel.tsx` — remove Supabase references
  - Clean up `src/lib/registry/capabilityRegistry.ts` — remove Supabase references
  - Clean up `src/hooks/useGatewayProvisioningPreflight.ts` — if Phase 03 migrated this hook, verify no Supabase references remain; if still blocked, update the comment to reference the backend procedure instead of edge function
  - Search for any remaining files that reference "supabase" (including comments, TODOs, legacy imports) and clean them
  - Search for any files importing from `@supabase/supabase-js` or `@supabase/functions-js` — these should not exist
  - Verify `package.json` has no Supabase dependencies remaining

- [ ] Verify and fix the offline sync mechanism for the new backend:
  - Read `src/hooks/useOfflineSync.ts` to understand the IndexedDB-based offline sync
  - Verify it targets the correct backend endpoints (tRPC or REST, not Supabase)
  - Test the offline flow:
    - Disconnect network (or stop the backend)
    - Create a manual temperature log entry
    - Verify the entry is stored in IndexedDB
    - Reconnect network (or restart backend)
    - Verify the entry syncs to the backend
    - Verify the sync status indicators update correctly
  - If the sync targets Supabase endpoints, migrate it to use the tRPC client or REST API
  - If IndexedDB operations fail, fix the schema or initialization

- [ ] Run the full frontend build and fix all TypeScript errors:
  - Run `npx tsc --noEmit` to check TypeScript without building
  - Fix every TypeScript error (type mismatches, missing properties, incorrect imports)
  - Common issues to look for:
    - tRPC procedure return types that don't match component expectations
    - Missing or incorrect type imports from the backend `AppRouter`
    - Deprecated Supabase types still referenced
    - Hook return type changes from the migration
  - Run `npm run build` to verify Vite production build succeeds
  - The build must complete with zero errors

- [ ] Run ESLint and fix all warnings and errors:
  - Run `npm run lint` to check for linting issues
  - Fix all errors (these block CI)
  - Fix all warnings that are straightforward (unused imports, missing dependencies in useEffect)
  - For complex warnings that require architectural changes, add `// eslint-disable-next-line` with a comment explaining why
  - Do NOT disable rules globally — only suppress individual lines where justified
  - Run lint again to verify zero errors remain

- [ ] Verify all frontend pages render without runtime errors:
  - Start the full stack (docker services, backend, frontend)
  - Navigate through every major page and verify it loads without JavaScript errors:
    - Dashboard — loads unit cards with temperature data
    - Sites list and Site detail
    - Areas list and Area detail
    - Units list and Unit detail — shows readings chart
    - Alerts list — shows active/resolved alerts
    - Manual Log — entry form works
    - Settings — organization settings load
    - Reports — export interface loads
    - Onboarding — setup wizard loads
    - Platform/Admin pages (if accessible)
  - Check browser console for React errors, failed API calls, or unhandled exceptions
  - Document any pages that fail to load or show errors
  - Fix critical rendering failures (pages that crash or show blank screens)

- [ ] Produce a frontend quality report:
  - Create `docs/reports/frontend-quality-phase05.md` with YAML front matter:
    - type: report, title: Frontend Quality Report, tags: [frontend, quality, typescript, lint]
  - Document:
    - TypeScript compilation status (errors fixed, if any remain)
    - ESLint results (warnings remaining, if any)
    - Page-by-page rendering verification results
    - Offline sync verification results
    - Supabase reference removal confirmation (zero references remaining)
    - Build output size and any performance observations
