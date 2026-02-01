# Hypothesis Document: REC-002
**Version**: 1.0.0 | **Created**: 2026-02-01T08:30:00Z | **Status**: VALIDATED

## Summary
| Hypothesis | Risk | Result | Implication |
|------------|------|--------|-------------|
| HYP-001 | HIGH | REJECTED | Drizzle requires custom migrations for partitions; ORM operations transparent once created |
| HYP-002 | HIGH | CONFIRMED | PostgreSQL 15 fully supports declarative partitioning |

## Hypotheses

### HYP-001: Drizzle ORM Transparent Partitioning Support
**Risk Level**: HIGH
**Status**: REJECTED
**Statement**: Drizzle ORM v0.38.0 supports partitioned PostgreSQL tables transparently without requiring schema definition changes
**Context**: If Drizzle ORM requires special configuration or doesn't support partitioned tables, the implementation complexity increases significantly and may require custom SQL queries instead of ORM operations
**Validation Criteria**:
- CONFIRM if: Drizzle ORM can INSERT into partitioned tables without errors, SELECT queries show partition pruning in EXPLAIN output, and foreign key relationships work correctly
- REJECT if: Drizzle ORM throws errors on partitioned tables, requires special schema annotations, or cannot handle partition routing
**Suggested Method**: CODE_EXPERIMENT

### HYP-002: PostgreSQL Version Compatibility
**Risk Level**: HIGH
**Status**: CONFIRMED
**Statement**: Production PostgreSQL version is 10 or higher, supporting declarative table partitioning
**Context**: Declarative partitioning (PARTITION BY RANGE) was introduced in PostgreSQL 10. Older versions require inheritance-based partitioning which is more complex and less performant
**Validation Criteria**:
- CONFIRM if: PostgreSQL version >= 10.0 and PARTITION BY RANGE syntax is supported
- REJECT if: PostgreSQL version < 10.0 or PARTITION BY RANGE syntax fails
**Suggested Method**: CODEBASE_ANALYSIS

## Validation Findings

### HYP-002 Findings
**Validated**: 2026-02-01T13:25:00Z
**Method**: CODEBASE_ANALYSIS
**Result**: CONFIRMED

**Evidence**:
PostgreSQL version 15 is confirmed in both development and production Docker Compose configurations:

1. **Development Environment** (docker-compose.yml:9):
   ```yaml
   postgres:
     image: postgres:15-alpine
   ```

2. **Production Environment** (docker-compose.prod.yml:9):
   ```yaml
   postgres:
     image: postgres:15-alpine
   ```

PostgreSQL 15 was released in October 2022 and is well above the minimum requirement of PostgreSQL 10 (released in 2017). PostgreSQL 15 fully supports:
- Declarative table partitioning (PARTITION BY RANGE, LIST, HASH)
- All partition management features
- Native partition pruning optimization
- Foreign keys on partitioned tables (added in PG 11)

**Sources**:
- docker-compose.yml:9 (postgres:15-alpine image)
- docker-compose.prod.yml:9 (postgres:15-alpine image)
- PostgreSQL 15 official documentation

**Implications for Design**:
All PostgreSQL partitioning features are available. No version upgrade required. Design can proceed with full confidence in declarative partitioning support.

---

### HYP-001 Findings
**Validated**: 2026-02-01T13:25:00Z
**Method**: EXTERNAL_RESEARCH + CODE_ANALYSIS
**Result**: REJECTED

**Evidence**:

**1. Schema Definition Limitation**:
Drizzle ORM v0.38.0 does NOT support `PARTITION BY` syntax in schema definitions. This is an active feature request tracked in GitHub Issue #2854 and Discussion #2093 (as of June 2025, still unresolved).

**2. Operational Transparency** (Partial Support):
Research confirms that once partitioned tables exist (created via custom migrations), Drizzle ORM operations work transparently:
- ✓ INSERT operations route to correct partition automatically (PostgreSQL handles routing)
- ✓ SELECT queries work normally (PostgreSQL handles partition pruning)
- ✓ Query builder operations (where, orderBy, joins) function without modification
- ✓ Drizzle treats partitioned tables as ordinary tables during introspection

**3. Required Workaround**:
The documented pattern requires custom migration files:
```bash
drizzle-kit generate --custom
# Edit generated SQL to add: PARTITION BY RANGE (created_at)
drizzle-kit migrate
```

This means the hypothesis statement "without requiring schema definition changes" is technically correct for the schema.ts file, but DOES require changes to migration files.

**4. Foreign Key Constraint**:
Foreign keys work but require composite primary key including the partition key:
```sql
PRIMARY KEY (id, created_at)  -- Both columns required
```

**Sources**:
- [Drizzle ORM GitHub Issue #2854](https://github.com/drizzle-team/drizzle-orm/issues/2854)
- [Drizzle ORM Discussion #2093](https://github.com/drizzle-team/drizzle-orm/discussions/2093)
- [Drizzle ORM Custom Migrations Documentation](https://orm.drizzle.team/docs/kit-custom-migrations)
- [Drizzle ORM Insert Documentation](https://orm.drizzle.team/docs/insert)
- backend/package.json:33 (drizzle-orm@0.38.0 confirmed)

**Implications for Design**:

**CRITICAL - Hypothesis Technically Rejected but Implementation Viable**:

The hypothesis as stated is REJECTED because:
- ❌ Schema definition DOES require changes (custom migration files, not just schema.ts)
- ❌ PARTITION BY is not supported in Drizzle schema DSL
- ❌ Requires manual SQL intervention for partition creation

**However, the design remains viable with modifications**:
- ✅ All ORM operations (INSERT/SELECT/JOIN) work transparently once partitions exist
- ✅ No application code changes needed beyond migration step
- ✅ Foreign keys work with composite PK pattern
- ⚠ Implementation plan must include custom migration step
- ⚠ Future schema changes may require manual partition management

**Recommended Design Adjustment**:
1. Add "Custom Migration Creation" task to implementation plan
2. Document pattern: Define table in schema.ts WITHOUT partition syntax
3. Generate custom migration: `drizzle-kit generate --custom`
4. Edit migration SQL to add PARTITION BY clause
5. All subsequent ORM code works normally

**Risk Assessment**:
- **Risk**: MEDIUM (down from HIGH)
- **Mitigation**: Well-documented workaround, community-validated pattern
- **Trade-off**: Slightly more complex migrations vs. fully transparent ORM usage
