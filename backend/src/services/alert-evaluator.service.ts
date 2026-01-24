import { eq, and, or, inArray, isNull, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  alerts,
  alertRules,
  units,
  areas,
  sites,
  profiles,
  notificationDeliveries,
  type Alert,
  type InsertAlert,
  type Unit,
} from '../db/schema/index.js';
import type { SocketService } from './socket.service.js';
import { getQueueService } from './queue.service.js';

// Rate limit window in milliseconds (15 minutes)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Get users with phone numbers in an organization who should receive SMS alerts
 *
 * @param organizationId - Organization to get recipients for
 * @returns Array of { userId, phoneNumber } for users with valid E.164 phone numbers
 */
async function getAlertRecipients(
  organizationId: string
): Promise<Array<{ userId: string; phoneNumber: string }>> {
  // Get users with phone numbers who should receive alerts
  // For now, get all users in org with phone numbers and smsEnabled
  // Future: Add notification preferences filtering, escalation contact priority
  const recipients = await db
    .select({
      userId: profiles.id,
      phoneNumber: profiles.phone,
    })
    .from(profiles)
    .where(
      and(
        eq(profiles.organizationId, organizationId),
        eq(profiles.smsEnabled, true)
      )
    );

  // Filter to only valid E.164 phone numbers
  return recipients.filter(
    (r): r is { userId: string; phoneNumber: string } =>
      r.phoneNumber !== null && r.phoneNumber.startsWith('+')
  );
}

/**
 * Check if a user has received an SMS alert recently (within rate limit window)
 *
 * @param userId - User profile ID to check
 * @returns True if rate limited (should not send), false if OK to send
 */
async function isRateLimited(userId: string): Promise<boolean> {
  const rateLimitCutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const [recentDelivery] = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.profileId, userId),
        eq(notificationDeliveries.channel, 'sms'),
        inArray(notificationDeliveries.status, ['sent', 'delivered']),
        gte(notificationDeliveries.sentAt, rateLimitCutoff)
      )
    )
    .limit(1);

  return !!recentDelivery;
}

/**
 * Queue SMS notifications for all eligible recipients when an alert escalates
 *
 * This function:
 * 1. Gets all users in the org with valid phone numbers and SMS enabled
 * 2. Checks rate limiting for each user (15-minute window)
 * 3. Creates notification_deliveries records
 * 4. Queues SMS jobs for processing
 *
 * @param organizationId - Organization the alert belongs to
 * @param alertId - Alert that escalated
 * @param message - SMS message to send
 * @param alertType - Type of alert for rate limiting grouping
 */
async function queueAlertSms(
  organizationId: string,
  alertId: string,
  message: string,
  alertType: string
): Promise<void> {
  const queueService = getQueueService();
  if (!queueService || !queueService.isRedisEnabled()) {
    console.log('[Alert SMS] Queue service not available - SMS not sent');
    return;
  }

  const recipients = await getAlertRecipients(organizationId);
  console.log(`[Alert SMS] Found ${recipients.length} recipients for org ${organizationId}`);

  for (const recipient of recipients) {
    // Check rate limit
    if (await isRateLimited(recipient.userId)) {
      console.log(`[Alert SMS] Rate limited for user ${recipient.userId} - skipping`);
      continue;
    }

    // Create notification delivery record
    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        alertId,
        profileId: recipient.userId,
        channel: 'sms',
        recipient: recipient.phoneNumber,
        status: 'pending',
      })
      .returning();

    // Queue SMS job
    await queueService.addSmsJob({
      organizationId,
      phoneNumber: recipient.phoneNumber,
      message,
      alertId,
      deliveryId: delivery.id,
      userId: recipient.userId,
      alertType,
    });

    // Log with masked phone number for privacy
    console.log(
      `[Alert SMS] Queued SMS for user ${recipient.userId} to ${recipient.phoneNumber.slice(0, 5)}***${recipient.phoneNumber.slice(-2)}`
    );
  }
}

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
 * @param socketService - Optional Socket.io service for real-time notifications
 * @returns Evaluation result with state changes and alert mutations
 */
export async function evaluateUnitAfterReading(
  unitId: string,
  latestTemp: number,
  recordedAt: Date,
  socketService?: SocketService
): Promise<EvaluationResult> {
  return db.transaction(async (tx) => {
    // Fetch current unit state with organization context
    const [unitData] = await tx
      .select({
        unit: units,
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

    const { unit, organizationId } = unitData;

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

      // Emit real-time alert notification
      if (result.alertCreated && socketService) {
        socketService.emitToOrg(organizationId, 'alert:triggered', {
          alertId: result.alertCreated.id,
          unitId: result.alertCreated.unitId,
          alertType: result.alertCreated.alertType,
          severity: result.alertCreated.severity,
          message: result.alertCreated.message,
          triggerTemperature: result.alertCreated.triggerTemperature,
          thresholdViolated: result.alertCreated.thresholdViolated,
          triggeredAt: result.alertCreated.triggeredAt.toISOString(),
        });
      }
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
        const [escalatedAlert] = await tx
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
          )
          .returning();

        // Emit real-time escalation notification
        if (escalatedAlert && socketService) {
          socketService.emitToOrg(organizationId, 'alert:escalated', {
            alertId: escalatedAlert.id,
            unitId: escalatedAlert.unitId,
            escalationLevel: escalatedAlert.escalationLevel || 1,
          });
        }

        // Queue SMS notifications for critical alert
        if (escalatedAlert) {
          const alertMessage = `CRITICAL: Temperature alert for unit. ${result.stateChange?.reason || 'Temperature excursion confirmed.'}`;

          // Queue asynchronously - don't await to avoid blocking the reading pipeline
          queueAlertSms(organizationId, escalatedAlert.id, alertMessage, 'alarm_active').catch(
            (err) => {
              console.error('[Alert SMS] Failed to queue SMS:', err);
            }
          );
        }
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

      // Emit real-time resolution notification
      if (resolved && socketService) {
        socketService.emitToOrg(organizationId, 'alert:resolved', {
          alertId: resolved.id,
          unitId: resolved.unitId,
          resolvedAt: resolved.resolvedAt?.toISOString() || now.toISOString(),
        });
      }
    }

    // STATE TRANSITION 4: restoring -> ok (future: after N good readings)
    // TODO: Implement multi-reading confirmation for restoring -> ok
    // For now, manual resolution or scheduled job handles this

    return result;
  });
}
