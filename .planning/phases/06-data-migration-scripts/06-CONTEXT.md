# Phase 6: Data Migration Scripts - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Scripts to export all data from Supabase and import it into the new self-hosted PostgreSQL database. Handles user ID mapping between Supabase auth and Stack Auth. Includes verification to confirm data integrity after migration.

</domain>

<decisions>
## Implementation Decisions

### Migration strategy

- Freeze+Backfill approach (not dual-write) — existing decision from roadmap
- Overnight maintenance window (8+ hours) — no need for parallel/streaming optimization
- Migrate all tables as-is — full data fidelity including audit trails
- No filtering of old data — complete historical preservation

### Export format & tooling

- JSON files per table — human-readable, easy to inspect and transform
- One JSON file per table in export directory

### User ID mapping

- Mapping retained for 90 days post-migration — useful for customer support referencing old Supabase IDs, then can be removed

### Verification & safety

- Fail fast on import errors — halt immediately, fix issue, restart from scratch
- Progress output to both console and log file — watch live + persistent record
- No dry-run mode — overnight window provides sufficient time to address issues

### Claude's Discretion

- **Rollback strategy** — Determine appropriate rollback approach (likely: keep Supabase untouched until new system verified)
- **Idempotency** — Choose one-shot vs idempotent based on complexity tradeoffs
- **Export connection method** — Direct Postgres connection vs Supabase SDK based on reliability
- **Compression** — Gzip or not based on expected data size
- **User migration approach** — Investigate Stack Auth capabilities for bulk user import vs re-registration
- **ID mapping storage** — JSON file vs database table based on what works best
- **Verification depth** — Row counts vs sample data vs full comparison based on data volume

</decisions>

<specifics>
## Specific Ideas

- Migration should be reliable over fast — we have an 8+ hour window
- Keep mapping file for 90 days for customer support scenarios ("user says their old dashboard showed X...")
- Console + log file for progress — want to watch it run and have a record

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 06-data-migration-scripts_
_Context gathered: 2026-01-23_
