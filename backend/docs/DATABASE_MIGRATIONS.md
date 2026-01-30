# Database Migrations

This document describes the database migration process for FrostGuard Pro using Drizzle ORM.

## Overview

FrostGuard uses [Drizzle ORM](https://orm.drizzle.team/) for database schema management and migrations. The schema is defined in TypeScript files under `src/db/schema/`, and migrations are stored as SQL files in the `drizzle/` directory.

## Migration Files

```
backend/
├── drizzle/
│   ├── 0000_polite_gunslinger.sql    # Initial schema
│   ├── 0001_silky_rhodey.sql         # TTN, SMS, gateway support
│   ├── 0002_reading_metrics.sql      # Aggregated metrics table
│   └── meta/
│       └── _journal.json             # Migration tracking
├── src/db/
│   ├── schema/                       # TypeScript schema definitions
│   └── migrate.ts                    # Migration runner
└── scripts/
    └── migrate-production.sh         # Production migration script
```

## Development Workflow

### Generate New Migrations

When you modify schema files in `src/db/schema/`, generate a new migration:

```bash
cd backend
pnpm db:generate
```

This creates a new SQL file in `drizzle/` with the schema changes.

### Apply Migrations Locally

```bash
pnpm db:migrate
```

### Push Schema Directly (Development Only)

For rapid iteration during development, push schema changes directly:

```bash
pnpm db:push
```

**Warning:** This bypasses migrations and should only be used in development.

### View Database with Drizzle Studio

```bash
pnpm db:studio
```

## Production Deployment

### Running Migrations

Migrations run automatically as part of the deployment pipeline. They can also be run manually:

#### Using Docker Compose

```bash
docker compose -f docker-compose.prod.yml exec backend ./scripts/migrate-production.sh
```

#### Using Docker Run

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  ghcr.io/getdatasurge/frostguard-backend:latest \
  ./scripts/migrate-production.sh
```

### Migration Safety

The migration system:

1. **Tracks Applied Migrations**: Drizzle maintains a `__drizzle_migrations` table to track which migrations have been applied.

2. **Idempotent**: Running migrations multiple times is safe. Already-applied migrations are skipped.

3. **Transactional**: Each migration runs in a transaction. If it fails, the database is rolled back.

4. **Sequential**: Migrations are applied in order based on the `_journal.json` file.

### Pre-Deployment Checklist

1. **Backup Database**: Always create a backup before running migrations in production.

2. **Review Migration SQL**: Check the generated SQL in `drizzle/` before deploying.

3. **Test in Staging**: Apply migrations to a staging environment first.

4. **Monitor**: Watch application logs during deployment for migration errors.

### Rollback Strategy

Drizzle does not generate automatic rollback migrations. For rollbacks:

1. **Manual Rollback**: Write SQL to reverse the changes and apply it manually.

2. **Restore from Backup**: For complex rollbacks, restore the database from a backup taken before the migration.

3. **Forward Fix**: Often the safest approach is to deploy a new migration that fixes the issue.

## Schema Organization

The schema is organized by domain:

| File                 | Description                                    |
| -------------------- | ---------------------------------------------- |
| `enums.ts`           | PostgreSQL enum types                          |
| `tenancy.ts`         | Organizations, subscriptions                   |
| `users.ts`           | Profiles, roles, escalation contacts           |
| `hierarchy.ts`       | Sites, areas, units, hubs                      |
| `devices.ts`         | Sensors, LoRa config, calibration              |
| `telemetry.ts`       | Sensor readings, door events, manual logs      |
| `reading-metrics.ts` | Aggregated reading statistics                  |
| `alerts.ts`          | Alert rules, active alerts, corrective actions |
| `notifications.ts`   | Notification delivery tracking                 |
| `audit.ts`           | Event logging for compliance                   |

## Troubleshooting

### Migration Fails

1. Check `DATABASE_URL` is correct
2. Ensure the database user has CREATE/ALTER privileges
3. Check for conflicting schema (manual changes)
4. Review the migration SQL for syntax errors

### Schema Drift

If the production database doesn't match migrations:

```bash
pnpm db:check
```

This compares the schema files against existing migrations.

### Regenerate Snapshots

If snapshot files are corrupted:

```bash
rm drizzle/meta/*.json
pnpm db:generate
```

This regenerates all migration metadata from the SQL files.
