#!/usr/bin/env tsx
/**
 * Export script for FreshTrack data migration
 *
 * Exports all tables from Supabase PostgreSQL to JSON files.
 * Handles both small tables (in-memory) and large tables (streaming).
 *
 * Usage:
 *   pnpm export                    # Export all tables
 *   pnpm export --dry-run          # List tables without exporting
 *   pnpm export --table sites      # Export single table
 *   pnpm export --skip-large       # Skip sensor_readings, event_logs, alerts
 *   pnpm export --output-dir ./out # Custom output directory
 */

import 'dotenv/config';
import { Command } from 'commander';
import ora, { type Ora } from 'ora';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  logger,
  logMigrationStart,
  logMigrationComplete,
  logMigrationError,
  closeLogger,
} from '../lib/logger.js';
import { supabasePool, testSupabaseConnection, closeSupabasePool } from '../lib/supabase-client.js';
import { getTableImportOrder, TABLE_IMPORT_ORDER, type TableName } from '../lib/table-metadata.js';
import {
  getTableRowCount,
  streamTableToJson,
  exportSmallTable,
  exportAuthUsers,
  shouldUseStreaming,
  STREAMING_THRESHOLD,
  LARGE_TABLES,
} from '../lib/stream-helpers.js';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI program setup
const program = new Command()
  .name('export')
  .description('Export FreshTrack data from Supabase to JSON files')
  .version('1.0.0')
  .option('-o, --output-dir <path>', 'Output directory for JSON files', './migration-data')
  .option('-t, --table <name>', 'Export a single table only')
  .option('--skip-large', 'Skip large tables (sensor_readings, event_logs, alerts)')
  .option('--skip-auth', 'Skip auth.users export')
  .option('--dry-run', 'List tables without exporting')
  .parse(process.argv);

// CLI options interface
interface ExportOptions {
  outputDir: string;
  table?: string;
  skipLarge?: boolean;
  skipAuth?: boolean;
  dryRun?: boolean;
}

// Export metadata structure
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
 * Validate that a table name is in the import order
 */
function validateTableName(tableName: string): tableName is TableName {
  return (TABLE_IMPORT_ORDER as readonly string[]).includes(tableName);
}

/**
 * Get tables to export based on options
 */
function getTablesToExport(options: ExportOptions): TableName[] {
  const allTables = getTableImportOrder();

  // Single table mode
  if (options.table) {
    if (!validateTableName(options.table)) {
      throw new Error(`Unknown table: ${options.table}. Valid tables: ${allTables.join(', ')}`);
    }
    return [options.table];
  }

  // Filter out large tables if requested
  if (options.skipLarge) {
    return allTables.filter((t) => !(LARGE_TABLES as readonly string[]).includes(t)) as TableName[];
  }

  return [...allTables];
}

/**
 * Display dry-run information
 */
async function dryRun(options: ExportOptions): Promise<void> {
  const tables = getTablesToExport(options);

  console.log('\n=== DRY RUN: Export Plan ===\n');
  console.log(`Output directory: ${path.resolve(options.outputDir)}`);
  console.log(`Tables to export: ${tables.length}`);
  console.log(`Skip large tables: ${options.skipLarge ? 'Yes' : 'No'}`);
  console.log(`Skip auth.users: ${options.skipAuth ? 'Yes' : 'No'}`);
  console.log('');

  // Test connection first
  const spinner = ora('Testing Supabase connection...').start();
  const connected = await testSupabaseConnection();

  if (!connected) {
    spinner.fail('Supabase connection failed');
    console.log('\nSet SUPABASE_DB_URL in .env to enable row counts in dry-run mode.');
    console.log('\n--- Tables (dependency order) ---\n');
    tables.forEach((table, index) => {
      const isLarge = (LARGE_TABLES as readonly string[]).includes(table);
      const marker = isLarge ? ' [LARGE]' : '';
      console.log(`  ${String(index + 1).padStart(2)}. ${table}${marker}`);
    });
    if (!options.skipAuth) {
      console.log(`\n  + auth.users (user mapping data)`);
    }
    return;
  }

  spinner.succeed('Supabase connection OK');
  console.log('\n--- Tables (with row counts) ---\n');

  let totalRows = 0;
  for (const table of tables) {
    try {
      const count = await getTableRowCount(supabasePool, table);
      totalRows += count;
      const method = shouldUseStreaming(table, count) ? 'streaming' : 'memory';
      const isLarge = (LARGE_TABLES as readonly string[]).includes(table);
      const marker = isLarge ? ' [LARGE]' : '';
      console.log(`  ${table.padEnd(25)} ${String(count).padStart(10)} rows  (${method})${marker}`);
    } catch (error) {
      console.log(`  ${table.padEnd(25)} [ERROR: ${(error as Error).message}]`);
    }
  }

  // Check auth.users if not skipped
  if (!options.skipAuth) {
    try {
      const authCount = await getTableRowCount(supabasePool, 'users', 'auth');
      console.log(`\n  auth.users${' '.repeat(14)} ${String(authCount).padStart(10)} rows`);
      totalRows += authCount;
    } catch (error) {
      console.log(`\n  auth.users              [ERROR: ${(error as Error).message}]`);
    }
  }

  console.log(`\n--- Total: ${totalRows.toLocaleString()} rows ---\n`);
}

/**
 * Export a single table with progress tracking
 */
