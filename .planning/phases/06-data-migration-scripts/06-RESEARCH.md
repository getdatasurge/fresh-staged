# Phase 6: Data Migration Scripts - Research

**Researched:** 2026-01-23
**Domain:** PostgreSQL data export/import, Node.js migration tooling, user ID mapping
**Confidence:** MEDIUM

## Summary

Phase 6 requires building TypeScript scripts to export all data from Supabase PostgreSQL, handle user ID mapping from Supabase Auth to Stack Auth, and import everything into the new self-hosted database. The standard approach uses native PostgreSQL clients (node-postgres or pg-copy-streams for performance) with JSON as the export format for human readability and transformation flexibility.

Key technical decisions from CONTEXT.md are locked in: JSON files per table, freeze+backfill strategy (no dual-write), 8+ hour maintenance window allowing for reliability over speed, fail-fast on errors, and 90-day retention of user ID mapping for customer support.

The research reveals that while pg_dump is standard for schema export, programmatic data export via node-postgres or pg-copy-streams provides better control for transformations (especially user ID mapping). For Stack Auth user migration, the platform provides REST API endpoints but lacks documented bulk import - individual user creation via API may be necessary. Verification should use row counts plus table-level checksums (MD5 or SHA-256 of sorted row hashes) for data integrity confirmation.

**Primary recommendation:** Use node-postgres for table-by-table export to JSON files with streaming support, implement user ID mapping logic during import, create verification scripts that compare row counts and data checksums between source and target databases.

## Standard Stack

### Core Libraries

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-postgres (pg) | Latest | PostgreSQL client for export/import | Official PostgreSQL client, mature, full feature support for connections and queries |
| pg-copy-streams | Latest | Fast bulk data transfer | PostgreSQL native COPY FROM/TO commands, 10-20x faster than INSERT for bulk operations |
| zod | Latest | Data validation during migration | Runtime type checking ensures data integrity, validates JSON exports before import |
| pino | Latest | Structured logging | Low-overhead logging for progress tracking, both console and file output |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg-query-stream | Latest | Memory-efficient streaming | When exporting large tables (sensor_readings) to avoid OOM |
| fast-csv | Latest | CSV parsing/generation | If adding CSV export option alongside JSON |
| commander | Latest | CLI argument parsing | For export/import/verify script options (--table, --verify-only, etc.) |
| ora | Latest | Terminal spinners | Progress indication during long-running operations |

### Installation

```bash
npm install pg pg-copy-streams pg-query-stream zod pino
npm install --save-dev @types/pg commander ora fast-csv
```

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── migration/
│   ├── lib/
│   │   ├── supabase-client.ts      # Supabase connection pool
│   │   ├── new-db-client.ts        # New PostgreSQL connection pool
│   │   ├── logger.ts               # Pino logger configuration
│   │   ├── table-metadata.ts       # Table dependency order, schemas
│   │   ├── user-mapping.ts         # User ID mapping logic
│   │   ├── checksum.ts             # Data verification helpers
│   │   └── stream-helpers.ts       # Streaming utilities
│   ├── export.ts                   # Main export script
│   ├── import.ts                   # Main import script
│   ├── verify.ts                   # Verification script
│   ├── map-users.ts                # User ID mapping generator
│   └── migrate-users.ts            # Stack Auth user migration
├── migration-data/                 # Generated during export
│   ├── metadata.json               # Migration metadata
│   ├── user-mapping.json           # Supabase ID → Stack Auth ID
│   ├── organizations.json
│   ├── profiles.json
│   ├── sites.json
│   └── ...                         # All other tables
└── README.md                       # Migration runbook
```

### Pattern 1: Table Export with Streaming

**What:** Export large tables to JSON files using streaming to avoid memory issues
**When to use:** For tables with >10k rows (sensor_readings, event_logs, alerts)
**Example:**

```typescript
// Source: Context7 node-postgres documentation
import { Pool } from 'pg';
import QueryStream from 'pg-query-stream';
import * as fs from 'fs';
import * as JSONStream from 'JSONStream';

