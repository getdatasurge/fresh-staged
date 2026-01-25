/**
 * TTN Settings Service
 *
 * Provides data access operations for TTN settings management.
 * Uses raw SQL since ttn_settings table is not in Drizzle schema.
 *
 * Operations:
 * - getTTNSettings: Retrieve TTN settings for organization
 * - updateTTNSettings: Update TTN settings
 * - updateTestResult: Update connection test result
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import type {
  TTNSettings,
  UpdateTTNSettings,
  TestConnectionResult,
  ProvisioningStatus,
} from '../schemas/ttn-settings.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw database row type with index signature for Drizzle compatibility
 */
type RawTTNSettingsRow = Record<string, unknown> & {
  organization_id: string;
  ttn_region: string | null;
  ttn_application_id: string | null;
  is_enabled: boolean;
  provisioning_status: string;
  provisioning_step: string | null;
  provisioning_started_at: string | null;
  provisioning_last_heartbeat_at: string | null;
  provisioning_attempt_count: number;
  provisioning_error: string | null;
  last_http_status: number | null;
  last_http_body: string | null;
  provisioning_last_step: string | null;
  provisioning_can_retry: boolean;
  provisioned_at: string | null;
  has_api_key: boolean;
  api_key_last4: string | null;
  api_key_updated_at: string | null;
  has_webhook_secret: boolean;
  webhook_secret_last4: string | null;
  webhook_url: string | null;
  webhook_id: string | null;
  webhook_events: string[] | null;
  last_connection_test_at: string | null;
  last_connection_test_result: unknown;
  last_updated_source: string | null;
  last_test_source: string | null;
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map legacy provisioning status values to new enum values
 */
function mapProvisioningStatus(status: string): ProvisioningStatus {
  if (status === 'not_started') return 'idle';
  if (status === 'completed') return 'ready';
  // Validate it's a known status, default to 'idle' if unknown
  const validStatuses: ProvisioningStatus[] = ['idle', 'provisioning', 'ready', 'failed'];
  return validStatuses.includes(status as ProvisioningStatus)
    ? (status as ProvisioningStatus)
    : 'idle';
}

/**
 * Map raw database row to TTNSettings type
 */
function mapRowToSettings(row: RawTTNSettingsRow): TTNSettings {
  return {
    organization_id: row.organization_id,
    ttn_region: row.ttn_region,
    ttn_application_id: row.ttn_application_id,
    is_enabled: row.is_enabled,
    provisioning_status: mapProvisioningStatus(row.provisioning_status),
    provisioning_step: row.provisioning_step,
    provisioning_started_at: row.provisioning_started_at,
    provisioning_last_heartbeat_at: row.provisioning_last_heartbeat_at,
    provisioning_attempt_count: row.provisioning_attempt_count,
    provisioning_error: row.provisioning_error,
    last_http_status: row.last_http_status,
    last_http_body: row.last_http_body,
    provisioning_last_step: row.provisioning_last_step,
    provisioning_can_retry: row.provisioning_can_retry,
    provisioned_at: row.provisioned_at,
    has_api_key: row.has_api_key,
    api_key_last4: row.api_key_last4,
    api_key_updated_at: row.api_key_updated_at,
    has_webhook_secret: row.has_webhook_secret,
    webhook_secret_last4: row.webhook_secret_last4,
    webhook_url: row.webhook_url,
    webhook_id: row.webhook_id,
    webhook_events: row.webhook_events,
    last_connection_test_at: row.last_connection_test_at,
    last_connection_test_result: row.last_connection_test_result,
    last_updated_source: row.last_updated_source,
    last_test_source: row.last_test_source,
  };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get TTN settings for an organization
 * @returns TTNSettings or null if not found
 */
export async function getTTNSettings(
  organizationId: string
): Promise<TTNSettings | null> {
  const result = await db.execute<RawTTNSettingsRow>(sql`
    SELECT * FROM ttn_settings
    WHERE organization_id = ${organizationId}
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToSettings(result.rows[0]);
}

/**
 * Update TTN settings for an organization
 * Only updates provided fields, sets last_updated_source to 'api'
 * @returns true if updated, false if no row found
 */
export async function updateTTNSettings(
  organizationId: string,
  data: UpdateTTNSettings
): Promise<boolean> {
  // Build SET clause dynamically based on provided fields
  const setClauses: string[] = ['last_updated_source = \'api\''];
  const values: unknown[] = [];

  if (data.is_enabled !== undefined) {
    setClauses.push(`is_enabled = $${values.length + 1}`);
    values.push(data.is_enabled);
  }

  if (data.ttn_region !== undefined) {
    setClauses.push(`ttn_region = $${values.length + 1}`);
    values.push(data.ttn_region);
  }

  if (data.webhook_url !== undefined) {
    setClauses.push(`webhook_url = $${values.length + 1}`);
    values.push(data.webhook_url);
  }

  if (data.webhook_events !== undefined) {
    setClauses.push(`webhook_events = $${values.length + 1}`);
    values.push(data.webhook_events);
  }

  // Use sql.raw for the dynamic SET clause and properly parameterize the WHERE
  const setClause = setClauses.join(', ');
  const result = await db.execute(sql`
    UPDATE ttn_settings
    SET ${sql.raw(setClause)}
    WHERE organization_id = ${organizationId}
  `);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Update connection test result for an organization
 * @returns true if updated, false if no row found
 */
export async function updateTestResult(
  organizationId: string,
  testResult: TestConnectionResult
): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE ttn_settings
    SET
      last_connection_test_at = ${testResult.testedAt ?? new Date().toISOString()},
      last_connection_test_result = ${JSON.stringify(testResult)}::jsonb,
      last_test_source = 'api'
    WHERE organization_id = ${organizationId}
  `);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Check if TTN is configured for an organization
 * @returns true if has API key configured
 */
export async function isTTNConfigured(
  organizationId: string
): Promise<boolean> {
  const settings = await getTTNSettings(organizationId);
  return settings !== null && settings.has_api_key;
}
