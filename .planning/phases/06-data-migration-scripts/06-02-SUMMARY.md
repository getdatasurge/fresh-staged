---
phase: 06-data-migration-scripts
plan: 02
subsystem: database
tags: [postgresql, pg-query-stream, json, streaming, export, migration]

# Dependency graph
requires:
  - phase: 06-01
    provides: Migration infrastructure (supabase-client, table-metadata, logger)
provides:
  - Export script CLI for Supabase data extraction
  - Streaming helpers for memory-efficient large table export
  - JSON export format with preserved data types
  - auth.users export for user ID mapping
affects:
  - 06-03 import scripts (consumes exported JSON files)
  - 06-04 user mapping scripts (uses auth_users.json)
  - 06-05 verification scripts (validates export integrity)

# Tech tracking
tech-stack:
  added: []
  patterns: [pg-query-stream for large tables, JSON streaming writes, ora progress spinners]

key-files:
  created:
    - scripts/migration/lib/stream-helpers.ts
  modified:
    - scripts/migration/src/export.ts

key-decisions:
  - "STREAMING_THRESHOLD = 10000 rows: tables above this use streaming"
  - "LARGE_TABLES always stream: sensor_readings, event_logs, alerts"
  - "Timestamps converted to ISO 8601 UTC at export time"
  - "Numeric types preserved as strings for lossless precision"
  - "auth.users exported separately with selected columns for user mapping"

patterns-established:
  - "Export method decision: rowCount > threshold OR in LARGE_TABLES array"
  - "JSON streaming: Transform stream writes JSON array incrementally"
  - "Progress logging: every 1000 rows during streaming export"

# Metrics
duration: 4min
completed: 2026-01-23
---

# Phase 6 Plan 02: Export Scripts Summary

**Stream helpers for large table export and CLI for extracting all Supabase data to JSON files with preserved data types**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-23T22:21:17Z
- **Completed:** 2026-01-23T22:24:59Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 1

## Accomplishments

- Created stream-helpers.ts with memory-efficient export utilities
- streamTableToJson uses pg-query-stream for tables > 10,000 rows
- exportSmallTable loads all rows for smaller configuration tables
- exportAuthUsers extracts Supabase auth.users for user ID mapping
- CLI with --output-dir, --table, --skip-large, --skip-auth, --dry-run options
- Dry-run mode lists all 23 tables in dependency order with row counts
- Progress spinner (ora) shows export status for each table
- metadata.json created with export timestamp and per-table statistics

## Task Commits

Each task was committed atomically:

1. **Task 1: Create streaming helpers** - `e9c1984` (feat)
2. **Task 2: Create main export CLI** - `453fcb3` (feat)

## Files Created/Modified

- `scripts/migration/lib/stream-helpers.ts` - Streaming and small-table export utilities
- `scripts/migration/src/export.ts` - Main export CLI script (previously placeholder)

## Key Functions

### stream-helpers.ts

| Function | Purpose |
|----------|---------|
| `streamTableToJson(pool, table, path)` | Memory-efficient streaming for large tables |
| `exportSmallTable(pool, table, path)` | Simple export for tables < 10,000 rows |
| `exportAuthUsers(pool, path)` | Extract auth.users for user mapping |
| `getTableRowCount(pool, table)` | Count rows for export method decision |
| `shouldUseStreaming(table, count)` | Determine export method |

### export.ts CLI Options

| Option | Description |
|--------|-------------|
| `--output-dir <path>` | Output directory (default: ./migration-data) |
| `--table <name>` | Export single table only |
| `--skip-large` | Skip sensor_readings, event_logs, alerts |
| `--skip-auth` | Skip auth.users export |
| `--dry-run` | List tables without exporting |

## Decisions Made

1. **Streaming threshold at 10,000 rows** - Balance between memory efficiency and simplicity; below this threshold, loading all rows is safe and faster
2. **Always stream large tables** - sensor_readings, event_logs, alerts use streaming regardless of current row count (they will grow)
3. **ISO 8601 timestamps** - All timestamps converted to UTC ISO strings for portability and human readability
4. **Numeric as strings** - PostgreSQL numeric types exported as strings to preserve precision (avoids JavaScript float issues)
5. **auth.users separate** - Exported to auth_users.json with only columns needed for user mapping (id, email, metadata)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `pnpm exec tsx src/export.ts --help` - Shows all CLI options correctly
2. `pnpm exec tsx src/export.ts --dry-run` - Lists all 23 tables in dependency order
3. `pnpm exec tsx src/export.ts --dry-run --skip-large` - Shows 20 tables (3 large filtered out)
4. TypeScript compiles without errors
5. Stream helpers properly exported from module

## Next Phase Readiness

- Export script ready for production use with valid SUPABASE_DB_URL
- JSON output format compatible with 06-03 import scripts
- auth_users.json will feed 06-04 user mapping scripts
- metadata.json enables 06-05 verification of export completeness

---
*Phase: 06-data-migration-scripts*
*Completed: 2026-01-23*