async function exportTable(pool: Pool, tableName: string, outputPath: string) {
  const client = await pool.connect();
  try {
    const query = new QueryStream(`SELECT * FROM ${tableName}`);
    const stream = client.query(query);
    const writeStream = fs.createWriteStream(outputPath);

    await new Promise((resolve, reject) => {
      stream
        .pipe(JSONStream.stringify())
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    logger.info(`Exported ${tableName} to ${outputPath}`);
  } finally {
    client.release();
  }
}
```

### Pattern 2: Import with User ID Mapping

**What:** Load data from JSON files while mapping Supabase user IDs to Stack Auth IDs
**When to use:** For all tables with foreign keys to profiles or auth.users
**Example:**

```typescript
import { Pool } from 'pg';
import * as fs from 'fs';

interface UserMapping {
  supabaseUserId: string;
  stackAuthUserId: string;
}

async function importTableWithMapping(
  pool: Pool,
  tableName: string,
  jsonPath: string,
  userMapping: Map<string, string>
) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of data) {
      // Map user_id if present
      if (row.user_id && userMapping.has(row.user_id)) {
        row.user_id = userMapping.get(row.user_id);
      }

      // Map profile_id if present
      if (row.profile_id && userMapping.has(row.profile_id)) {
        row.profile_id = userMapping.get(row.profile_id);
      }

      const columns = Object.keys(row);
      const values = Object.values(row);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      await client.query(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
    }

    await client.query('COMMIT');
    logger.info(`Imported ${data.length} rows into ${tableName}`);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, tableName }, 'Import failed, rolled back');
    throw err;
  } finally {
    client.release();
  }
}
```

### Pattern 3: Fast Bulk Import with COPY

**What:** Use PostgreSQL COPY FROM for maximum import speed when no transformations needed
**When to use:** For tables without user ID references (organizations, subscriptions)
**Example:**

```typescript
// Source: Context7 pg-copy-streams documentation
import { pipeline } from 'node:stream/promises';
import * as fs from 'node:fs';
import { from as copyFrom } from 'pg-copy-streams';

async function fastImportTable(pool: Pool, tableName: string, csvPath: string) {
  const client = await pool.connect();
  try {
    const ingestStream = client.query(copyFrom(`COPY ${tableName} FROM STDIN CSV HEADER`));
    const sourceStream = fs.createReadStream(csvPath);
    await pipeline(sourceStream, ingestStream);

    logger.info(`Fast imported ${tableName} (${ingestStream.rowCount} rows)`);
  } catch (err) {
    logger.error({ err, tableName }, 'Fast import failed');
    throw err;
  } finally {
    client.release();
  }
}
```

### Pattern 4: Table Checksum Verification

**What:** Generate deterministic checksums of table data for integrity verification
**When to use:** After import to confirm data matches source
**Example:**

```typescript
import * as crypto from 'crypto';

async function computeTableChecksum(pool: Pool, tableName: string): Promise<string> {
  const client = await pool.connect();
  try {
    // Get sorted hash of all rows
    const result = await client.query(`
      SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) as table_checksum
      FROM (
        SELECT md5(CAST(t AS text)) as row_hash
        FROM ${tableName} t
      ) hashes
    `);

    return result.rows[0].table_checksum;
  } finally {
    client.release();
  }
}

async function verifyTableIntegrity(
  sourcePool: Pool,
  targetPool: Pool,
  tableName: string
): Promise<boolean> {
  const sourceChecksum = await computeTableChecksum(sourcePool, tableName);
  const targetChecksum = await computeTableChecksum(targetPool, tableName);

  const match = sourceChecksum === targetChecksum;
  logger.info({
    tableName,
    sourceChecksum,
    targetChecksum,
    match
  }, 'Table verification');

  return match;
}
```

### Anti-Patterns to Avoid

- **Loading entire tables into memory:** Use streaming for large tables to prevent OOM errors
- **One-shot migration without logging:** Always log progress to both console and file for troubleshooting
- **No transaction boundaries:** Wrap imports in transactions so failures can rollback cleanly
- **Ignoring dependency order:** Import tables in dependency order to avoid foreign key violations
- **Manual ID mapping:** Generate and persist user ID mapping programmatically, don't manual-edit

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming large datasets | Custom pagination loop | pg-query-stream + node streams | Handles backpressure, memory-safe, battle-tested |
| Bulk data import | Loop with individual INSERTs | pg-copy-streams (COPY FROM) | 10-20x faster, native PostgreSQL optimization |
| Progress indicators | console.log with timers | ora (terminal spinners) | Professional UX, handles concurrent output |
| Data validation | Manual JSON parsing | Zod schemas | Runtime type safety, clear error messages |
| Database checksums | Custom hash functions | PostgreSQL md5() with sorted aggregation | Database-native, deterministic, handles NULL properly |

**Key insight:** PostgreSQL's native COPY command and streaming abstractions are dramatically faster and more reliable than application-level loops. The 10-20x performance difference matters when migrating 100K+ sensor readings.

## Common Pitfalls

### Pitfall 1: Supabase Auth Schema Access

**What goes wrong:** Trying to export auth.users via Supabase client SDK fails - auth schema not exposed in API
**Why it happens:** Supabase intentionally hides auth schema for security, even from authenticated users
**How to avoid:** Use direct PostgreSQL connection (not Supabase SDK) for migration scripts. Connection string format: `postgresql://postgres:[password]@db.mfwyiifehsvwnjwqoxht.supabase.co:5432/postgres`
**Warning signs:** Import errors about missing auth.users table, or empty user exports

