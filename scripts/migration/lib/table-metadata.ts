/**
 * Table metadata for FreshTrack migration
 *
 * Defines the import order respecting foreign key dependencies
 * and identifies columns that require user ID mapping.
 */

/**
 * Table import order - respects foreign key dependencies
 *
 * Tables must be imported in this order to avoid FK constraint violations.
 * Each level depends only on tables from previous levels.
 */
export const TABLE_IMPORT_ORDER = [
  // Level 0: No dependencies - root tables
  "organizations",

  // Level 1: Depends on organizations only
  "subscriptions", // organization_id -> organizations
  "profiles", // organization_id -> organizations
  "sites", // organization_id -> organizations
  "ttn_connections", // organization_id -> organizations

  // Level 2: Depends on Level 1 tables
  "user_roles", // user_id -> profiles, organization_id -> organizations
  "escalation_contacts", // profile_id -> profiles, organization_id -> organizations
  "areas", // site_id -> sites
  "hubs", // site_id -> sites
  "alert_rules", // organization_id -> organizations, site_id -> sites (nullable unit_id)

  // Level 3: Depends on Level 2 tables
  "units", // area_id -> areas
  "devices", // hub_id -> hubs (nullable unit_id -> units)

  // Level 4: Depends on Level 3 tables
  "lora_sensors", // device_id -> devices
  "calibration_records", // device_id -> devices
  "sensor_readings", // unit_id -> units, device_id -> devices
  "manual_temperature_logs", // unit_id -> units, profile_id -> profiles
  "door_events", // unit_id -> units

  // Level 5: Depends on units and alert_rules
  "alerts", // unit_id -> units
  "alert_rules_history", // alert_rule_id -> alert_rules

  // Level 6: Depends on alerts
  "corrective_actions", // alert_id -> alerts, unit_id -> units, profile_id -> profiles
  "notification_deliveries", // alert_id -> alerts, profile_id -> profiles

  // Level 7: Standalone tables (no FK dependencies but import last for completeness)
  "event_logs", // organization_id -> organizations (audit trail - import last)
  "pairing_sessions", // device_id -> devices (temporary pairing data)
] as const;

/**
 * Type for table names based on TABLE_IMPORT_ORDER
 */
export type TableName = (typeof TABLE_IMPORT_ORDER)[number];

/**
 * Tables that contain user ID columns requiring mapping
 *
 * Maps table names to arrays of column names that reference user IDs.
 * These columns need to be mapped from Supabase auth.users UUIDs
 * to Stack Auth user IDs during migration.
 */
export const TABLES_WITH_USER_IDS: Record<string, string[]> = {
  // profiles.user_id is the primary user identifier from Supabase auth.users
  profiles: ["user_id"],

  // user_roles.user_id references the profile's user_id
  user_roles: ["user_id"],

  // escalation_contacts.profile_id references profiles (which has user_id)
  escalation_contacts: ["profile_id"],

  // manual_temperature_logs.profile_id references the user who logged the entry
  manual_temperature_logs: ["profile_id"],

  // corrective_actions.profile_id references the user who performed the action
  corrective_actions: ["profile_id"],

  // notification_deliveries.profile_id references the notification recipient
  notification_deliveries: ["profile_id"],

  // event_logs.actor_id references the user who performed the action
  event_logs: ["actor_id"],
};

/**
 * Get the full ordered list of tables for import
 */
export function getTableImportOrder(): readonly TableName[] {
  return TABLE_IMPORT_ORDER;
}

/**
 * Check if a table requires user ID mapping
 *
 * @param tableName - Name of the table to check
 * @returns true if the table has columns requiring user ID mapping
 */
export function requiresUserMapping(tableName: string): boolean {
  return tableName in TABLES_WITH_USER_IDS;
}

/**
 * Get the column names that require user ID mapping for a table
 *
 * @param tableName - Name of the table
 * @returns Array of column names that need user ID mapping, or empty array if none
 */
export function getUserIdColumns(tableName: string): string[] {
  return TABLES_WITH_USER_IDS[tableName] ?? [];
}

/**
 * Get the dependency level of a table
 *
 * Useful for debugging and understanding table relationships.
 * Tables at level N can only reference tables at levels 0 to N-1.
 *
 * @param tableName - Name of the table
 * @returns Dependency level (0-7), or -1 if table not found
 */
export function getTableLevel(tableName: string): number {
  const levelBoundaries: Record<number, string[]> = {
    0: ["organizations"],
    1: ["subscriptions", "profiles", "sites", "ttn_connections"],
    2: ["user_roles", "escalation_contacts", "areas", "hubs", "alert_rules"],
    3: ["units", "devices"],
    4: [
      "lora_sensors",
      "calibration_records",
      "sensor_readings",
      "manual_temperature_logs",
      "door_events",
    ],
    5: ["alerts", "alert_rules_history"],
    6: ["corrective_actions", "notification_deliveries"],
    7: ["event_logs", "pairing_sessions"],
  };

  for (const [level, tables] of Object.entries(levelBoundaries)) {
    if (tables.includes(tableName)) {
      return parseInt(level, 10);
    }
  }

  return -1; // Table not found
}

/**
 * Validate that a table name is known
 *
 * @param tableName - Name to validate
 * @returns true if the table is in the import order
 */
export function isKnownTable(tableName: string): tableName is TableName {
  return (TABLE_IMPORT_ORDER as readonly string[]).includes(tableName);
}

/**
 * Get tables grouped by dependency level
 *
 * Useful for parallel processing - tables at the same level have no
 * dependencies on each other and can potentially be imported in parallel.
 */
export function getTablesByLevel(): Map<number, string[]> {
  const levels = new Map<number, string[]>();

  for (const table of TABLE_IMPORT_ORDER) {
    const level = getTableLevel(table);
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push(table);
  }

  return levels;
}

/**
 * Count of tables in the import order
 */
export const TABLE_COUNT = TABLE_IMPORT_ORDER.length;

/**
 * Count of tables requiring user ID mapping
 */
export const TABLES_WITH_USER_IDS_COUNT = Object.keys(TABLES_WITH_USER_IDS).length;
