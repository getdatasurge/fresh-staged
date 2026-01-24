#!/usr/bin/env tsx
/**
 * migrate-users.ts - Create users in Stack Auth from Supabase export
 *
 * This script reads a Supabase auth.users JSON export and creates corresponding
 * users in Stack Auth via their REST API. A mapping file is generated tracking
 * old Supabase IDs to new Stack Auth IDs.
 *
 * IMPORTANT: Password Migration Limitation
 * -----------------------------------------
 * Supabase uses bcrypt password hashes stored in auth.users.encrypted_password.
 * Stack Auth does not support importing pre-hashed passwords. As a result:
 * - Users will be created WITHOUT passwords
 * - Users MUST reset their passwords after migration using "forgot password" flow
 * - Plan to send password reset emails to all users post-migration
 *
 * Usage:
 *   pnpm exec tsx migrate-users.ts --input ./migration-data/auth_users.json
 *   pnpm exec tsx migrate-users.ts --dry-run  # Preview without API calls
 *
 * Required environment variables:
 *   STACK_AUTH_PROJECT_ID - Stack Auth project identifier
 *   STACK_AUTH_SECRET_KEY - Stack Auth server secret key
 */

import "dotenv/config";
import { Command } from "commander";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import {
  saveMapping,
  type UserMapping,
  DEFAULT_MAPPING_PATH,
  MAPPING_RETENTION_DAYS,
} from "./lib/user-mapping.js";
import {
  logger,
  logMigrationStart,
  logMigrationProgress,
  logMigrationComplete,
  logMigrationError,
  closeLogger,
} from "./lib/logger.js";

/**
 * Supabase auth.users record structure (partial - only fields we need)
 */
interface SupabaseUser {
  id: string; // UUID
  email: string;
  email_confirmed_at: string | null;
  raw_user_meta_data?: {
    name?: string;
    full_name?: string;
    display_name?: string;
  };
  created_at: string;
}

/**
 * Stack Auth user creation payload
 */
interface StackAuthUserCreate {
  email: string;
  email_verified: boolean;
  display_name?: string;
}

/**
 * Stack Auth user creation response (partial)
 */
interface StackAuthUser {
  id: string;
  primary_email: string;
  primary_email_verified: boolean;
  display_name: string | null;
}

/**
 * Migration result for a single user
 */
interface MigrationResult {
  supabaseId: string;
  email: string;
  success: boolean;
  stackAuthId?: string;
  error?: string;
}

/**
 * Create a user in Stack Auth via REST API
 */
