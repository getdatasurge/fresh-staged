# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Multi-Tenant SPA with Supabase Backend

**Key Characteristics:**
- React SPA with file-based page routing (not Next.js - uses react-router-dom)
- Supabase for authentication, database, and edge functions
- Multi-tenant architecture with organization-scoped data
- Super Admin platform with impersonation support
- React Query for server state management

## Layers

**Presentation Layer:**
- Purpose: UI rendering and user interaction
- Location: `src/components/`, `src/pages/`
- Contains: React components, page layouts, UI primitives
- Depends on: Hooks, Contexts, UI library (shadcn/ui)
- Used by: App router

**Page Layer:**
- Purpose: Route-level components that compose features
- Location: `src/pages/`
- Contains: 28 page components (Dashboard, Sites, Units, Settings, etc.)
- Depends on: DashboardLayout, feature components, hooks
- Used by: `src/App.tsx` router

**Feature Layer:**
- Purpose: Self-contained feature modules
- Location: `src/features/`
- Contains: Dashboard layouts with widgets, types, hooks, components
- Depends on: Hooks, lib utilities
- Used by: Page components

**Hooks Layer:**
- Purpose: Reusable data fetching and state logic
- Location: `src/hooks/`
- Contains: 45+ custom hooks (useOrgScope, useCan, useTTN*, useUnit*, etc.)
- Depends on: Supabase client, React Query, Contexts
- Used by: Components, Pages

**Context Layer:**
- Purpose: Global application state
- Location: `src/contexts/`
- Contains: DebugContext, SuperAdminContext, TTNConfigContext
- Depends on: Supabase client
- Used by: Entire application via providers in App.tsx

**Library Layer:**
- Purpose: Domain logic, utilities, and configurations
- Location: `src/lib/`
- Contains: RBAC permissions, query keys, cache invalidation, TTN utilities, error handling
- Depends on: Supabase types
- Used by: Hooks, Components

**Integration Layer:**
- Purpose: External service clients
- Location: `src/integrations/supabase/`
- Contains: Supabase client configuration, auto-generated types
- Depends on: Environment variables
- Used by: Entire application

**Backend Layer (Edge Functions):**
- Purpose: Server-side logic and external API integrations
- Location: `supabase/functions/`
- Contains: 40+ Deno edge functions for TTN, Telnyx, Stripe, data processing
- Depends on: Supabase service role, external APIs
- Used by: Frontend via supabase.functions.invoke()

## Data Flow

**User Data Query:**
1. Component calls hook (e.g., `useLoraSensors()`)
2. Hook uses `useOrgScope()` to get effective organization ID (handles impersonation)
3. Hook uses `qk.org(orgId).loraSensors()` for type-safe query key
4. React Query fetches from Supabase with RLS-enforced data
5. Data cached by query key hierarchy

**Mutation with Invalidation:**
1. Component calls mutation hook
2. Mutation writes to Supabase
3. On success, calls `invalidateUnit()` or `invalidateOrg()` from `src/lib/invalidation.ts`
4. React Query refetches affected queries by key prefix

**State Management:**
- Server state: React Query (`@tanstack/react-query`)
- Auth state: Supabase auth listeners + SuperAdminContext
- UI state: React useState, component-local
- Global state: React Context (Debug, SuperAdmin, TTNConfig)

## Key Abstractions

**Effective Identity (`src/hooks/useEffectiveIdentity.ts`):**
- Purpose: Resolves "who is the current user/org" considering impersonation
- Examples: `src/hooks/useOrgScope.ts` wraps this for data queries
- Pattern: Returns effectiveOrgId, effectiveUserId, isImpersonating

**RBAC Permissions (`src/lib/permissions.ts`):**
- Purpose: Role-based access control with permission matrix
- Examples: `src/hooks/useCan.tsx`, `src/lib/rbac/index.ts`
- Pattern: Roles (owner, admin, manager, staff, viewer, inspector) map to permissions

**Query Key Factory (`src/lib/queryKeys.ts`):**
- Purpose: Type-safe, hierarchical cache keys for React Query
- Examples: `qk.org(orgId).sites()`, `qk.unit(unitId).readings('24h')`
- Pattern: Scoped keys enable prefix-based invalidation

**Cache Invalidation (`src/lib/invalidation.ts`):**
- Purpose: Centralized, context-aware cache busting
- Examples: `invalidateOrg()`, `invalidateUnit()`, `invalidateAllOrgData()`
- Pattern: Invalidates by query key prefix

**Dashboard Layouts (`src/features/dashboard-layout/`):**
- Purpose: Customizable drag-and-drop widget layouts for unit/site dashboards
- Examples: `EntityDashboard`, `LayoutManager`, `WidgetRenderer`
- Pattern: Widget registry + user-saved layout configs

## Entry Points

**Browser Entry:**
- Location: `src/main.tsx`
- Triggers: Browser loads index.html
- Responsibilities: Mount React app to DOM

**Application Root:**
- Location: `src/App.tsx`
- Triggers: React renders
- Responsibilities: Provider composition, route definitions

**Routes:**
- Main app: `/dashboard`, `/sites/:id`, `/units/:id`, `/settings`, etc.
- Platform admin: `/platform/*` (Super Admin only)
- Public: `/`, `/auth`, `/privacy`, `/terms`

**Edge Functions:**
- Location: `supabase/functions/*/index.ts`
- Triggers: HTTP requests, Supabase invocations
- Responsibilities: Server-side processing (TTN provisioning, SMS alerts, webhooks)

## Error Handling

**Strategy:** Centralized error explanation with graceful degradation

**Patterns:**
- `src/lib/errorHandler.ts`: Global error processing
- `src/lib/errorExplainer.ts`: User-friendly error messages with debugging hints
- `src/lib/ttn/errorMapper.ts`: TTN-specific error mapping
- Toast notifications via `src/hooks/use-toast.ts`

## Cross-Cutting Concerns

**Logging:**
- Development: `src/lib/debugLogger.ts` with gated console output
- Production: Edge function logs via Deno console
- RBAC debugging: `window.location.search.includes('debug_rbac=1')`

**Validation:**
- Form validation: Zod schemas with react-hook-form
- API validation: Edge functions use Zod schemas (`supabase/functions/_shared/validation.ts`)

**Authentication:**
- Provider: Supabase Auth (email/password, OAuth)
- Session: localStorage persistence, auto-refresh
- Super Admin: Server-side role check via `is_current_user_super_admin` RPC
- Impersonation: Server-side sessions via `start_impersonation`/`stop_impersonation` RPCs

**Multi-Tenancy:**
- Organization-scoped: All data queries filter by `organization_id`
- Row Level Security: Supabase RLS policies enforce tenant isolation
- Impersonation: Super Admins can view/act as any user within Support Mode

---

*Architecture analysis: 2026-01-23*