async function exportTable(
  table: TableName,
  outputPath: string,
  spinner: Ora,
): Promise<{ rowCount: number; exportMethod: 'streaming' | 'small-table'; durationMs: number }> {
  const startTime = Date.now();

  // Get row count to determine export method
  const rowCount = await getTableRowCount(supabasePool, table);
  const useStreaming = shouldUseStreaming(table, rowCount);
  const method = useStreaming ? 'streaming' : 'small-table';

  spinner.text = `Exporting ${table} (${rowCount.toLocaleString()} rows, ${useStreaming ? 'streaming' : 'in-memory'})...`;

  if (useStreaming) {
    await streamTableToJson(supabasePool, table, outputPath);
  } else {
    await exportSmallTable(supabasePool, table, outputPath);
  }

  const durationMs = Date.now() - startTime;
  return { rowCount, exportMethod: method, durationMs };
}

/**
 * Main export function
 */
async function main(): Promise<void> {
  const options = program.opts<ExportOptions>();
  const startTime = Date.now();

  logMigrationStart('export', { options });

  // Dry run mode
  if (options.dryRun) {
    await dryRun(options);
    return;
  }

  // Test connection
  const spinner = ora('Testing Supabase connection...').start();
  const connected = await testSupabaseConnection();

  if (!connected) {
    spinner.fail('Supabase connection failed');
    logMigrationError('export', new Error('Supabase connection failed'));
    process.exit(1);
  }
  spinner.succeed('Supabase connection OK');

  // Resolve output directory
  const outputDir = path.resolve(options.outputDir);
  spinner.start(`Creating output directory: ${outputDir}`);
  await fs.mkdir(outputDir, { recursive: true });
  spinner.succeed(`Output directory ready: ${outputDir}`);

  // Get tables to export
  const tables = getTablesToExport(options);
  logger.info({ tableCount: tables.length }, `Exporting ${tables.length} tables`);

  // Initialize metadata
  const metadata: ExportMetadata = {
    exportedAt: new Date().toISOString(),
    sourceDatabase: 'supabase',
    version: '1.0.0',
    options: {
      skipLarge: options.skipLarge ?? false,
      skipAuth: options.skipAuth ?? false,
      singleTable: options.table,
    },
    tables: {},
    totalDurationMs: 0,
  };

  // Export each table
  let exportedCount = 0;
  const exportSpinner = ora().start();

  for (const table of tables) {
    exportedCount++;
    const progressPrefix = `[${exportedCount}/${tables.length}]`;

    try {
      const outputPath = path.join(outputDir, `${table}.json`);
      exportSpinner.text = `${progressPrefix} Exporting ${table}...`;

      const result = await exportTable(table, outputPath, exportSpinner);

      metadata.tables[table] = result;
      exportSpinner.succeed(
        `${progressPrefix} ${table}: ${result.rowCount.toLocaleString()} rows (${result.durationMs}ms)`,
      );

      logger.info(
        {
          table,
          rowCount: result.rowCount,
          exportMethod: result.exportMethod,
          durationMs: result.durationMs,
        },
        `Exported ${table}`,
      );
    } catch (error) {
      exportSpinner.fail(`${progressPrefix} ${table}: FAILED`);
      logMigrationError('export', error, { table });
      throw error; // Fail fast
    }
  }

  // Export auth.users separately if not skipped
  if (!options.skipAuth) {
    exportSpinner.start('Exporting auth.users...');
    try {
      const authStartTime = Date.now();
      const authOutputPath = path.join(outputDir, 'auth_users.json');
      const authRowCount = await exportAuthUsers(supabasePool, authOutputPath);
      const authDuration = Date.now() - authStartTime;

      metadata.authUsers = {
        rowCount: authRowCount,
        durationMs: authDuration,
      };

      exportSpinner.succeed(
        `auth.users: ${authRowCount.toLocaleString()} rows (${authDuration}ms)`,
      );
      logger.info({ rowCount: authRowCount, durationMs: authDuration }, 'Exported auth.users');
    } catch (error) {
      exportSpinner.fail('auth.users: FAILED');
      logMigrationError('export', error, { table: 'auth.users' });
      // Continue even if auth.users fails - it requires special permissions
      logger.warn('auth.users export failed - continuing without it');
    }
  }

  // Finalize metadata
  const totalDurationMs = Date.now() - startTime;
  metadata.totalDurationMs = totalDurationMs;

  // Write metadata file
  const metadataPath = path.join(outputDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  logger.info({ metadataPath }, 'Wrote export metadata');

  // Summary
  const totalRows =
    Object.values(metadata.tables).reduce((sum, t) => sum + t.rowCount, 0) +
    (metadata.authUsers?.rowCount ?? 0);

  console.log('\n=== Export Complete ===');
  console.log(`Tables exported: ${Object.keys(metadata.tables).length}`);
  console.log(`Total rows: ${totalRows.toLocaleString()}`);
  console.log(`Duration: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Output: ${outputDir}`);
  console.log(`Metadata: ${metadataPath}`);

  logMigrationComplete('export', totalDurationMs, {
    tables: Object.keys(metadata.tables).length,
    totalRows,
    outputDir,
  });
}

// Run the export
main()
  .catch((error) => {
    logger.error({ error: error.message, stack: error.stack }, 'Export failed');
    console.error('\nExport failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    // Clean up connections
    await closeSupabasePool();
    await closeLogger();
  });
