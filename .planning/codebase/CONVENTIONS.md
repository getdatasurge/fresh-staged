# Coding Conventions

**Analysis Date:** 2026-01-29

**Analysis Scope:**

- Files reviewed: 742 source files
- Test files: 75 files
- Languages: TypeScript (frontend), TypeScript (backend)

## Naming Patterns

**Files:**

- Components: PascalCase with `.tsx` extension (e.g., `TTNCredentialsPanel.tsx`, `DashboardLayout.tsx`)
- Hooks: camelCase starting with `use` prefix (e.g., `useAlerts.ts`, `useSites.ts`)
- Services: camelCase with `.service.ts` suffix (e.g., `ttn.service.ts`, `alert.service.ts`)
- Routes: kebab-case or camelCase with `.ts` extension (e.g., `alerts.ts`)
- Types: camelCase with `.d.ts` or inline in `.ts` files
- Test files: `.test.ts` or `.test.tsx` suffix, mirroring source file naming
- Config files: kebab-case (e.g., `eslint.config.js`, `vite.config.ts`)

**Functions:**

- Regular functions: camelCase (e.g., `listAlerts`, `acknowledgeAlert`, `formatBatteryEstimate`)
- React components: PascalCase (e.g., `Button`, `AlertHistoryWidget`, `TTNCredentialsPanel`)
- Hooks: camelCase starting with `use` (e.g., `useAlerts`, `useNavTree`, `useBatteryForecast`)

**Variables:**

- Local variables: camelCase (e.g., `organizationId`, `alertFilters`, `mockDevices`)
- Constants: UPPER_SNAKE_CASE for true constants (e.g., `SAMPLE_PAYLOADS`, `PAYLOAD_SCHEMAS`)
- React state: camelCase (e.g., `isLoading`, `areasCount`, `unitsCount`)

**Types:**

- Interfaces: PascalCase (e.g., `TTNConfig`, `AlertFilters`, `WidgetProps`)
- Type aliases: PascalCase (e.g., `AlertStatusFilter`, `AlertSeverityFilter`)
- Enums: Not commonly used; prefer union types or string literals

## Code Style

**Formatting:**

- No Prettier config detected (relies on editor defaults or manual formatting)
- Tab width: 2 spaces (inferred from codebase)
- Line length: No strict limit enforced
- Semicolons: Required (enforced by TypeScript)
- Quotes: Double quotes for strings in most files, single quotes in some
- Trailing commas: Inconsistent; often present in multi-line arrays/objects

**Linting:**

- Tool: ESLint v9 with TypeScript ESLint plugin
- Config: `eslint.config.js` at root
- Key rules:
  - `@typescript-eslint/no-unused-vars`: off (explicitly disabled)
  - `@typescript-eslint/no-empty-object-type`: off
  - `@typescript-eslint/no-explicit-any`: warn (not error)
  - `@typescript-eslint/no-unused-expressions`: error with `allowShortCircuit: true`
  - `react-hooks/recommended`: enabled
  - `prefer-const`: warn
  - `no-useless-escape`: warn
- Special config for Supabase edge functions: allows `any` types due to Deno environment

## Import Organization

**Order:**

1. External libraries (React, third-party packages)
2. Internal UI components from `@/components/ui`
3. Internal feature components from `@/components` or `@/features`
4. Hooks from `@/hooks`
5. Utilities from `@/lib`
6. Types (often imported last or inline with related imports)

**Frontend Example:**

```typescript
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTRPC } from '@/lib/trpc';
import { format } from 'date-fns';
import type { WidgetProps } from '../types';
```

**Backend Example:**

```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles, userRoles } from '../db/schema/users.js';
import type { AppRole } from '../types/auth.js';
```

**Path Aliases:**

- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- Backend uses relative imports with `.js` extensions (ESM style): `'../db/client.js'`

## Error Handling

**Frontend Patterns:**

