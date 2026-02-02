#!/usr/bin/env tsx
/**
 * map-users.ts - Generate user ID mapping from existing users
 *
 * This script generates a mapping file by matching users that already exist
 * in both Supabase and Stack Auth. Useful for:
 * - Users who were manually created in Stack Auth
 * - Users who self-registered after migration announcement
 * - Regenerating mapping after partial migration
 *
 * Users are matched by email address (case-insensitive).
 *
 * Usage:
 *   pnpm exec tsx map-users.ts --supabase-export ./migration-data/auth_users.json
 *   pnpm exec tsx map-users.ts --help
 *
 * Required environment variables:
 *   STACK_AUTH_PROJECT_ID - Stack Auth project identifier
 *   STACK_AUTH_SECRET_KEY - Stack Auth server secret key
 */

import 'dotenv/config';
import { Command } from 'commander';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveMapping,
  type UserMapping,
  DEFAULT_MAPPING_PATH,
  MAPPING_RETENTION_DAYS,
} from './lib/user-mapping.js';
import {
  logger,
  logMigrationStart,
  logMigrationComplete,
  logMigrationError,
  closeLogger,
} from './lib/logger.js';

/**
 * Supabase auth.users record structure (partial)
 */
interface SupabaseUser {
  id: string;
  email: string;
  created_at: string;
}

/**
 * Stack Auth user from list API (partial)
 */
interface StackAuthUser {
  id: string;
  primary_email: string;
  primary_email_verified: boolean;
  display_name: string | null;
}

/**
 * Stack Auth list users response
 */
interface StackAuthListResponse {
  items: StackAuthUser[];
  pagination_result: {
    has_more: boolean;
    cursor: string | null;
  };
}

/**
 * Fetch all users from Stack Auth using pagination
 */
async function fetchAllStackAuthUsers(
  projectId: string,
  secretKey: string,
): Promise<StackAuthUser[]> {
  const allUsers: StackAuthUser[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const url = new URL('https://api.stack-auth.com/api/v1/users');
    url.searchParams.set('limit', '100'); // Max per page
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-stack-access-type': 'server',
        'x-stack-project-id': projectId,
        'x-stack-secret-server-key': secretKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stack Auth API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as StackAuthListResponse;
    allUsers.push(...data.items);

    hasMore = data.pagination_result.has_more;
    cursor = data.pagination_result.cursor;

    logger.debug(
      { fetched: data.items.length, total: allUsers.length, hasMore },
      'Fetched Stack Auth users page',
    );
  }

  return allUsers;
}

/**
 * Main mapping function
 */
