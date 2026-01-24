import { eq, and, or, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  alerts,
  alertRules,
  units,
  areas,
  sites,
  type Alert,
  type InsertAlert,
  type Unit,
} from '../db/schema/index.js';

/**
 * Result of evaluating a unit after a new temperature reading
 */
export interface EvaluationResult {
  stateChange: { from: string; to: string; reason: string } | null;
  alertCreated: Alert | null;
  alertResolved: Alert | null;
}

/**
 * Effective thresholds resolved from rule hierarchy
 */
export interface EffectiveThresholds {
  tempMin: number;
  tempMax: number;
  hysteresis: number;
  confirmTimeSeconds: number;
}

/**
 * Resolve effective thresholds for a unit using hierarchy:
 * Unit thresholds OR alert rules (unit -> site -> org precedence)
 *
 * @param unitId - Unit to resolve thresholds for
 * @returns Effective thresholds with hysteresis and confirmation time
 * @throws Error if unit not found or no thresholds configured
 */
export async function resolveEffectiveThresholds(
  unitId: string
): Promise<EffectiveThresholds> {
  // Fetch unit with area/site/org context
  const [unitData] = await db
    .select({
      unit: units,
      siteId: sites.id,
      organizationId: sites.organizationId,
    })
    .from(units)
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(eq(units.id, unitId))
    .limit(1);

  if (!unitData) {
    throw new Error(`Unit ${unitId} not found`);
  }

  const { unit, siteId, organizationId } = unitData;

  // Default values
  const defaults = {
    hysteresis: 5, // 0.5 degrees in integer format (temp * 10)
    confirmTimeSeconds: 600, // 10 minutes
  };

  // Start with unit's own thresholds as base
  let tempMin = unit.tempMin;
  let tempMax = unit.tempMax;
  let confirmTimeSeconds = defaults.confirmTimeSeconds;
  const hysteresis = defaults.hysteresis; // Fixed for now

  // Query alert rules for this unit/site/org
  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.isEnabled, true),
        eq(alertRules.organizationId, organizationId),
        or(
          eq(alertRules.unitId, unitId),
          and(eq(alertRules.siteId, siteId), isNull(alertRules.unitId)),
          and(isNull(alertRules.siteId), isNull(alertRules.unitId))
        )
      )
    );

  // Find most specific rule (unit > site > org)
  const unitRule = rules.find((r) => r.unitId === unitId);
  const siteRule = rules.find((r) => r.siteId === siteId && !r.unitId);
  const orgRule = rules.find((r) => !r.siteId && !r.unitId);

  const applicableRule = unitRule || siteRule || orgRule;

  if (applicableRule) {
    // Use rule thresholds if defined, otherwise keep unit thresholds
    if (applicableRule.tempMin !== null && applicableRule.tempMin !== undefined) {
      tempMin = applicableRule.tempMin;
    }
    if (applicableRule.tempMax !== null && applicableRule.tempMax !== undefined) {
      tempMax = applicableRule.tempMax;
    }
    confirmTimeSeconds = applicableRule.delayMinutes * 60;
  }

  // Validate we have thresholds
  if (tempMin === null || tempMax === null) {
    throw new Error(
      `Unit ${unitId} has no temperature thresholds configured (neither on unit nor in alert rules)`
    );
  }

  return {
    tempMin,
    tempMax,
    hysteresis,
    confirmTimeSeconds,
  };
}

/**
 * Create an alert if none exists with same type and unit in active/acknowledged state
 * Implements idempotent alert creation to prevent duplicates
 *
 * @param tx - Drizzle transaction
 * @param data - Alert data to insert
 * @returns Created alert or null if duplicate prevented
 */
export async function createAlertIfNotExists(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: InsertAlert
): Promise<Alert | null> {
  // Check for existing active or acknowledged alert of same type for this unit
  const [existing] = await tx
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.unitId, data.unitId),
        eq(alerts.alertType, data.alertType),
        inArray(alerts.status, ['active', 'acknowledged'])
      )
    )
    .limit(1);

  if (existing) {
    // Duplicate detected - do not create
    return null;
  }

  // No existing alert, create new one
  const [alert] = await tx.insert(alerts).values(data).returning();

  return alert;
}