- React Query handles errors via `error` property in query results
- Mutations use `try/catch` blocks sparingly; prefer `onError` callbacks
- Toast notifications for user-facing errors (using `sonner` library)
- Console logging for development errors: `console.error('Error message:', err)`
- Error boundaries for component crashes: `DashboardErrorBoundary`

**Backend Patterns:**

- Custom error utilities: `notFound(reply, 'Message')`, `conflict(reply, 'Message')`
- TTN API client uses custom `TTNApiError` class with status codes
- Fastify error responses via reply methods: `reply.status(404).send({ error: 'Not found' })`
- Null returns for "not found" cases (e.g., `getDevice` returns `null` for 404)
- Service layer returns null or throws; route layer converts to HTTP responses

**Example Backend Error Handling:**

```typescript
const alert = await alertService.getAlert(alertId, organizationId);
if (!alert) {
  return notFound(reply, 'Alert not found');
}
return alert;
```

**Example Frontend Error Handling:**

```typescript
const { data, error, isLoading } = useAlerts(organizationId);

if (error) {
  console.error('Error fetching alerts:', error);
  // React Query handles error state display
}
```

## Logging

**Framework:** Console-based logging (no structured logger detected)

**Patterns:**

- Development logging: `console.log`, `console.warn`, `console.error`
- Conditional logging: `DEV && console.log('[ComponentName]', { data })`
- Error logging always includes context: `console.error('[Component] Failed:', error)`
- Log prefixes for traceability: `[DashboardErrorBoundary]`, `[useLayoutManager]`, `[DraftManager]`
- No production logger detected (console statements in production code)

**Example:**

```typescript
DEV &&
  console.log('[EntityDashboard.widgetProps]', {
    organizationId,
    siteId,
    areaId,
    unitId,
  });
```

## Comments

**When to Comment:**

- File-level JSDoc headers for modules/services
- Function-level JSDoc for public APIs and hooks
- Inline comments for complex logic or non-obvious behavior
- Configuration explanations (e.g., TTN provisioning steps)
- Test descriptions using Vitest's `describe` and `it` blocks

**JSDoc/TSDoc:**

- Used extensively for hooks and service functions
- Includes `@param` and `@returns` tags
- Often includes usage examples in `@example` blocks
- Type information in JSDoc when TypeScript inference isn't enough

**Example:**

```typescript
/**
 * List alerts for an organization with optional filters
 *
 * @param organizationId - Organization UUID
 * @param filters - Optional filters for status, severity, unit, site, pagination
 * @param options - Query options including enabled flag
 * @returns React Query result with alerts array
 */
export function useAlerts(
  organizationId: string | undefined,
  filters?: AlertFilters,
  options?: { enabled?: boolean },
) {
  // Implementation
}
```

## Function Design

**Size:**

- Most functions are 10-50 lines
- Complex operations broken into helper functions
- Widget components often 50-100 lines (acceptable for UI)
- Service functions 20-80 lines per operation

**Parameters:**

- Prefer object parameters for 3+ arguments
- Optional parameters use `?` or default values
- Destructuring in function signatures common

**Return Values:**

- Hooks return React Query result objects
- Service functions return data objects, arrays, or null
- Mutations return success/error objects
- Avoid returning `undefined`; use `null` for "not found"

## Module Design

**Exports:**

- Named exports preferred over default exports
- Default exports used for route modules and some components
- Barrel files in `@/components/ui` for shadcn components
- No barrel files for features (direct imports)

**File Structure:**

```typescript
// Imports
import { ... } from '...'

// Types/Interfaces
export interface MyType { ... }

// Constants
const MY_CONSTANT = ...

// Main exports
export function myFunction() { ... }
export class MyClass { ... }
```

**Barrel Files:**

- Used in `src/components/ui` to re-export shadcn components
- Not used elsewhere; direct imports preferred

---

_Convention analysis: 2026-01-29_
