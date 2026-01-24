#!/usr/bin/env tsx
/**
 * Verification script for FreshTrack data migration
 *
 * Compares row counts and checksums between Supabase (source) and
 * new PostgreSQL (target) databases to verify data integrity after migration.
 *
 * Usage:
 *   pnpm verify                    # Verify all tables
 *   pnpm verify --table sites      # Verify single table
 *   pnpm verify --skip-checksum    # Only verify row counts (faster)
 *   pnpm verify --fail-fast        # Stop on first mismatch
 *   pnpm verify --output ./report.json  # Custom output path
 */

import "dotenv/config";
import { Command } from "commander";
import ora, { type Ora } from "ora";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  logger,
  logMigrationStart,
  logMigrationComplete,
  logMigrationError,
  closeLogger,
} from "../lib/logger.js";
import {
  supabasePool,
  testSupabaseConnection,
  closeSupabasePool,
} from "../lib/supabase-client.js";
import {
  newDbPool,
  testNewDbConnection,
  closeNewDbPool,
} from "../lib/new-db-client.js";
import {
  getTableImportOrder,
  TABLE_IMPORT_ORDER,
  type TableName,
  requiresUserMapping,
  getUserIdColumns,
} from "../lib/table-metadata.js";
import {
  getTableRowCount,
  computeTableChecksum,
  computeChecksumExcludingColumns,
  type TableComparison,
} from "../lib/checksum.js";

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI program setup
const program = new Command()
  .name("verify")
  .description("Verify data integrity after FreshTrack migration")
  .version("1.0.0")
  .option(
    "-o, --output <path>",
    "Output path for verification report",
    "./migration-data/verification-report.json"
  )
  .option("-t, --table <name>", "Verify a single table only")
  .option("--skip-checksum", "Skip checksum verification (row counts only)")
  .option("--fail-fast", "Stop verification on first mismatch")
  .parse(process.argv);

// CLI options interface
interface VerifyOptions {
  output: string;
  table?: string;
  skipChecksum?: boolean;
  failFast?: boolean;
}

// Verification report structure
interface VerificationReport {
  verifiedAt: string;
  sourceDatabase: string;
  targetDatabase: string;
  options: {
    skipChecksum: boolean;
    failFast: boolean;
    singleTable?: string;
  };
  allPassed: boolean;
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
  };
  results: TableComparison[];
  durationMs: number;
}

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

/**
 * Format status with color
 */
function formatStatus(status: "pass" | "fail" | "warn"): string {
  switch (status) {
    case "pass":
      return `${colors.green}PASS${colors.reset}`;
    case "fail":
      return `${colors.red}FAIL${colors.reset}`;
    case "warn":
      return `${colors.yellow}WARN${colors.reset}`;
  }
}

/**
 * Validate that a table name is in the import order
 */
function validateTableName(tableName: string): tableName is TableName {
  return (TABLE_IMPORT_ORDER as readonly string[]).includes(tableName);
}

/**
 * Get tables to verify based on options
 */
function getTablesToVerify(options: VerifyOptions): TableName[] {
  const allTables = getTableImportOrder();

  // Single table mode
  if (options.table) {
    if (!validateTableName(options.table)) {
      throw new Error(
        `Unknown table: ${options.table}. Valid tables: ${allTables.join(", ")}`
      );
    }
    return [options.table];
  }

  return [...allTables];
}

/**
 * Verify a single table and return comparison result
 */