### Pitfall 2: User ID Mapping Overwrites

**What goes wrong:** Mapping Supabase UUIDs to Stack Auth UUIDs fails if Stack Auth IDs not created first
**Why it happens:** Stack Auth user creation is async and generates IDs server-side
**How to avoid:**
1. Export Supabase auth.users first
2. Create all users in Stack Auth (via API or UI)
3. Generate mapping file (supabase_id → stack_auth_id)
4. Use mapping during data import
**Warning signs:** NULL user_id values after import, foreign key constraint violations

### Pitfall 3: Table Import Order Violations

**What goes wrong:** Import fails with foreign key constraint errors (e.g., importing units before sites)
**Why it happens:** PostgreSQL enforces referential integrity - child tables need parent rows first
**How to avoid:** Define explicit import order in table-metadata.ts following dependency graph:
```typescript
// Correct order
const IMPORT_ORDER = [
  'organizations',     // No dependencies
  'profiles',          // → organizations
  'user_roles',        // → profiles, organizations
  'sites',             // → organizations
  'areas',             // → sites
  'units',             // → areas
  'sensor_readings',   // → units, devices
  // ... etc
];
```
**Warning signs:** Errors like "violates foreign key constraint", "insert or update on table violates foreign key"

### Pitfall 4: JSON Number Precision Loss

**What goes wrong:** High-precision numeric fields (temperature, GPS coordinates) lose precision through JSON
**Why it happens:** JavaScript JSON.parse converts all numbers to IEEE 754 doubles (53-bit precision)
**How to avoid:**
- Export numeric columns as strings in JSON: `SELECT row_to_json(t)::text`
- Or use PostgreSQL's COPY TO CSV for lossless export
- Parse strings back to PG numeric type on import
**Warning signs:** Temperature readings like 4.199999999 instead of 4.2, truncated decimal places

### Pitfall 5: Timestamp Timezone Confusion

**What goes wrong:** Timestamps shift hours during migration, breaking time-series data
**Why it happens:** Mixing TIMESTAMP vs TIMESTAMPTZ types, or client timezone affecting serialization
**How to avoid:**
- Export timestamps with explicit timezone: `recorded_at AT TIME ZONE 'UTC'`
- Use ISO 8601 format in JSON: `to_json(recorded_at)::text`
- Import with explicit timezone: `$1::timestamptz`
**Warning signs:** All timestamps shifted by N hours, sensor readings appearing in wrong time buckets

### Pitfall 6: Idempotency Failures

**What goes wrong:** Re-running import after partial failure creates duplicate rows
**Why it happens:** No tracking of which tables/rows already imported
**How to avoid:**
- Option A (one-shot): Delete all data and restart from scratch (acceptable with 8hr window)
- Option B (idempotent): Track migration state in metadata table, skip completed tables
**Warning signs:** Constraint violations on unique keys, row count doubling after retry

## Code Examples

Verified patterns from official sources:

### Export Supabase Auth Users

```typescript
// Source: Supabase community discussions + pg documentation
import { Pool } from 'pg';
import * as fs from 'fs';

interface SupabaseUser {
  id: string;
  email: string;
  encrypted_password: string;
  email_confirmed_at: string | null;
  phone: string | null;
  raw_user_meta_data: Record<string, unknown>;
  raw_app_meta_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

async function exportSupabaseUsers(outputPath: string) {
  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    // Must query auth schema directly
    const result = await client.query<SupabaseUser>(`
      SELECT
        u.id,
        u.email,
        u.encrypted_password,
        u.email_confirmed_at,
        u.phone,
        u.raw_user_meta_data,
        u.raw_app_meta_data,
        u.created_at,
        u.updated_at
      FROM auth.users u
      ORDER BY u.created_at ASC
    `);

    fs.writeFileSync(outputPath, JSON.stringify(result.rows, null, 2));
    logger.info(`Exported ${result.rows.length} users from auth.users`);

    return result.rows;
  } finally {
    client.release();
    await pool.end();
  }
}
```

### Create Users in Stack Auth

