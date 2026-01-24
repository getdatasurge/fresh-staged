/**
 * Checksum computation utilities for data integrity verification
 *
 * Provides deterministic checksum computation for comparing data between
 * source (Supabase) and target (new PostgreSQL) databases after migration.
 */

import pg from "pg";
import { logger } from "./logger.js";

/**
 * Result of comparing a table between source and target
 */
export interface TableComparison {
  /** Name of the table */
  tableName: string;
  /** Row count in source database */
  sourceRowCount: number;
  /** Row count in target database */
  targetRowCount: number;
  /** Whether row counts match */
  rowCountMatch: boolean;
  /** Checksum of source table data (null if computation failed) */
  sourceChecksum: string | null;
  /** Checksum of target table data (null if computation failed) */
  targetChecksum: string | null;
  /** Whether checksums match (null if either checksum couldn't be computed) */
  checksumMatch: boolean | null;
  /** Overall status: pass, fail, or warn (if checksum couldn't be computed) */
  status: "pass" | "fail" | "warn";
}

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
 * Get all column names for a table
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table
 * @param schema - Schema name (default: public)
 * @returns Array of column names
 */
async function getTableColumns(
  pool: pg.Pool,
  tableName: string,
  schema: string = "public"
): Promise<string[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
      `,
      [schema, tableName]
    );
    return result.rows.map((r) => r.column_name);
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
 * Compute a deterministic checksum for a table's data
 *
 * Uses PostgreSQL MD5 aggregation over sorted row hashes.
 * The result is deterministic for identical data regardless of
 * physical storage order.
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table
 * @param schema - Schema name (default: public)
 * @returns MD5 checksum string, or null if computation failed
 */
export async function computeTableChecksum(
  pool: pg.Pool,
  tableName: string,
  schema: string = "public"
): Promise<string | null> {
  const client = await pool.connect();
  try {
    // Get primary key for deterministic ordering
    const pkColumns = await getPrimaryKeyColumns(pool, tableName, schema);
    const orderBy = pkColumns.map((col) => `"${col}"`).join(", ");

    // Compute checksum by hashing each row, sorting hashes, then aggregating
    // This ensures consistent results regardless of physical row order
    const result = await client.query(`
      SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) as checksum
      FROM (
        SELECT md5(CAST(t.* AS text)) as row_hash
        FROM "${schema}"."${tableName}" t
        ORDER BY ${orderBy}
      ) hashes
    `);

    const checksum = result.rows[0]?.checksum;
    if (!checksum) {
      // Table might be empty
      logger.debug({ tableName }, "Table empty or no checksum computed");
      return null;
    }

    return checksum;
  } catch (err) {
    // Table might have columns that don't cast to text well (e.g., complex JSONB)
    logger.warn(
      { tableName, error: (err as Error).message },
      "Checksum computation failed, falling back to row count only"
    );
    return null;
  } finally {
    client.release();
  }
}

/**
 * Compute a deterministic checksum excluding specific columns
 *
 * Useful for tables with user ID columns that are expected to differ
 * between source and target (due to ID mapping during migration).
 *
 * @param pool - PostgreSQL connection pool
 * @param tableName - Name of the table
 * @param excludeColumns - Array of column names to exclude from checksum
 * @param schema - Schema name (default: public)
 * @returns MD5 checksum string, or null if computation failed
 */
export async function computeChecksumExcludingColumns(
  pool: pg.Pool,
  tableName: string,
  excludeColumns: string[],
  schema: string = "public"
): Promise<string | null> {
  const client = await pool.connect();
  try {
    // Get all columns for the table
    const allColumns = await getTableColumns(pool, tableName, schema);

    // Filter out excluded columns
    const columnsToInclude = allColumns.filter(
      (col) => !excludeColumns.includes(col)
    );

    if (columnsToInclude.length === 0) {
      logger.warn(
        { tableName, excludeColumns },
        "All columns excluded, cannot compute checksum"
      );
      return null;
    }

    // Get primary key for deterministic ordering
    const pkColumns = await getPrimaryKeyColumns(pool, tableName, schema);
    const orderBy = pkColumns.map((col) => `"${col}"`).join(", ");

    // Build column list for checksum (excluding specified columns)
    const columnList = columnsToInclude
      .map((col) => `"${col}"::text`)
      .join(" || '|' || ");

    // Compute checksum by concatenating included columns, hashing each row, then aggregating
    const result = await client.query(`
      SELECT md5(string_agg(row_hash, '' ORDER BY row_hash)) as checksum
      FROM (
        SELECT md5(${columnList}) as row_hash
        FROM "${schema}"."${tableName}"
        ORDER BY ${orderBy}
      ) hashes
    `);

    const checksum = result.rows[0]?.checksum;
    if (!checksum) {
      logger.debug(
        { tableName },
        "Table empty or no checksum computed (with exclusions)"
      );
      return null;
    }

    logger.debug(
      { tableName, excludedColumns: excludeColumns, includedCount: columnsToInclude.length },
      "Computed checksum with column exclusions"
    );

    return checksum;
  } catch (err) {
    logger.warn(
      { tableName, excludeColumns, error: (err as Error).message },
      "Checksum computation with exclusions failed"
    );
    return null;
  } finally {
    client.release();
  }
}

/**
 * Compare table statistics between source and target databases
 *
 * Computes row counts and checksums for both databases and returns
 * a comparison result with pass/fail/warn status.
 *
 * @param sourcePool - PostgreSQL connection pool for source database
 * @param targetPool - PostgreSQL connection pool for target database
 * @param tableName - Name of the table to compare
 * @param excludeColumns - Columns to exclude from checksum (e.g., user ID columns)
 * @param skipChecksum - Skip checksum computation (only verify row counts)
 * @param schema - Schema name (default: public)
 * @returns TableComparison with full comparison results
 */
export async function compareTableStats(
  sourcePool: pg.Pool,
  targetPool: pg.Pool,
  tableName: string,
  excludeColumns: string[] = [],
  skipChecksum: boolean = false,
  schema: string = "public"
): Promise<TableComparison> {
  // Get row counts from both databases
  const [sourceRowCount, targetRowCount] = await Promise.all([
    getTableRowCount(sourcePool, tableName, schema),
    getTableRowCount(targetPool, tableName, schema),
  ]);

  const rowCountMatch = sourceRowCount === targetRowCount;

  // Compute checksums if not skipped
  let sourceChecksum: string | null = null;
  let targetChecksum: string | null = null;
  let checksumMatch: boolean | null = null;

  if (!skipChecksum) {
    if (excludeColumns.length > 0) {
      // Use checksum with column exclusions for tables with user ID columns
      [sourceChecksum, targetChecksum] = await Promise.all([
        computeChecksumExcludingColumns(sourcePool, tableName, excludeColumns, schema),
        computeChecksumExcludingColumns(targetPool, tableName, excludeColumns, schema),
      ]);
    } else {
      // Use full table checksum
      [sourceChecksum, targetChecksum] = await Promise.all([
        computeTableChecksum(sourcePool, tableName, schema),
        computeTableChecksum(targetPool, tableName, schema),
      ]);
    }

    // Determine checksum match status
    if (sourceChecksum !== null && targetChecksum !== null) {
      checksumMatch = sourceChecksum === targetChecksum;
    }
  }

  // Determine overall status
  let status: "pass" | "fail" | "warn" = "pass";

  if (!rowCountMatch) {
    status = "fail";
  } else if (checksumMatch === false) {
    status = "fail";
  } else if (!skipChecksum && checksumMatch === null) {
    // Checksum couldn't be computed but row counts match
    status = "warn";
  }

  return {
    tableName,
    sourceRowCount,
    targetRowCount,
    rowCountMatch,
    sourceChecksum,
    targetChecksum,
    checksumMatch,
    status,
  };
}
