# Phase 07: Legacy Supabase Functions Removal & Codebase Cleanup

After Phases 01-06, the Fastify backend fully replaces all Supabase edge functions. The `supabase/functions/` directory (39 Deno edge functions) and `supabase/migrations/` directory (100+ SQL migrations) are now dead code — all functionality lives in the Fastify backend with Drizzle ORM. This phase removes the legacy code, cleans up stale configuration files, removes unused dependencies, and ensures the repository contains only the active self-hosted stack. A smaller, cleaner codebase is easier to maintain, faster to onboard, and eliminates confusion about which code is authoritative.

## Tasks

- [ ] Remove the entire `supabase/functions/` directory:
  - Verify the edge function deprecation inventory from Phase 03 shows all functions as REPLACED or REDUNDANT
  - If any functions are still marked ACTIVE, do NOT remove them — document the blocker and skip those
  - Delete `supabase/functions/` and all its contents
  - Delete `supabase/config.toml` if it exists (Supabase CLI configuration)
  - Delete any Supabase-specific configuration files (supabase/.gitignore, etc.)
  - Keep `supabase/migrations/` for now as historical reference (addressed in next task)

- [ ] Archive the Supabase migrations directory:
  - The `supabase/migrations/` directory contains 100+ SQL migrations — historical records of the database evolution
  - Move `supabase/migrations/` to `archive/supabase-migrations/` to preserve history without cluttering the active codebase
  - Create `archive/README.md` explaining this is archived Supabase migration history from before the Fastify migration
  - After moving, if the `supabase/` directory is now empty, remove it entirely
  - Verify no code references `supabase/migrations/` paths

- [ ] Remove unused dependencies from both package.json files:
  - In the root `package.json` (frontend):
    - Search for any Supabase-related packages and remove them if still present
    - Run `npx depcheck` (or manually audit) to find unused dependencies
    - Remove packages that are no longer imported anywhere in `src/`
    - Be cautious: some packages may be used indirectly (Vite plugins, Tailwind plugins)
  - In `backend/package.json`:
    - Search for any Supabase-related packages
    - Run audit for unused packages
    - Remove dead dependencies
  - After removal, run `npm install` in both directories to update lockfiles
  - Run `npm run build` in both to verify nothing breaks

- [ ] Clean up stale environment variables and configuration:
  - Read `.env.example` — remove any Supabase-related environment variables:
    - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
  - Read `backend/.env.example` — remove Supabase variables
  - Update `docs/ENVIRONMENT_VARIABLES.md` to reflect only the current stack's variables
  - Search for any `.env` templates or documentation referencing Supabase credentials and update them
  - Ensure all environment variable documentation mentions only: Stack Auth, PostgreSQL, Redis, MinIO, Stripe, Telnyx, TTN

- [ ] Remove stale documentation references to Supabase:
  - Search all files in `docs/` for references to "Supabase", "edge function", "Deno"
  - Update or remove outdated documentation that describes the Supabase architecture
  - In `docs/architecture/ARCHITECTURE.md` — update to describe only the Fastify stack
  - In `README.md` — remove any "Note: Legacy Supabase variables" disclaimers
  - In `docs/MIGRATION_BACKLOG.md` — add a header note: "Migration complete as of [date]"
  - Do NOT remove documentation that discusses the migration itself (it's useful history)
  - Update `docs/INDEX.md` to reflect current documentation structure

- [ ] Verify the cleaned codebase builds and all tests pass:
  - Run `npm install` in root and `backend/`
  - Run `npm run build` in root (frontend) — must succeed
  - Run `npm run build` in `backend/` — must succeed
  - Run `npm test` in `backend/` — all tests must pass
  - Run `npm run lint` in root — zero errors
  - Verify Docker Compose still starts all services correctly
  - Verify the health endpoint still responds after cleanup
  - Document the final repository size reduction (before vs after, if measurable)
