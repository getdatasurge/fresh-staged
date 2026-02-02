# Phase 33: Error Handling UI Integration - Research

**Researched:** 2026-01-28
**Domain:** React Error Boundaries, Custom Error Handling, UI Error States
**Confidence:** HIGH

## Summary

This phase wires the existing `SupabaseMigrationError` class (created in Phase 30-03) to React UI components so users see helpful messages instead of generic errors when hitting deprecated Supabase functionality. The project already has:

1. **SupabaseMigrationError class** in `src/lib/supabase-placeholder.ts` with `isSupabaseMigration` flag
2. **isSupabaseMigrationError helper** for cross-module error detection
3. **DashboardErrorBoundary** component that catches render errors
4. **errorHandler.ts** with permission-aware error handling using sonner toasts

The standard approach is to:

1. Extend the existing error handler to recognize SupabaseMigrationError
2. Optionally create a specialized error boundary for migration errors
3. Update components that consume Supabase data to check for this error type

**Primary recommendation:** Extend the existing errorHandler.ts to handle SupabaseMigrationError and create a MigrationErrorBoundary component, keeping the pattern consistent with DashboardErrorBoundary.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library      | Version | Purpose             | Why Standard                  |
| ------------ | ------- | ------------------- | ----------------------------- |
| React        | 18.3.1  | UI framework        | Already in project            |
| sonner       | 1.7.4   | Toast notifications | Already used for error toasts |
| lucide-react | 0.462.0 | Icons               | Already used in error UIs     |

### Supporting

| Library                      | Version | Purpose                  | When to Use                                 |
| ---------------------------- | ------- | ------------------------ | ------------------------------------------- |
| @radix-ui/react-alert-dialog | 1.1.14  | Modal dialogs            | For blocking error messages                 |
| shadcn/ui Card components    | -       | Error display containers | Match existing DashboardErrorBoundary style |

### Alternatives Considered

| Instead of            | Could Use                     | Tradeoff                                                                                                                     |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Custom error boundary | react-error-boundary (v6.1.0) | Library adds functional component support and resetKeys, but project already uses class-based DashboardErrorBoundary pattern |

**Installation:**
No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── supabase-placeholder.ts    # SupabaseMigrationError (EXISTS)
│   └── errorHandler.ts            # Update to handle migration errors
├── components/
│   ├── errors/
│   │   └── MigrationErrorBoundary.tsx  # NEW: Catches migration errors
│   │   └── MigrationErrorFallback.tsx  # NEW: UI for migration errors
│   └── ui/
│       └── ... (existing shadcn components)
└── features/
    └── dashboard-layout/
        └── components/
            └── DashboardErrorBoundary.tsx  # EXISTS: Reference implementation
```

### Pattern 1: Type Guard Error Detection

**What:** Use `isSupabaseMigrationError` for reliable cross-module detection
**When to use:** Always when checking if error is migration-related
**Example:**

```typescript
// Source: src/lib/supabase-placeholder.ts (existing code)
import { isSupabaseMigrationError } from '@/lib/supabase-placeholder';

function handleError(error: unknown) {
  if (isSupabaseMigrationError(error)) {
    // Show migration-specific UI
    return;
  }
  // Handle other errors
}
```

### Pattern 2: Class-Based Error Boundary

**What:** Match existing DashboardErrorBoundary pattern for consistency
**When to use:** For catching render-time errors from suspended Supabase calls
**Example:**

```typescript
// Source: Adapted from src/features/dashboard-layout/components/DashboardErrorBoundary.tsx
import React, { Component, ReactNode } from "react";
import { isSupabaseMigrationError, SupabaseMigrationError } from "@/lib/supabase-placeholder";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isMigrationError: boolean;
}

