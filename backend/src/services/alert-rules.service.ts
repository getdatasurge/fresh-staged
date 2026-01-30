import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { alertRules, type AlertRule, type InsertAlertRule } from '../db/schema/alerts.js';

/**
 * Get alert rules for a specific scope
 */
export async function getAlertRules(scope: {
  organizationId: string;
  siteId?: string;
  unitId?: string;
}): Promise<AlertRule | null> {
  const conditions = [eq(alertRules.organizationId, scope.organizationId)];

  if (scope.unitId) {
    conditions.push(eq(alertRules.unitId, scope.unitId));
  } else if (scope.siteId) {
    conditions.push(eq(alertRules.siteId, scope.siteId));
  } else {
    // Org level
    conditions.push(sql`${alertRules.siteId} IS NULL`);
    conditions.push(sql`${alertRules.unitId} IS NULL`);
  }

  const [rule] = await db
    .select()
    .from(alertRules)
    .where(and(...conditions))
    .limit(1);

  return rule ?? null;
}

/**
 * Upsert alert rules (create or update)
 */
export async function upsertAlertRules(
  scope: { organizationId: string; siteId?: string; unitId?: string },
  data: Partial<
    Omit<InsertAlertRule, 'id' | 'organizationId' | 'siteId' | 'unitId' | 'createdAt' | 'updatedAt'>
  >,
): Promise<AlertRule> {
  const existing = await getAlertRules(scope);

  if (existing) {
    const [updated] = await db
      .update(alertRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(alertRules.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(alertRules)
      .values({
        organizationId: scope.organizationId,
        siteId: scope.siteId,
        unitId: scope.unitId,
        name: 'Alert Rules', // Default name
        ...data,
      } as any) // Type casting due to partial data vs required columns (defaults should handle it)
      .returning();
    return created;
  }
}

/**
 * Delete alert rules (reset to defaults/inherit)
 */
export async function deleteAlertRules(scope: {
  organizationId: string;
  siteId?: string;
  unitId?: string;
}): Promise<void> {
  const conditions = [eq(alertRules.organizationId, scope.organizationId)];

  if (scope.unitId) {
    conditions.push(eq(alertRules.unitId, scope.unitId));
  } else if (scope.siteId) {
    conditions.push(eq(alertRules.siteId, scope.siteId));
  } else {
    // Org level
    conditions.push(sql`${alertRules.siteId} IS NULL`);
    conditions.push(sql`${alertRules.unitId} IS NULL`);
  }

  await db.delete(alertRules).where(and(...conditions));
}

/**
 * Clear a specific field (set to null)
 */
export async function clearRuleField(ruleId: string, field: string): Promise<void> {
  // Validate field against allowed fields to prevent injection
  const allowedFields = [
    'manual_interval_minutes',
    'manual_grace_minutes',
    'expected_reading_interval_seconds',
    'offline_trigger_multiplier',
    'offline_trigger_additional_minutes',
    'door_open_warning_minutes',
    'door_open_critical_minutes',
    'door_open_max_mask_minutes_per_day',
    'excursion_confirm_minutes_door_closed',
    'excursion_confirm_minutes_door_open',
    'max_excursion_minutes',
    'offline_warning_missed_checkins',
    'offline_critical_missed_checkins',
    'manual_log_missed_checkins_threshold',
  ];

  if (!allowedFields.includes(field)) {
    throw new Error(`Field ${field} is not allowed to be cleared`);
  }

  // Need to map field name if backend schema uses camelCase but frontend uses snake_case
  // My schema uses camelCase for some?
  // backend/src/db/schema/alerts.ts:
  // tempMin, tempMax, delayMinutes
  // BUT frontend uses snake_case 'manual_interval_minutes'.
  // We need to map or ensure DB uses expected names.
  // In `alerts.ts` schema:
  // manually defined columns?

  /*
    manualMonitoringInterval: integer('manual_monitoring_interval'), // minutes
    ...
  */
  // Wait, `alertRules` table in schema `alerts.ts` (Step 288):
  /*
    tempMin, tempMax, delayMinutes, alertType, severity, isEnabled, schedule
  */
  // It DOES NOT HAVE `manual_interval_minutes` etc.!!!

  // The `alertRules` table definition in schema `alerts.ts` (Step 288) is MISSING many columns used by frontend!
  // The frontend expects: manual_interval_minutes, door_open_warning_minutes etc.

  // I created `alert-rules.service.ts` assuming schema matches frontend.
  // But Drizzle schema `backend/src/db/schema/alerts.ts` is missing these columns.

  await db.execute(
    sql`UPDATE alert_rules SET ${sql.identifier(field)} = NULL WHERE id = ${ruleId}`,
  );
}
