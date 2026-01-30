# Architecture

**Analysis Date:** 2026-01-29

**Scope:**
- Source files: 742 files
- Primary language: TypeScript (100% of codebase)
- LOC: 169,190 lines

## Pattern Overview

**Overall:** Full-Stack Monorepo with Client-Server Architecture

**Key Characteristics:**
- **Monorepo structure** with frontend (Vite/React) and backend (Fastify/Node.js) in single repository
- **Type-safe API layer** via tRPC with shared types between frontend and backend
- **Multi-tenant SaaS** architecture with organization-based data isolation
- **Real-time data synchronization** via Socket.io for sensor readings and alerts
- **Background job processing** with BullMQ workers for async operations (SMS, email, billing)
- **Edge function migration in progress** - Legacy Supabase Edge Functions coexist with new Fastify backend

## Layers

**Frontend Layer:**
- Purpose: React SPA providing user interface for IoT monitoring platform
- Location: `/src`
- Contains: React components, pages, hooks, contexts, UI library (shadcn/ui)
- Depends on: Backend tRPC API, Socket.io realtime service, Stack Auth
- Used by: End users via web browser

**Backend API Layer:**
- Purpose: REST and tRPC API server handling authentication, authorization, and business logic
- Location: `/backend/src`
- Contains: Fastify server, tRPC routers, middleware, routes, plugins
- Depends on: Database (Drizzle ORM), Queue service (BullMQ), External APIs (TTN, Stripe, Telnyx)
- Used by: Frontend, webhooks, background workers

**Service Layer:**
- Purpose: Domain business logic and external service integrations
- Location: `/backend/src/services`
- Contains: 40+ service modules (alert.service, ttn.service, stripe-webhook.service, etc.)
- Depends on: Database, external APIs
- Used by: tRPC routers, REST routes, background workers

**Data Access Layer:**
- Purpose: Database schema and query abstraction
- Location: `/backend/src/db`
- Contains: Drizzle ORM schema definitions, migrations, database client
- Depends on: PostgreSQL database
- Used by: Services, routers, workers

**Worker Layer:**
- Purpose: Background job processing for async operations
- Location: `/backend/src/workers`
- Contains: BullMQ workers and processors for SMS, email digests, Stripe meter reporting
- Depends on: Redis, Queue service, Services (Telnyx, email)
- Used by: Scheduled jobs, API-triggered async tasks

**Edge Function Layer (Legacy):**
- Purpose: Serverless functions for specific operations (being migrated to backend)
- Location: `/supabase/functions`
- Contains: 50+ Deno edge functions for TTN provisioning, webhooks, exports
- Depends on: Supabase client, external APIs
- Used by: Webhooks, scheduled tasks (gradually being replaced)

## Data Flow

**Real-time Sensor Data Flow:**

1. IoT sensor transmits data via LoRaWAN to The Things Network (TTN)
2. TTN forwards uplink message to backend webhook endpoint (`/api/webhooks/ttn`)
3. `ttn-webhook.service.ts` processes payload, normalizes data format
4. Service writes reading to `sensor_readings` table via Drizzle ORM
5. Alert evaluator service checks reading against configured alert rules
6. Socket.io broadcasts new reading to connected frontend clients
7. Frontend `useRealtimeSensorData` hook receives update and updates React Query cache
8. UI components re-render with fresh data

**User Request Flow (tRPC):**

1. Frontend component calls `trpc.sites.list.useQuery()`
2. tRPC client batches request and sends to `/trpc` endpoint with JWT token
3. Backend `createContext` verifies JWT and attaches user to context
4. `sites.router.ts` procedure runs with authorization checks
5. `site.service.ts` queries database via Drizzle ORM with tenant isolation
6. Response returns through tRPC with full type safety
7. React Query caches result and component receives typed data

**Background Job Flow:**

1. API endpoint (e.g., alert triggered) calls `queueService.addJob('sms-notifications', data)`
2. BullMQ adds job to Redis queue with organizationId and metadata
3. Separate worker process (`/backend/src/workers/index.ts`) picks up job
4. Worker executes processor (`sms-notification.processor.ts`)
5. Processor calls `TelnyxService` to send SMS via Telnyx API
6. Job completion/failure logged to Redis and Bull Board dashboard

**State Management:**
- **Server state:** React Query manages all server data with tRPC integration
- **Real-time state:** Socket.io pushes updates, React Query cache invalidated on receive
- **Client state:** React Context API for cross-cutting concerns (auth, debug, TTN config)
- **Form state:** React Hook Form with Zod validation
- **URL state:** React Router for navigation and route params

## Key Abstractions

**tRPC Router:**
- Purpose: Type-safe API procedures with input validation and authorization
- Examples: `/backend/src/routers/sites.router.ts`, `/backend/src/routers/alerts.router.ts`
- Pattern: Input schemas (Zod) → middleware chain → service call → typed output

**Service Modules:**
- Purpose: Encapsulate business logic and external integrations
- Examples: `/backend/src/services/alert-evaluator.service.ts`, `/backend/src/services/ttn-device.service.ts`
- Pattern: Export functions that accept dependencies, return results, throw domain errors