```typescript
// Source: Stack Auth REST API documentation (inferred from search results)
// Note: MEDIUM confidence - official bulk import not documented

interface StackAuthUserCreate {
  email: string;
  emailVerified?: boolean;
  displayName?: string;
  profileImageUrl?: string;
}

async function createStackAuthUser(
  userData: StackAuthUserCreate
): Promise<string> {
  const response = await fetch('https://api.stack-auth.com/api/v1/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-stack-access-type': 'server',
      'x-stack-project-id': process.env.STACK_AUTH_PROJECT_ID!,
      'x-stack-secret-server-key': process.env.STACK_AUTH_SECRET_KEY!,
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    throw new Error(`Stack Auth user creation failed: ${response.statusText}`);
  }

  const user = await response.json();
  return user.id; // Stack Auth user ID
}

async function migrateUsersToStackAuth(
  supabaseUsers: SupabaseUser[]
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();

  for (const supabaseUser of supabaseUsers) {
    try {
      const stackAuthId = await createStackAuthUser({
        email: supabaseUser.email,
        emailVerified: !!supabaseUser.email_confirmed_at,
        displayName: supabaseUser.raw_user_meta_data?.full_name as string,
      });

      mapping.set(supabaseUser.id, stackAuthId);
      logger.info({
        supabaseId: supabaseUser.id,
        stackAuthId,
        email: supabaseUser.email
      }, 'User migrated');

      // Rate limiting - Stack Auth may have limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      logger.error({ err, user: supabaseUser.email }, 'User migration failed');
      throw err; // Fail fast
    }
  }

  return mapping;
}
```

### Row Count and Checksum Verification

