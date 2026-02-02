# Phase 29: Production Data Migration - Research

**Researched:** 2026-01-25
**Domain:** Production database migration from Supabase to self-hosted PostgreSQL
**Confidence:** HIGH

## Summary

Phase 29 involves executing the final data transfer from the legacy Supabase system to the new self-hosted PostgreSQL database. The project has already developed comprehensive migration scripts in `scripts/migration/` that handle the technical aspects of data export, user migration to Stack Auth, and data import. The critical focus for this phase is production execution, risk mitigation, and maintaining service continuity during the migration window.

The migration uses a "Freeze+Backfill" strategy with an 8+ hour maintenance window. All migration scripts are tested and ready, with support for dry-run operations, user ID mapping, and comprehensive logging. The primary challenge is coordinating the production cutover while minimizing user impact and ensuring rollback capability.

**Primary recommendation:** Execute migration during low-traffic hours with comprehensive pre-migration validation, maintain Supabase as rollback option for 48 hours, and use the existing migration scripts with production environment configuration.

## Standard Stack

The established tools and infrastructure for this migration:

### Core Migration Stack

| Library                  | Version  | Purpose                            | Why Standard                            |
| ------------------------ | -------- | ---------------------------------- | --------------------------------------- |
| Custom migration scripts | 1.0.0    | Export/import data, user migration | Purpose-built for FreshTrack data model |
| Node.js                  | >=20.0.0 | Migration runtime                  | Required by migration scripts           |
| PostgreSQL               | 15       | Target database                    | Production database version             |
| pg                       | 8.11.3   | PostgreSQL client                  | Robust connection handling              |
| pg-query-stream          | 4.5.3    | Streaming large tables             | Memory-efficient exports                |

### Supporting Infrastructure

| Component      | Purpose               | When to Use                         |
| -------------- | --------------------- | ----------------------------------- |
| Stack Auth     | User authentication   | Replace Supabase Auth               |
| Docker Compose | Production deployment | Self-hosted infrastructure          |
| Pino logger    | Migration logging     | Structured logging with file output |
| Commander.js   | CLI interface         | Script parameter handling           |

### Migration Strategy Components

| Component        | Purpose            | Configuration                |
| ---------------- | ------------------ | ---------------------------- |
| Freeze+Backfill  | Migration approach | 8+ hour maintenance window   |
| User ID mapping  | Auth migration     | 90-day retention for support |
| Streaming export | Large tables       | >10,000 rows use streaming   |
| Batch import     | Performance        | 500 rows per transaction     |

**Installation:**

```bash
cd scripts/migration
pnpm install
```

## Architecture Patterns

### Recommended Migration Execution Structure

```
production-migration/
├── pre-migration/          # Validation and preparation
│   ├── connections-test.ts
│   ├── data-volume-check.ts
│   └── rollback-plan.md
├── migration-execution/   # Core migration scripts
│   ├── export.ts
│   ├── migrate-users.ts
│   └── import.ts
├── post-migration/         # Validation and cleanup
│   ├── data-verification.ts
│   ├── performance-check.ts
│   └── user-communications.ts
└── rollback/              # Emergency procedures
    ├── restore-supabase.ts
    └── data-reconciliation.ts
```

### Pattern 1: Maintenance Window Migration

**What:** Freeze application writes, export data, migrate users, import data, verify, unfreeze
**When to use:** Production systems with acceptable maintenance window
**Example:**

```typescript
// Source: scripts/migration/src/export.ts
// Pre-migration validation
await testSupabaseConnection();
await testNewDatabaseConnection();
const tableCounts = await validateTableSizes();

// Export with user notification
await logMigrationStart('export', { dryRun: false });
await exportAllTables({ outputDir: './migration-data' });
```

### Pattern 2: User Migration with Password Reset Flow

**What:** Create users in Stack Auth without passwords, trigger password reset emails
**When to use:** Migrating from Supabase Auth (bcrypt hashes incompatible with Stack Auth)
**Example:**

```typescript
// Source: scripts/migration/migrate-users.ts
// Users created without passwords - must reset
const stackAuthUser = await createStackAuthUser({
  email: supabaseUser.email,
  displayName: supabaseUser.raw_user_meta_data?.display_name,
});
// Password reset handled post-migration
```

### Anti-Patterns to Avoid

- **Hot migration without maintenance window:** Risk of data inconsistency during active writes
- **Skipping user mapping validation:** Leads to broken foreign key references
- **Import without FK checks disabled:** Can cause constraint violations during large imports
- **No rollback testing:** Leaves no recovery path if migration fails

## Don't Hand-Roll

Problems that have existing solutions in the migration scripts:

| Problem                       | Don't Build                  | Use Instead                                    | Why                                  |
| ----------------------------- | ---------------------------- | ---------------------------------------------- | ------------------------------------ |
| Table dependency ordering     | Custom dependency resolution | `getTableImportOrder()` from table-metadata.ts | 23 tables across 8 dependency levels |
| Large table memory management | In-memory JSON loading       | Streaming export with `streamTableToJson()`    | Handles tables >10,000 rows          |
| User ID mapping               | Manual UUID replacement      | `saveMapping()` and user-mapping.ts            | Maintains referential integrity      |
| Batch import performance      | Single transaction imports   | `importWithBatching()` from import-helpers.ts  | 500 rows per transaction             |
| Migration logging             | Console.log only             | Structured Pino logger                         | File + console with rotation         |

**Key insight:** The migration scripts handle edge cases like streaming large tables, user ID mapping across 8 tables, and proper transaction batching that would be error-prone to rebuild.

