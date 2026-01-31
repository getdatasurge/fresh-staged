---
phase: 06-data-migration-scripts
plan: 05
subsystem: database
tags: [postgresql, migration, verification, checksum, md5, cli]

# Dependency graph
requires:
  - phase: 06-02
    provides: Supabase and new DB client pools
  - phase: 06-04
    provides: Import script and table metadata utilities
provides:
  - Checksum computation utilities for data integrity verification
  - Verification CLI comparing source and target databases
  - Row count and checksum comparison per table
  - JSON verification report generation
affects: [07-cutover, migration-runbook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - MD5 checksum aggregation over sorted row hashes
    - Column exclusion for user ID mappings in checksums
    - Color-coded CLI output with progress spinners

key-files:
  created:
    - scripts/migration/lib/checksum.ts
  modified:
    - scripts/migration/src/verify.ts

key-decisions:
  - 'Used MD5 aggregation for deterministic table checksums'
  - 'Exclude user ID columns from checksum (IDs differ after mapping)'
  - 'Pass/Fail/Warn status: Pass=match, Fail=mismatch, Warn=checksum not computed'

patterns-established:
  - 'Checksum exclusion: Tables with user ID columns use computeChecksumExcludingColumns'
  - 'Verification report: JSON with per-table results and summary counts'

# Metrics
duration: 2min
completed: 2026-01-23
---

# Phase 6 Plan 5: Verification Script Summary

**Migration verification script with row count comparison, MD5 checksums, and JSON report generation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-23T22:37:20Z
- **Completed:** 2026-01-23T22:39:39Z
- **Tasks:** 2
- **Files created/modified:** 2

## Accomplishments

- Checksum utilities for deterministic data integrity verification
- CLI verification script with --output, --table, --skip-checksum, --fail-fast options
- Row count comparison for all 24 tables in import order
- MD5 checksum comparison (excluding user ID columns that differ after mapping)
- JSON verification report with pass/fail/warn status per table
- Color-coded console output with summary table

## Task Commits

Each task was committed atomically:

1. **Task 1: Create checksum computation utilities** - `3a42f05` (feat)
2. **Task 2: Create main verification script** - `6977090` (feat)

## Files Created/Modified

- `scripts/migration/lib/checksum.ts` - Checksum computation utilities (getTableRowCount, computeTableChecksum, computeChecksumExcludingColumns, compareTableStats)
- `scripts/migration/src/verify.ts` - Main verification CLI comparing source and target databases

## Decisions Made

- **MD5 aggregation for checksums:** Used `md5(string_agg(md5(row), '' ORDER BY md5(row)))` for deterministic table-level checksum
- **User ID exclusion:** Tables in TABLES_WITH_USER_IDS have those columns excluded from checksum since IDs differ after migration mapping
- **Three-state result:** Pass (match), Fail (mismatch), Warn (checksum couldn't be computed but row counts match)
- **Reused getTableRowCount from stream-helpers pattern:** Consistent with export script's row counting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The verification script uses the same environment variables as export/import scripts:

- `SUPABASE_DB_URL` - Source database connection string
- `DATABASE_URL` - Target database connection string

## Next Phase Readiness

- Complete migration toolchain: export, import, verify scripts
- Ready for Phase 6 completion and Phase 7 cutover planning
- Verification script is the final gate before production cutover

---

_Phase: 06-data-migration-scripts_
_Completed: 2026-01-23_
