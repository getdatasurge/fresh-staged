/**
 * Notification Policy Service
 *
 * Provides CRUD operations for notification policies and effective policy resolution.
 * Replaces Supabase RPC function `get_effective_notification_policy` with backend implementation.
 *
 * Key features:
 * - Hierarchical policy inheritance: unit -> site -> org
 * - CRUD operations for policies at all scope levels
 * - Effective policy resolution with source tracking
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { units, areas, sites, organizations } from '../db/schema/index.js';

// ============================================================================
// Types
// ============================================================================

export type NotificationChannel = 'WEB_TOAST' | 'IN_APP_CENTER' | 'EMAIL' | 'SMS';
export type SeverityThreshold = 'INFO' | 'WARNING' | 'CRITICAL';
export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export interface EscalationStep {
  delay_minutes: number;
  channels: ('EMAIL' | 'SMS')[];
  contact_priority?: number;
  repeat: boolean;
}

export interface NotificationPolicy {
  id: string;
  organization_id: string | null;
  site_id: string | null;
  unit_id: string | null;
  alert_type: string;
  initial_channels: NotificationChannel[];
  requires_ack: boolean;
  ack_deadline_minutes: number | null;
  escalation_steps: EscalationStep[];
  send_resolved_notifications: boolean;
  reminders_enabled: boolean;
  reminder_interval_minutes: number | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string | null;
  quiet_hours_end_local: string | null;
  severity_threshold: SeverityThreshold;
  allow_warning_notifications: boolean;
  notify_roles: AppRole[];
  notify_site_managers: boolean;
  notify_assigned_users: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EffectiveNotificationPolicy {
  alert_type: string;
  initial_channels: NotificationChannel[];
  requires_ack: boolean;
  ack_deadline_minutes: number | null;
  escalation_steps: EscalationStep[];
  send_resolved_notifications: boolean;
  reminders_enabled: boolean;
  reminder_interval_minutes: number | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string | null;
  quiet_hours_end_local: string | null;
  severity_threshold: SeverityThreshold;
  allow_warning_notifications: boolean;
  notify_roles: AppRole[];
  notify_site_managers: boolean;
  notify_assigned_users: boolean;
  source_unit: boolean;
  source_site: boolean;
  source_org: boolean;
}

export interface PolicyScope {
  organization_id?: string;
  site_id?: string;
  unit_id?: string;
}

export interface PolicyInput {
  initial_channels?: NotificationChannel[];
  requires_ack?: boolean;
  ack_deadline_minutes?: number | null;
  escalation_steps?: EscalationStep[];
  send_resolved_notifications?: boolean;
  reminders_enabled?: boolean;
  reminder_interval_minutes?: number | null;
  quiet_hours_enabled?: boolean;
  quiet_hours_start_local?: string | null;
  quiet_hours_end_local?: string | null;
  severity_threshold?: SeverityThreshold;
  allow_warning_notifications?: boolean;
  notify_roles?: AppRole[];
  notify_site_managers?: boolean;
  notify_assigned_users?: boolean;
}

// ============================================================================
// Helper: Raw SQL queries for notification_policies table
// (Table exists in Supabase but not in Drizzle schema, using raw SQL)
// ============================================================================

// Raw DB row type with index signature for Drizzle compatibility
type RawPolicyRow = Record<string, unknown> & {
  id: string;
  organization_id: string | null;
  site_id: string | null;
  unit_id: string | null;
  alert_type: string;
  initial_channels: string[];
  requires_ack: boolean;
  ack_deadline_minutes: number | null;
  escalation_steps: unknown;
  send_resolved_notifications: boolean;
  reminders_enabled: boolean;
  reminder_interval_minutes: number | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string | null;
  quiet_hours_end_local: string | null;
  severity_threshold: string;
  allow_warning_notifications: boolean;
  notify_roles: string[] | null;
  notify_site_managers: boolean | null;
  notify_assigned_users: boolean | null;
  created_at: Date;
  updated_at: Date;
};

function mapRowToPolicy(row: RawPolicyRow): NotificationPolicy {
  // Parse escalation_steps - it may be JSON or already parsed
  let escalationSteps: EscalationStep[] = [];
  if (row.escalation_steps) {
    if (typeof row.escalation_steps === 'string') {
      try {
        escalationSteps = JSON.parse(row.escalation_steps);
      } catch {
        escalationSteps = [];
      }
    } else if (Array.isArray(row.escalation_steps)) {
      escalationSteps = row.escalation_steps as EscalationStep[];
    }
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    site_id: row.site_id,
    unit_id: row.unit_id,
    alert_type: row.alert_type,
    initial_channels: (row.initial_channels || []) as NotificationChannel[],
    requires_ack: row.requires_ack,
    ack_deadline_minutes: row.ack_deadline_minutes,
    escalation_steps: escalationSteps,
    send_resolved_notifications: row.send_resolved_notifications,
    reminders_enabled: row.reminders_enabled,
    reminder_interval_minutes: row.reminder_interval_minutes,
    quiet_hours_enabled: row.quiet_hours_enabled,
    quiet_hours_start_local: row.quiet_hours_start_local,
    quiet_hours_end_local: row.quiet_hours_end_local,
    severity_threshold: (row.severity_threshold || 'WARNING') as SeverityThreshold,
    allow_warning_notifications: row.allow_warning_notifications,
    notify_roles: (row.notify_roles || ['owner', 'admin']) as AppRole[],
    notify_site_managers: row.notify_site_managers ?? true,
    notify_assigned_users: row.notify_assigned_users ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List notification policies for a given scope
 * Only one of organizationId, siteId, or unitId should be provided to get
 * policies at that specific level.
 */