async function createStackAuthUser(
  userData: StackAuthUserCreate,
  projectId: string,
  secretKey: string
): Promise<StackAuthUser> {
  const response = await fetch("https://api.stack-auth.com/api/v1/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-stack-access-type": "server",
      "x-stack-project-id": projectId,
      "x-stack-secret-server-key": secretKey,
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stack Auth API error: ${response.status} ${errorText}`);
  }

  return (await response.json()) as StackAuthUser;
}

/**
 * Extract display name from Supabase user metadata
 */
function extractDisplayName(user: SupabaseUser): string | undefined {
  const meta = user.raw_user_meta_data;
  if (!meta) return undefined;
  return meta.display_name || meta.full_name || meta.name;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main migration function
 */
async function migrateUsers(options: {
  input: string;
  output: string;
  dryRun: boolean;
  rateLimit: number;
}): Promise<void> {
  const { input, output, dryRun, rateLimit } = options;

  // Validate environment variables (only required for non-dry-run)
  const projectId = process.env.STACK_AUTH_PROJECT_ID;
  const secretKey = process.env.STACK_AUTH_SECRET_KEY;

  if (!dryRun && (!projectId || !secretKey)) {
    throw new Error(
      "Missing required environment variables: STACK_AUTH_PROJECT_ID and STACK_AUTH_SECRET_KEY"
    );
  }

  // Load Supabase users export
  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  logMigrationStart("user-migration", {
    inputFile: inputPath,
    outputFile: path.resolve(output),
    dryRun,
    rateLimit,
  });

  const content = fs.readFileSync(inputPath, "utf-8");
  let users: SupabaseUser[];

  try {
    users = JSON.parse(content);
    if (!Array.isArray(users)) {
      throw new Error("Expected array of users");
    }
  } catch (err) {
    throw new Error(`Failed to parse input file: ${err instanceof Error ? err.message : err}`);
  }

  logger.info({ userCount: users.length }, `Loaded ${users.length} users from Supabase export`);

  if (dryRun) {
    console.log("\n=== DRY RUN MODE ===");
    console.log("No users will be created in Stack Auth.\n");
  }

  const startTime = Date.now();
  const results: MigrationResult[] = [];
  const mappings: UserMapping[] = [];

  const spinner = ora({
    text: `Migrating users: 0/${users.length}`,
    prefixText: dryRun ? "[DRY RUN] " : "",
  }).start();

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const result: MigrationResult = {
      supabaseId: user.id,
      email: user.email,
      success: false,
    };

    try {
      const userData: StackAuthUserCreate = {
        email: user.email,
        email_verified: user.email_confirmed_at !== null,
        display_name: extractDisplayName(user),
      };

      if (dryRun) {
        // Simulate successful creation
        result.success = true;
        result.stackAuthId = `dry-run-${user.id.substring(0, 8)}`;
        logger.debug(
          { supabaseId: user.id, email: user.email, userData },
          "[DRY RUN] Would create user"
        );
      } else {
        // Actually create user in Stack Auth
        const stackAuthUser = await createStackAuthUser(userData, projectId!, secretKey!);
        result.success = true;
        result.stackAuthId = stackAuthUser.id;
        logger.debug(
          { supabaseId: user.id, stackAuthId: stackAuthUser.id, email: user.email },
          "Created user in Stack Auth"
        );
      }

      // Add to mappings
      mappings.push({
        supabaseUserId: user.id,
        stackAuthUserId: result.stackAuthId!,
        email: user.email,
        migratedAt: new Date().toISOString(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      result.error = errorMessage;

      // Handle duplicate email gracefully
      if (errorMessage.includes("already exists") || errorMessage.includes("duplicate")) {
        logger.warn(
          { supabaseId: user.id, email: user.email, error: errorMessage },
          "User may already exist in Stack Auth (duplicate email)"
        );
      } else {
        logMigrationError("create-user", err, { supabaseId: user.id, email: user.email });
      }
    }

    results.push(result);

    // Update spinner
    const successCount = results.filter((r) => r.success).length;
    spinner.text = `Migrating users: ${i + 1}/${users.length} (${successCount} successful)`;

    // Log progress periodically
    if ((i + 1) % 100 === 0) {
      logMigrationProgress("user-migration", i + 1, users.length, { successCount });
    }

    // Rate limiting (skip for last user)
    if (!dryRun && i < users.length - 1 && rateLimit > 0) {
      await sleep(rateLimit);
    }
  }

  spinner.stop();

  // Calculate statistics
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const duration = Date.now() - startTime;

  // Save mapping file
  if (mappings.length > 0) {
    saveMapping(output, mappings);
    console.log(`\nMapping file saved: ${path.resolve(output)}`);
    console.log(`  Retention period: ${MAPPING_RETENTION_DAYS} days`);
  }

  // Log failed users for manual resolution
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    logger.warn({ failedCount: failed.length }, "Some users failed to migrate:");
    for (const f of failed) {
      logger.warn({ supabaseId: f.supabaseId, email: f.email, error: f.error }, "Failed user");
    }
    console.log(`\nFailed users (${failed.length}):`);
    for (const f of failed.slice(0, 10)) {
      console.log(`  - ${f.email}: ${f.error}`);
    }
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more (see migration.log)`);
    }
  }

  // Summary
  console.log("\n=== Migration Summary ===");
  console.log(`Total users:      ${users.length}`);
  console.log(`Successful:       ${successCount}`);
  console.log(`Failed:           ${failCount}`);
  console.log(`Duration:         ${(duration / 1000).toFixed(1)}s`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes were made to Stack Auth.");
    console.log("Remove --dry-run to perform actual migration.");
  } else {
    console.log("\n=== IMPORTANT: Password Reset Required ===");
    console.log("Passwords cannot be migrated from Supabase to Stack Auth.");
    console.log("Users must reset their passwords using the 'forgot password' flow.");
    console.log("Consider sending password reset emails to all migrated users.");
  }

  logMigrationComplete("user-migration", duration, {
    total: users.length,
    success: successCount,
    failed: failCount,
    dryRun,
  });
}

// CLI setup
const program = new Command();

program
  .name("migrate-users")
  .description("Create users in Stack Auth from Supabase auth.users export")
  .option("-i, --input <path>", "Input JSON file with Supabase users", "./migration-data/auth_users.json")
  .option("-o, --output <path>", "Output mapping file path", DEFAULT_MAPPING_PATH)
  .option("-d, --dry-run", "Preview migration without creating users", false)
  .option("-r, --rate-limit <ms>", "Milliseconds between API calls", "100")
  .action(async (options) => {
    try {
      await migrateUsers({
        input: options.input,
        output: options.output,
        dryRun: options.dryRun,
        rateLimit: parseInt(options.rateLimit, 10),
      });
    } catch (err) {
      logMigrationError("migrate-users", err);
      console.error("\nMigration failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    } finally {
      await closeLogger();
    }
  });

program.parse();