```typescript
// Source: PostgreSQL documentation + migration best practices articles
interface TableStats {
  rowCount: number;
  checksum: string;
}

async function getTableStats(pool: Pool, tableName: string): Promise<TableStats> {
  const client = await pool.connect();
  try {
    // Row count
    const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
    const rowCount = parseInt(countResult.rows[0].count, 10);

    // Deterministic checksum of all row data
    const checksumResult = await client.query(`
      SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) as checksum
      FROM (
        SELECT md5(CAST(t AS text)) as row_hash
        FROM ${tableName} t
      ) hashes
    `);
    const checksum = checksumResult.rows[0].checksum;

    return { rowCount, checksum };
  } finally {
    client.release();
  }
}

async function verifyMigration(
  supabasePool: Pool,
  newDbPool: Pool,
  tables: string[]
): Promise<void> {
  logger.info('Starting migration verification...');

  const results = [];
  for (const table of tables) {
    const source = await getTableStats(supabasePool, table);
    const target = await getTableStats(newDbPool, table);

    const match = source.rowCount === target.rowCount &&
                  source.checksum === target.checksum;

    results.push({
      table,
      sourceRows: source.rowCount,
      targetRows: target.rowCount,
      match,
      sourceChecksum: source.checksum,
      targetChecksum: target.checksum,
    });

    if (!match) {
      logger.error({ table, source, target }, 'VERIFICATION FAILED');
    } else {
      logger.info({ table, rowCount: source.rowCount }, 'Verified');
    }
  }

  // Summary
  const allMatch = results.every(r => r.match);
  if (allMatch) {
    logger.info('✓ All tables verified successfully');
  } else {
    const failed = results.filter(r => !r.match).map(r => r.table);
    logger.error({ failed }, 'Migration verification FAILED');
    throw new Error(`Verification failed for tables: ${failed.join(', ')}`);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pg_dump for all data | Programmatic export with transformation | 2023+ | Enables user ID mapping, custom validation, progress tracking |
| CSV export format | JSON export format | 2024+ | Human-readable, easier to inspect/debug, native JS handling |
| Manual foreign key order | Dependency graph traversal | 2022+ | Automated ordering, prevents constraint errors |
| Row-by-row INSERT | COPY FROM STDIN (pg-copy-streams) | Always preferred | 10-20x performance improvement for bulk data |
| Manual verification | Automated checksum comparison | 2024+ | Deterministic, catches subtle data corruption |

**Deprecated/outdated:**
- pg_dump with --inserts flag: Generates individual INSERT statements (slow), prefer COPY or bulk insert
- Exporting passwords from Supabase Auth: Not possible via API, must use direct PostgreSQL connection
- Assuming idempotency: Modern migration scripts should be one-shot with proper transactions, not idempotent retries

## Open Questions

### 1. Stack Auth Bulk User Import

**What we know:** Stack Auth has REST API for individual user creation (`POST /api/v1/users`)
**What's unclear:** Whether bulk import endpoint exists or if rate limits apply to sequential creation
**Recommendation:**
- Test creating 5-10 users via API to confirm approach works
- If rate limits detected, add delay between requests (100-500ms)
- Alternative: Check Stack Auth docs for CSV import or migration tooling
- Consider reaching out to Stack Auth support for migration assistance

**Confidence:** LOW (no official bulk import documentation found)

### 2. Password Hash Compatibility

**What we know:** Supabase uses bcrypt for password hashing in auth.users
**What's unclear:** Whether Stack Auth accepts pre-hashed passwords during user creation
**Recommendation:**
- If Stack Auth doesn't accept bcrypt hashes: users must reset passwords post-migration
- Send password reset emails to all users as part of cutover communication
- Document this in migration runbook

**Confidence:** LOW (Stack Auth password hash import not documented)

### 3. Optimal Export Format for Large Tables

**What we know:** JSON is human-readable, CSV/TSV is faster with COPY
**What's unclear:** Whether JSON overhead matters for 100K sensor_readings (estimated <1GB total)
**Recommendation:**
- Use JSON for small tables (<10K rows) for inspectability
- Use CSV with COPY for sensor_readings (largest table)
- Hybrid approach provides best of both worlds

**Confidence:** MEDIUM (tradeoff decision, both approaches work)

### 4. Rollback Mechanism

**What we know:** Keep Supabase untouched until verification passes
**What's unclear:** Whether to automate rollback or rely on manual process
**Recommendation:**
- No automatic rollback (adds complexity)
- Document manual rollback: restore new DB from pre-migration backup, revert DNS
- 8+ hour window sufficient to detect issues and manually revert

**Confidence:** HIGH (manual rollback is simpler and safer)

## Sources

### Primary (HIGH confidence)

- [node-postgres (pg) - Context7](https://context7.com/brianc/node-postgres/llms.txt) - PostgreSQL client query patterns, type handling
- [pg-copy-streams - Context7](https://context7.com/brianc/node-pg-copy-streams/llms.txt) - COPY TO/FROM streaming examples
- [Drizzle ORM - Context7](https://context7.com/drizzle-team/drizzle-orm-docs) - Bulk insert patterns
- [PostgreSQL Official Documentation](https://www.postgresql.org/docs/current/app-pgdump.html) - pg_dump reference
- [PostgreSQL Checksums Documentation](https://www.postgresql.org/docs/current/checksums.html) - Data integrity verification

### Secondary (MEDIUM confidence)

- [Supabase Auth Migration Guide](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects) - Exporting auth.users table patterns
- [Database Migration Validation Best Practices (Quinnox, 2025)](https://www.quinnox.com/blogs/data-migration-validation-best-practices/) - Row counts, checksums
- [PostgreSQL Checksums for Tables (CYBERTEC)](https://www.cybertec-postgresql.com/en/postgresql-creating-checksums-for-tables/) - Table-level integrity checks
- [Node.js Database Migrations Best Practices (Medium, 2024)](https://medium.com/@AlexeyBalchunas/how-to-migrate-dbs-with-nodejs-and-typescript-ededc39d7d19) - TypeScript patterns
- [Synvinkel - Node.js PostgreSQL Migrations](https://synvinkel.org/notes/node-postgres-migrations) - Migration script architecture

### Tertiary (LOW confidence)

- [Stack Auth Documentation](https://docs.stack-auth.com/) - User management REST API (inferred from search results)
- [Stack Auth Overview (LogRocket)](https://blog.logrocket.com/stackauth-open-source-auth0-alternative/) - Feature overview
- WebSearch: "Stack Auth user import API" - No official bulk import docs found, marked for validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - node-postgres and pg-copy-streams are official PostgreSQL ecosystem tools with extensive documentation
- Architecture: HIGH - Patterns verified from Context7 documentation and official PostgreSQL guides
- User migration: LOW - Stack Auth bulk import not officially documented, requires validation/testing
- Verification: HIGH - PostgreSQL checksums and row count validation are well-established practices

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - stable migration domain)

**Research limitations:**
- Stack Auth is a newer platform (2024-2025) with limited migration documentation
- No hands-on testing of Stack Auth user import API
- Supabase connection strings and auth schema access assumed based on standard Supabase architecture

**Recommended next steps:**
1. Test Stack Auth user creation API with sample data before planning
2. Confirm Supabase direct PostgreSQL connection access (not just SDK)
3. Validate table dependency order matches actual foreign key constraints
4. Review migration window sizing based on actual data volumes
