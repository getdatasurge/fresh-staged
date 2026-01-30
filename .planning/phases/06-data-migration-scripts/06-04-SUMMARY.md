---
phase: 06-data-migration-scripts
plan: 04
subsystem: database
tags: [postgresql, import, migration, user-mapping, typescript, esm]

# Dependency graph
requires:
  - phase: 06-data-migration-scripts
    plan: 01
    provides: Migration script infrastructure (logger, pg clients, table metadata)
  - phase: 06-data-migration-scripts
    plan: 02
    provides: Export script and JSON file format
  - phase: 06-data-migration-scripts
    plan: 03
    provides: User ID mapping utilities (loadMapping, mapUserId)
provides:
  - Import script CLI for loading JSON into new PostgreSQL
  - Import helpers with batch inserts and user ID transformation
  - Truncate utilities for restart-from-scratch strategy
  - FK check disable/enable for bulk import performance
affects:
  - 06-05 verification scripts (will validate import integrity)

# Tech tracking
tech-stack:
  added: []
  patterns: [batch inserts, parameterized queries, fail-fast error handling]

key-files:
  created:
    - scripts/migration/lib/import-helpers.ts
  modified:
    - scripts/migration/src/import.ts

key-decisions:
  - 'BATCH_SIZE = 500 rows per transaction for memory/performance balance'
  - 'Fail-fast on any error - with 8+ hour window, restart from scratch is acceptable'
  - "session_replication_role = 'replica' to disable FK checks during bulk import"
  - 'User ID columns keep original value if mapping not found (logged as warning)'

patterns-established:
  - 'Import pattern: load JSON, batch insert with parameterized queries'
  - 'User ID transformation: mapUserId lookup during row processing'
  - 'Truncate in REVERSE dependency order with CASCADE'

# Metrics
duration: 5min
completed: 2026-01-23
---

# Phase 6 Plan 04: Import Scripts Summary

**Batch import from JSON to PostgreSQL with user ID mapping and FK-safe dependency ordering**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-23T22:28:53Z
- **Completed:** 2026-01-23T22:33:47Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 1

## Accomplishments

- Import helpers with batch inserts (500 rows per transaction)
- importTable for tables without user references
- importTableWithMapping transforms user ID columns using mapUserId
- truncateAllTables with CASCADE for restart-from-scratch
- disableForeignKeys/enableForeignKeys via session_replication_role
- CLI with --input-dir, --mapping, --table, --truncate-first, --disable-fk, --yes, --dry-run
- Dry-run validates export files exist and shows row counts
- Fail-fast error handling with table name and row context

## Task Commits

Each task was committed atomically:

1. **Task 1: Create import helpers with user ID mapping** - `8780b78` (feat)
2. **Task 2: Create main import script with CLI** - `8222880` (feat)

## Files Created/Modified

- `scripts/migration/lib/import-helpers.ts` - Import utilities (importTable, importTableWithMapping, truncateAllTables, disableForeignKeys, enableForeignKeys)
- `scripts/migration/src/import.ts` - Main import CLI (previously placeholder)

## Key Functions

### import-helpers.ts

| Function                                                          | Purpose                                      |
| ----------------------------------------------------------------- | -------------------------------------------- |
| `importTable(pool, table, jsonPath)`                              | Batch import without user ID transformation  |
| `importTableWithMapping(pool, table, jsonPath, mapping, columns)` | Import with user ID column transformation    |
| `truncateAllTables(pool, tables)`                                 | CASCADE truncate in reverse dependency order |
| `disableForeignKeys(pool)`                                        | Set session_replication_role = 'replica'     |
| `enableForeignKeys(pool)`                                         | Set session_replication_role = 'origin'      |
| `jsonFileExists(path)`                                            | Check if export file exists                  |
| `getJsonRowCount(path)`                                           | Count rows in JSON export file               |

### import.ts CLI Options

| Option                   | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `-i, --input-dir <path>` | Input directory (default: ./migration-data)                     |
| `-m, --mapping <path>`   | User mapping file (default: ./migration-data/user-mapping.json) |
| `-t, --table <name>`     | Import single table only                                        |
| `--truncate-first`       | Truncate before import (requires --yes)                         |
| `--disable-fk`           | Disable FK checks during import                                 |
| `--yes`                  | Skip confirmation prompts                                       |
| `--dry-run`              | Validate files without importing                                |

## Decisions Made

1. **Batch size of 500 rows** - Good balance between memory usage and transaction overhead. Large enough for performance, small enough to avoid memory issues.

2. **Fail-fast on errors** - With 8+ hour maintenance window, it's acceptable to fix issues and restart from scratch. Provides clear error context (table name, row index, row data).

3. **Keep original ID if mapping not found** - When user ID mapping is missing, log warning but continue import with original Supabase ID. Allows partial imports when not all users were migrated.

4. **session_replication_role for FK disable** - Standard PostgreSQL pattern for bulk imports. Faster than importing in strict dependency order and allows parallel table imports.

5. **Truncate requires --yes flag** - Dangerous operation that deletes all data. Requires explicit confirmation to prevent accidents.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. **CLI help shows all options** - `pnpm import --help` displays all documented options
2. **Dry-run validates export files** - Lists all 23 tables with MISSING/OK status and row counts
3. **User ID columns correctly configured** - 7 tables with user ID mapping (profiles, user_roles, escalation_contacts, manual_temperature_logs, corrective_actions, notification_deliveries, event_logs)
4. **Tables in dependency order** - 23 tables across 8 levels (0-7), ensures no FK violations
5. **Truncate-first requires --yes** - Error message with safety warning when --yes not provided
6. **Fail-fast behavior** - On error, throws exception that stops import loop

## Key Links Verified

| From              | To               | Via         | Pattern                 |
| ----------------- | ---------------- | ----------- | ----------------------- |
| import.ts         | new-db-client.ts | newDbPool   | `import.*new-db-client` |
| import.ts         | user-mapping.ts  | loadMapping | `loadMapping`           |
| import-helpers.ts | user-mapping.ts  | mapUserId   | `mapUserId`             |

## Next Phase Readiness

- Import script ready for production use with valid DATABASE_URL
- Consumes JSON files from 06-02 export script
- Uses user mapping from 06-03 migrate-users script
- Ready for 06-05: Verification Scripts implementation

---

_Phase: 06-data-migration-scripts_
_Completed: 2026-01-23_
