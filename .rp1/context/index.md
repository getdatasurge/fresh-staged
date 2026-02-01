# FreshStaged - Knowledge Base

**Type**: Single Project
**Languages**: TypeScript, SQL, Markdown
**Version**: 2.9.0
**Updated**: 2026-02-01

## Project Summary

FreshStaged is a multi-tenant IoT temperature monitoring SaaS platform for cold chain compliance. It ingests real-time temperature data from LoRa sensors via The Things Network, enforces threshold-based alerting with SMS/Email escalation, and provides real-time dashboard updates via WebSocket. Built with Fastify (backend), React (frontend), Drizzle ORM (PostgreSQL), and BullMQ (background jobs), the system uses event-driven architecture for asynchronous alert processing and maintains strict tenant isolation for multi-organization deployments.

## Quick Reference

| Aspect | Value |
|--------|-------|
| Entry Point | `backend/src/index.ts` (Fastify server), `src/main.tsx` (React SPA) |
| Key Pattern | Monolithic Layered Architecture with Event-Driven Processing |
| Tech Stack | Fastify, tRPC, React, Vite, Drizzle ORM, PostgreSQL, Redis, BullMQ, Socket.io |

## KB File Manifest

**Progressive Loading**: Load files on-demand based on your task.

| File | Lines | Load For |
|------|-------|----------|
| architecture.md | ~283 | System design, component relationships, data flows |
| modules.md | ~324 | Component breakdown, module responsibilities |
| patterns.md | ~82 | Code conventions, implementation patterns |
| concept_map.md | ~236 | Domain terminology, business concepts |

## Task-Based Loading

| Task | Files to Load |
|------|---------------|
| Code review | `patterns.md` |
| Bug investigation | `architecture.md`, `modules.md` |
| Feature implementation | `modules.md`, `patterns.md` |
| Strategic analysis | ALL files |

## How to Load

```
Read: .rp1/context/{filename}
```

## Project Structure

```
fresh-staged/
├── backend/               # Fastify API server
│   ├── src/
│   │   ├── app.ts        # Fastify app configuration
│   │   ├── index.ts      # Server entry point
│   │   ├── trpc/         # tRPC routers and context
│   │   ├── routers/      # Domain-specific tRPC procedures (28 routers)
│   │   ├── services/     # Business logic layer (15 services)
│   │   ├── db/schema/    # Drizzle ORM schemas (14 schemas)
│   │   ├── middleware/   # Auth, RBAC, org context
│   │   ├── plugins/      # Fastify plugins (auth, queue, socket)
│   │   ├── workers/      # BullMQ job processors
│   │   └── utils/        # Shared utilities
│   └── drizzle/          # Database migrations (116 migrations)
├── supabase/functions/   # Deno edge functions for webhooks
├── src/                  # React frontend (Vite)
│   ├── pages/           # React Router pages
│   ├── components/      # Reusable UI components (shadcn/ui)
│   ├── features/        # Feature-specific components
│   └── lib/             # tRPC client, Socket.io client
└── docs/                # Architecture decision records
```

## Navigation

- **[architecture.md](architecture.md)**: System design and diagrams - Event-driven layered architecture with tRPC API, BullMQ workers, and Socket.io real-time updates
- **[modules.md](modules.md)**: Component breakdown - 18 major modules including tRPC routers, services layer, database schema, workers, and Supabase edge functions
- **[patterns.md](patterns.md)**: Code conventions - TypeScript strict mode, Drizzle ORM schema-first, Zod validation, Fastify plugin architecture
- **[concept_map.md](concept_map.md)**: Domain terminology - Multi-tenant organization model, IoT device management, temperature event processing, alert escalation