export class MigrationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isMigrationError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isMigrationError: isSupabaseMigrationError(error)
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[MigrationErrorBoundary]", {
      error: error.message,
      isMigration: isSupabaseMigrationError(error),
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError && this.state.isMigrationError) {
      return this.props.fallback || <MigrationErrorFallback error={this.state.error} />;
    }
    // Re-throw non-migration errors to parent boundaries
    if (this.state.hasError) {
      throw this.state.error;
    }
    return this.props.children;
  }
}
```

### Pattern 3: Toast-Based Async Error Handling

**What:** Extend errorHandler.ts for promise/async errors (event handlers, effects)
**When to use:** Errors from async operations that don't bubble to error boundaries
**Example:**

```typescript
// Source: Adapted from src/lib/errorHandler.ts
import { toast } from 'sonner';
import { isSupabaseMigrationError, SupabaseMigrationError } from '@/lib/supabase-placeholder';

export function handleError(error: unknown, action?: string, fallbackMessage?: string): void {
  console.error('Operation failed:', error);

  // Check for migration error FIRST
  if (isSupabaseMigrationError(error)) {
    const migrationError = error as SupabaseMigrationError;
    const featureMsg = migrationError.featureName ? ` (${migrationError.featureName})` : '';
    toast.error(`This feature is temporarily unavailable${featureMsg}`, {
      description: 'It is being migrated to the new backend. Please try again later.',
      duration: 5000,
    });
    return;
  }

  // Existing permission error handling
  if (isPermissionError(error)) {
    toast.error(getPermissionErrorMessage(error, action));
    return;
  }

  // Use fallback or generic message
  const message = fallbackMessage || getPermissionErrorMessage(error, action);
  toast.error(message);
}
```

### Anti-Patterns to Avoid

- **Checking instanceof directly:** Can fail across module boundaries; always use `isSupabaseMigrationError()` helper
- **Swallowing errors silently:** Always show user feedback when migration error occurs
- **Multiple fallback layers:** Don't wrap in both MigrationErrorBoundary and DashboardErrorBoundary at same level

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem              | Don't Build              | Use Instead                     | Why                                |
| -------------------- | ------------------------ | ------------------------------- | ---------------------------------- |
| Error type detection | Custom instanceof checks | `isSupabaseMigrationError()`    | Handles module boundary issues     |
| Toast notifications  | Custom DOM manipulation  | sonner toast                    | Already integrated, consistent UX  |
| Error card styling   | Custom CSS               | shadcn Card + existing patterns | Match DashboardErrorBoundary style |
| Modal error dialogs  | Custom modal             | @radix-ui AlertDialog           | Already in dependencies            |

**Key insight:** The project has established patterns from DashboardErrorBoundary and errorHandler.ts. Matching these patterns ensures consistency and reduces code review friction.

## Common Pitfalls

### Pitfall 1: Error Boundary Position Too High

**What goes wrong:** Wrapping entire app in MigrationErrorBoundary catches all errors
**Why it happens:** Over-caution about missing errors
**How to avoid:** Place around specific feature areas that use Supabase placeholder
**Warning signs:** Generic migration error shown for unrelated crashes

### Pitfall 2: Missing Async Error Handling

**What goes wrong:** Error boundary doesn't catch errors from useEffect, event handlers, or promises
**Why it happens:** React error boundaries only catch render-time errors
**How to avoid:** Use handleError() in try-catch blocks for async code
**Warning signs:** Generic "An error occurred" instead of migration message

### Pitfall 3: Confusing Generic Errors for Migration Errors

**What goes wrong:** All errors treated as migration errors
**Why it happens:** Not checking `isSupabaseMigrationError` properly
**How to avoid:** Always use the type guard function, check before other error types
**Warning signs:** Migration message for auth errors, network errors, etc.

### Pitfall 4: Error State Not Resettable

**What goes wrong:** User stuck on error screen with no way to retry
**Why it happens:** No reset mechanism in error boundary
**How to avoid:** Include retry/dismiss buttons like DashboardErrorBoundary does
**Warning signs:** User must refresh entire page to recover

## Code Examples

Verified patterns from official sources and existing codebase:

### Migration Error Fallback Component

```typescript
// Based on DashboardErrorBoundary.tsx styling
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMigrationError } from "@/lib/supabase-placeholder";

interface MigrationErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
}

