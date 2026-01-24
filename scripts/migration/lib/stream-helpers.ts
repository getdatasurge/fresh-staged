/**
 * Stream helpers for efficient data export from PostgreSQL
 *
 * Provides memory-efficient streaming for large tables and simple
 * export for small tables. Handles data type conversion for JSON.
 */

import pg from "pg";
import QueryStream from "pg-query-stream";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { logger, logMigrationProgress } from "./logger.js";

const { Pool } = pg;

// Constants for export behavior
export const STREAMING_THRESHOLD = 10000; // Rows above this use streaming
export const LARGE_TABLES = ["sensor_readings", "event_logs", "alerts"] as const;
const PROGRESS_INTERVAL = 1000; // Log progress every N rows

/**
 * Get the row count for a table
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table to count
 * @param schema - Schema name (default: public)
 * @returns Row count
 */
export async function getTableRowCount(
  pool: pg.Pool,
  tableName: string,
  schema: string = "public"
): Promise<number> {
  const client = await pool.connect();
  try {
    // Use identifier quoting to prevent SQL injection
    const result = await client.query(
      `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`
    );
    return parseInt(result.rows[0].count, 10);
  } finally {
    client.release();
  }
}

/**
 * Get the primary key column(s) for a table
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table
 * @param schema - Schema name (default: public)
 * @returns Array of primary key column names, or ['id'] as fallback
 */