async function mapUsers(options: {
  supabaseExport: string;
  output: string;
  matchBy: 'email' | 'metadata';
}): Promise<void> {
  const { supabaseExport, output, matchBy } = options;

  // Validate environment variables
  const projectId = process.env.STACK_AUTH_PROJECT_ID;
  const secretKey = process.env.STACK_AUTH_SECRET_KEY;

  if (!projectId || !secretKey) {
    throw new Error(
      'Missing required environment variables: STACK_AUTH_PROJECT_ID and STACK_AUTH_SECRET_KEY',
    );
  }

  if (matchBy !== 'email') {
    throw new Error('Currently only email matching is supported. Use --match-by email');
  }

  // Load Supabase users export
  const inputPath = path.resolve(supabaseExport);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Supabase export file not found: ${inputPath}`);
  }

  logMigrationStart('user-mapping-generation', {
    supabaseExport: inputPath,
    outputFile: path.resolve(output),
    matchBy,
  });

  const content = fs.readFileSync(inputPath, 'utf-8');
  let supabaseUsers: SupabaseUser[];

  try {
    supabaseUsers = JSON.parse(content);
    if (!Array.isArray(supabaseUsers)) {
      throw new Error('Expected array of users');
    }
  } catch (err) {
    throw new Error(`Failed to parse Supabase export: ${err instanceof Error ? err.message : err}`);
  }

  logger.info(
    { count: supabaseUsers.length },
    `Loaded ${supabaseUsers.length} users from Supabase export`,
  );

  // Fetch all Stack Auth users
  const spinner = ora('Fetching users from Stack Auth...').start();
  let stackAuthUsers: StackAuthUser[];

  try {
    stackAuthUsers = await fetchAllStackAuthUsers(projectId, secretKey);
    spinner.succeed(`Fetched ${stackAuthUsers.length} users from Stack Auth`);
  } catch (err) {
    spinner.fail('Failed to fetch Stack Auth users');
    throw err;
  }

  logger.info(
    { count: stackAuthUsers.length },
    `Loaded ${stackAuthUsers.length} users from Stack Auth`,
  );

  // Build Stack Auth email -> user map (case-insensitive)
  const stackAuthByEmail = new Map<string, StackAuthUser>();
  for (const user of stackAuthUsers) {
    if (user.primary_email) {
      stackAuthByEmail.set(user.primary_email.toLowerCase(), user);
    }
  }

  // Match users by email
  const matchedMappings: UserMapping[] = [];
  const unmatchedSupabase: SupabaseUser[] = [];

  spinner.start('Matching users by email...');

  for (const supabaseUser of supabaseUsers) {
    const emailLower = supabaseUser.email.toLowerCase();
    const stackAuthUser = stackAuthByEmail.get(emailLower);

    if (stackAuthUser) {
      matchedMappings.push({
        supabaseUserId: supabaseUser.id,
        stackAuthUserId: stackAuthUser.id,
        email: supabaseUser.email,
        migratedAt: new Date().toISOString(),
      });

      // Remove from stackAuth map to track unmatched Stack Auth users
      stackAuthByEmail.delete(emailLower);
    } else {
      unmatchedSupabase.push(supabaseUser);
    }
  }

  spinner.stop();

  // Unmatched Stack Auth users (new registrations since export)
  const unmatchedStackAuth = Array.from(stackAuthByEmail.values());

  // Save mapping file
  if (matchedMappings.length > 0) {
    saveMapping(output, matchedMappings);
    console.log(`\nMapping file saved: ${path.resolve(output)}`);
    console.log(`  Retention period: ${MAPPING_RETENTION_DAYS} days`);
  } else {
    console.log('\nNo matching users found. No mapping file generated.');
  }

  // Report unmatched Supabase users
  if (unmatchedSupabase.length > 0) {
    logger.warn(
      { count: unmatchedSupabase.length },
      'Supabase users with no Stack Auth match (need manual creation)',
    );
    console.log(`\nUnmatched Supabase users (${unmatchedSupabase.length}):`);
    console.log('  These users need to be created in Stack Auth or migrated manually.');
    for (const u of unmatchedSupabase.slice(0, 10)) {
      console.log(`  - ${u.email} (${u.id})`);
    }
    if (unmatchedSupabase.length > 10) {
      console.log(`  ... and ${unmatchedSupabase.length - 10} more (see migration.log)`);
    }

    // Log all to file
    for (const u of unmatchedSupabase) {
      logger.info({ supabaseId: u.id, email: u.email }, 'Unmatched Supabase user');
    }
  }

  // Report unmatched Stack Auth users (informational)
  if (unmatchedStackAuth.length > 0) {
    logger.info(
      { count: unmatchedStackAuth.length },
      'Stack Auth users not in Supabase export (new registrations)',
    );
    console.log(`\nStack Auth-only users (${unmatchedStackAuth.length}):`);
    console.log('  These users registered after the Supabase export (no action needed).');
    for (const u of unmatchedStackAuth.slice(0, 5)) {
      console.log(`  - ${u.primary_email}`);
    }
    if (unmatchedStackAuth.length > 5) {
      console.log(`  ... and ${unmatchedStackAuth.length - 5} more`);
    }
  }

  // Summary
  console.log('\n=== Mapping Summary ===');
  console.log(`Supabase users:          ${supabaseUsers.length}`);
  console.log(`Stack Auth users:        ${stackAuthUsers.length}`);
  console.log(`Matched (mapped):        ${matchedMappings.length}`);
  console.log(`Unmatched (Supabase):    ${unmatchedSupabase.length}`);
  console.log(`Unmatched (Stack Auth):  ${unmatchedStackAuth.length}`);

  if (unmatchedSupabase.length > 0) {
    console.log('\nACTION REQUIRED:');
    console.log(`  ${unmatchedSupabase.length} Supabase users have no Stack Auth account.`);
    console.log('  Run migrate-users.ts to create them, or create manually.');
  }

  logMigrationComplete('user-mapping-generation', 0, {
    supabaseCount: supabaseUsers.length,
    stackAuthCount: stackAuthUsers.length,
    matchedCount: matchedMappings.length,
    unmatchedSupabaseCount: unmatchedSupabase.length,
    unmatchedStackAuthCount: unmatchedStackAuth.length,
  });
}

// CLI setup
const program = new Command();

program
  .name('map-users')
  .description('Generate user ID mapping from existing users in both systems')
  .option(
    '-s, --supabase-export <path>',
    'Supabase auth_users.json export file',
    './migration-data/auth_users.json',
  )
  .option('-o, --output <path>', 'Output mapping file path', DEFAULT_MAPPING_PATH)
  .option('-m, --match-by <method>', 'Matching method: email | metadata', 'email')
  .action(async (options) => {
    try {
      await mapUsers({
        supabaseExport: options.supabaseExport,
        output: options.output,
        matchBy: options.matchBy as 'email' | 'metadata',
      });
    } catch (err) {
      logMigrationError('map-users', err);
      console.error('\nMapping failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    } finally {
      await closeLogger();
    }
  });

program.parse();
