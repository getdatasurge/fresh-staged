/**
 * Import Helpers for FreshTrack Migration
 *
 * Utilities for loading JSON data into the new PostgreSQL database.
 * Handles user ID mapping, data type conversions, and batch operations.
 *
 * IMPORTANT: Import operations modify the target database. Always test
 * with --dry-run first and ensure you have a backup strategy.
 */

import fs from "node:fs/promises";
import type pg from "pg";
import { logger, logMigrationProgress } from "./logger.js";
import { mapUserId } from "./user-mapping.js";

/**
 * Batch size for bulk inserts
 * 500 rows per transaction is a good balance between memory usage and performance
 */
export const BATCH_SIZE = 500;

/**
 * Progress logging interval (rows)
 */
const PROGRESS_INTERVAL = 1000;

/**
 * Result of an import operation
 */
export interface ImportResult {
  table: string;
  rowCount: number;
  durationMs: number;
  mappingsApplied?: number;
  mappingsNotFound?: number;
}

/**
 * Load JSON file and parse it
 *
 * @param jsonPath - Path to the JSON file
 * @returns Parsed array of row objects
 */
async function loadJsonFile(jsonPath: string): Promise<Record<string, unknown>[]> {
  const content = await fs.readFile(jsonPath, "utf-8");
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error(`Expected array in JSON file, got ${typeof data}`);
  }

  return data;
}

/**
 * Convert a JavaScript value to a PostgreSQL-compatible parameter
 *
 * Handles:
 * - null/undefined -> null
 * - Date objects -> ISO 8601 string
 * - Objects/arrays -> JSON string for JSONB columns
 * - Primitives -> pass through (pg handles type conversion)
 *
 * @param value - Value to convert
 * @returns PostgreSQL-compatible value
 */
function toPgValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // Date objects to ISO string
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Objects and arrays to JSON string for JSONB columns
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  // Primitives pass through (string, number, boolean)
  // PostgreSQL driver handles conversion for NUMERIC, TIMESTAMP, etc.
  return value;
}

/**
 * Build a parameterized INSERT statement
 *
 * @param tableName - Target table name
 * @param columns - Array of column names
 * @returns Parameterized INSERT SQL
 */
function buildInsertSql(tableName: string, columns: string[]): string {
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  return `INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders})`;
}

/**
 * Import a table from JSON file without user ID mapping
 *
 * Imports all rows from the JSON file into the target table.
 * Uses batched transactions for large tables.
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Target table name
 * @param jsonPath - Path to the JSON export file
 * @returns Import result with row count and duration
 */
export async function importTable(
  pool: pg.Pool,
  tableName: string,
  jsonPath: string
): Promise<ImportResult> {
  const startTime = Date.now();

  // Load JSON data
  const rows = await loadJsonFile(jsonPath);

  if (rows.length === 0) {
    logger.info({ table: tableName }, "No rows to import (empty JSON file)");
    return {
      table: tableName,
      rowCount: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Get columns from first row
  const columns = Object.keys(rows[0]);
  const insertSql = buildInsertSql(tableName, columns);

  let importedCount = 0;

  // Import in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const row of batch) {
        const values = columns.map((col) => toPgValue(row[col]));
        await client.query(insertSql, values);
        importedCount++;
      }

      await client.query("COMMIT");

      // Log progress every PROGRESS_INTERVAL rows
      if (importedCount % PROGRESS_INTERVAL === 0 || importedCount === rows.length) {
        logMigrationProgress("import", importedCount, rows.length, { table: tableName });
      }
    } catch (error) {
      await client.query("ROLLBACK");
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          table: tableName,
          rowIndex: importedCount,
          error: errorMessage,
          row: rows[importedCount],
        },
        `Import failed at row ${importedCount}`
      );
      throw new Error(
        `Import failed for ${tableName} at row ${importedCount}: ${errorMessage}`
      );
    } finally {
      client.release();
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    table: tableName,
    rowCount: importedCount,
    durationMs,
  };
}

/**
 * Import a table from JSON file with user ID mapping
 *
 * Same as importTable but transforms specified columns from
 * Supabase user IDs to Stack Auth user IDs using the mapping.
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Target table name
 * @param jsonPath - Path to the JSON export file
 * @param userMapping - Map of Supabase ID -> Stack Auth ID
 * @param userIdColumns - Array of column names that contain user IDs
 * @returns Import result with row count, mappings applied, and mappings not found
 */
