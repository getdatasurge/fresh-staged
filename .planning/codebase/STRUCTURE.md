# Codebase Structure

**Analysis Date:** 2026-01-29

## Codebase Metrics

**Files Analyzed:**
- Total files: 742 files
- Source files: 677 files (excluding tests)
- Test files: 65 files
- Config files: 8 files (tsconfig, vite, eslint, tailwind, etc.)

**Lines of Code:**
- Total: 169,190 lines
- Source: ~160,000 lines (estimated)
- Tests: ~9,000 lines (estimated)

**Excluded from analysis:**
- Infrastructure: `.claude`, `.github`, `.codex`, `node_modules`, `.git`
- Build artifacts: `dist`, `build`, `out`, `target`, `coverage`

## Directory Layout

```plaintext
fresh-staged/
├── src/                          # Frontend React application
│   ├── components/               # React UI components
│   │   ├── ui/                  # shadcn/ui component library
│   │   ├── alerts/              # Alert-related components
│   │   ├── dashboard/           # Dashboard components
│   │   ├── settings/            # Settings panels
│   │   ├── site/                # Site-specific components
│   │   ├── unit/                # Unit-specific components
│   │   ├── guards/              # Auth/route guards
│   │   ├── platform/            # Platform admin components
│   │   └── ...                  # Other domain components
│   ├── pages/                   # Route page components
│   ├── features/                # Feature modules (dashboard-layout)
│   ├── hooks/                   # Custom React hooks (60+ hooks)
│   ├── contexts/                # React Context providers
│   ├── providers/               # High-level providers (Realtime)
│   ├── lib/                     # Frontend utilities and services
│   │   ├── trpc.ts              # tRPC client setup
│   │   ├── stack/               # Stack Auth integration
│   │   ├── api/                 # REST API clients
│   │   ├── validation/          # Zod schemas
│   │   ├── devices/             # Device registry
│   │   └── ...                  # Other utilities
│   ├── App.tsx                  # Root component with providers
│   ├── main.tsx                 # React entry point
│   └── index.css                # Global styles
├── backend/                     # Backend Fastify application
│   ├── src/
│   │   ├── routers/             # tRPC router modules (30+ routers)
│   │   ├── routes/              # REST route handlers
│   │   ├── services/            # Business logic services (40+ services)
│   │   ├── middleware/          # Auth, RBAC, org context middleware
│   │   ├── plugins/             # Fastify plugins (auth, socket, queue, email)
│   │   ├── workers/             # BullMQ worker processes
│   │   │   └── processors/      # Job processors (SMS, email, billing)
│   │   ├── jobs/                # Job definitions and schedulers
│   │   ├── trpc/                # tRPC setup (context, router, procedures)
│   │   ├── db/                  # Database layer
│   │   │   ├── schema/          # Drizzle ORM schema definitions
│   │   │   └── migrate.ts       # Migration runner
│   │   ├── schemas/             # Zod validation schemas
│   │   ├── utils/               # Backend utilities
│   │   ├── types/               # TypeScript type definitions
│   │   ├── emails/              # React Email templates
│   │   ├── hooks/               # Backend lifecycle hooks
│   │   ├── config/              # Configuration modules
│   │   ├── features/            # Shared feature modules
│   │   ├── app.ts               # Fastify app builder
│   │   └── index.ts             # Server entry point
│   ├── tests/                   # Backend integration tests
│   ├── drizzle/                 # Database migrations
│   └── package.json             # Backend dependencies
├── supabase/                    # Supabase Edge Functions (legacy)
│   └── functions/               # 50+ edge functions (being migrated)
│       └── _shared/             # Shared utilities for edge functions
├── docker/                      # Docker Compose services
│   ├── frontend/                # Nginx config for SPA
│   ├── grafana/                 # Grafana dashboards
│   ├── prometheus/              # Prometheus config
│   └── ...                      # Other services
├── docs/                        # Documentation
│   ├── architecture/            # Architecture decision records
│   ├── engineering/             # Engineering guides
│   └── ...                      # Other documentation
├── scripts/                     # Utility scripts
├── .planning/                   # GSD planning documents
│   ├── codebase/                # Codebase analysis (this file)
│   ├── phases/                  # Phase implementation plans
│   └── config.json              # GSD configuration
├── package.json                 # Frontend dependencies
├── vite.config.ts               # Vite build configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── components.json              # shadcn/ui configuration
```

## Directory Purposes

**`/src`:**
- Purpose: Frontend React application source code
- Contains: Components, pages, hooks, contexts, utilities
- Key files: `main.tsx` (entry), `App.tsx` (root component), `lib/trpc.ts` (API client)

**`/src/components`:**
- Purpose: Reusable React UI components organized by domain
- Contains:
  - `ui/` - shadcn/ui component library (buttons, cards, dialogs, etc.)
  - Domain folders (`alerts/`, `site/`, `unit/`) - Feature-specific components
  - `guards/` - Authorization guard components
- Key files: Component files follow PascalCase naming

