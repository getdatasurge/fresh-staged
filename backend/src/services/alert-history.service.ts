import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { alertRules, alertRulesHistory } from '../db/schema/alerts.js';
import { profiles } from '../db/schema/users.js';

export interface AlertHistoryEntry {
  id: string;
  alertRuleId: string;
  changeType: string;
  oldValues: string | null;
  newValues: string | null;
  changedAt: Date;
  changedBy: string | null;
  userEmail: string | null;
  userName: string | null;
}

export async function getAlertHistory(
  scope: { organizationId?: string; siteId?: string; unitId?: string },
  limit: number = 20,
): Promise<AlertHistoryEntry[]> {
  const conditions = [];

  if (scope.organizationId) conditions.push(eq(alertRules.organizationId, scope.organizationId));
  if (scope.siteId) conditions.push(eq(alertRules.siteId, scope.siteId));
  if (scope.unitId) conditions.push(eq(alertRules.unitId, scope.unitId));

  const query = db
    .select({
      id: alertRulesHistory.id,
      alertRuleId: alertRulesHistory.alertRuleId,
      changeType: alertRulesHistory.changeType,
      oldValues: alertRulesHistory.oldValues,
      newValues: alertRulesHistory.newValues,
      changedAt: alertRulesHistory.changedAt,
      changedBy: alertRulesHistory.changedBy,
      userEmail: profiles.email,
      userName: profiles.fullName,
    })
    .from(alertRulesHistory)
    .innerJoin(alertRules, eq(alertRulesHistory.alertRuleId, alertRules.id))
    .leftJoin(profiles, eq(alertRulesHistory.changedBy, profiles.id))
    .where(and(...conditions))
    .orderBy(desc(alertRulesHistory.changedAt))
    .limit(limit);

  const results = await query;

  return results.map((r) => ({
    ...r,
    userName: r.userName || 'System',
  }));
}

export async function createHistory(
  userId: string,
  data: {
    alertRuleId: string;
    organizationId?: string;
    siteId?: string;
    unitId?: string;
    changeType: string;
    oldValues?: any;
    newValues: any;
    note?: string; // Not in schema? Check schema
  },
) {
  // Check schema for 'note', 'organizationId' etc.
  // pgTable alertRulesHistory only has: alertRuleId, changedBy, changeType, oldValues, newValues, changedAt.
  // It does NOT have organizationId, siteId, unitId, note.
  // So we can only insert what matches table.
  // If useAlertRulesHistory tries to insert orgId/note, they are dropped or stored in values?

  // Checking schema again:
  /*
  export const alertRulesHistory = pgTable('alert_rules_history', {
    id, alertRuleId, changedBy, changeType, oldValues, newValues, changedAt
  })
  */
  // No note, no orgId.
  // So insertAlertRulesHistory in frontend is trying to insert fields that DON'T EXIST in backend schema?
  // "if (scope.organization_id) insertData.organization_id = scope.organization_id;"
  // If Supabase allows this, then DB schema has these columns but Drizzle doesn't.
  // Or Supabase insert fails silently?
  // Or I am looking at outdated schema.

  // I will act according to Drizzle schema.

  await db.insert(alertRulesHistory).values({
    alertRuleId: data.alertRuleId,
    changedBy: userId,
    changeType: data.changeType,
    oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
    newValues: data.newValues ? JSON.stringify(data.newValues) : null,
  });
}