export async function listNotificationPolicies(scope: {
  organizationId?: string;
  siteId?: string;
  unitId?: string;
}): Promise<NotificationPolicy[]> {
  // Build parameterized query based on scope
  const query = scope.unitId
    ? sql`SELECT * FROM notification_policies WHERE unit_id = ${scope.unitId} ORDER BY alert_type`
    : scope.siteId
    ? sql`SELECT * FROM notification_policies WHERE site_id = ${scope.siteId} AND unit_id IS NULL ORDER BY alert_type`
    : scope.organizationId
    ? sql`SELECT * FROM notification_policies WHERE organization_id = ${scope.organizationId} AND site_id IS NULL AND unit_id IS NULL ORDER BY alert_type`
    : null;

  if (!query) {
    return [];
  }

  const rows = await db.execute<RawPolicyRow>(query);
  return rows.rows.map(mapRowToPolicy);
}

/**
 * Get a single notification policy by ID, verifying org membership
 */
export async function getNotificationPolicy(
  id: string,
  organizationId: string
): Promise<NotificationPolicy | null> {
  // Query with org verification through hierarchy
  const result = await db.execute<RawPolicyRow>(sql`
    SELECT np.* FROM notification_policies np
    LEFT JOIN units u ON np.unit_id = u.id
    LEFT JOIN areas a ON u.area_id = a.id OR np.site_id IS NOT NULL
    LEFT JOIN sites s ON a.site_id = s.id OR np.site_id = s.id OR np.organization_id IS NOT NULL
    WHERE np.id = ${id}
    AND (
      np.organization_id = ${organizationId}
      OR s.organization_id = ${organizationId}
    )
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPolicy(result.rows[0]);
}

/**
 * Upsert a notification policy
 * Handles the three unique constraints: (organization_id, alert_type), (site_id, alert_type), (unit_id, alert_type)
 */
export async function upsertNotificationPolicy(
  scope: PolicyScope,
  alertType: string,
  policy: PolicyInput
): Promise<NotificationPolicy> {
  // Determine the conflict clause based on scope
  let conflictClause: string;
  if (scope.unit_id) {
    conflictClause = '(unit_id, alert_type)';
  } else if (scope.site_id) {
    conflictClause = '(site_id, alert_type)';
  } else if (scope.organization_id) {
    conflictClause = '(organization_id, alert_type)';
  } else {
    throw new Error('Must provide organization_id, site_id, or unit_id');
  }

  // Serialize escalation_steps to JSON string
  const escalationStepsJson = policy.escalation_steps
    ? JSON.stringify(policy.escalation_steps)
    : '[]';

  const notifyRolesArray = policy.notify_roles || ['owner', 'admin'];

  const result = await db.execute<RawPolicyRow>(sql`
    INSERT INTO notification_policies (
      organization_id,
      site_id,
      unit_id,
      alert_type,
      initial_channels,
      requires_ack,
      ack_deadline_minutes,
      escalation_steps,
      send_resolved_notifications,
      reminders_enabled,
      reminder_interval_minutes,
      quiet_hours_enabled,
      quiet_hours_start_local,
      quiet_hours_end_local,
      severity_threshold,
      allow_warning_notifications,
      notify_roles,
      notify_site_managers,
      notify_assigned_users
    ) VALUES (
      ${scope.organization_id ?? null},
      ${scope.site_id ?? null},
      ${scope.unit_id ?? null},
      ${alertType},
      ${sql.raw(`ARRAY[${(policy.initial_channels || ['IN_APP_CENTER']).map(c => `'${c}'`).join(',')}]::text[]`)},
      ${policy.requires_ack ?? false},
      ${policy.ack_deadline_minutes ?? null},
      ${escalationStepsJson}::jsonb,
      ${policy.send_resolved_notifications ?? false},
      ${policy.reminders_enabled ?? false},
      ${policy.reminder_interval_minutes ?? null},
      ${policy.quiet_hours_enabled ?? false},
      ${policy.quiet_hours_start_local ?? null},
      ${policy.quiet_hours_end_local ?? null},
      ${policy.severity_threshold ?? 'WARNING'},
      ${policy.allow_warning_notifications ?? false},
      ${sql.raw(`ARRAY[${notifyRolesArray.map(r => `'${r}'`).join(',')}]::text[]`)},
      ${policy.notify_site_managers ?? true},
      ${policy.notify_assigned_users ?? false}
    )
    ON CONFLICT ${sql.raw(conflictClause)}
    DO UPDATE SET
      initial_channels = EXCLUDED.initial_channels,
      requires_ack = EXCLUDED.requires_ack,
      ack_deadline_minutes = EXCLUDED.ack_deadline_minutes,
      escalation_steps = EXCLUDED.escalation_steps,
      send_resolved_notifications = EXCLUDED.send_resolved_notifications,
      reminders_enabled = EXCLUDED.reminders_enabled,
      reminder_interval_minutes = EXCLUDED.reminder_interval_minutes,
      quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
      quiet_hours_start_local = EXCLUDED.quiet_hours_start_local,
      quiet_hours_end_local = EXCLUDED.quiet_hours_end_local,
      severity_threshold = EXCLUDED.severity_threshold,
      allow_warning_notifications = EXCLUDED.allow_warning_notifications,
      notify_roles = EXCLUDED.notify_roles,
      notify_site_managers = EXCLUDED.notify_site_managers,
      notify_assigned_users = EXCLUDED.notify_assigned_users,
      updated_at = NOW()
    RETURNING *
  `);

  return mapRowToPolicy(result.rows[0]);
}

/**
 * Delete a notification policy matching scope and alert type
 * @returns true if deleted, false if not found
 */
export async function deleteNotificationPolicy(
  scope: PolicyScope,
  alertType: string
): Promise<boolean> {
  if (!scope.unit_id && !scope.site_id && !scope.organization_id) {
    return false;
  }

  // Use parameterized query
  const result = scope.unit_id
    ? await db.execute(sql`DELETE FROM notification_policies WHERE unit_id = ${scope.unit_id} AND alert_type = ${alertType}`)
    : scope.site_id
    ? await db.execute(sql`DELETE FROM notification_policies WHERE site_id = ${scope.site_id} AND alert_type = ${alertType}`)
    : await db.execute(sql`DELETE FROM notification_policies WHERE organization_id = ${scope.organization_id} AND alert_type = ${alertType}`);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Get the effective notification policy for a unit and alert type.
 * Implements inheritance chain: unit -> site -> org
 *
 * This replaces the Supabase RPC function `get_effective_notification_policy`.
 *
 * Logic:
 * 1. Get the unit to find its area_id
 * 2. Get the area to find its site_id
 * 3. Get the site to find its organization_id
 * 4. Look for policy at unit level
 * 5. If not found, look at site level
 * 6. If not found, look at org level
 * 7. If not found, return null
 */
export async function getEffectiveNotificationPolicy(
  unitId: string,
  alertType: string
): Promise<EffectiveNotificationPolicy | null> {
  // First, resolve the hierarchy: unit -> area -> site -> org
  const hierarchyResult = await db
    .select({
      unitId: units.id,
      areaId: units.areaId,
      siteId: sites.id,
      organizationId: sites.organizationId,
    })
    .from(units)
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(eq(units.id, unitId))
    .limit(1);

  if (hierarchyResult.length === 0) {
    return null;
  }

  const { siteId, organizationId } = hierarchyResult[0];

  // Try unit level first
  const unitPolicy = await db.execute<RawPolicyRow>(sql`
    SELECT * FROM notification_policies
    WHERE unit_id = ${unitId} AND alert_type = ${alertType}
    LIMIT 1
  `);

  if (unitPolicy.rows.length > 0) {
    const policy = mapRowToPolicy(unitPolicy.rows[0]);
    return {
      alert_type: policy.alert_type,
      initial_channels: policy.initial_channels,
      requires_ack: policy.requires_ack,
      ack_deadline_minutes: policy.ack_deadline_minutes,
      escalation_steps: policy.escalation_steps,
      send_resolved_notifications: policy.send_resolved_notifications,
      reminders_enabled: policy.reminders_enabled,
      reminder_interval_minutes: policy.reminder_interval_minutes,
      quiet_hours_enabled: policy.quiet_hours_enabled,
      quiet_hours_start_local: policy.quiet_hours_start_local,
      quiet_hours_end_local: policy.quiet_hours_end_local,
      severity_threshold: policy.severity_threshold,
      allow_warning_notifications: policy.allow_warning_notifications,
      notify_roles: policy.notify_roles,
      notify_site_managers: policy.notify_site_managers,
      notify_assigned_users: policy.notify_assigned_users,
      source_unit: true,
      source_site: false,
      source_org: false,
    };
  }

  // Try site level
  const sitePolicy = await db.execute<RawPolicyRow>(sql`
    SELECT * FROM notification_policies
    WHERE site_id = ${siteId} AND unit_id IS NULL AND alert_type = ${alertType}
    LIMIT 1
  `);

  if (sitePolicy.rows.length > 0) {
    const policy = mapRowToPolicy(sitePolicy.rows[0]);
    return {
      alert_type: policy.alert_type,
      initial_channels: policy.initial_channels,
      requires_ack: policy.requires_ack,
      ack_deadline_minutes: policy.ack_deadline_minutes,
      escalation_steps: policy.escalation_steps,
      send_resolved_notifications: policy.send_resolved_notifications,
      reminders_enabled: policy.reminders_enabled,
      reminder_interval_minutes: policy.reminder_interval_minutes,
      quiet_hours_enabled: policy.quiet_hours_enabled,
      quiet_hours_start_local: policy.quiet_hours_start_local,
      quiet_hours_end_local: policy.quiet_hours_end_local,
      severity_threshold: policy.severity_threshold,
      allow_warning_notifications: policy.allow_warning_notifications,
      notify_roles: policy.notify_roles,
      notify_site_managers: policy.notify_site_managers,
      notify_assigned_users: policy.notify_assigned_users,
      source_unit: false,
      source_site: true,
      source_org: false,
    };
  }

  // Try org level
  const orgPolicy = await db.execute<RawPolicyRow>(sql`
    SELECT * FROM notification_policies
    WHERE organization_id = ${organizationId} AND site_id IS NULL AND unit_id IS NULL AND alert_type = ${alertType}
    LIMIT 1
  `);

  if (orgPolicy.rows.length > 0) {
    const policy = mapRowToPolicy(orgPolicy.rows[0]);
    return {
      alert_type: policy.alert_type,
      initial_channels: policy.initial_channels,
      requires_ack: policy.requires_ack,
      ack_deadline_minutes: policy.ack_deadline_minutes,
      escalation_steps: policy.escalation_steps,
      send_resolved_notifications: policy.send_resolved_notifications,
      reminders_enabled: policy.reminders_enabled,
      reminder_interval_minutes: policy.reminder_interval_minutes,
      quiet_hours_enabled: policy.quiet_hours_enabled,
      quiet_hours_start_local: policy.quiet_hours_start_local,
      quiet_hours_end_local: policy.quiet_hours_end_local,
      severity_threshold: policy.severity_threshold,
      allow_warning_notifications: policy.allow_warning_notifications,
      notify_roles: policy.notify_roles,
      notify_site_managers: policy.notify_site_managers,
      notify_assigned_users: policy.notify_assigned_users,
      source_unit: false,
      source_site: false,
      source_org: true,
    };
  }

  // No policy found at any level
  return null;
}