/**
 * Evaluate unit after new temperature reading and apply state machine transitions
 *
 * State Machine:
 * ok -> excursion (temp out of range) -> alarm_active (confirmed) -> restoring (temp returns) -> ok
 *
 * @param unitId - Unit to evaluate
 * @param latestTemp - Latest temperature reading (integer, e.g., 320 = 32.0F)
 * @param recordedAt - Timestamp of the reading
 * @returns Evaluation result with state changes and alert mutations
 */
export async function evaluateUnitAfterReading(
  unitId: string,
  latestTemp: number,
  recordedAt: Date
): Promise<EvaluationResult> {
  return db.transaction(async (tx) => {
    // Fetch current unit state
    const [unit] = await tx
      .select()
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);

    if (!unit) {
      throw new Error(`Unit ${unitId} not found`);
    }

    // Get effective thresholds via hierarchy resolution
    const thresholds = await resolveEffectiveThresholds(unitId);

    // Evaluate temperature against thresholds
    const isAboveLimit = latestTemp > thresholds.tempMax;
    const isBelowLimit = latestTemp < thresholds.tempMin;
    const isOutOfRange = isAboveLimit || isBelowLimit;

    // Check if temp is back in range with hysteresis
    const inRangeWithHysteresis =
      latestTemp <= thresholds.tempMax - thresholds.hysteresis &&
      latestTemp >= thresholds.tempMin + thresholds.hysteresis;

    const result: EvaluationResult = {
      stateChange: null,
      alertCreated: null,
      alertResolved: null,
    };

    const now = new Date();

    // STATE TRANSITION 1: ok -> excursion (temperature out of range)
    if (isOutOfRange && unit.status === 'ok') {
      result.stateChange = {
        from: 'ok',
        to: 'excursion',
        reason: `Temperature ${(latestTemp / 10).toFixed(1)}°${unit.tempUnit} ${
          isAboveLimit ? 'above' : 'below'
        } threshold`,
      };

      await tx
        .update(units)
        .set({
          status: 'excursion',
          updatedAt: now,
        })
        .where(eq(units.id, unitId));

      // Create warning-level alert
      result.alertCreated = await createAlertIfNotExists(tx, {
        unitId,
        alertType: 'alarm_active',
        severity: 'warning',
        message: result.stateChange.reason,
        triggerTemperature: latestTemp,
        thresholdViolated: isAboveLimit ? 'max' : 'min',
        triggeredAt: now,
      });
    }

    // STATE TRANSITION 2: excursion -> alarm_active (confirmation time elapsed)
    if (isOutOfRange && unit.status === 'excursion') {
      const statusChangeTime = unit.updatedAt.getTime();
      const timeInExcursion = now.getTime() - statusChangeTime;
      const confirmTimeMs = thresholds.confirmTimeSeconds * 1000;

      if (timeInExcursion >= confirmTimeMs) {
        result.stateChange = {
          from: 'excursion',
          to: 'alarm_active',
          reason: 'Temperature excursion confirmed after delay period',
        };

        await tx
          .update(units)
          .set({
            status: 'alarm_active',
            updatedAt: now,
          })
          .where(eq(units.id, unitId));

        // Escalate existing alert to critical severity
        await tx
          .update(alerts)
          .set({
            severity: 'critical',
            escalationLevel: 1,
            escalatedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(alerts.unitId, unitId),
              eq(alerts.alertType, 'alarm_active'),
              inArray(alerts.status, ['active', 'acknowledged'])
            )
          );
      }
    }

    // STATE TRANSITION 3: (excursion | alarm_active) -> restoring (temp returns to range)
    if (
      inRangeWithHysteresis &&
      (unit.status === 'excursion' || unit.status === 'alarm_active')
    ) {
      result.stateChange = {
        from: unit.status,
        to: 'restoring',
        reason: 'Temperature returned to acceptable range',
      };

      await tx
        .update(units)
        .set({
          status: 'restoring',
          updatedAt: now,
        })
        .where(eq(units.id, unitId));

      // Resolve any active alerts
      const [resolved] = await tx
        .update(alerts)
        .set({
          status: 'resolved',
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(alerts.unitId, unitId),
            eq(alerts.alertType, 'alarm_active'),
            inArray(alerts.status, ['active', 'acknowledged'])
          )
        )
        .returning();

      result.alertResolved = resolved || null;
    }

    // STATE TRANSITION 4: restoring -> ok (future: after N good readings)
    // TODO: Implement multi-reading confirmation for restoring -> ok
    // For now, manual resolution or scheduled job handles this

    return result;
  });
}