**React Custom Hooks:**
- Purpose: Reusable data fetching and state management logic
- Examples: `/src/hooks/useSites.ts`, `/src/hooks/useAlerts.ts`, `/src/hooks/useRealtimeSensorData.ts`
- Pattern: Wrap tRPC queries/mutations, handle loading/error states, expose typed data

**Drizzle Schema Tables:**
- Purpose: Type-safe database schema definitions
- Examples: `/backend/src/db/schema/hierarchy.ts`, `/backend/src/db/schema/alerts.ts`
- Pattern: Export table definitions with relations, types inferred for queries

**Dashboard Widgets:**
- Purpose: Composable dashboard components with standardized interface
- Examples: `/src/features/dashboard-layout/widgets/BatteryHealthWidget.tsx`
- Pattern: Accept `WidgetProps` (entityId, entityType), render card with data

**Fastify Plugins:**
- Purpose: Modular Fastify extensions for cross-cutting functionality
- Examples: `/backend/src/plugins/auth.plugin.ts`, `/backend/src/plugins/queue.plugin.ts`
- Pattern: Register with Fastify, decorate instance with services (socket, queue, email)

## Entry Points

**Frontend Entry:**
- Location: `/src/main.tsx`
- Triggers: Browser loads index.html
- Responsibilities: Mount React root, initialize app with providers

**Frontend App Root:**
- Location: `/src/App.tsx`
- Triggers: React render
- Responsibilities: Set up provider tree (Stack Auth, tRPC, Query Client, Socket.io, Contexts), define routes

**Backend Server:**
- Location: `/backend/src/index.ts`
- Triggers: `npm run dev` or container start
- Responsibilities: Load environment, call `buildApp()`, start Fastify server, handle graceful shutdown

**Backend App Builder:**
- Location: `/backend/src/app.ts`
- Triggers: Called by index.ts or test setup
- Responsibilities: Configure Fastify (CORS, helmet, rate limiting), register plugins, register routes, return app instance

**Background Workers:**
- Location: `/backend/src/workers/index.ts`
- Triggers: Separate process/container start
- Responsibilities: Connect to Redis, register BullMQ workers for SMS/email/billing queues

**Edge Functions:**
- Location: `/supabase/functions/*/index.ts`
- Triggers: HTTP request to Supabase function URL
- Responsibilities: Serverless handlers for webhooks, scheduled tasks (legacy, being migrated)

## Error Handling

**Strategy:** Layered error handling with domain errors, error boundaries, and global handlers

**Backend Patterns:**
- Service layer throws domain errors (e.g., `new Error('Site not found')`)
- tRPC procedures catch errors and convert to tRPC errors with codes (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`)
- Fastify error handler plugin (`/backend/src/plugins/error-handler.plugin.ts`) catches all unhandled errors
- Error responses follow consistent shape: `{ error: string, code: string, details?: any }`
- Structured logging via Pino logger includes error context and stack traces

**Frontend Patterns:**
- React Query error handling in hooks: `onError` callbacks for user feedback
- tRPC mutations include error toasts via Sonner
- Error boundaries for component-level failures (planned)
- 404 page for invalid routes (`/src/pages/NotFound.tsx`)
- Auth guard redirects for unauthenticated access

**Validation:**
- Input validation via Zod schemas at API boundary
- Fastify type provider enforces schema validation before route handlers
- tRPC input validation in router definitions
- Frontend form validation with React Hook Form + Zod resolvers

## Cross-Cutting Concerns

**Logging:**
- Backend: Pino structured JSON logging with Fastify integration, log levels via environment
- Frontend: Debug context for development mode logging (`/src/contexts/DebugContext.tsx`)
- Workers: Console logging with job metadata, visible in Bull Board

**Validation:**
- Shared Zod schemas between frontend and backend where possible
- Backend: `/backend/src/schemas` for reusable validation schemas
- Frontend: Inline schemas in components or `/src/lib/validation` for shared validators

**Authentication:**
- Stack Auth provider for identity management (JWT tokens)
- Backend middleware: `requireAuth` verifies JWT and decorates request with user object
- Frontend: `useUser()` hook provides authenticated user context
- Socket.io: Auth middleware verifies JWT before allowing connection

**Authorization:**
- Role-based access control (RBAC) via `requireRole` middleware
- Roles: viewer, staff, manager, admin, owner (hierarchical)
- Organization context middleware: `requireOrgContext` ensures user belongs to org in URL
- Multi-tenancy: All queries scoped by `organizationId` with RLS-style filtering

**Real-time Updates:**
- Socket.io rooms for organization-scoped broadcasts
- Event types: `sensor:reading`, `alert:new`, `unit:state-change`
- Frontend hooks subscribe to events and invalidate React Query cache
- Connection state managed by `RealtimeProvider` context

**Multi-tenancy:**
- Every entity has `organizationId` foreign key
- Middleware enforces organization context on all routes
- Database queries always include organization filter
- Socket.io rooms scoped by org: `org:${orgId}`

**Monitoring:**
- Bull Board dashboard for queue monitoring (`/api/admin/queues`)
- Health check endpoints: `/health`, `/health/db`, `/health/redis`
- Widget health metrics tracking render performance
- Structured logs for error tracking (Sentry integration pending)

---

*Architecture analysis: 2026-01-29*
