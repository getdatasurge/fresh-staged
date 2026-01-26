# Architecture

**Analysis Date:** 2026-01-26

## Pattern Overview

**Overall:** Full-stack web application (React SPA + Fastify API + Supabase/Postgres + Edge functions)

**Key Characteristics:**
- React/Vite single-page frontend with routing and data fetching
- Fastify backend exposes REST and tRPC endpoints, plus webhook handlers
- Supabase provides Postgres, migrations, and edge functions

## Layers

**Frontend UI Layer:**
- Purpose: User-facing pages and reusable UI components
- Contains: Route pages, layout components, UI primitives
- Depends on: Frontend state/data layer, contexts, hooks
- Used by: React Router entry (`src/App.tsx`)
- Location: `src/pages`, `src/components`, `src/assets`

**Frontend State/Data Layer:**
- Purpose: API access, caching, client-side domain logic
- Contains: API clients, React Query/tRPC setup, context providers, hooks
- Depends on: Backend APIs, Supabase client helpers, shared utilities
- Used by: UI layer components and pages
- Location: `src/lib`, `src/hooks`, `src/contexts`, `src/providers`

**Backend API Layer:**
- Purpose: HTTP API endpoints, tRPC router, webhook receivers
- Contains: Fastify routes, tRPC routers, middleware, plugins
- Depends on: Services, schemas, data access, background jobs
- Used by: Frontend, external webhook providers
- Location: `backend/src/routes`, `backend/src/routers`, `backend/src/trpc`, `backend/src/middleware`, `backend/src/plugins`

**Backend Service Layer:**
- Purpose: Business logic and integrations
- Contains: Service modules, background jobs, feature modules
- Depends on: Data layer, external APIs (Stripe/Telnyx/TTN), utilities
- Used by: API layer routes/routers
- Location: `backend/src/services`, `backend/src/features`, `backend/src/jobs`, `backend/src/workers`

**Data Layer:**
- Purpose: Database access and persistence
- Contains: Drizzle schemas/migrations, Supabase migrations, DB helpers
- Depends on: Postgres/Supabase
- Used by: Backend services and jobs
- Location: `backend/src/db`, `backend/drizzle`, `supabase/migrations`, `supabase/config.toml`

**Edge Functions Layer:**
- Purpose: Serverless functions for external integrations
- Contains: Supabase edge functions
- Depends on: Supabase runtime, external APIs
- Used by: External webhooks or scheduled triggers
- Location: `supabase/functions/*/index.ts`

## Data Flow

**Web App Request (SPA + API):**

1. Browser loads `index.html` and bootstraps React (`src/main.tsx`).
2. React Router renders pages (`src/App.tsx` → `src/pages/*`).
3. Pages call hooks/clients (`src/hooks`, `src/lib/api`, `src/lib/trpc`).
4. Requests hit Fastify routes/tRPC (`backend/src/app.ts`, `backend/src/routes`, `backend/src/trpc`).
5. Services execute business logic and access data (`backend/src/services`, `backend/src/db`).
6. Response returns to client, cached via React Query.

**Webhook Processing (TTN/Stripe/Telnyx):**

1. Provider sends webhook to backend route (`backend/src/routes/*-webhooks.ts`).
2. Middleware validates/authenticates, parses payloads.
3. Services enqueue jobs or persist data.
4. Async workers/jobs perform follow-up tasks (`backend/src/jobs`, `backend/src/workers`).

**State Management:**
- Frontend: React Query cache + context providers (`src/contexts`, `src/providers`).
- Backend: Stateless request handling with persistent state in Postgres/Supabase.
- Local persistence: client-side storage helpers (`src/lib/offlineStorage.ts`).

## Key Abstractions

**Routes/Controllers:**
- Purpose: HTTP boundary and request validation
- Examples: `backend/src/routes/areas.ts`, `backend/src/routes/alerts.ts`
- Pattern: Fastify route modules

**tRPC Router:**
- Purpose: Typed RPC endpoints between frontend and backend
- Examples: `backend/src/trpc/router.ts`, `src/lib/trpc.ts`
- Pattern: tRPC router with Fastify adapter

**Service Modules:**
- Purpose: Domain logic and integrations
- Examples: `backend/src/services/*`, `backend/src/features/*`
- Pattern: Module-based services called by routes

**React Hooks/Contexts:**
- Purpose: Encapsulate client-side state and effects
- Examples: `src/hooks/useUnits.ts`, `src/contexts/TTNConfigContext.tsx`
- Pattern: Custom hooks + context providers

## Entry Points

**Frontend App:**
- Location: `src/main.tsx`
- Triggers: Browser loads app bundle
- Responsibilities: Mount React app, load global styles

**Backend API Server:**
- Location: `backend/src/index.ts`
- Triggers: Node process start
- Responsibilities: Build Fastify app, register routes/plugins, start server

**Supabase Edge Functions:**
- Location: `supabase/functions/*/index.ts`
- Triggers: Supabase edge function invocation (webhook/event)
- Responsibilities: Handle integration-specific workflows

## Error Handling

**Strategy:** Centralized error handler in backend, per-route/client handling in frontend

**Patterns:**
- Backend error plugin (`backend/src/plugins/error-handler.plugin.ts`) for consistent responses
- Fastify validation with Zod (`backend/src/app.ts`, `backend/src/schemas`)
- Frontend helpers for user-facing error messages (`src/lib/errorHandler.ts`, `src/lib/errors/userFriendlyErrors.ts`)

## Cross-Cutting Concerns

**Logging:**
- Backend structured logging (`backend/src/utils/logger.ts`)
- Frontend debug logging utilities (`src/lib/debugLogger.ts`)

**Validation:**
- Backend: Zod validation via Fastify type provider (`backend/src/app.ts`, `backend/src/schemas`)
- Frontend: runtime schema validation helpers (`src/lib/validation`, `src/lib/validation/runtimeSchemaValidator.ts`)

**Authentication:**
- Frontend auth provider (`src/App.tsx`, `src/lib/stack/client.ts`)
- Backend auth middleware (`backend/src/middleware/auth.ts`, `backend/src/plugins/auth.plugin.ts`)

---

*Architecture analysis: 2026-01-26*
*Update when major patterns change*
