---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - docs/architecture/ARCHITECTURE.md
autonomous: true
must_haves:
  truths:
    - 'README accurately reflects current tech stack (Stack Auth, Fastify backend)'
    - 'Quick Start instructions reference correct environment variables'
    - 'Environment Variables table shows current required vars'
  artifacts:
    - path: 'README.md'
      provides: 'Accurate project documentation'
      contains: 'Stack Auth'
    - path: 'docs/architecture/ARCHITECTURE.md'
      provides: 'Architecture documentation with migration note'
      contains: 'migration in progress'
  key_links: []
---

<objective>
Update README.md and ARCHITECTURE.md to accurately reflect current tech stack

Purpose: The project has migrated from Supabase Auth to Stack Auth and from Supabase Edge Functions to a self-hosted Fastify backend. The README and architecture docs still present Supabase as the primary backend infrastructure, which is misleading for anyone reading the docs.

Output: Updated documentation that reflects the current state while acknowledging the ongoing migration.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@docs/architecture/ARCHITECTURE.md
@.env.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update README.md tech stack and quick start</name>
  <files>README.md</files>
  <action>
Update the README.md to reflect the current architecture:

1. **Tech Stack table** - Change from:

   ```
   | Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
   ```

   To:

   ```
   | Backend | Fastify 5, PostgreSQL, Drizzle ORM |
   | Auth | Stack Auth |
   | Database | PostgreSQL (self-hosted or Supabase) |
   ```

2. **Quick Start section** - Update the comment from:

   ```
   # Edit .env with your Supabase credentials
   ```

   To:

   ```
   # Edit .env with your Stack Auth and API configuration
   ```

3. **Environment Variables table** - Replace the Supabase-only table with current vars:

   ```
   | Variable | Description |
   |----------|-------------|
   | `VITE_API_URL` | Backend API URL (default: http://localhost:3000) |
   | `VITE_STACK_AUTH_PROJECT_ID` | Stack Auth project ID |
   | `VITE_STACK_AUTH_PUBLISHABLE_CLIENT_KEY` | Stack Auth client key |
   ```

4. Add a note below the table:
   ```
   > **Note:** Legacy Supabase variables are documented in `.env.example` for the ongoing database migration.
   ```

Keep all other content unchanged (features, project structure, scripts, etc.).
</action>
<verify>Read the updated README.md and confirm:

- Tech Stack table shows Fastify, Stack Auth, PostgreSQL
- Quick Start mentions Stack Auth, not Supabase credentials
- Environment Variables table shows VITE_API_URL and Stack Auth vars
- No mention of "Supabase credentials" in Quick Start</verify>
  <done>README.md accurately represents current tech stack with Stack Auth and Fastify backend</done>
  </task>

<task type="auto">
  <name>Task 2: Add migration notice to ARCHITECTURE.md</name>
  <files>docs/architecture/ARCHITECTURE.md</files>
  <action>
Add a prominent migration notice at the top of ARCHITECTURE.md (after the title and before Table of Contents):

```markdown
> **Architecture Migration in Progress**
>
> This documentation describes the original Supabase-based architecture. The project is migrating to:
>
> - **Authentication**: Stack Auth (replacing Supabase Auth)
> - **Backend API**: Fastify 5 with Drizzle ORM (replacing Edge Functions)
> - **Database**: PostgreSQL (Supabase or self-hosted)
>
> See `.planning/STATE.md` for current migration status. The frontend codebase still uses `@supabase/supabase-js` for database queries during migration.
```

Do NOT rewrite the entire architecture document - that would be a larger effort. The notice clearly communicates the current state while preserving the valuable reference documentation.
</action>
<verify>Read the first 30 lines of docs/architecture/ARCHITECTURE.md and confirm the migration notice is present after the title</verify>
<done>ARCHITECTURE.md has prominent migration notice alerting readers to the ongoing transition</done>
</task>

</tasks>

<verification>
- [ ] README.md tech stack table shows Fastify, Stack Auth, PostgreSQL (not Supabase as backend)
- [ ] README.md quick start references Stack Auth configuration
- [ ] README.md environment variables table shows current required vars
- [ ] docs/architecture/ARCHITECTURE.md has migration notice at top
- [ ] Changes are documentation-only, no code changes
</verification>

<success_criteria>
A new developer reading README.md understands that:

1. Auth is via Stack Auth, not Supabase Auth
2. Backend is Fastify-based, not Supabase Edge Functions
3. Some Supabase integration remains during migration
   </success_criteria>

<output>
After completion, create `.planning/quick/001-remove-supabase-references-from-readme-a/001-SUMMARY.md`
</output>
