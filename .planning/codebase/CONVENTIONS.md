# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- React components: PascalCase (`GatewayManager.tsx`, `AddSensorDialog.tsx`)
- Hooks: camelCase with `use` prefix (`useGateways.ts`, `useDebounce.ts`)
- Utilities/libraries: camelCase (`queryKeys.ts`, `debugLogger.ts`)
- Test files: Same name as module with `.test.ts` suffix (`gatewayEligibility.test.ts`)
- Type files: camelCase or PascalCase for domain-specific (`types.ts`, `ttn.ts`)
- Index files: `index.ts` for barrel exports

**Functions:**
- Regular functions: camelCase (`canProvisionGateway`, `formatEUI`)
- React components: PascalCase (`GatewayManager`, `ColumnHeaderTooltip`)
- Hooks: `use` prefix + PascalCase (`useGateways`, `useProvisionGateway`)
- Boolean getters: `can`/`is`/`has` prefix (`canHideWidget`, `isPayloadTypeRegistered`)
- Event handlers: `handle` prefix (`handleDelete`, `handleSiteChange`)
- Mutations: `use` + verb + noun (`useCreateGateway`, `useDeleteGateway`)

**Variables:**
- Local variables: camelCase (`bestMatch`, `payloadKeys`)
- Constants: UPPER_SNAKE_CASE for config objects (`PAYLOAD_SCHEMAS`, `WIDGET_REGISTRY`)
- React state: camelCase (`editGateway`, `confirmSiteChange`)
- Boolean state: descriptive (`isProvisioning`, `isLoading`)

**Types:**
- Interfaces: PascalCase (`ActionEligibility`, `GatewayForEligibility`)
- Type aliases: PascalCase (`ActionCode`, `GatewayStatus`)
- Generic type params: Single uppercase letter or descriptive (`T`, `EntityType`)

## Code Style

**Formatting:**
- No Prettier config detected - relies on TypeScript defaults
- 2-space indentation (inferred from tsconfig bundler mode)
- No semicolon enforcement - semicolons used consistently

**Linting:**
- ESLint 9 with flat config at `eslint.config.js`
- TypeScript-ESLint recommended rules
- React Hooks plugin enabled
- React Refresh plugin for HMR

**Key ESLint rules:**
- `@typescript-eslint/no-unused-vars`: off (relaxed)
- `@typescript-eslint/no-explicit-any`: warn (allows but discourages)
- `@typescript-eslint/no-empty-object-type`: off
- `react-refresh/only-export-components`: warn
- Short-circuit expressions allowed (`allowShortCircuit: true`)

**TypeScript config:**
- Strict mode: disabled (`"strict": false`)
- No implicit any: disabled
- Null checks: disabled (`"strictNullChecks": false`)
- Target: ES2020, JSX: react-jsx
- Path alias: `@/*` maps to `./src/*`

## Import Organization

**Order:**
1. React and external packages (`react`, `@tanstack/react-query`)
2. Radix UI components (`@radix-ui/react-*`)
3. Internal UI components (`@/components/ui/*`)
4. Internal hooks (`@/hooks/*`)
5. Internal lib utilities (`@/lib/*`)
6. Types (often last, with `type` keyword)

**Path Aliases:**
- `@/` resolves to `./src/`
- Always use `@/` for internal imports, never relative paths from components

**Example:**
```typescript
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useGateways } from "@/hooks/useGateways";
import { cn } from "@/lib/utils";
import type { Gateway } from "@/types/ttn";
```

## Error Handling

**Patterns:**
- Return result objects with `allowed`, `code`, and `reason` fields for eligibility checks
- Use `ActionEligibility` interface pattern: `{ allowed: boolean; code: ActionCode; reason?: string }`
- Toast notifications for user feedback (`toast.success()`, `toast.error()`)
- Throw errors in mutation functions, catch in `onError` callbacks
- Always provide human-readable reasons when operations are disallowed

**Error codes:**
- Use stable string codes for programmatic handling (e.g., `"PERMISSION_DENIED"`, `"TTN_NOT_CONFIGURED"`)
- Define codes as union types in `types.ts` for type safety
- Codes used for tests, telemetry, and UI decisions