## Common Pitfalls

### Pitfall 1: Insufficient Maintenance Window

**What goes wrong:** Migration takes longer than expected, extended downtime
**Why it happens:** Underestimating data volume, network latency, or user migration API rate limits
**How to avoid:**

- Run full export/import on production-sized data in staging
- Add 50% buffer to time estimates
- Use `--skip-large` flag for initial migration if needed
  **Warning signs:** Export taking >2x expected time, frequent API rate limiting

### Pitfall 2: User Migration Password Issues

**What goes wrong:** Users cannot log in after migration due to password hash incompatibility
**Why it happens:** Supabase uses bcrypt, Stack Auth doesn't support importing pre-hashed passwords
**How to avoid:**

- Send password reset emails to ALL users immediately after migration
- Clear communication about required password reset
- Have support process for users who miss reset emails
  **Warning signs:** High login failure rates post-migration

### Pitfall 3: Foreign Key Constraint Violations

**What goes wrong:** Import fails due to FK references to non-existent records
**Why it happens:** Tables imported in wrong order or user ID mapping not applied
**How to avoid:**

- Use `--disable-fk` flag during import
- Verify user-mapping.json exists and is valid
- Import in dependency order (handled by scripts)
  **Warning signs:** Import errors on specific tables, mapping not found warnings

### Pitfall 4: Rollback Complexity

**What goes wrong:** Migration fails, rollback is difficult or data loss occurs
**Why it happens:** No clear rollback procedure, or source data modified during migration
**How to avoid:**

- Never modify Supabase data during export (read-only)
- Keep Supabase running for 48 hours post-migration
- Document rollback procedure and test in staging
  **Warning signs:** Any write operations to source database

## Code Examples

Verified patterns from the existing migration scripts:

### Pre-Migration Connection Testing

```typescript
// Source: scripts/migration/test-connections.ts
const supabaseOk = await testSupabaseConnection();
const newDbOk = await testNewDatabaseConnection();

if (!supabaseOk || !newDbOk) {
  logger.error('Database connection tests failed');
  process.exit(1);
}
```

### Export with Progress Tracking

```typescript
// Source: scripts/migration/src/export.ts
const spinner = ora('Exporting tables...').start();
for (const tableName of TABLE_IMPORT_ORDER) {
  spinner.start(`Exporting ${tableName}...`);
  await exportTable(tableName, outputDir);
  spinner.succeed(`Exported ${tableName}`);
}
```

### User Migration with Mapping

```typescript
// Source: scripts/migration/migrate-users.ts
const mapping: UserMapping = {
  generatedAt: new Date().toISOString(),
  retainUntil: new Date(Date.now() + MAPPING_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  mappings: [],
};

for (const supabaseUser of users) {
  const stackAuthUser = await createStackAuthUser(supabaseUser);
  mapping.mappings.push({
    supabaseUserId: supabaseUser.id,
    stackAuthUserId: stackAuthUser.id,
    email: supabaseUser.email,
    migratedAt: new Date().toISOString(),
  });
}
```

### Import with Batching

```typescript
// Source: scripts/migration/lib/import-helpers.ts
async function importWithBatching(tableName: string, data: any[]) {
  const batchSize = 500;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await insertBatch(tableName, batch);
  }
}
```

## State of the Art

| Old Approach              | Current Approach                     | When Changed           | Impact                                       |
| ------------------------- | ------------------------------------ | ---------------------- | -------------------------------------------- |
| Manual SQL dumps          | Scripted JSON export/import          | Phase 28 development   | Consistent, repeatable migrations            |
| In-place user migration   | Separate auth migration with mapping | Current project        | Maintains data relationships                 |
| Single transaction import | Batched imports with FK disabled     | Migration scripts v1.0 | Handles large datasets without memory issues |

**Deprecated/outdated:**

- Direct pg_dump migration: Doesn't handle user ID mapping or auth migration
- Manual user data entry: Error-prone, doesn't scale
- In-memory export of large tables: Causes memory exhaustion

## Open Questions

Things that couldn't be fully resolved:

1. **Production Migration Timing**
   - What we know: Scripts support dry-run and timing estimation
   - What's unclear: Optimal maintenance window for user base
   - Recommendation: Analyze traffic patterns, choose low-traffic window (e.g., weekend 2AM-6AM)

2. **User Communication Strategy**
   - What we know: Password reset emails required for all users
   - What's unclear: Timing and messaging for user notifications
   - Recommendation: Send pre-migration notice 48 hours prior, immediate reset email post-migration

3. **Rollback Trigger Conditions**
   - What we know: Supabase remains untouched during export
   - What's unclear: What specific failure conditions trigger rollback
   - Recommendation: Define clear success criteria (data verification, user login testing)

## Sources

### Primary (HIGH confidence)

- Migration scripts in `scripts/migration/` - Complete implementation
- Migration README.md - Comprehensive documentation and CLI reference
- Docker compose production configuration - Infrastructure setup
- Environment configuration files - Production settings

### Secondary (MEDIUM confidence)

- WebSearch 2026 production migration patterns - Current best practices
- Stack Auth documentation - User migration limitations and API
- PostgreSQL blue/green deployment guides - Zero-downtime strategies

### Tertiary (LOW confidence)

- General data migration checklists - Common industry practices (verified against specific implementation)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Based on existing migration scripts
- Architecture: HIGH - Scripts implement proven patterns
- Pitfalls: HIGH - Migration logs show real issues encountered
- Production execution: MEDIUM - Requires production environment validation

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (migration domain evolves rapidly)
