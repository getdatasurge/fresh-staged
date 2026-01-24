# FreshTrack Pro Data Migration

Scripts to migrate data from Supabase to self-hosted PostgreSQL.

## Overview

| Property | Value |
|----------|-------|
| **Strategy** | Freeze+Backfill (8+ hour maintenance window) |
| **Data Volume** | <1GB total (estimated) |
| **User ID Mapping** | Retained 90 days for customer support |
| **Tables** | 23 tables across 8 dependency levels |

## Prerequisites

1. New PostgreSQL database running and accessible
2. All database tables created (Phase 1 complete)
3. Stack Auth project configured
4. Supabase direct PostgreSQL connection string
5. Sufficient disk space for JSON exports (~2GB recommended)

## Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
# Supabase (source)
SUPABASE_DB_URL=postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres

# New database (target)
DATABASE_URL=postgresql://postgres:[password]@localhost:5432/freshtrack

# Stack Auth
STACK_AUTH_PROJECT_ID=your-project-id
STACK_AUTH_SECRET_KEY=your-secret-key

# Logging
LOG_FILE_PATH=./migration.log
```

**Important:** Use port 5432 for Supabase direct connection, not port 6543 (which is the pooler).

## Migration Steps

### Step 1: Pre-Migration Checks

```bash
# Navigate to migration scripts
cd scripts/migration

# Install dependencies
pnpm install

# Test database connections
pnpm exec tsx test-connections.ts

# Preview tables to export (dry-run)
pnpm exec tsx src/export.ts --dry-run
```

Expected output: Both connections should show "OK" status.

### Step 2: Export Data from Supabase

```bash
# Full export (takes ~10-30 minutes depending on data volume)
pnpm exec tsx src/export.ts

# Or export with options:
pnpm exec tsx src/export.ts --output-dir ./migration-data    # Custom output directory
pnpm exec tsx src/export.ts --table sites                     # Export single table
pnpm exec tsx src/export.ts --skip-large                      # Skip large tables (sensor_readings, event_logs, alerts)
pnpm exec tsx src/export.ts --skip-auth                       # Skip auth.users export