**Example pattern:**
```typescript
export function canProvisionGateway(
  gateway: GatewayForEligibility,
  ttnConfig: TTNConfigState | null
): ActionEligibility {
  if (gateway.ttn_gateway_id) {
    return {
      allowed: false,
      code: "GATEWAY_ALREADY_PROVISIONED",
      reason: "Gateway is already provisioned to TTN",
    };
  }
  // ... more checks
  return { allowed: true, code: "ALLOWED" };
}
```

## Logging

**Framework:** Custom `debugLog` utility at `src/lib/debugLogger.ts`

**Patterns:**
- Category-based logging: `debugLog.info('ttn', 'TTN_PROVISION_GATEWAY_REQUEST', {...})`
- CRUD operations: `debugLog.crud('update', 'gateway', id, details)`
- Structured context objects with snake_case keys
- Request IDs for tracing: `request_id: crypto.randomUUID().slice(0, 8)`
- Timing: capture `startTime` and log `duration_ms`

## Comments

**When to Comment:**
- File-level docblocks explaining module purpose
- JSDoc for exported functions with parameters and return types
- Section comments using `// ===` dividers for logical groupings
- Inline comments for non-obvious business logic

**JSDoc/TSDoc:**
- Use `/** */` for public API documentation
- Include `@param` for function parameters when complex
- Brief descriptions (1-2 lines) preferred over verbose

**Example:**
```typescript
/**
 * Check if a gateway can be provisioned to TTN.
 *
 * Order of checks:
 * 1. Already provisioned
 * 2. Permission check
 * 3. TTN configuration
 * 4. Gateway EUI
 */
export function canProvisionGateway(...): ActionEligibility {
```

## Function Design

**Size:** Functions kept focused, typically under 50 lines. Extract helpers for complex logic.

**Parameters:**
- Destructure objects in function signature for clarity
- Use optional chaining for nullable params
- Group related params into objects (e.g., `{ id, updates }`)

**Return Values:**
- Explicit return types for public APIs
- Use result objects over throw for expected failures
- Return early for error conditions

## Module Design

**Exports:**
- Named exports preferred over default exports
- Explicit `export` keyword on functions/types to export
- Group related exports together

**Barrel Files:**
- `index.ts` for re-exporting from subdirectories
- Example: `src/components/ui/index.ts` exports all UI components
- Pattern: `export * from "./component"` or `export { specific } from "./module"`

**Directory Structure:**
- Feature directories: `src/features/{feature}/`
  - `__tests__/` for test files
  - `hooks/` for feature-specific hooks
  - `types/` or `types.ts` for feature types
  - `utils/` for utilities
  - `index.ts` for public exports
- Shared code in `src/lib/`
- React hooks in `src/hooks/`
- React contexts in `src/contexts/`

## React Patterns

**Component Structure:**
```typescript
interface Props {
  organizationId: string;
  sites: Site[];
  canEdit: boolean;
}

export function ComponentName({ organizationId, sites, canEdit }: Props) {
  // Hooks first
  const { data, isLoading } = useQuery(...);
  const mutation = useMutation(...);

  // Local state
  const [editItem, setEditItem] = useState<Item | null>(null);

  // Effects
  useEffect(() => {...}, [deps]);

  // Handlers
  const handleAction = async () => {...};

  // Early returns for loading/empty
  if (isLoading) return <Loader />;

  // Main render
  return (...);
}
```

**Hooks Pattern:**
```typescript
export function useResourceName(resourceId: string | null) {
  return useQuery({
    queryKey: qk.resource(resourceId).details(),
    queryFn: async (): Promise<Resource | null> => {
      if (!resourceId) return null;
      const { data, error } = await supabase.from("resources")...
      if (error) throw error;
      return data;
    },
    enabled: !!resourceId,
  });
}
```

**Query Keys:**
- Centralized in `src/lib/queryKeys.ts`
- Hierarchical factory pattern: `qk.org(orgId).gateways()`
- Type-safe with `as const` assertions

---

*Convention analysis: 2026-01-23*
