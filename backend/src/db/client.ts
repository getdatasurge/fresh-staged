import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import * as schema from './schema/index.js';

const log = logger.child({ service: 'db-client' });

/**
 * Database connection pool
 *
 * CONNECTION STRING:
 * - Development: postgresql://user:pass@localhost:5432/frostguard (direct PostgreSQL)
 * - Production: postgresql://user:pass@pgbouncer:6432/frostguard (via PgBouncer)
 *
 * PGBOUNCER COMPATIBILITY:
 * This codebase is verified compatible with PgBouncer transaction pooling mode.
 *
 * Safe patterns:
 * - ✅ Drizzle ORM parameterized queries (all queries use prepared statements)
 * - ✅ db.transaction() blocks (each transaction gets dedicated connection)
 * - ✅ Batch inserts/updates (handled within single transaction)
 *
 * Avoided patterns:
 * - ❌ .prepare() - Not used (Drizzle handles internally)
 * - ❌ SET SESSION/LOCAL - Not used
 * - ❌ LISTEN/NOTIFY - Not used
 * - ❌ Advisory locks - Not used
 *
 * POOL SETTINGS:
 * - max: 20 - Matches PgBouncer default_pool_size for optimal connection reuse
 * - idleTimeoutMillis: 30s - Close idle connections to free resources
 * - connectionTimeoutMillis: 5s - Fail fast on connection issues
 *
 * PgBouncer handles connection pooling at transaction boundary (pool_mode = transaction).
 * Application pool (max: 20) matches PgBouncer pool to prevent double-queueing.
 *
 * See docs/DATABASE.md for full compatibility audit and architecture details.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle({ client: pool, schema });

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, closing database connections');
  await closeDatabase();
  process.exit(0);
});
