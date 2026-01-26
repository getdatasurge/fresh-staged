# Coding Conventions

**Analysis Date:** 2026-01-26

## Naming Patterns

**Files:**
- camelCase for most utility/modules (examples: `src/lib/errorHandler.ts`, `src/lib/orgScopedInvalidation.ts`)
- PascalCase for React components/pages (examples: `src/App.tsx`, `src/pages/Areas.tsx`)
- Tests use `*.test.ts`/`*.test.tsx` in-place or under `__tests__` (examples: `src/lib/__tests__/api-client.test.ts`, `src/hooks/__tests__/useSites.test.tsx`)

**Functions:**
- camelCase for functions and methods (examples: `src/lib/utils.ts`, `src/lib/eventLogger.ts`)
- React hooks use `useX` naming (examples: `src/hooks/useEffectiveIdentity.ts`, `src/hooks/useNavTree.ts`)
- Async functions use `async`/`await`, no special naming prefix detected

**Variables:**
- camelCase for local variables and properties (examples: `src/lib/eventLogger.ts`)
- UPPER_SNAKE_CASE for constants (example: `RLS_ERROR_CODES` in `src/lib/errorHandler.ts`)
- Private member prefix: Not detected

**Types:**
- PascalCase for interfaces and type aliases (examples: `LogEventParams`, `ImpersonationContext` in `src/lib/eventLogger.ts`)
- Enums: Not detected (TS enums not used; enum-like values are mapped via config or zod)

## Code Style

**Formatting:**
- Tool: Not detected at repo root (no `.prettierrc`); `opencode/package.json` embeds a Prettier config for that subproject
- Line length: Not detected (opencode Prettier config sets `printWidth: 120`)
- Quotes: Mixed (single quotes are common in `src/**/*.ts(x)`, double quotes appear in some files). Match the local file style.
- Semicolons: Mixed (present in some TS files like `src/lib/utils.ts`, absent in many TSX files like `src/App.tsx`). Match the local file style.
- Indentation: Mixed (tabs in many TSX files like `src/App.tsx`, spaces in some TS files like `src/lib/errorHandler.ts`). Match the local file style.

**Linting:**
- Tool: ESLint via `eslint.config.js`
- Notable rules: `@typescript-eslint/no-explicit-any` is `warn` (off in `supabase/functions/**/*.ts`), `react-refresh/only-export-components` is `warn`, `@typescript-eslint/no-unused-vars` is `off`
- Run: `npm run lint`

## Import Organization

**Order:**
1. No strict ordering rule detected; files often mix external, alias, and relative imports (see `src/App.tsx`)
2. Type-only imports use `import type` in some files (example: `src/lib/actions/sensorEligibility.test.ts`)

**Grouping:**
- Blank lines between groups are inconsistently used; follow the local file pattern
- Sorting: Not detected

**Path Aliases:**
- `@/` maps to `src/` (see `tsconfig.json`, used in `src/App.tsx` and tests)

## Error Handling

**Patterns:**
- Throw `Error` for hard failures (example: `src/lib/eventLogger.ts`)
- Permission and toast handling centralized in `src/lib/errorHandler.ts`
- Async operations use `try/catch` in service-like helpers (example: `src/lib/eventLogger.ts`)

**Error Types:**
- Custom error classes: Not detected
- Return shapes with `{ error }` for some helpers (example: `logEvent` in `src/lib/eventLogger.ts`)
- Console logging before user-facing feedback is common (example: `handleError` in `src/lib/errorHandler.ts`)

## Logging

**Framework:**
- Primarily `console.*` in frontend (examples: `src/lib/errorHandler.ts`, `src/features/dashboard-layout/hooks/useLayoutManager.ts`)
- Audit/event logging via `logEvent` in `src/lib/eventLogger.ts`

**Patterns:**
- Log errors with context strings (example: `console.error("Failed to log event:", err)` in `src/lib/eventLogger.ts`)
- `console.warn`/`console.log` used for diagnostics in feature modules

## Comments

**When to Comment:**
- JSDoc blocks for public utility functions (examples: `src/lib/errorHandler.ts`, `src/lib/eventLogger.ts`)
- Inline comments for non-obvious behavior or operational notes

**JSDoc/TSDoc:**
- Used for exported helpers and complex logic; not required everywhere

**TODO Comments:**
- Format: `// TODO: ...` with optional phase tags (examples: `src/hooks/useEffectiveIdentity.ts`, `src/pages/DataMaintenance.tsx`)
- Issue linking: Not detected

## Function Design

**Size:**
- No explicit size limits detected; functions vary from small utilities to larger handlers

**Parameters:**
- No strict parameter count convention detected
- Options objects used when appropriate (example: `logEvent` params in `src/lib/eventLogger.ts`)

**Return Values:**
- Explicit returns are common; guard clauses appear in helpers (example: `isPermissionError` in `src/lib/errorHandler.ts`)

## Module Design

**Exports:**
- Named exports common for utilities (examples: `src/lib/utils.ts`, `src/lib/errorHandler.ts`)
- Default exports common for React components/pages (example: `src/pages/Areas.tsx`)

**Barrel Files:**
- Barrel exports used for API modules (example: `src/lib/api/index.ts`)
- Avoided elsewhere; no global barrel pattern detected

---

*Convention analysis: 2026-01-26*
*Update when patterns change*
