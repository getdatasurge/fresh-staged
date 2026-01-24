import { eq, and, inArray, desc, gte, lte, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  alerts,
  correctiveActions,
  units,
  areas,
  sites,
  type Alert,
  type InsertCorrectiveAction,
} from '../db/schema/index.js';
import type { AlertQuery } from '../schemas/alerts.js';

/**
 * Verify alert belongs to organization via unit -> area -> site -> org hierarchy
 * @returns Alert if accessible, null otherwise
 */
export async function verifyAlertAccess(
  alertId: string,
  organizationId: string
): Promise<Alert | null> {
  const [result] = await db
    .select({ alert: alerts })
    .from(alerts)
    .innerJoin(units, eq(alerts.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(
      and(
        eq(alerts.id, alertId),
        eq(sites.organizationId, organizationId),
        eq(units.isActive, true),
        eq(areas.isActive, true),
        eq(sites.isActive, true)
      )
    )
    .limit(1);

  return result?.alert || null;
}

/**
 * List alerts for organization with filtering and pagination
 * Enforces org isolation via hierarchy joins
 */
export async function listAlerts(
  organizationId: string,
  params: AlertQuery
): Promise<Alert[]> {
  const {
    unitId,
    status,
    severity,
    start,
    end,
    limit = 100,
    offset = 0,
  } = params;

  // Build where conditions
  const conditions = [
    eq(sites.organizationId, organizationId),
    eq(units.isActive, true),
    eq(areas.isActive, true),
    eq(sites.isActive, true),
  ];

  if (unitId) {
    conditions.push(eq(alerts.unitId, unitId));
  }

  if (status) {
    conditions.push(eq(alerts.status, status));
  }

  if (severity) {
    conditions.push(eq(alerts.severity, severity));
  }

  if (start) {
    conditions.push(gte(alerts.triggeredAt, new Date(start)));
  }

  if (end) {
    conditions.push(lte(alerts.triggeredAt, new Date(end)));
  }

  // Query alerts with hierarchy validation
  const results = await db
    .select({ alert: alerts })
    .from(alerts)
    .innerJoin(units, eq(alerts.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(and(...conditions))
    .orderBy(desc(alerts.triggeredAt))
    .limit(limit)
    .offset(offset);

  return results.map((r) => r.alert);
}

/**
 * Get single alert with hierarchy validation
 */
export async function getAlert(
  alertId: string,
  organizationId: string
): Promise<Alert | null> {
  return verifyAlertAccess(alertId, organizationId);
}

/**
 * Acknowledge an alert
 * @returns Alert if acknowledged, 'already_acknowledged' if already in that state, null if not found
 */
export async function acknowledgeAlert(
  alertId: string,
  organizationId: string,
  profileId: string,
  notes?: string
): Promise<Alert | 'already_acknowledged' | null> {
  // Verify access first
  const alert = await verifyAlertAccess(alertId, organizationId);
  if (!alert) {
    return null;
  }

  // Check if already acknowledged
  if (alert.status === 'acknowledged') {
    return 'already_acknowledged';
  }

  // Update alert to acknowledged
  const [updated] = await db
    .update(alerts)
    .set({
      status: 'acknowledged',
      acknowledgedAt: new Date(),
      acknowledgedBy: profileId,
      metadata: notes
        ? JSON.stringify({ acknowledgementNotes: notes })
        : alert.metadata,
      updatedAt: new Date(),
    })
    .where(eq(alerts.id, alertId))
    .returning();

  return updated || null;
}

/**
 * Resolve an alert with optional corrective action
 * @returns Resolved alert or null if not found
 */
export async function resolveAlert(
  alertId: string,
  organizationId: string,
  profileId: string,
  resolution: string,
  correctiveAction?: string
): Promise<Alert | null> {
  // Verify access first
  const alert = await verifyAlertAccess(alertId, organizationId);
  if (!alert) {
    return null;
  }

  return db.transaction(async (tx) => {
    // Update alert to resolved
    const [updated] = await tx
      .update(alerts)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: profileId,
        metadata: JSON.stringify({ resolution }),
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, alertId))
      .returning();

    if (!updated) {
      return null;
    }

    // Create corrective action if provided
    if (correctiveAction) {
      const actionData: InsertCorrectiveAction = {
        alertId,
        unitId: alert.unitId,
        profileId,
        description: resolution,
        actionTaken: correctiveAction,
        resolvedAlert: true,
        actionAt: new Date(),
      };

      await tx.insert(correctiveActions).values(actionData);
    }

    // Update unit status to 'ok' if currently in alarm state
    await tx
      .update(units)
      .set({
        status: 'ok',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(units.id, alert.unitId),
          inArray(units.status, ['excursion', 'alarm_active', 'restoring'])
        )
      );

    return updated;
  });
}
