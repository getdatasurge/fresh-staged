import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

const log = logger.child({ service: 'db-migrate' });

async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  log.info('Connecting to database');
  const pool = new Pool({ connectionString });

  try {
    const db = drizzle({ client: pool });

    log.info('Running migrations');
    await migrate(db, { migrationsFolder: './drizzle' });

    log.info('Migrations completed successfully');
  } catch (error) {
    log.error({ err: error }, 'Migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