async function verifyTable(
  table: TableName,
  skipChecksum: boolean,
  spinner: Ora
): Promise<TableComparison> {
  spinner.text = `Verifying ${table}...`;

  // Get row counts from both databases
  const [sourceRowCount, targetRowCount] = await Promise.all([
    getTableRowCount(supabasePool, table),
    getTableRowCount(newDbPool, table),
  ]);

  const rowCountMatch = sourceRowCount === targetRowCount;

  // Compute checksums if not skipped
  let sourceChecksum: string | null = null;
  let targetChecksum: string | null = null;
  let checksumMatch: boolean | null = null;

  if (!skipChecksum) {
    spinner.text = `Verifying ${table} (computing checksums)...`;

    // For tables with user IDs, exclude those columns from checksum
    if (requiresUserMapping(table)) {
      const excludeCols = getUserIdColumns(table);
      [sourceChecksum, targetChecksum] = await Promise.all([
        computeChecksumExcludingColumns(supabasePool, table, excludeCols),
        computeChecksumExcludingColumns(newDbPool, table, excludeCols),
      ]);
    } else {
      [sourceChecksum, targetChecksum] = await Promise.all([
        computeTableChecksum(supabasePool, table),
        computeTableChecksum(newDbPool, table),
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
    tableName: table,
    sourceRowCount,
    targetRowCount,
    rowCountMatch,
    sourceChecksum,
    targetChecksum,
    checksumMatch,
    status,
  };
}

/**
 * Print verification summary table to console
 */
function printSummaryTable(results: TableComparison[]): void {
  console.log("\n=== Verification Summary ===\n");

  // Table header
  const header = `${"Table".padEnd(28)} ${"Source".padStart(10)} ${"Target".padStart(10)} ${"Rows".padStart(6)} ${"Hash".padStart(6)} ${"Status".padStart(8)}`;
  console.log(colors.bold + header + colors.reset);
  console.log("-".repeat(header.length));

  // Table rows
  for (const result of results) {
    const rowMatch = result.rowCountMatch ? "OK" : "DIFF";
    const hashMatch =
      result.checksumMatch === null
        ? "N/A"
        : result.checksumMatch
          ? "OK"
          : "DIFF";

    const line = `${result.tableName.padEnd(28)} ${String(result.sourceRowCount).padStart(10)} ${String(result.targetRowCount).padStart(10)} ${rowMatch.padStart(6)} ${hashMatch.padStart(6)} ${formatStatus(result.status).padStart(8 + colors.green.length + colors.reset.length)}`;
    console.log(line);
  }

  console.log("-".repeat(header.length));
}

/**
 * Main verification function
 */
async function main(): Promise<void> {
  const options = program.opts<VerifyOptions>();
  const startTime = Date.now();

  logMigrationStart("verify", { options });

  // Test source connection (Supabase)
  const sourceSpinner = ora("Testing Supabase connection...").start();
  const sourceConnected = await testSupabaseConnection();

  if (!sourceConnected) {
    sourceSpinner.fail("Supabase connection failed");
    logMigrationError("verify", new Error("Supabase connection failed"));
    process.exit(1);
  }
  sourceSpinner.succeed("Supabase connection OK");

  // Test target connection (new database)
  const targetSpinner = ora("Testing new database connection...").start();
  const targetConnected = await testNewDbConnection();

  if (!targetConnected) {
    targetSpinner.fail("New database connection failed");
    logMigrationError("verify", new Error("New database connection failed"));
    process.exit(1);
  }
  targetSpinner.succeed("New database connection OK");

  // Get tables to verify
  const tables = getTablesToVerify(options);
  logger.info(
    { tableCount: tables.length, skipChecksum: options.skipChecksum },
    `Verifying ${tables.length} tables`
  );

  // Initialize results array
  const results: TableComparison[] = [];
  let allPassed = true;
  let failedCount = 0;

  // Verify each table
  const verifySpinner = ora().start();

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const progressPrefix = `[${i + 1}/${tables.length}]`;

    try {
      verifySpinner.text = `${progressPrefix} Verifying ${table}...`;

      const result = await verifyTable(
        table,
        options.skipChecksum ?? false,
        verifySpinner
      );

      results.push(result);

      // Update spinner based on result
      if (result.status === "pass") {
        verifySpinner.succeed(
          `${progressPrefix} ${table}: ${formatStatus(result.status)} (${result.sourceRowCount} rows)`
        );
        logger.info(
          { table, rowCount: result.sourceRowCount, status: result.status },
          `Verified ${table}`
        );
      } else if (result.status === "warn") {
        verifySpinner.warn(
          `${progressPrefix} ${table}: ${formatStatus(result.status)} (checksum not computed)`
        );
        logger.warn(
          { table, result },
          `Verification warning: checksum not computed for ${table}`
        );
      } else {
        verifySpinner.fail(
          `${progressPrefix} ${table}: ${formatStatus(result.status)}`
        );
        logger.error(
          { table, result },
          `Verification failed for ${table}`
        );
        allPassed = false;
        failedCount++;

        if (options.failFast) {
          logger.info("Stopping verification (--fail-fast mode)");
          break;
        }
      }
    } catch (err) {
      verifySpinner.fail(`${progressPrefix} ${table}: ERROR`);
      logMigrationError("verify", err, { table });

      // Add error result
      results.push({
        tableName: table,
        sourceRowCount: -1,
        targetRowCount: -1,
        rowCountMatch: false,
        sourceChecksum: null,
        targetChecksum: null,
        checksumMatch: null,
        status: "fail",
      });

      allPassed = false;
      failedCount++;

      if (options.failFast) {
        logger.info("Stopping verification (--fail-fast mode)");
        break;
      }
    }
  }

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    warned: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
  };

  // Print summary table
  printSummaryTable(results);

  // Build report
  const durationMs = Date.now() - startTime;
  const report: VerificationReport = {
    verifiedAt: new Date().toISOString(),
    sourceDatabase: "supabase",
    targetDatabase: "new-postgres",
    options: {
      skipChecksum: options.skipChecksum ?? false,
      failFast: options.failFast ?? false,
      singleTable: options.table,
    },
    allPassed,
    summary,
    results,
    durationMs,
  };

  // Write report to file
  const outputPath = path.resolve(options.output);
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");

  logger.info({ outputPath }, "Wrote verification report");

  // Final summary
  console.log("\n=== Final Results ===\n");
  console.log(`Tables verified: ${summary.total}`);
  console.log(`  ${colors.green}Passed${colors.reset}: ${summary.passed}`);
  console.log(`  ${colors.yellow}Warned${colors.reset}: ${summary.warned}`);
  console.log(`  ${colors.red}Failed${colors.reset}: ${summary.failed}`);
  console.log(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`Report: ${outputPath}`);

  if (allPassed) {
    console.log(`\n${colors.green}${colors.bold}VERIFICATION PASSED${colors.reset} - All tables match\n`);
    logMigrationComplete("verify", durationMs, { summary, allPassed });
  } else {
    console.log(`\n${colors.red}${colors.bold}VERIFICATION FAILED${colors.reset} - ${failedCount} table(s) have mismatches\n`);
    logMigrationComplete("verify", durationMs, { summary, allPassed });
    process.exit(1);
  }
}

// Run the verification
main()
  .catch((error) => {
    logger.error(
      { error: error.message, stack: error.stack },
      "Verification failed"
    );
    console.error("\nVerification failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    // Clean up connections
    await closeSupabasePool();
    await closeNewDbPool();
    await closeLogger();
  });
