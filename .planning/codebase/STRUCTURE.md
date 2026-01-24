# Codebase Structure

**Analysis Date:** 2026-01-23

## Directory Layout

```
freshtrack-pro/
├── src/                    # Frontend application source
│   ├── App.tsx            # Root component with providers and routes
│   ├── main.tsx           # Entry point - mounts React app
│   ├── index.css          # Global styles (Tailwind)
│   ├── components/        # React components (150+ files)
│   ├── pages/             # Route-level page components
│   ├── features/          # Self-contained feature modules
│   ├── hooks/             # Custom React hooks (45+ files)
│   ├── contexts/          # React Context providers
│   ├── lib/               # Utilities, configs, domain logic
│   ├── integrations/      # External service clients
│   ├── types/             # Shared TypeScript types
│   ├── assets/            # Static assets (images, fonts)
│   └── test/              # Test utilities and setup
├── supabase/              # Backend configuration
│   ├── functions/         # Edge functions (40+ functions)
│   ├── migrations/        # Database migrations
│   └── config.toml        # Supabase local config
├── public/                # Static files served directly
├── docs/                  # Documentation
├── scripts/               # Build and dev scripts
├── docker/                # Docker configuration
└── .planning/             # GSD planning documents
```

## Directory Purposes

**`src/components/`:**
- Purpose: Reusable React components
- Contains: UI primitives, feature components, layout components
- Key subdirectories:
  - `ui/` - shadcn/ui primitives (button, card, dialog, etc.)
  - `platform/` - Super Admin platform components
  - `settings/` - Settings page components
  - `sidebar/` - Navigation sidebar components
  - `devices/` - Device/sensor display components
  - `health/` - System health components
  - `debug/` - Debug panels and overlays
  - `ttn/` - TTN-specific components
  - `billing/` - Stripe billing components

**`src/pages/`:**
- Purpose: Route-level components (one per route)
- Contains: 28 page components
- Key files:
  - `Dashboard.tsx` - Main dashboard
  - `SiteDetail.tsx`, `UnitDetail.tsx` - Entity detail views
  - `Settings.tsx` - Organization settings (56KB - largest page)
  - `Onboarding.tsx` - New user onboarding flow
  - `platform/` subdirectory - Super Admin pages

**`src/features/`:**
- Purpose: Self-contained feature modules with components, hooks, types
- Contains: `dashboard-layout/` - Drag-and-drop widget system
- Pattern: Each feature exports via `index.ts` barrel file

**`src/hooks/`:**
- Purpose: Custom React hooks for data fetching and state
- Contains: 45+ hooks
- Key files:
  - `useOrgScope.ts` - Canonical hook for org-scoped queries
  - `useEffectiveIdentity.ts` - Impersonation-aware identity
  - `useCan.tsx` - RBAC permission hooks and components
  - `useLoraSensors.ts` - Sensor management
  - `useGateways.ts` - Gateway management
  - `useTTN*.ts` - TTN integration hooks (6 files)
  - `useUnitStatus.ts`, `useUnitAlerts.ts` - Unit monitoring

**`src/contexts/`:**
- Purpose: React Context for global state
- Contains:
  - `SuperAdminContext.tsx` - Impersonation, support mode, audit logging
  - `TTNConfigContext.tsx` - TTN configuration state
  - `DebugContext.tsx` - Debug mode toggle

**`src/lib/`:**
- Purpose: Domain logic, utilities, configurations
- Contains: 15+ subdirectories and standalone files
- Key files:
  - `queryKeys.ts` - Type-safe React Query key factory
  - `invalidation.ts` - Cache invalidation utilities
  - `permissions.ts` - RBAC permission matrix and helpers
  - `rbac/index.ts` - RBAC module re-exports
- Key subdirectories:
  - `ttn/` - TTN error mapping, diagnostics, guards
  - `health/` - Health check utilities
  - `devices/` - Device type configurations
  - `errors/` - Error types and handling

**`src/integrations/supabase/`:**
- Purpose: Supabase client and auto-generated types
- Contains:
  - `client.ts` - Initialized Supabase client
  - `types.ts` - Auto-generated database types (127KB)

