---
phase: 27
plan: research
---

# RESEARCH: TTN SDK Integration

## Goal
Determine the best way to integrate The Things Network (TTN) stack into the Fastify/Node.js backend to replace Supabase Edge Functions.

## Findings

1. **Current Implementation**:
   - Uses direct HTTP `fetch` calls to TTN v3 API.
   - Strictly enforces `NAM1` cluster.
   - Contains significant logic for rights validation and robust error handling in `_shared/ttnConfig.ts`.

2. **SDK Selection**:
   - **Recommendation**: Do NOT use `@ttn-lw/grpc-web-api-client`. It is designed for browser-to-gRPC usage.
   - **Decision**: Port the existing robust HTTP `fetch` logic to Node.js services. Native `fetch` (Node 18+) is sufficient and minimizes dependencies.

3. **Architecture**:
   - **Services**: Create `backend/src/services/ttn/`
     - `TtnClient.ts`: Base HTTP client with auth and error handling.
     - `TtnPermissionService.ts`: Rights validation.
     - `TtnProvisioningService.ts`: Bootstrap and Org/App creation.
     - `TtnWebhookService.ts`: Webhook management.
   - **Router**: `backend/src/routers/ttnSettings.ts` exposing these capabilities to the frontend.

## Migration Strategy
We will "lift and shift" the TypeScript logic from `supabase/functions/_shared` and `supabase/functions/ttn-*` into the backend, adapting it for:
- Node.js `fetch` (native).
- Drizzle ORM (replacing Supabase client).
- Fastify/tRPC context (replacing `Deno.serve`).

## Plan structure
- 27-01: Foundation (Client & Base Logic)
- 27-02: Bootstrap Service (Provisioning)
- 27-03: Settings Service (CRUD & Test)
- 27-04: Webhook Service (Updates)
- 27-05: tRPC Router Implementation
- 27-06: Frontend Hook Migration
