---
phase: 4
plan: fix-deletedAt-org
wave: 1
---

# Plan 4-fix-deletedAt-org: Add soft‑delete column to `organizations`

## Objective
Add a `deleted_at` timestamp column to the `organizations` table and ensure the backend schema uses it.

## Steps
1. **Create migration** – Add a new SQL migration file `backend/drizzle/0005_add_deleted_at_to_organizations.sql` with an `ALTER TABLE` statement.
2. **Run migration** – Execute the migration using the project's migration tool (e.g., `npm run migrate` or `npx drizzle-kit push`).
3. **Verify** – Run the dev server and confirm that `adminRouter.listOrganizations` and `adminRouter.getOrganization` no longer error.
4. **Commit** – Add the new migration file to git.

## Verification
- `npm run dev` starts without DB errors.
- API calls to `/admin.listOrganizations` and `/admin.getOrganization` succeed.

## Done
- Migration file added and applied.
- Phase 4 passes verification.
