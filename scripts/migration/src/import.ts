#!/usr/bin/env tsx
/**
 * Import script for FreshTrack data migration
 *
 * Imports JSON export files into the new PostgreSQL database.
 * Handles user ID mapping for tables that reference Supabase auth.users.
 *
 * Usage:
 *   pnpm import                        # Import all tables
 *   pnpm import --dry-run              # Validate files exist without importing
 *   pnpm import --table sites          # Import single table
 *   pnpm import --truncate-first --yes # Truncate before import (DANGER!)
 *   pnpm import --disable-fk           # Disable FK checks during import
 *   pnpm import --input-dir ./data     # Custom input directory
 *
 * IMPORTANT: This script MODIFIES the target database. Always:
 * 1. Run with --dry-run first to validate export files
 * 2. Have a backup/rollback strategy before running
 * 3. Use --truncate-first only when you want to restart from scratch
 */

import 'dotenv/config';
import { Command } from 'commander';
import ora, { type Ora } from 'ora';
import path from 'node:path';
import fs from 'node:fs/promises';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  logger,
  logMigrationStart,
  logMigrationComplete,
  logMigrationError,
  closeLogger,
} from '../lib/logger.js';
import { newDbPool, testNewDbConnection, closeNewDbPool } from '../lib/new-db-client.js';
import {
  getTableImportOrder,
  requiresUserMapping,
  getUserIdColumns,
  TABLE_IMPORT_ORDER,
  type TableName,
} from '../lib/table-metadata.js';
import { loadMapping, mappingExists } from '../lib/user-mapping.js';
import {
  importTable,
  importTableWithMapping,
  truncateAllTables,
  disableForeignKeys,
  enableForeignKeys,
  jsonFileExists,
  getJsonRowCount,
  type ImportResult,
} from '../lib/import-helpers.js';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI program setup
const program = new Command()
  .name('import')
  .description('Import FreshTrack data from JSON files into new PostgreSQL database')
  .version('1.0.0')
  .option(
    '-i, --input-dir <path>',
    'Input directory containing JSON export files',
    './migration-data',
  )
  .option(
    '-m, --mapping <path>',
    'Path to user mapping JSON file',
    './migration-data/user-mapping.json',
  )
  .option('-t, --table <name>', 'Import a single table only')
  .option('--truncate-first', 'Truncate target tables before import (DANGER! requires --yes)')
  .option('--disable-fk', 'Disable foreign key checks during import')
  .option('--yes', 'Skip confirmation prompts (required for --truncate-first)')
  .option('--dry-run', 'Validate export files exist without importing')
  .parse(process.argv);

// CLI options interface
interface ImportOptions {
  inputDir: string;
  mapping: string;
  table?: string;
  truncateFirst?: boolean;
  disableFk?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

// Import metadata structure (matches export metadata)
interface ExportMetadata {
  exportedAt: string;
  sourceDatabase: string;
  version: string;
  options: {
    skipLarge: boolean;
    skipAuth: boolean;
    singleTable?: string;
  };
  tables: Record<
    string,
    {
      rowCount: number;
      exportMethod: 'streaming' | 'small-table';
      durationMs: number;
    }
  >;
  authUsers?: {
    rowCount: number;
    durationMs: number;
  };
  totalDurationMs: number;
}

/**
 * Prompt user for confirmation
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Validate that a table name is in the import order
 */
function validateTableName(tableName: string): tableName is TableName {
  return (TABLE_IMPORT_ORDER as readonly string[]).includes(tableName);
}

/**
 * Get tables to import based on options and available files
 */
async function getTablesToImport(
  options: ImportOptions,
  metadata: ExportMetadata | null,
): Promise<TableName[]> {
  const allTables = getTableImportOrder();

  // Single table mode
  if (options.table) {
    if (!validateTableName(options.table)) {
      throw new Error(`Unknown table: ${options.table}. Valid tables: ${allTables.join(', ')}`);
    }
    return [options.table];
  }

  // If we have metadata, only import tables that were exported
  if (metadata) {
    const exportedTables = Object.keys(metadata.tables);
    return allTables.filter((t) => exportedTables.includes(t));
  }

  // Otherwise, return all tables and let import handle missing files
  return [...allTables];
}

/**
 * Display dry-run information
 */
async function dryRun(options: ImportOptions): Promise<void> {
  const inputDir = path.resolve(options.inputDir);

  console.log('\n=== DRY RUN: Import Plan ===\n');
  console.log(`Input directory: ${inputDir}`);
  console.log(`Mapping file: ${path.resolve(options.mapping)}`);
  console.log(`Truncate first: ${options.truncateFirst ? 'Yes' : 'No'}`);
  console.log(`Disable FK checks: ${options.disableFk ? 'Yes' : 'No'}`);
  console.log('');

  // Check if metadata exists
  const metadataPath = path.join(inputDir, 'metadata.json');
  let metadata: ExportMetadata | null = null;

  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(metadataContent);
    console.log(`Export metadata found:`);
    console.log(`  - Exported at: ${metadata!.exportedAt}`);
    console.log(`  - Tables exported: ${Object.keys(metadata!.tables).length}`);
    console.log('');
  } catch {
    console.log('WARNING: No metadata.json found in input directory');
    console.log('Will attempt to import all known tables.\n');
  }