export async function importTableWithMapping(
  pool: pg.Pool,
  tableName: string,
  jsonPath: string,
  userMapping: Map<string, string>,
  userIdColumns: string[]
): Promise<ImportResult> {
  const startTime = Date.now();

  // Load JSON data
  const rows = await loadJsonFile(jsonPath);

  if (rows.length === 0) {
    logger.info({ table: tableName }, "No rows to import (empty JSON file)");
    return {
      table: tableName,
      rowCount: 0,
      durationMs: Date.now() - startTime,
      mappingsApplied: 0,
      mappingsNotFound: 0,
    };
  }

  // Get columns from first row
  const columns = Object.keys(rows[0]);
  const insertSql = buildInsertSql(tableName, columns);

  let importedCount = 0;
  let mappingsApplied = 0;
  let mappingsNotFound = 0;

  // Import in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const row of batch) {
        // Transform user ID columns
        const transformedRow = { ...row };

        for (const col of userIdColumns) {
          const oldId = row[col];

          // Skip null/undefined values
          if (oldId === null || oldId === undefined) {
            continue;
          }

          const newId = mapUserId(userMapping, String(oldId));

          if (newId) {
            transformedRow[col] = newId;
            mappingsApplied++;
          } else {
            // Log warning but continue - keep the original ID
            // This allows partial imports when not all users were migrated
            logger.warn(
              {
                table: tableName,
                column: col,
                oldId,
                rowIndex: importedCount,
              },
              `User ID mapping not found for ${col}=${oldId}, keeping original`
            );
            mappingsNotFound++;
          }
        }

        const values = columns.map((col) => toPgValue(transformedRow[col]));
        await client.query(insertSql, values);
        importedCount++;
      }

      await client.query("COMMIT");

      // Log progress every PROGRESS_INTERVAL rows
      if (importedCount % PROGRESS_INTERVAL === 0 || importedCount === rows.length) {
        logMigrationProgress("import-with-mapping", importedCount, rows.length, {
          table: tableName,
          mappingsApplied,
          mappingsNotFound,
        });
      }
    } catch (error) {
      await client.query("ROLLBACK");
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          table: tableName,
          rowIndex: importedCount,
          error: errorMessage,
          row: rows[importedCount],
        },
        `Import failed at row ${importedCount}`
      );
      throw new Error(
        `Import failed for ${tableName} at row ${importedCount}: ${errorMessage}`
      );
    } finally {
      client.release();
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    table: tableName,
    rowCount: importedCount,
    durationMs,
    mappingsApplied,
    mappingsNotFound,
  };
}

/**
 * Truncate all tables in the provided list
 *
 * Tables are truncated in the provided order (should be REVERSE dependency order).
 * Uses CASCADE to handle any remaining FK constraints.
 *
 * @param pool - PostgreSQL connection pool
 * @param tables - Array of table names in truncation order
 */
export async function truncateAllTables(
  pool: pg.Pool,
  tables: readonly string[]
): Promise<void> {
  logger.info({ tableCount: tables.length }, "Truncating all tables...");

  const client = await pool.connect();
  try {
    // Use a single transaction for all truncations
    await client.query("BEGIN");

    for (const table of tables) {
      logger.info({ table }, `Truncating ${table}...`);
      await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }

    await client.query("COMMIT");
    logger.info({ tableCount: tables.length }, "All tables truncated successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "Truncate failed");
    throw new Error(`Truncate failed: ${errorMessage}`);
  } finally {
    client.release();
  }
}

/**
 * Disable foreign key checks for bulk import
 *
 * Uses session_replication_role = 'replica' to disable FK triggers.
 * This is faster than importing in strict dependency order but requires
 * careful verification after import.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function disableForeignKeys(pool: pg.Pool): Promise<void> {
  logger.info("Disabling foreign key checks (session_replication_role = 'replica')");

  const client = await pool.connect();
  try {
    await client.query("SET session_replication_role = 'replica'");
    logger.info("Foreign key checks disabled");
  } finally {
    client.release();
  }
}

/**
 * Re-enable foreign key checks after bulk import
 *
 * Restores normal FK trigger behavior.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function enableForeignKeys(pool: pg.Pool): Promise<void> {
  logger.info("Re-enabling foreign key checks (session_replication_role = 'origin')");

  const client = await pool.connect();
  try {
    await client.query("SET session_replication_role = 'origin'");
    logger.info("Foreign key checks re-enabled");
  } finally {
    client.release();
  }
}

/**
 * Check if a JSON export file exists
 *
 * @param jsonPath - Path to check
 * @returns true if file exists
 */
export async function jsonFileExists(jsonPath: string): Promise<boolean> {
  try {
    await fs.access(jsonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the row count from a JSON export file without loading full content
 *
 * Note: This still loads the file into memory to parse JSON.
 * For very large files, consider using streaming JSON parsing.
 *
 * @param jsonPath - Path to the JSON file
 * @returns Number of rows in the file
 */
export async function getJsonRowCount(jsonPath: string): Promise<number> {
  const content = await fs.readFile(jsonPath, "utf-8");
  const data = JSON.parse(content);
  return Array.isArray(data) ? data.length : 0;
}
