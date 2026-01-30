# FrostGuard - Project Instructions

IoT refrigeration monitoring & food safety compliance platform. Real-time temperature monitoring, multi-tier alerts, HACCP compliance, and offline-first manual logging.

## Tech Stack

| Layer     | Tech                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| Frontend  | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, shadcn/ui (Radix primitives) |
| State     | TanStack Query v5, React Context                                             |
| API       | tRPC v11 (end-to-end type-safe)                                              |
| Backend   | Fastify 5, Node.js (ESM)                                                     |
| Database  | PostgreSQL 15, Drizzle ORM                                                   |
| Auth      | Stack Auth (migrating from Supabase Auth)                                    |
| Real-time | Socket.io v4 with Redis adapter                                              |
| Jobs      | BullMQ + Redis                                                               |
| Storage   | MinIO (S3-compatible)                                                        |
| IoT       | The Things Network (TTN), LoRaWAN                                            |
| Payments  | Stripe                                                                       |
| SMS       | Telnyx                                                                       |
| Email     | Resend + React Email                                                         |
| PWA       | Workbox via vite-plugin-pwa                                                  |

## Commands

```bash
# Frontend
npm run dev              # Vite dev server (port 8080)
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # tsc --build
npm run test             # Vitest (happy-dom)
npm run test:watch       # Vitest watch mode

# Backend
cd backend
npm run dev              # tsx watch (port 3000)
npm run build            # tsc
npm run test             # Vitest
npm run db:generate      # Drizzle Kit generate migrations
npm run db:migrate       # Run migrations
npm run db:push          # Push schema to DB (dev)
npm run db:studio        # Drizzle Studio UI

# Infrastructure
docker compose up -d                    # Postgres + Redis + MinIO
docker compose --profile admin up -d    # + pgAdmin + Redis Commander

# Docs
npm run docs:site:dev    # MkDocs dev server
npm run docs:site:build  # Build docs site
npm run adr:new          # Create new ADR
```

## Project Structure

```
src/                        # Frontend (React)
  pages/                    # Route-level components (30+ pages)
  components/               # UI components (shadcn/ui + custom)
  features/                 # Feature modules (dashboard-layout)
  hooks/                    # Custom React hooks (useAlerts, useAreas, etc.)
  lib/                      # Utilities, API client, tRPC setup
    trpc.ts                 # tRPC client configuration
    api/                    # API layer
    rbac/                   # Role-based access control
    validation/             # Zod schemas
    health/                 # Health monitoring
  contexts/                 # React contexts
  providers/                # Provider components (RealtimeProvider)
  types/                    # TypeScript type definitions
  test/                     # Test setup

backend/                    # Backend (Fastify)
  src/
    app.ts                  # Fastify app setup
    index.ts                # Entry point
    routers/                # tRPC routers (30+ route files)
    services/               # Business logic (40+ services)
    db/
      schema/               # Drizzle ORM schema definitions
      client.ts             # DB client
      migrate.ts            # Migration runner
    middleware/              # Auth, rate limiting
    plugins/                # Fastify plugins
    trpc/                   # tRPC context + router setup
    jobs/                   # BullMQ job processors
    workers/                # Background workers
    config/                 # Configuration
  drizzle/                  # Generated migrations
  tests/                    # Backend tests

docker/                     # Docker configs (production)
supabase/                   # Legacy Supabase (migrating away)
e2e/                        # Playwright E2E tests
docs/                       # Project documentation
docs-site/                  # MkDocs documentation site
scripts/                    # Build & utility scripts
```

## Path Alias

```typescript
"@/*" → "./src/*"
// Example: import { trpc } from "@/lib/trpc"
```

## Architecture Notes

- **tRPC everywhere**: Frontend and backend share types via tRPC. No manual API type definitions.
- **Domain hierarchy**: Organization → Site → Area → Unit. All data is org-scoped for multi-tenancy.
- **Alert SSOT**: Alert processing has a single source of truth in the backend (`unit-state.service.ts`, `alert-evaluator.service.ts`).
- **Offline-first**: Manual temperature logging uses IndexedDB, syncs when online.
- **Real-time**: Socket.io for live sensor updates. Redis adapter for multi-process.
- **Migration in progress**: Moving from Supabase edge functions to Fastify backend. Legacy Supabase code still exists in `supabase/functions/`.

## TypeScript Config

- `strict: false` (relaxed — project is in migration)
- `noImplicitAny: false`
- `strictNullChecks: false`
- Target: ES2020, module: ESNext, bundler resolution

## ESLint Rules

- `@typescript-eslint/no-unused-vars`: off
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-empty-object-type`: off
- `react-refresh/only-export-components`: warn (allowConstantExport)
- `prefer-const`: warn

## Testing

- **Unit tests**: Vitest with happy-dom environment. Files: `src/**/*.{test,spec}.{ts,tsx}`
- **Setup**: `src/test/setup.ts`
- **E2E**: Playwright (Chromium). Test dir: `e2e/`. Base URL: `http://localhost:5173`
- **Backend tests**: Vitest in `backend/tests/`

## Environment Variables

Required (frontend — all prefixed `VITE_`):

- `VITE_API_URL` — Backend URL (default: `http://localhost:3000`)
- `VITE_STACK_AUTH_PROJECT_ID` — Stack Auth project ID
- `VITE_STACK_AUTH_PUBLISHABLE_CLIENT_KEY` — Stack Auth client key

Legacy (still used during migration):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

See `.env.example` for full list with descriptions.

## Docker Services

| Service         | Port                       | Purpose                      |
| --------------- | -------------------------- | ---------------------------- |
| PostgreSQL 15   | 5432                       | Primary database             |
| Redis 7         | 6379                       | Cache, jobs, pub/sub         |
| MinIO           | 9200 (API), 9201 (Console) | File/image storage           |
| pgAdmin         | 5050                       | DB admin (profile: admin)    |
| Redis Commander | 8081                       | Redis admin (profile: admin) |

## Coding Conventions

- Components use PascalCase files (`DashboardLayout.tsx`)
- Hooks use camelCase with `use` prefix (`useAlerts.ts`)
- Services use kebab-case (`alert-rules.service.ts`)
- Routers use kebab-case (`alert-rules.router.ts`)
- UI components from shadcn/ui in `src/components/ui/`
- Use `@/` import alias for all src imports
- Zod for runtime validation (v4)
- React Hook Form + Zod resolvers for forms
- Sonner for toast notifications
- Lucide React for icons
- date-fns for date formatting

<!-- BEGIN FLOW-NEXT -->

## Flow-Next

This project uses Flow-Next for task tracking. Use `.flow/bin/flowctl` instead of markdown TODOs or TodoWrite.

**Quick commands:**

```bash
.flow/bin/flowctl list                # List all epics + tasks
.flow/bin/flowctl epics               # List all epics
.flow/bin/flowctl tasks --epic fn-N   # List tasks for epic
.flow/bin/flowctl ready --epic fn-N   # What's ready
.flow/bin/flowctl show fn-N.M         # View task
.flow/bin/flowctl start fn-N.M        # Claim task
.flow/bin/flowctl done fn-N.M --summary-file s.md --evidence-json e.json
```

**Rules:**

- Use `.flow/bin/flowctl` for ALL task tracking
- Do NOT create markdown TODOs or use TodoWrite
- Re-anchor (re-read spec + status) before every task

**More info:** `.flow/bin/flowctl --help` or read `.flow/usage.md`

<!-- END FLOW-NEXT -->
