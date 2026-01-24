/**
 * User ID Mapping Utilities for FreshTrack Migration
 *
 * Manages the mapping between Supabase auth.users UUIDs and Stack Auth user IDs.
 * The mapping file persists to JSON and includes retention tracking (90 days).
 *
 * IMPORTANT: This mapping is critical for data migration. The mapping file should be
 * retained for at least 90 days after migration to allow for verification and
 * potential rollback scenarios.
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

/**
 * Represents a single user ID mapping entry
 */
export interface UserMapping {
  /** UUID from Supabase auth.users */
  supabaseUserId: string;
  /** UUID from Stack Auth */
  stackAuthUserId: string;
  /** Email address for debugging/verification */
  email: string;
  /** ISO timestamp when this user was migrated */
  migratedAt: string;
}

/**
 * Structure of the persisted mapping file
 */
export interface UserMappingFile {
  /** ISO timestamp when the mapping file was generated */
  generatedAt: string;
  /** ISO timestamp - mapping should be retained until this date (90 days from generation) */
  retainUntil: string;
  /** Array of user mappings */
  mappings: UserMapping[];
}

/**
 * Retention period for mapping files in days
 *
 * Mapping files should be retained for at least 90 days after migration to allow
 * for verification, auditing, and potential rollback scenarios.
 */
export const MAPPING_RETENTION_DAYS = 90;

/**
 * Default path for the user mapping file
 */
export const DEFAULT_MAPPING_PATH = "./migration-data/user-mapping.json";

/**
 * Load a user mapping file and return a Map for efficient lookup
 *
 * @param filePath - Path to the mapping JSON file
 * @returns Map with Supabase user ID as key and Stack Auth user ID as value
 * @throws Error if file doesn't exist or is invalid JSON
 */
export function loadMapping(filePath: string = DEFAULT_MAPPING_PATH): Map<string, string> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Mapping file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const mappingFile: UserMappingFile = JSON.parse(content);

  // Validate structure
  if (!mappingFile.generatedAt || !mappingFile.mappings || !Array.isArray(mappingFile.mappings)) {
    throw new Error(`Invalid mapping file structure: ${absolutePath}`);
  }

  // Check mapping age and warn if older than retention period
  const mappingAge = getMappingAge(filePath);
  if (mappingAge > MAPPING_RETENTION_DAYS) {
    logger.warn(
      {
        filePath: absolutePath,
        ageInDays: mappingAge,
        retentionDays: MAPPING_RETENTION_DAYS,
        retainUntil: mappingFile.retainUntil,
      },
      `Mapping file is ${mappingAge} days old (exceeds ${MAPPING_RETENTION_DAYS} day retention). ` +
        "This mapping may be stale. Consider regenerating if issues occur."
    );
  }

  // Build lookup map
  const mapping = new Map<string, string>();
  for (const entry of mappingFile.mappings) {
    mapping.set(entry.supabaseUserId, entry.stackAuthUserId);
  }

  logger.info(
    {
      filePath: absolutePath,
      mappingCount: mapping.size,
      generatedAt: mappingFile.generatedAt,
    },
    `Loaded ${mapping.size} user mappings from ${absolutePath}`
  );

  return mapping;
}

/**
 * Load the full mapping file with metadata
 *
 * @param filePath - Path to the mapping JSON file
 * @returns The complete UserMappingFile object
 */
export function loadMappingFile(filePath: string = DEFAULT_MAPPING_PATH): UserMappingFile {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Mapping file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  return JSON.parse(content) as UserMappingFile;
}

/**
 * Save user mappings to a JSON file with retention metadata
 *
 * @param filePath - Path to save the mapping file
 * @param mappings - Array of user mappings to save
 */
export function saveMapping(
  filePath: string = DEFAULT_MAPPING_PATH,
  mappings: UserMapping[]
): void {
  const absolutePath = path.resolve(filePath);
  const dir = path.dirname(absolutePath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info({ dir }, `Created mapping directory: ${dir}`);
  }

  const now = new Date();
  const retainUntil = new Date(now);
  retainUntil.setDate(retainUntil.getDate() + MAPPING_RETENTION_DAYS);

  const mappingFile: UserMappingFile = {
    generatedAt: now.toISOString(),
    retainUntil: retainUntil.toISOString(),
    mappings,
  };

  fs.writeFileSync(absolutePath, JSON.stringify(mappingFile, null, 2), "utf-8");

  logger.info(
    {
      filePath: absolutePath,
      mappingCount: mappings.length,
      generatedAt: mappingFile.generatedAt,
      retainUntil: mappingFile.retainUntil,
    },
    `Saved ${mappings.length} user mappings to ${absolutePath}`
  );
}

/**
 * Look up a Stack Auth user ID from a Supabase user ID
 *
 * @param mapping - Map loaded from loadMapping()
 * @param supabaseId - Supabase auth.users UUID to look up
 * @returns Stack Auth user ID, or null if not found
 */
export function mapUserId(mapping: Map<string, string>, supabaseId: string): string | null {
  const stackAuthId = mapping.get(supabaseId);

  if (!stackAuthId) {
    logger.warn(
      { supabaseId },
      `No mapping found for Supabase user ID: ${supabaseId}. This user may not have been migrated.`
    );
    return null;
  }

  return stackAuthId;
}

/**
 * Get the age of a mapping file in days
 *
 * @param filePath - Path to the mapping JSON file
 * @returns Number of days since the mapping was generated
 */
export function getMappingAge(filePath: string = DEFAULT_MAPPING_PATH): number {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return -1; // File doesn't exist
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const mappingFile: UserMappingFile = JSON.parse(content);

  const generatedDate = new Date(mappingFile.generatedAt);
  const now = new Date();
  const diffMs = now.getTime() - generatedDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if a mapping file exists
 *
 * @param filePath - Path to check
 * @returns true if the mapping file exists
 */
export function mappingExists(filePath: string = DEFAULT_MAPPING_PATH): boolean {
  return fs.existsSync(path.resolve(filePath));
}

/**
 * Get mapping statistics
 *
 * @param filePath - Path to the mapping JSON file
 * @returns Object with mapping statistics
 */
export function getMappingStats(filePath: string = DEFAULT_MAPPING_PATH): {
  exists: boolean;
  count: number;
  ageInDays: number;
  isExpired: boolean;
  generatedAt: string | null;
  retainUntil: string | null;
} {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      exists: false,
      count: 0,
      ageInDays: -1,
      isExpired: false,
      generatedAt: null,
      retainUntil: null,
    };
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const mappingFile: UserMappingFile = JSON.parse(content);
  const ageInDays = getMappingAge(filePath);

  return {
    exists: true,
    count: mappingFile.mappings.length,
    ageInDays,
    isExpired: ageInDays > MAPPING_RETENTION_DAYS,
    generatedAt: mappingFile.generatedAt,
    retainUntil: mappingFile.retainUntil,
  };
}

/**
 * Validate that all required Supabase IDs have mappings
 *
 * @param mapping - Map loaded from loadMapping()
 * @param requiredIds - Array of Supabase user IDs that must have mappings
 * @returns Object with validation results
 */
export function validateMappings(
  mapping: Map<string, string>,
  requiredIds: string[]
): {
  valid: boolean;
  missingIds: string[];
  foundCount: number;
  totalRequired: number;
} {
  const missingIds: string[] = [];

  for (const id of requiredIds) {
    if (!mapping.has(id)) {
      missingIds.push(id);
    }
  }

  return {
    valid: missingIds.length === 0,
    missingIds,
    foundCount: requiredIds.length - missingIds.length,
    totalRequired: requiredIds.length,
  };
}