**`supabase/functions/`:**
- Purpose: Deno edge functions for server-side logic
- Contains: 40+ function directories
- Key functions:
  - `ingest-readings/` - Sensor data ingestion
  - `ttn-webhook/` - TTN uplink webhook
  - `ttn-provision-*` - TTN device/gateway provisioning
  - `send-sms-alert/` - Telnyx SMS alerts
  - `stripe-*` - Stripe billing integration
  - `process-unit-states/` - Background state processing
  - `_shared/` - Shared utilities for edge functions

**`supabase/migrations/`:**
- Purpose: Database schema migrations
- Contains: 60+ SQL migration files
- Pattern: Timestamped UUIDs (e.g., `20251226003405_0ddcfd94-...`)

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React DOM mount
- `src/App.tsx`: Provider tree and route definitions
- `index.html`: HTML shell

**Configuration:**
- `vite.config.ts`: Vite build configuration with path aliases
- `tsconfig.json`: TypeScript configuration
- `tailwind.config.ts`: Tailwind CSS configuration
- `supabase/config.toml`: Supabase local development config
- `.env`: Environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)

**Core Logic:**
- `src/lib/permissions.ts`: RBAC permission matrix (393 lines)
- `src/lib/queryKeys.ts`: Query key factory (173 lines)
- `src/contexts/SuperAdminContext.tsx`: Impersonation logic (647 lines)
- `src/hooks/useEffectiveIdentity.ts`: Identity resolution (331 lines)

**Testing:**
- `src/test/setup.ts`: Vitest setup
- `src/lib/orgScopedInvalidation.test.ts`: Example unit test

## Naming Conventions

**Files:**
- Components: PascalCase (`DashboardLayout.tsx`, `AlertRow.tsx`)
- Hooks: camelCase with `use` prefix (`useOrgScope.ts`, `useCan.tsx`)
- Utilities: camelCase (`queryKeys.ts`, `invalidation.ts`)
- Types: camelCase or PascalCase depending on content

**Directories:**
- Lowercase with hyphens for multi-word (`dashboard-layout/`)
- Singular for feature modules (`components/`, not `component/`)

**Exports:**
- Barrel files: `index.ts` in feature directories
- Named exports preferred over default exports in utilities
- Default exports for page and component files

## Where to Add New Code

**New Page:**
- Primary code: `src/pages/NewPage.tsx`
- Add route: `src/App.tsx` Routes section
- If protected: Wrap with `<RequireImpersonationGuard>` for Super Admin compatibility

**New Component:**
- Shared UI: `src/components/ui/` (for shadcn/ui-style primitives)
- Feature-specific: `src/components/{feature}/` (e.g., `src/components/devices/`)
- Page-specific: Co-locate with page if only used there

**New Hook:**
- Location: `src/hooks/useNewHook.ts`
- Naming: `use` prefix, camelCase
- For data fetching: Use `useOrgScope()` for org-scoped queries

**New Feature Module:**
- Location: `src/features/{feature-name}/`
- Structure: `index.ts`, `types.ts`, `components/`, `hooks/`, `utils/`
- Export via barrel file

**New Edge Function:**
- Location: `supabase/functions/{function-name}/index.ts`
- Shared code: `supabase/functions/_shared/`
- Pattern: Deno.serve with CORS headers

**New Database Migration:**
- Generate: Supabase CLI (`supabase migration new migration_name`)
- Location: `supabase/migrations/`

**New Utility:**
- Domain logic: `src/lib/{category}/newUtil.ts`
- General helpers: `src/lib/utils.ts` (already exists with `cn()`)

## Special Directories

**`node_modules/`:**
- Purpose: NPM dependencies
- Generated: Yes (npm install)
- Committed: No

**`dist/`:**
- Purpose: Production build output
- Generated: Yes (npm run build)
- Committed: No

**`.next/` (if exists):**
- Purpose: N/A - This is NOT a Next.js project
- Note: Project uses Vite, not Next.js

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Partially (by mapping agents)
- Committed: Yes

**`docs/`:**
- Purpose: Project documentation
- Generated: No
- Committed: Yes

**`public/`:**
- Purpose: Static files served at root URL
- Contains: Favicon, robots.txt, Telnyx assets
- Committed: Yes

---

*Structure analysis: 2026-01-23*