  // Check user mapping file
  const mappingPath = path.resolve(options.mapping);
  if (await mappingExists(mappingPath)) {
    console.log('User mapping file: FOUND');
    const mapping = loadMapping(mappingPath);
    console.log(`  - Mappings: ${mapping.size}`);
  } else {
    console.log('User mapping file: NOT FOUND');
    console.log('  WARNING: Tables with user IDs will keep original Supabase IDs');
  }
  console.log('');

  // Get tables to import
  const tables = await getTablesToImport(options, metadata);
  console.log('--- Tables to Import (dependency order) ---\n');

  let totalRows = 0;
  let foundFiles = 0;
  let missingFiles = 0;

  for (const table of tables) {
    const jsonPath = path.join(inputDir, `${table}.json`);
    const exists = await jsonFileExists(jsonPath);

    if (exists) {
      const rowCount = await getJsonRowCount(jsonPath);
      totalRows += rowCount;
      foundFiles++;

      const needsMapping = requiresUserMapping(table);
      const mappingMark = needsMapping ? ' [USER-ID]' : '';
      const columns = needsMapping ? ` (${getUserIdColumns(table).join(', ')})` : '';

      console.log(
        `  ${table.padEnd(25)} ${String(rowCount).padStart(10)} rows  OK${mappingMark}${columns}`,
      );
    } else {
      missingFiles++;
      console.log(`  ${table.padEnd(25)} ${' '.repeat(10)}       MISSING`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total rows to import: ${totalRows.toLocaleString()}`);
  console.log(`Files found: ${foundFiles}`);
  console.log(`Files missing: ${missingFiles}`);

  if (missingFiles > 0) {
    console.log('\nWARNING: Missing files will be skipped during import.');
  }

  // Test database connection
  console.log('\n--- Database Connection ---\n');
  const spinner = ora('Testing target database connection...').start();
  const connected = await testNewDbConnection();

  if (connected) {
    spinner.succeed('Target database connection OK');
  } else {
    spinner.fail('Target database connection FAILED');
    console.log('\nSet DATABASE_URL in .env to enable import to target database.');
  }
}

/**
 * Main import function
 */
async function main(): Promise<void> {
  const options = program.opts<ImportOptions>();
  const startTime = Date.now();

  logMigrationStart('import', { options });

  // Dry run mode
  if (options.dryRun) {
    await dryRun(options);
    return;
  }

  // Validate truncate-first requires --yes
  if (options.truncateFirst && !options.yes) {
    console.error('ERROR: --truncate-first requires --yes flag for confirmation');
    console.error('This operation will DELETE ALL DATA in target tables!');
    process.exit(1);
  }

  // Resolve paths
  const inputDir = path.resolve(options.inputDir);
  const mappingPath = path.resolve(options.mapping);

  // Test database connection
  const spinner = ora('Testing target database connection...').start();
  const connected = await testNewDbConnection();

  if (!connected) {
    spinner.fail('Target database connection failed');
    logMigrationError('import', new Error('Target database connection failed'));
    process.exit(1);
  }
  spinner.succeed('Target database connection OK');

  // Load export metadata
  const metadataPath = path.join(inputDir, 'metadata.json');
  let metadata: ExportMetadata | null = null;

  spinner.start('Loading export metadata...');
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(metadataContent);
    spinner.succeed(
      `Export metadata loaded (${Object.keys(metadata!.tables).length} tables exported at ${metadata!.exportedAt})`,
    );
  } catch {
    spinner.warn('No metadata.json found - will attempt to import all known tables');
  }

  // Load user mapping if it exists
  let userMapping = new Map<string, string>();
  spinner.start('Loading user mapping...');

  if (await mappingExists(mappingPath)) {
    try {
      userMapping = loadMapping(mappingPath);
      spinner.succeed(`User mapping loaded (${userMapping.size} mappings)`);
    } catch (error) {
      spinner.fail(`Failed to load user mapping: ${(error as Error).message}`);
      logMigrationError('import', error, { mappingPath });
      process.exit(1);
    }
  } else {
    spinner.warn('User mapping file not found - tables with user IDs will keep original values');
    logger.warn(
      { mappingPath },
      'User mapping not found - import will proceed without user ID transformation',
    );
  }

  // Handle truncate-first option
  if (options.truncateFirst) {
    if (!options.yes) {
      const confirmed = await promptConfirmation(
        "This will DELETE ALL DATA in target tables. Type 'yes' to confirm: ",
      );
      if (!confirmed) {
        console.log('Aborted.');
        process.exit(1);
      }
    }

    spinner.start('Truncating target tables...');
    try {
      // Truncate in REVERSE dependency order
      const reverseOrder = [...TABLE_IMPORT_ORDER].reverse();
      await truncateAllTables(newDbPool, reverseOrder);
      spinner.succeed('All tables truncated');
    } catch (error) {
      spinner.fail(`Truncate failed: ${(error as Error).message}`);
      logMigrationError('import', error);
      process.exit(1);
    }
  }

  // Handle disable-fk option
  if (options.disableFk) {
    spinner.start('Disabling foreign key checks...');
    try {
      await disableForeignKeys(newDbPool);
      spinner.succeed('Foreign key checks disabled');
    } catch (error) {
      spinner.fail(`Failed to disable FK checks: ${(error as Error).message}`);
      logMigrationError('import', error);
      process.exit(1);
    }
  }

  // Get tables to import
  const tables = await getTablesToImport(options, metadata);
  logger.info({ tableCount: tables.length }, `Importing ${tables.length} tables`);

  // Track import results
  const results: ImportResult[] = [];
  let importedCount = 0;
  let skippedCount = 0;
  let totalMappingsApplied = 0;
  let totalMappingsNotFound = 0;

  // Import each table
  const importSpinner = ora().start();

  for (const table of tables) {
    const progressPrefix = `[${importedCount + skippedCount + 1}/${tables.length}]`;
    const jsonPath = path.join(inputDir, `${table}.json`);

    // Check if file exists
    if (!(await jsonFileExists(jsonPath))) {
      importSpinner.warn(`${progressPrefix} ${table}: SKIPPED (file not found)`);
      logger.warn({ table, jsonPath }, 'Skipping table - JSON file not found');
      skippedCount++;
      continue;
    }

    try {
      importSpinner.text = `${progressPrefix} Importing ${table}...`;

      let result: ImportResult;

      if (requiresUserMapping(table)) {
        const userIdColumns = getUserIdColumns(table);
        result = await importTableWithMapping(
          newDbPool,
          table,
          jsonPath,
          userMapping,
          userIdColumns,
        );
        totalMappingsApplied += result.mappingsApplied ?? 0;
        totalMappingsNotFound += result.mappingsNotFound ?? 0;
      } else {
        result = await importTable(newDbPool, table, jsonPath);
      }

      results.push(result);
      importedCount++;

      const mappingInfo =
        result.mappingsApplied !== undefined
          ? ` (${result.mappingsApplied} mapped, ${result.mappingsNotFound} not found)`
          : '';

      importSpinner.succeed(
        `${progressPrefix} ${table}: ${result.rowCount.toLocaleString()} rows (${result.durationMs}ms)${mappingInfo}`,
      );

      logger.info(
        {
          table,
          rowCount: result.rowCount,
          durationMs: result.durationMs,
          mappingsApplied: result.mappingsApplied,
          mappingsNotFound: result.mappingsNotFound,
        },
        `Imported ${table}`,
      );
    } catch (error) {
      importSpinner.fail(`${progressPrefix} ${table}: FAILED`);
      logMigrationError('import', error, { table });

      // Fail fast - re-enable FK checks if needed and exit
      if (options.disableFk) {
        try {
          await enableForeignKeys(newDbPool);
        } catch {
          // Ignore cleanup errors
        }
      }

      throw error;
    }
  }

  // Re-enable foreign key checks if they were disabled
  if (options.disableFk) {
    importSpinner.start('Re-enabling foreign key checks...');
    try {
      await enableForeignKeys(newDbPool);
      importSpinner.succeed('Foreign key checks re-enabled');
    } catch (error) {
      importSpinner.fail(`Failed to re-enable FK checks: ${(error as Error).message}`);
      logger.error({ error: (error as Error).message }, 'Failed to re-enable FK checks');
      // Don't exit - import was successful, this is just cleanup
    }
  }

  // Calculate totals
  const totalDurationMs = Date.now() - startTime;
  const totalRows = results.reduce((sum, r) => sum + r.rowCount, 0);

  // Summary
  console.log('\n=== Import Complete ===');
  console.log(`Tables imported: ${importedCount}`);
  console.log(`Tables skipped: ${skippedCount}`);
  console.log(`Total rows: ${totalRows.toLocaleString()}`);
  console.log(`User ID mappings applied: ${totalMappingsApplied}`);
  console.log(`User ID mappings not found: ${totalMappingsNotFound}`);
  console.log(`Duration: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Input: ${inputDir}`);

  logMigrationComplete('import', totalDurationMs, {
    tables: importedCount,
    skipped: skippedCount,
    totalRows,
    mappingsApplied: totalMappingsApplied,
    mappingsNotFound: totalMappingsNotFound,
    inputDir,
  });
}

// Run the import
main()
  .catch((error) => {
    logger.error({ error: error.message, stack: error.stack }, 'Import failed');
    console.error('\nImport failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    // Clean up connections
    await closeNewDbPool();
    await closeLogger();
  });
