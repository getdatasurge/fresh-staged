/**
 * Test script to verify database connections
 * Run with: pnpm exec tsx test-connections.ts
 *
 * Requires .env file with:
 * - SUPABASE_DB_URL
 * - DATABASE_URL
 */

import 'dotenv/config';
import { logger, closeLogger } from './lib/logger.js';
import { testSupabaseConnection, closeSupabasePool } from './lib/supabase-client.js';
import { testNewDbConnection, closeNewDbPool } from './lib/new-db-client.js';

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('FreshTrack Migration - Connection Test');
  logger.info('='.repeat(50));

  let supabaseOk = false;
  let newDbOk = false;

  // Test Supabase connection
  logger.info('');
  logger.info('1. Testing Supabase PostgreSQL connection...');
  try {
    supabaseOk = await testSupabaseConnection();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Supabase connection test threw an error',
    );
  }

  // Test new database connection
  logger.info('');
  logger.info('2. Testing new PostgreSQL connection...');
  try {
    newDbOk = await testNewDbConnection();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'New database connection test threw an error',
    );
  }

  // Summary
  logger.info('');
  logger.info('='.repeat(50));
  logger.info('Connection Test Summary');
  logger.info('='.repeat(50));
  logger.info({ status: supabaseOk ? 'OK' : 'FAILED' }, 'Supabase PostgreSQL');
  logger.info({ status: newDbOk ? 'OK' : 'FAILED' }, 'New PostgreSQL');
  logger.info('');

  if (supabaseOk && newDbOk) {
    logger.info('All connections successful! Ready for migration.');
  } else {
    logger.error('One or more connections failed. Check configuration.');
    process.exitCode = 1;
  }

  // Cleanup
  await closeSupabasePool();
  await closeNewDbPool();
  await closeLogger();
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
