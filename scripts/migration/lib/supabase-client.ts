import pg from "pg";
import { logger } from "./logger.js";

const { Pool } = pg;

// Validate required environment variable
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_DB_URL) {
  logger.warn(
    "SUPABASE_DB_URL environment variable not set - Supabase client will fail on connection"
  );
}

// Create connection pool for Supabase PostgreSQL
// Using SSL with rejectUnauthorized: false for Supabase hosted certificates
export const supabasePool = new Pool({
  connectionString: SUPABASE_DB_URL,
  max: 10, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Timeout after 10 seconds when connecting
  ssl: {
    rejectUnauthorized: false, // Required for Supabase self-signed certs
  },
});

// Log pool events for debugging
supabasePool.on("connect", (client) => {
  logger.debug("New Supabase pool connection established");
});

supabasePool.on("error", (err) => {
  logger.error({ error: err.message }, "Supabase pool error");
});

supabasePool.on("remove", () => {
  logger.debug("Supabase pool connection removed");
});

/**
 * Get a connected client from the Supabase pool
 * Remember to release the client when done: client.release()
 */
export async function getSupabaseClient(): Promise<pg.PoolClient> {
  logger.debug("Acquiring Supabase client from pool");
  try {
    const client = await supabasePool.connect();
    logger.debug("Supabase client acquired");
    return client;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Failed to connect to Supabase");
    throw new Error(`Supabase connection failed: ${message}`);
  }
}

/**
 * Test the connection to Supabase database
 * Returns true if connection successful, false otherwise
 */
export async function testSupabaseConnection(): Promise<boolean> {
  logger.info("Testing Supabase connection...");
  let client: pg.PoolClient | null = null;

  try {
    client = await getSupabaseClient();
    const result = await client.query("SELECT current_database(), version()");
    const { current_database, version } = result.rows[0];

    logger.info(
      { database: current_database, version: version.split(",")[0] },
      "Supabase connection successful"
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Supabase connection test failed");
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Close the Supabase connection pool
 * Call this when shutting down the migration script
 */
export async function closeSupabasePool(): Promise<void> {
  logger.info("Closing Supabase connection pool...");
  await supabasePool.end();
  logger.info("Supabase connection pool closed");
}
