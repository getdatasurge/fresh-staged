---
phase: 06-data-migration-scripts
plan: 01
subsystem: database
tags: [postgresql, pg, pino, migration, typescript, esm]

# Dependency graph
requires:
  - phase: 05-frontend-migration
    provides: Stack Auth integration, API client foundation
provides:
  - Migration script TypeScript project infrastructure
  - Dual database connection clients (Supabase + new PostgreSQL)
  - Pino logger with console + file output
  - Table metadata with FK-safe import order
  - User ID column mapping definitions
affects:
  - 06-02 export scripts
  - 06-03 import scripts
  - 06-04 user mapping scripts
  - 06-05 verification scripts

# Tech tracking
tech-stack:
  added: [pg, pg-query-stream, pino, pino-pretty, dotenv, commander, ora, tsx]
  patterns: [ESM modules, connection pooling, dual transport logging]

key-files:
  created:
    - scripts/migration/package.json
    - scripts/migration/tsconfig.json
    - scripts/migration/lib/logger.ts
    - scripts/migration/lib/supabase-client.ts
    - scripts/migration/lib/new-db-client.ts
    - scripts/migration/lib/table-metadata.ts
    - scripts/migration/test-connections.ts
  modified: []

key-decisions:
  - "Dual logger using Proxy pattern for console pretty + file JSON output"
  - "SSL auto-detect for new DB client (enabled for remote, disabled for localhost)"
  - "23 tables in import order across 8 dependency levels"
  - "7 tables identified with user ID columns requiring mapping"

patterns-established:
  - "Database client pattern: Pool with connection test function and graceful shutdown"
  - "Logger pattern: Proxy-based dual transport for console/file output"
  - "Migration helper functions: logMigrationStart/Progress/Complete/Error"

# Metrics
duration: 5min
completed: 2026-01-23
---

# Phase 6 Plan 01: Migration Infrastructure Summary

**PostgreSQL connection pools for Supabase and new DB, Pino dual-output logger, and 23-table import order with user ID mapping**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-23T22:13:27Z
- **Completed:** 2026-01-23T22:18:14Z
- **Tasks:** 3
- **Files created:** 12

## Accomplishments

- TypeScript ESM project with pg, pino, commander, ora dependencies
- Supabase PostgreSQL client with SSL for hosted certificates
- New PostgreSQL client with auto-detect SSL (localhost vs remote)
- Pino logger writing to both console (pretty) and file (JSON)
- Table import order respecting all foreign key constraints
- User ID column identification for post-migration mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration script TypeScript project** - `b3366d9` (feat)
2. **Task 2: Create logger and database clients** - `39456c0` (feat)
3. **Task 3: Create table metadata with dependency order** - `a13c314` (feat)

## Files Created

- `scripts/migration/package.json` - ESM TypeScript project with migration dependencies
- `scripts/migration/tsconfig.json` - ES2022/NodeNext compiler configuration
- `scripts/migration/.env.example` - Required environment variables documentation
- `scripts/migration/.gitignore` - Excludes secrets, logs, and data exports
- `scripts/migration/lib/logger.ts` - Pino logger with dual console/file output
- `scripts/migration/lib/supabase-client.ts` - PostgreSQL pool for Supabase connection
- `scripts/migration/lib/new-db-client.ts` - PostgreSQL pool for new self-hosted DB
- `scripts/migration/lib/table-metadata.ts` - Import order and user ID column mappings
- `scripts/migration/test-connections.ts` - Connection verification script
- `scripts/migration/src/export.ts` - Placeholder for export script
- `scripts/migration/src/import.ts` - Placeholder for import script
- `scripts/migration/src/verify.ts` - Placeholder for verification script
- `scripts/migration/src/map-users.ts` - Placeholder for user mapping script

## Decisions Made

1. **Dual logger via Proxy pattern** - Pino doesn't support multistream cleanly in ESM, so used Proxy to intercept log calls and write to both console (pino-pretty) and file (JSON) transports
2. **SSL auto-detection for new DB** - Local development typically doesn't need SSL, so client auto-detects localhost/127.0.0.1 and disables SSL for local connections
3. **23 tables across 8 dependency levels** - Based on SUPABASE_SCHEMA_INVENTORY.md, organized tables from organizations (level 0) through event_logs (level 7)
4. **7 tables with user ID mapping** - profiles, user_roles, escalation_contacts, manual_temperature_logs, corrective_actions, notification_deliveries, event_logs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **Pino ESM import** - Initial attempt to use `pino.multistream()` failed due to TypeScript/ESM module resolution. Resolved by using separate logger instances with Proxy pattern for dual output.

## User Setup Required

None - no external service configuration required. Users will need to create `.env` from `.env.example` with actual database credentials before running migration scripts.

## Next Phase Readiness

- Infrastructure complete for subsequent migration scripts
- Database clients ready for export/import operations
- Logger available for all migration scripts
- Table metadata defines import order and user mapping requirements
- Ready for 06-02: Export Scripts implementation

---
*Phase: 06-data-migration-scripts*
*Completed: 2026-01-23*