async function getPrimaryKeyColumns(
  pool: pg.Pool,
  tableName: string,
  schema: string = "public"
): Promise<string[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass
        AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
      `,
      [`"${schema}"."${tableName}"`]
    );
    if (result.rows.length > 0) {
      return result.rows.map((r) => r.column_name);
    }
    // Fallback to 'id' if no primary key found
    return ["id"];
  } catch {
    // If table lookup fails, default to id
    return ["id"];
  } finally {
    client.release();
  }
}

/**
 * Convert PostgreSQL value to JSON-safe format
 *
 * - Timestamps: Convert to ISO 8601 UTC string
 * - Numeric: Convert to string for lossless precision
 * - JSONB: Keep as native object
 * - NULL: Preserve as null
 */
function convertToJsonSafe(value: unknown, columnType?: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // Handle Date objects (timestamps)
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle numeric types as strings to preserve precision
  // PostgreSQL numeric/decimal types are returned as strings by pg
  // but we want to ensure BigInt and precise decimals are preserved
  if (typeof value === "bigint") {
    return value.toString();
  }

  // JSONB columns come through as parsed objects - preserve as-is
  if (typeof value === "object" && value !== null) {
    // Check if it's a Buffer (bytea type)
    if (Buffer.isBuffer(value)) {
      return value.toString("base64");
    }
    return value;
  }

  return value;
}

/**
 * Convert a row's values to JSON-safe format
 */
function convertRowToJsonSafe(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = convertToJsonSafe(value);
  }
  return result;
}

/**
 * Stream a large table to a JSON file
 *
 * Uses pg-query-stream for memory-efficient processing.
 * Writes a JSON array with proper formatting.
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table to export
 * @param outputPath - Path to write the JSON file
 * @param schema - Schema name (default: public)
 * @returns Number of rows exported
 */
export async function streamTableToJson(
  pool: pg.Pool,
  tableName: string,
  outputPath: string,
  schema: string = "public"
): Promise<number> {
  const client = await pool.connect();
  let rowCount = 0;

  try {
    // Get primary key for ordering
    const pkColumns = await getPrimaryKeyColumns(pool, tableName, schema);
    const orderBy = pkColumns.map((col) => `"${col}"`).join(", ");

    // Use to_json for timestamp conversion at database level
    const query = new QueryStream(
      `SELECT * FROM "${schema}"."${tableName}" ORDER BY ${orderBy}`,
      [],
      { batchSize: 1000 }
    );

    const stream = client.query(query);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create write stream
    const writeStream = fs.createWriteStream(outputPath);

    // Write opening bracket
    writeStream.write("[\n");

    let isFirst = true;

    // Transform stream to JSON lines
    const transformStream = new Transform({
      objectMode: true,
      transform(row, _encoding, callback) {
        try {
          rowCount++;
          const jsonSafeRow = convertRowToJsonSafe(row);
          const prefix = isFirst ? "  " : ",\n  ";
          isFirst = false;
          this.push(prefix + JSON.stringify(jsonSafeRow));

          // Log progress every PROGRESS_INTERVAL rows
          if (rowCount % PROGRESS_INTERVAL === 0) {
            logMigrationProgress(`export:${tableName}`, rowCount, 0, { streaming: true });
          }

          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
      flush(callback) {
        // Write closing bracket
        this.push("\n]");
        callback();
      },
    });

    // Pipeline the streams together
    await pipeline(stream, transformStream, writeStream);

    logger.info(
      { table: tableName, rowCount, outputPath },
      `Streamed ${rowCount} rows to ${outputPath}`
    );

    return rowCount;
  } finally {
    client.release();
  }
}

/**
 * Export a small table (< STREAMING_THRESHOLD rows) to JSON
 *
 * Loads all rows into memory for simpler processing.
 * Suitable for configuration tables, reference data, etc.
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table to export
 * @param outputPath - Path to write the JSON file
 * @param schema - Schema name (default: public)
 * @returns Number of rows exported
 */
export async function exportSmallTable(
  pool: pg.Pool,
  tableName: string,
  outputPath: string,
  schema: string = "public"
): Promise<number> {
  const client = await pool.connect();

  try {
    // Get primary key for ordering
    const pkColumns = await getPrimaryKeyColumns(pool, tableName, schema);
    const orderBy = pkColumns.map((col) => `"${col}"`).join(", ");

    const result = await client.query(
      `SELECT * FROM "${schema}"."${tableName}" ORDER BY ${orderBy}`
    );

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert rows to JSON-safe format
    const jsonSafeRows = result.rows.map(convertRowToJsonSafe);

    // Write with pretty formatting for human readability
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify(jsonSafeRows, null, 2),
      "utf-8"
    );

    logger.info(
      { table: tableName, rowCount: result.rows.length, outputPath },
      `Exported ${result.rows.length} rows to ${outputPath}`
    );

    return result.rows.length;
  } finally {
    client.release();
  }
}

/**
 * Export auth.users table from Supabase
 *
 * Special handling for Supabase's auth schema.
 * Exports only the columns needed for user mapping.
 *
 * @param pool - PostgreSQL connection pool (with auth schema access)
 * @param outputPath - Path to write the JSON file
 * @returns Number of users exported
 */
export async function exportAuthUsers(
  pool: pg.Pool,
  outputPath: string
): Promise<number> {
  const client = await pool.connect();

  try {
    // Select only the columns we need for user mapping
    // Supabase auth.users has many columns but we only need these for migration
    const result = await client.query(`
      SELECT
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_user_meta_data,
        raw_app_meta_data,
        is_super_admin,
        phone,
        phone_confirmed_at,
        last_sign_in_at
      FROM auth.users
      ORDER BY created_at
    `);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert rows to JSON-safe format
    const jsonSafeRows = result.rows.map(convertRowToJsonSafe);

    // Write with pretty formatting
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify(jsonSafeRows, null, 2),
      "utf-8"
    );

    logger.info(
      { rowCount: result.rows.length, outputPath },
      `Exported ${result.rows.length} auth.users to ${outputPath}`
    );

    return result.rows.length;
  } finally {
    client.release();
  }
}

/**
 * Determine whether a table should use streaming based on row count and table name
 */
export function shouldUseStreaming(tableName: string, rowCount: number): boolean {
  return (
    rowCount > STREAMING_THRESHOLD ||
    (LARGE_TABLES as readonly string[]).includes(tableName)
  );
}