**`/src/pages`:**
- Purpose: Top-level route components mapped to URLs
- Contains: Page components for each route in the application
- Key files: `Dashboard.tsx`, `Sites.tsx`, `SiteDetail.tsx`, `Settings.tsx`, `Alerts.tsx`

**`/src/hooks`:**
- Purpose: Custom React hooks for data fetching and state management
- Contains: 60+ hooks wrapping tRPC queries, mutations, and local state
- Key files: `useSites.ts`, `useAlerts.ts`, `useRealtimeSensorData.ts`, `useOrganization.ts`

**`/src/features`:**
- Purpose: Self-contained feature modules with components, hooks, and types
- Contains: `dashboard-layout/` - Customizable widget-based dashboard system
- Key files: Widget registry, layout manager, widget components

**`/backend/src`:**
- Purpose: Backend API server source code
- Contains: Fastify application, routers, services, database, workers
- Key files: `index.ts` (server entry), `app.ts` (app builder)

**`/backend/src/routers`:**
- Purpose: tRPC router modules defining type-safe API procedures
- Contains: 30+ router files, one per domain (sites, alerts, readings, etc.)
- Key files: `sites.router.ts`, `alerts.router.ts`, `organizations.router.ts`, `ttn-devices.router.ts`

**`/backend/src/routes`:**
- Purpose: REST API route handlers (non-tRPC endpoints)
- Contains: Webhook handlers, health checks, file uploads, auth callbacks
- Key files: `ttn-webhooks.ts`, `stripe-webhooks.ts`, `health.ts`, `assets.ts`

**`/backend/src/services`:**
- Purpose: Business logic layer with domain services
- Contains: 40+ service modules for alerts, TTN integration, billing, notifications
- Key files: `alert-evaluator.service.ts`, `ttn-device.service.ts`, `stripe-webhook.service.ts`

**`/backend/src/middleware`:**
- Purpose: Request middleware for auth, authorization, and context
- Contains: JWT auth, RBAC, organization context, API key auth
- Key files: `auth.ts`, `rbac.ts`, `org-context.ts`, `api-key-auth.ts`

**`/backend/src/plugins`:**
- Purpose: Fastify plugins for cross-cutting functionality
- Contains: Socket.io integration, queue service, email service, auth decorator
- Key files: `socket.plugin.ts`, `queue.plugin.ts`, `email.plugin.ts`, `auth.plugin.ts`

**`/backend/src/workers`:**
- Purpose: Background job processing with BullMQ
- Contains: Worker entry point and job processors
- Key files: `index.ts` (worker bootstrap), `processors/sms-notification.processor.ts`

**`/backend/src/db`:**
- Purpose: Database layer with Drizzle ORM
- Contains: Schema definitions, migrations, database client
- Key files: `schema/index.ts` (schema barrel), `schema/hierarchy.ts`, `schema/alerts.ts`

**`/backend/src/trpc`:**
- Purpose: tRPC configuration and router composition
- Contains: Context factory, procedure factory, root router
- Key files: `context.ts`, `router.ts`, `index.ts`

**`/supabase/functions`:**
- Purpose: Legacy Supabase Edge Functions (Deno serverless)
- Contains: 50+ edge functions being migrated to Fastify backend
- Key files: TTN provisioning, webhooks, scheduled tasks

**`/docker`:**
- Purpose: Docker Compose service configurations
- Contains: Configs for Grafana, Prometheus, Nginx, pgBouncer, etc.
- Key files: Service-specific subdirectories

## Key File Locations

**Entry Points:**
- `/src/main.tsx`: Frontend React entry point
- `/src/App.tsx`: Root React component with provider tree
- `/backend/src/index.ts`: Backend server entry point
- `/backend/src/app.ts`: Fastify app builder function
- `/backend/src/workers/index.ts`: Background worker entry point

**Configuration:**
- `/package.json`: Frontend dependencies and scripts
- `/backend/package.json`: Backend dependencies and scripts
- `/vite.config.ts`: Vite bundler configuration
- `/tsconfig.json`: TypeScript compiler options (frontend)
- `/backend/tsconfig.json`: TypeScript compiler options (backend)
- `/tailwind.config.ts`: Tailwind CSS configuration
- `/components.json`: shadcn/ui component configuration

**Core Logic:**
- `/src/lib/trpc.ts`: tRPC client factory and provider
- `/backend/src/trpc/router.ts`: Root tRPC router composition
- `/backend/src/app.ts`: Fastify app setup with all plugins and routes
- `/backend/src/db/schema/index.ts`: Database schema barrel export

**Testing:**
- `/src/**/__tests__`: Frontend unit tests (co-located with components)
- `/backend/tests`: Backend integration tests
- `/vitest.config.ts`: Frontend test configuration

## Naming Conventions

