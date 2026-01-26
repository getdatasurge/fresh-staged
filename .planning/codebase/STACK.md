# Technology Stack

**Analysis Date:** 2026-01-26

## Languages

**Primary:**
- TypeScript 5.x - Frontend and backend application code in `src` and `backend/src`

**Secondary:**
- JavaScript - Tooling/scripts in `scripts`
- SQL - Database migrations in `supabase/migrations` and `backend/drizzle`
- Shell - Ops scripts in `scripts`
- YAML - Infrastructure config in `docker-compose.yml` and `docker/compose.prod.yaml`

## Runtime

**Environment:**
- Node.js 20+ (inferred from package engines in `backend/pnpm-lock.yaml` and toolchain usage in `package.json`)
- Deno (Supabase Edge Functions) in `supabase/functions`

**Package Manager:**
- pnpm - Lockfile: `pnpm-lock.yaml` present
- npm - Lockfile: `package-lock.json` present
- bun - Lockfile: `bun.lockb` present

## Frameworks

**Core:**
- React 18.x - Frontend UI in `src`
- Vite 5.x - Frontend build/dev server in `vite.config.ts`
- Fastify 5.x - Backend HTTP server in `backend/src`
- tRPC 11.x - API layer for frontend/backend in `src/lib/trpc.ts` and `backend/src`

**Testing:**
- Vitest 2.x/4.x - Frontend and backend tests via `vitest.config.ts` and `backend/vitest.config.ts`
- Testing Library - React component tests (from `package.json`)

**Build/Dev:**
- TypeScript 5.x - Compilation and type checking via `tsconfig.json` and `backend/tsconfig.json`
- Tailwind CSS 3.x - Styling in `tailwind.config.ts`
- PostCSS - Styling pipeline in `postcss.config.js`

## Key Dependencies

**Critical:**
- @stackframe/react 2.x - Stack Auth frontend SDK in `src/App.tsx`
- drizzle-orm 0.38 - Database access layer in `backend/src`
- zod 3.x/4.x - Runtime schema validation across `src/lib` and `backend/src`
- socket.io 4.x - Realtime updates between client/server in `src/lib/socket.ts` and `backend/src`
- stripe 20.x - Payments integration in `backend/src`

**Infrastructure:**
- pg 8.x - PostgreSQL client in `backend/src`
- ioredis 5.x / redis 5.x - Redis connectivity in `backend/src`
- bullmq 5.x - Job queueing for background work in `backend/src`
- @aws-sdk/client-s3 3.x - S3/MinIO object storage in `backend/src`

## Configuration

**Environment:**
- Environment variables documented in `docs/ENVIRONMENT_VARIABLES.md`
- Secrets stored via files in `secrets/` for self-hosted deployments

**Build:**
- `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- `tailwind.config.ts`, `postcss.config.js`, `eslint.config.js`
- Docker Compose configs in `docker-compose.yml` and `docker/compose.prod.yaml`

## Platform Requirements

**Development:**
- Any OS with Node.js 20+ and Docker (local services) as described in `docs/LOCAL_DEV_ENV.md`
- Supabase CLI only if working on Edge Functions in `supabase/functions`

**Production:**
- Docker-based deployment on Linux hosts (Ubuntu/Debian) per `docs/operations/DEPLOYMENT.md`
- Supabase Edge Functions runtime (Deno) for functions in `supabase/functions`

---

*Stack analysis: 2026-01-26*
*Update after major dependency changes*
