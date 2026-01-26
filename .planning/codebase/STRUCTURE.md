# Codebase Structure

**Analysis Date:** 2026-01-26

## Directory Layout

```
`fresh-staged/`
├── `backend/`               # Fastify API server, workers, tests, and DB access
├── `src/`                   # Frontend React application (Vite)
├── `supabase/`              # Supabase config, migrations, edge functions
├── `docs/`                  # Product, engineering, and ops documentation
├── `scripts/`               # Devops, migration, and test scripts
├── `public/`                # Frontend static assets
├── `docker/`                # Docker and monitoring configs
├── `opencode/`              # SDKs/tools assets
├── `cleo/`                  # Packaging/install artifacts
├── `dist/`                  # Build output (generated)
├── `docs-site/`             # Docs site build output (generated)
├── `.planning/`             # Planning artifacts for the project
├── `package.json`           # Root frontend/tooling manifest
├── `vite.config.ts`         # Vite build configuration
└── `README.md`              # Project overview
```

## Directory Purposes

**`backend/`:**
- Purpose: Backend API server, workers, and data access logic
- Contains: Fastify app, routes, middleware, services, jobs, tests
- Key files: `backend/src/index.ts`, `backend/src/app.ts`, `backend/package.json`
- Subdirectories: `backend/src/routes`, `backend/src/services`, `backend/src/trpc`, `backend/tests`, `backend/drizzle`

**`src/`:**
- Purpose: Frontend React SPA
- Contains: Pages, components, hooks, contexts, client-side API helpers
- Key files: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Subdirectories: `src/pages`, `src/components`, `src/hooks`, `src/lib`, `src/contexts`, `src/providers`

**`supabase/`:**
- Purpose: Supabase configuration, database migrations, edge functions
- Contains: SQL migrations, function handlers, Supabase config
- Key files: `supabase/config.toml`, `supabase/functions/stripe-checkout/index.ts`
- Subdirectories: `supabase/migrations`, `supabase/functions`

**`docs/`:**
- Purpose: Documentation for architecture, product, ops, security
- Contains: Markdown docs, diagrams, ADRs
- Key files: `docs/INDEX.md`, `docs/architecture/ARCHITECTURE.md`
- Subdirectories: `docs/engineering`, `docs/operations`, `docs/product`, `docs/security`, `docs/adr`, `docs/diagrams`

**`scripts/`:**
- Purpose: Local dev, deployment, testing, migrations
- Contains: Shell scripts, TypeScript migration tooling
- Key files: `scripts/deploy.sh`, `scripts/seed-demo-data.sh`, `scripts/migration/README.md`
- Subdirectories: `scripts/dev`, `scripts/test`, `scripts/migration`, `scripts/docs`

**`public/`:**
- Purpose: Static assets served by the frontend
- Contains: Icons, robots.txt, static images
- Key files: `public/favicon.ico`, `public/robots.txt`
- Subdirectories: `public/telnyx`

**`docker/`:**
- Purpose: Container and monitoring configuration
- Contains: Dockerfiles, compose files, Prometheus/Loki configs
- Key files: `docker/docker-compose.yml`, `docker/prometheus/prometheus.yml`
- Subdirectories: `docker/prometheus`, `docker/loki`, `docker/frontend`, `docker/blackbox`

**`opencode/`:**
- Purpose: SDKs and UI assets (tooling)
- Contains: VS Code SDK, UI assets
- Key files: `opencode/sdks/vscode/package.json`
- Subdirectories: `opencode/sdks`, `opencode/packages`

**`cleo/`:**
- Purpose: Installer artifacts/tools
- Contains: Install scripts, packaged assets
- Key files: `cleo/install.sh`
- Subdirectories: Not detected

**`.planning/`:**
- Purpose: Planning and project management artifacts
- Contains: Project docs, milestones, codebase mapping
- Key files: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`
- Subdirectories: `.planning/codebase`, `.planning/milestones`, `.planning/phases`

## Key File Locations

**Entry Points:**
- `src/main.tsx` - Frontend React bootstrap
- `backend/src/index.ts` - Backend server entry
- `supabase/functions/*/index.ts` - Supabase edge function handlers

**Configuration:**
- `package.json` - Root dependencies and scripts
- `backend/package.json` - Backend dependencies and scripts
- `vite.config.ts` - Frontend build config
- `tailwind.config.ts` - Styling config
- `supabase/config.toml` - Supabase project config

**Core Logic:**
- `src/pages` - Route-level UI and views
- `src/lib` - Client-side domain logic and API clients
- `backend/src/routes` - HTTP route handlers
- `backend/src/services` - Business logic services
- `backend/src/db` - Database access helpers

**Testing:**
- `backend/tests` - Backend tests
- `src/lib/__tests__` - Frontend unit tests
- `src/test/setup.ts` - Frontend test setup
- `scripts/test` - E2E and validation scripts

**Documentation:**
- `README.md` - Project overview
- `docs/INDEX.md` - Documentation index
- `docs/architecture/ARCHITECTURE.md` - System architecture

## Naming Conventions

**Files:**
- `PascalCase.tsx`: React pages and components (example: `src/pages/OrganizationDashboard.tsx`)
- `camelCase.ts`: Frontend utilities/modules (example: `src/lib/errorHandler.ts`)
- `*.test.ts` or `*.test.tsx`: Tests (example: `backend/tests/api/sites.test.ts`)

**Directories:**
- `lowercase`: Top-level and domain folders (example: `backend`, `supabase`, `scripts`)
- `kebab-case`: Docs and script folders (example: `docs/LOCAL_DEV_ENV.md`)

**Special Patterns:**
- `index.ts`: Barrel exports and entry points (example: `backend/src/index.ts`)
- `CLAUDE.md`: Local agent instructions (example: `backend/CLAUDE.md`)

## Where to Add New Code

**New Feature:**
- Primary code: `src/pages` and `src/components`
- Tests: `src/lib/__tests__`
- Config if needed: `src/lib` or `src/contexts`

**New Component/Module:**
- Implementation: `src/components` or `src/lib`
- Types: `src/types`
- Tests: `src/lib/__tests__`

**New Route/Command:**
- Definition: `backend/src/routes`
- Handler: `backend/src/services`
- Tests: `backend/tests`

**Utilities:**
- Shared helpers: `src/lib` and `backend/src/utils`
- Type definitions: `src/types` and `backend/src/types`

## Special Directories

**`dist/`:**
- Purpose: Frontend build output
- Source: Generated by Vite build
- Committed: Not detected

**`docs/_build/`:**
- Purpose: Generated documentation exports
- Source: Built by docs tooling scripts
- Committed: Not detected

**`supabase/migrations/`:**
- Purpose: Database schema migrations
- Source: Generated and applied via Supabase tooling
- Committed: Yes

**`node_modules/`:**
- Purpose: Dependency installs
- Source: Package manager output
- Committed: No

---

*Structure analysis: 2026-01-26*
*Update when directory structure changes*