# Verify export files
ls -la migration-data/
cat migration-data/metadata.json
```

**Output:** `migration-data/*.json` files + `metadata.json`

### Step 3: Migrate Users to Stack Auth

**IMPORTANT: Users will need to reset their passwords after migration.**

Supabase uses bcrypt password hashes that cannot be imported to Stack Auth. All users must reset their passwords using the "forgot password" flow after migration.

```bash
# Preview user migration (no API calls)
pnpm exec tsx migrate-users.ts --dry-run

# Create users in Stack Auth
pnpm exec tsx migrate-users.ts

# Or with custom options:
pnpm exec tsx migrate-users.ts --input ./migration-data/auth_users.json
pnpm exec tsx migrate-users.ts --output ./migration-data/user-mapping.json
pnpm exec tsx migrate-users.ts --rate-limit 100    # Milliseconds between API calls (default: 100)

# Verify mapping file created
cat migration-data/user-mapping.json | head -50
```

**Output:** `migration-data/user-mapping.json`

**If users already exist in Stack Auth**, use map-users.ts to generate the mapping:

```bash
# Generate mapping from existing users (matches by email)
pnpm exec tsx map-users.ts

# Or with options:
pnpm exec tsx map-users.ts --supabase-export ./migration-data/auth_users.json
pnpm exec tsx map-users.ts --output ./migration-data/user-mapping.json
```

### Step 4: Import Data to New Database

```bash
# Preview import (validates files exist)
pnpm exec tsx src/import.ts --dry-run

# Full import (takes ~10-30 minutes)
# Option A: Import with FK checks disabled (faster)
pnpm exec tsx src/import.ts --disable-fk

# Option B: Import with FK checks enabled (safer, respects dependency order)
pnpm exec tsx src/import.ts

# Import with custom options:
pnpm exec tsx src/import.ts --input-dir ./migration-data         # Custom input directory
pnpm exec tsx src/import.ts --mapping ./migration-data/user-mapping.json  # Custom mapping file
pnpm exec tsx src/import.ts --table sites                        # Import single table
```

**If import fails partway through:**

```bash
# Clear all data and restart (DANGER - deletes all data in target)
pnpm exec tsx src/import.ts --truncate-first --yes

# Then re-run import
pnpm exec tsx src/import.ts --disable-fk
```

### Step 5: Verify Migration

After import completes, verify data integrity:

```bash
# Quick verification: Compare row counts
# Connect to both databases and run:
# SELECT 'organizations' as table_name, count(*) FROM organizations UNION ALL
# SELECT 'profiles', count(*) FROM profiles UNION ALL
# ...

# Check import log for errors
cat migration.log | grep -i error

# Verify user mapping was applied
# Check profiles table has Stack Auth user IDs
```

**Note:** The verify.ts script is planned for a future update to automate verification with checksums.

### Step 6: Post-Migration Tasks

1. **Send password reset emails** to all users
   - Stack Auth does not import passwords from Supabase
   - Users must set new passwords via reset flow

2. **Update DNS/configuration** to point to new system

3. **Monitor for errors** in new system logs

4. **Keep Supabase running** for 24-48 hours as rollback option

## Rollback Procedure

If issues are discovered after migration:

1. **Do NOT delete Supabase data** - it remains untouched during export
2. Revert DNS/configuration to point back to Supabase
3. Investigate and fix issues in new system
4. Re-run migration when ready

**The migration is non-destructive to the source database.** Supabase data is only read, never modified.

## Troubleshooting

### Connection Refused

- Check SUPABASE_DB_URL format (must use port 5432, not 6543 for direct connection)
- Verify Supabase allows direct database connections (check project settings)
- Check firewall rules on target database
- Ensure DATABASE_URL is accessible from migration environment

### Foreign Key Violations

- Use `--disable-fk` flag during import
- Or ensure tables are imported in correct dependency order (should be automatic)
- Check that referenced records exist in parent tables

### User Mapping Errors

- Verify Stack Auth users were created successfully
- Check `user-mapping.json` has entries for all Supabase users
- Run `map-users.ts` if mapping needs to be regenerated
- If mapping not found for a user ID, the original ID is kept (with warning)

### Import Fails Partway Through

- Use `--truncate-first --yes` to clear target and restart
- Check `migration.log` for specific error details
- Tables are imported atomically per batch (500 rows)

### Large Tables Timeout

- Use `--skip-large` to export without sensor_readings, event_logs, alerts
- Export large tables separately with `--table <name>`
- Consider streaming export for tables > 10,000 rows (automatic)

## CLI Reference

### export.ts

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output-dir <path>` | Output directory for JSON files | `./migration-data` |
| `-t, --table <name>` | Export a single table only | - |
| `--skip-large` | Skip large tables (sensor_readings, event_logs, alerts) | false |
| `--skip-auth` | Skip auth.users export | false |
| `--dry-run` | List tables without exporting | false |

### import.ts

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input-dir <path>` | Input directory containing JSON files | `./migration-data` |
| `-m, --mapping <path>` | Path to user mapping JSON file | `./migration-data/user-mapping.json` |
| `-t, --table <name>` | Import a single table only | - |
| `--truncate-first` | Truncate target tables before import (requires --yes) | false |
| `--disable-fk` | Disable foreign key checks during import | false |
| `--yes` | Skip confirmation prompts | false |
| `--dry-run` | Validate export files exist without importing | false |

### migrate-users.ts

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <path>` | Input JSON file with Supabase users | `./migration-data/auth_users.json` |
| `-o, --output <path>` | Output mapping file path | `./migration-data/user-mapping.json` |
| `-d, --dry-run` | Preview migration without creating users | false |
| `-r, --rate-limit <ms>` | Milliseconds between API calls | `100` |

### map-users.ts

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --supabase-export <path>` | Supabase auth_users.json export file | `./migration-data/auth_users.json` |
| `-o, --output <path>` | Output mapping file path | `./migration-data/user-mapping.json` |
| `-m, --match-by <method>` | Matching method: email | `email` |

## Files Reference

| File | Purpose |
|------|---------|
| `src/export.ts` | Export all tables from Supabase to JSON |
| `src/import.ts` | Import JSON files to new database |
| `src/verify.ts` | Compare source and target databases (placeholder) |
| `migrate-users.ts` | Create users in Stack Auth |
| `map-users.ts` | Generate user ID mapping from existing users |
| `test-connections.ts` | Verify database connectivity |
| `lib/logger.ts` | Shared logging configuration (Pino with file + console) |
| `lib/supabase-client.ts` | Supabase connection pool |
| `lib/new-db-client.ts` | New database connection pool |
| `lib/table-metadata.ts` | Table dependency order (23 tables, 8 levels) |
| `lib/user-mapping.ts` | User ID mapping utilities |
| `lib/stream-helpers.ts` | Streaming export utilities |
| `lib/import-helpers.ts` | Import utilities with batching |

## Table Import Order

Tables are imported in dependency order to avoid foreign key violations:

| Level | Tables |
|-------|--------|
| 0 | organizations |
| 1 | subscriptions, profiles, sites, ttn_connections |
| 2 | user_roles, escalation_contacts, areas, hubs, alert_rules |
| 3 | units, devices |
| 4 | lora_sensors, calibration_records, sensor_readings, manual_temperature_logs, door_events |
| 5 | alerts, alert_rules_history |
| 6 | corrective_actions, notification_deliveries |
| 7 | event_logs, pairing_sessions |

## Tables with User ID Mapping

These tables have columns that reference user IDs and require mapping from Supabase UUIDs to Stack Auth UUIDs:

| Table | Columns |
|-------|---------|
| profiles | user_id |
| user_roles | user_id |
| escalation_contacts | profile_id |
| manual_temperature_logs | profile_id |
| corrective_actions | profile_id |
| notification_deliveries | profile_id |
| event_logs | actor_id |

## User ID Mapping Retention

The `user-mapping.json` file maps Supabase UUIDs to Stack Auth UUIDs:

```json
{
  "generatedAt": "2026-01-23T...",
  "retainUntil": "2026-04-23T...",
  "mappings": [
    {
      "supabaseUserId": "abc-123",
      "stackAuthUserId": "xyz-789",
      "email": "user@example.com",
      "migratedAt": "2026-01-23T..."
    }
  ]
}
```

**Retain this file for 90 days** after migration for customer support scenarios where old IDs are referenced. The file includes a `retainUntil` timestamp for tracking.

## Performance Notes

- **Batch Size:** 500 rows per transaction (configurable in import-helpers.ts)
- **Streaming Threshold:** Tables > 10,000 rows use streaming export
- **Rate Limiting:** User migration defaults to 100ms between API calls
- **Large Tables:** sensor_readings, event_logs, alerts are marked as "large"

---

*Migration scripts version: 1.0*
*Created: 2026-01-23*
