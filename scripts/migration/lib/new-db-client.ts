import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

// Validate required environment variable
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  logger.warn('DATABASE_URL environment variable not set - New DB client will fail on connection');
}

// Parse connection string to determine if SSL should be used
// Local connections (localhost) typically don't need SSL
// Production connections should use SSL
function shouldUseSSL(connectionString: string | undefined): boolean {
  if (!connectionString) return false;

  const isLocalhost =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('host.docker.internal');

  return !isLocalhost;
}

// Create connection pool for new self-hosted PostgreSQL
export const newDbPool = new Pool({
  connectionString: DATABASE_URL,
  max: 10, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout after 10 seconds when connecting
  // Only use SSL for non-local connections
  ssl: shouldUseSSL(DATABASE_URL)
    ? {
        rejectUnauthorized: false, // Allow self-signed certs in production
      }
    : false,
});

// Log pool events for debugging
newDbPool.on('connect', (client) => {
  logger.debug('New DB pool connection established');
});

newDbPool.on('error', (err) => {
  logger.error({ error: err.message }, 'New DB pool error');
});

newDbPool.on('remove', () => {
  logger.debug('New DB pool connection removed');
});

/**
 * Get a connected client from the new database pool
 * Remember to release the client when done: client.release()
 */
export async function getNewDbClient(): Promise<pg.PoolClient> {
  logger.debug('Acquiring new DB client from pool');
  try {
    const client = await newDbPool.connect();
    logger.debug('New DB client acquired');
    return client;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to connect to new database');
    throw new Error(`New database connection failed: ${message}`);
  }
}

/**
 * Test the connection to new database
 * Returns true if connection successful, false otherwise
 */
export async function testNewDbConnection(): Promise<boolean> {
  logger.info('Testing new database connection...');
  let client: pg.PoolClient | null = null;

  try {
    client = await getNewDbClient();
    const result = await client.query('SELECT current_database(), version()');
    const { current_database, version } = result.rows[0];

    logger.info(
      { database: current_database, version: version.split(',')[0] },
      'New database connection successful',
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'New database connection test failed');
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Close the new database connection pool
 * Call this when shutting down the migration script
 */
export async function closeNewDbPool(): Promise<void> {
  logger.info('Closing new database connection pool...');
  await newDbPool.end();
  logger.info('New database connection pool closed');
}