**Files:**
- **React components**: PascalCase - `DashboardLayout.tsx`, `SiteCard.tsx`
- **Hooks**: camelCase with `use` prefix - `useSites.ts`, `useAlerts.ts`
- **Services**: kebab-case with `.service.ts` suffix - `alert-evaluator.service.ts`
- **Routers**: kebab-case with `.router.ts` suffix - `sites.router.ts`
- **Routes**: kebab-case with `.ts` suffix - `ttn-webhooks.ts`
- **Utilities**: kebab-case - `logger.ts`, `jwt.ts`
- **Types**: kebab-case - `auth.ts`, `reading.ts`

**Directories:**
- **Frontend**: kebab-case - `dashboard-layout/`, `alert-rules/`
- **Backend**: kebab-case - `ttn/`, `workers/`, `processors/`
- **Components**: kebab-case - `ui/`, `site/`, `platform/`

**Variables:**
- **React components**: PascalCase - `const SiteCard = () => {}`
- **Functions**: camelCase - `function calculateUptime() {}`
- **Constants**: UPPER_SNAKE_CASE - `const MAX_RETRY_ATTEMPTS = 3`
- **Types/Interfaces**: PascalCase - `type SiteData = {}`

**Database:**
- **Tables**: snake_case - `sensor_readings`, `alert_rules`, `ttn_devices`
- **Columns**: snake_case - `organization_id`, `created_at`, `dev_eui`

## Where to Add New Code

**New Feature:**
- Primary code: `/src/features/{feature-name}/` (if self-contained) OR `/src/components/{domain}/` (if domain-specific)
- Backend logic: `/backend/src/services/{feature}.service.ts`
- API endpoints: `/backend/src/routers/{feature}.router.ts` (tRPC) OR `/backend/src/routes/{feature}.ts` (REST)
- Tests: Co-locate in `__tests__` folders

**New Page/Route:**
- Implementation: `/src/pages/{PageName}.tsx`
- Route registration: Add to `/src/App.tsx` in `<Routes>` component
- Navigation link: Update sidebar or nav in `/src/components/sidebar/`

**New Component:**
- Implementation: `/src/components/{domain}/{ComponentName}.tsx`
- If UI primitive: `/src/components/ui/{component-name}.tsx`

**New API Endpoint (tRPC):**
- Router: `/backend/src/routers/{domain}.router.ts`
- Service: `/backend/src/services/{domain}.service.ts`
- Schema: `/backend/src/schemas/{domain}.schema.ts` (if needed)
- Register: Add to `/backend/src/trpc/router.ts` root router

**New API Endpoint (REST):**
- Route handler: `/backend/src/routes/{feature}.ts`
- Register: Add to `/backend/src/app.ts` with `app.register()`

**New Hook:**
- Implementation: `/src/hooks/use{FeatureName}.ts`
- Follow naming: `use` prefix, camelCase

**Utilities:**
- Frontend: `/src/lib/{category}/{utility}.ts`
- Backend: `/backend/src/utils/{utility}.ts`

**Database Changes:**
- Schema: Edit or add to `/backend/src/db/schema/{table}.ts`
- Migration: Run `npm run db:generate` to create migration in `/backend/drizzle/`
- Apply: Run `npm run db:migrate` to apply migration

**Background Job:**
- Processor: `/backend/src/workers/processors/{job-name}.processor.ts`
- Register: Add to `/backend/src/workers/index.ts`
- Queue name: Define in `/backend/src/jobs/index.ts`

**Email Template:**
- Template: `/backend/src/emails/{TemplateName}.tsx` (React Email)
- Service: Call from `/backend/src/services/email.service.ts`

## Special Directories

**`/backend/drizzle`:**
- Purpose: Contains database migration files generated by drizzle-kit
- Generated: Yes (via `npm run db:generate`)
- Committed: Yes (migrations are version controlled)

**`/backend/dist`:**
- Purpose: Compiled JavaScript output from TypeScript
- Generated: Yes (via `npm run build`)
- Committed: No (excluded in `.gitignore`)

**`/node_modules`:**
- Purpose: Frontend npm dependencies
- Generated: Yes (via `npm install`)
- Committed: No

**`/backend/node_modules`:**
- Purpose: Backend npm dependencies
- Generated: Yes (via `npm install` in backend/)
- Committed: No

**`/src/components/ui`:**
- Purpose: shadcn/ui component library (installed via CLI)
- Generated: Yes (via `npx shadcn-ui@latest add`)
- Committed: Yes (customizable components)

**`/.planning`:**
- Purpose: GSD (Get Shit Done) planning documents and phase tracking
- Generated: Yes (by GSD workflow)
- Committed: Yes (planning documents are tracked)

**`/docs`:**
- Purpose: Project documentation, ADRs, guides
- Generated: No (manually written)
- Committed: Yes

**`/docker`:**
- Purpose: Docker Compose service configurations for local development
- Generated: No (manually configured)
- Committed: Yes

**`/supabase/functions`:**
- Purpose: Legacy edge functions (being migrated to Fastify backend)
- Generated: No (manually written)
- Committed: Yes (temporary - will be removed after migration)

---

*Structure analysis: 2026-01-29*