export function MigrationErrorFallback({ error, onRetry }: MigrationErrorFallbackProps) {
  const migrationError = error as SupabaseMigrationError | null;
  const featureName = migrationError?.featureName;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-lg">Feature Temporarily Unavailable</CardTitle>
        </div>
        <CardDescription>
          {featureName
            ? `The "${featureName}" feature is being migrated to our new backend.`
            : "This feature is being migrated to our new backend."}
          {" "}It will be available again soon.
        </CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
```

### Error Handler Integration

```typescript
// Add to src/lib/errorHandler.ts
import { isSupabaseMigrationError, SupabaseMigrationError } from '@/lib/supabase-placeholder';

/**
 * Check if an error is a migration-related unavailability
 */
export function isMigrationError(error: unknown): boolean {
  return isSupabaseMigrationError(error);
}

/**
 * Get user-friendly message for migration errors
 */
export function getMigrationErrorMessage(error: unknown): string {
  if (isSupabaseMigrationError(error)) {
    const migrationError = error as SupabaseMigrationError;
    if (migrationError.featureName) {
      return `The "${migrationError.featureName}" feature is temporarily unavailable while being migrated.`;
    }
    return 'This feature is temporarily unavailable while being migrated to the new backend.';
  }
  return 'An unexpected error occurred.';
}
```

### Component Usage Pattern

```typescript
// In any component that uses supabase placeholder
import { handleError } from '@/lib/errorHandler';
import { isSupabaseMigrationError } from '@/lib/supabase-placeholder';

function MyComponent() {
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const handleAction = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('some-function');
      if (error) {
        if (isSupabaseMigrationError(error)) {
          setMigrationError(error.featureName || 'this feature');
          return;
        }
        throw error;
      }
      // Use data...
    } catch (err) {
      handleError(err, 'perform action');
    }
  };

  if (migrationError) {
    return <MigrationErrorFallback error={new SupabaseMigrationError('', migrationError)} />;
  }

  return <div>...</div>;
}
```

## State of the Art

| Old Approach                  | Current Approach                       | When Changed       | Impact                         |
| ----------------------------- | -------------------------------------- | ------------------ | ------------------------------ |
| instanceof checks             | Type guard with flag check             | Phase 30-03 (2026) | Works across module boundaries |
| Class error boundaries only   | react-error-boundary library available | 2024               | Functional component support   |
| window.onerror global handler | React error boundaries                 | React 16+          | Component-tree scoped catching |

**Deprecated/outdated:**

- Direct `instanceof SupabaseMigrationError` checks: Use `isSupabaseMigrationError()` instead

## Open Questions

Things that couldn't be fully resolved:

1. **Boundary placement granularity**
   - What we know: Can wrap individual features or broader regions
   - What's unclear: Exact component tree locations that need protection
   - Recommendation: Start with high-level placement (around Dashboard, Onboarding) and refine based on testing

2. **Recovery vs refresh strategy**
   - What we know: Migration errors won't resolve until code is updated
   - What's unclear: Should retry button refresh page or just component?
   - Recommendation: Retry button resets error state (like DashboardErrorBoundary), user can manually refresh if needed

## Sources

### Primary (HIGH confidence)

- `src/lib/supabase-placeholder.ts` - Existing SupabaseMigrationError implementation
- `src/features/dashboard-layout/components/DashboardErrorBoundary.tsx` - Existing pattern
- `src/lib/errorHandler.ts` - Existing error handling utilities
- [React Official Docs](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) - Error boundary lifecycle

### Secondary (MEDIUM confidence)

- [react-error-boundary GitHub](https://github.com/bvaughn/react-error-boundary) - Library patterns (v6.1.0)
- [TatvaSoft Blog](https://www.tatvasoft.com/outsourcing/2025/02/react-error-boundary.html) - Best practices 2025

### Tertiary (LOW confidence)

- WebSearch results for "React error boundary best practices 2025" - Community patterns

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - All dependencies already in project
- Architecture: HIGH - Following existing DashboardErrorBoundary pattern
- Pitfalls: MEDIUM - Based on React documentation and community patterns

**Research date:** 2026-01-28
**Valid until:** 60 days (stable React patterns, no fast-moving changes expected)
