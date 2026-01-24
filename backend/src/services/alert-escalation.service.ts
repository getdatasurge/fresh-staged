/**
 * AlertEscalationService for managing alert escalation and SMS notifications
 *
 * Implements severity-based and time-based escalation of alerts with SMS delivery
 * via Telnyx. Includes cooldown mechanisms to prevent alert storms.
 *
 * Features:
 * - Severity-based escalation rules (info/warning/critical)
 * - Time-based escalation with configurable delays
 * - Per-alert, per-user, and per-org cooldowns
 * - Escalation contact priority routing
 * - SMS delivery via Telnyx integration
 *
 * Usage:
 * ```typescript
 * import { escalateAlert, getAlertsReadyForEscalation } from './alert-escalation.service.js';
 *
 * // Find alerts ready for escalation
 * const alertsToEscalate = await getAlertsReadyForEscalation();
 *
 * // Escalate a specific alert
 * await escalateAlert(alertId, organizationId);
 * ```
 */

import { eq, and, gte, inArray, lt, asc, desc, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  alerts,
  notificationDeliveries,
  escalationContacts,
  units,
  areas,
  sites,
  type Alert,
  type EscalationContact,
} from '../db/schema/index.js';
import {
  ESCALATION_RULES,
  COOLDOWN_CONFIG,
  getEscalationRule,
  getContactPriorityThreshold,
} from '../config/escalation.config.js';
import { getQueueService } from './queue.service.js';

/**
 * Result of an escalation attempt
 */
export interface EscalationResult {
  /** Whether escalation was successful */
  success: boolean;
  /** Alert that was escalated */
  alert: Alert | null;
  /** New escalation level */
  newLevel: number;
  /** Number of SMS notifications queued */
  smsQueued: number;
  /** Reason if escalation was skipped */
  skipReason?: string;
}

/**
 * Check if an alert is in cooldown (recently escalated)
 *
 * @param alertId - Alert to check
 * @returns True if alert is in cooldown
 */
export async function isAlertInCooldown(alertId: string): Promise<boolean> {
  const [alert] = await db
    .select({ escalatedAt: alerts.escalatedAt })
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alert?.escalatedAt) {
    return false; // Never escalated, not in cooldown
  }

  const cooldownEnd = new Date(
    alert.escalatedAt.getTime() + COOLDOWN_CONFIG.perAlertMinutes * 60 * 1000
  );

  return new Date() < cooldownEnd;
}

/**
 * Check if a user is in SMS cooldown (recently received SMS)
 *
 * @param userId - User profile ID to check
 * @returns True if user should not receive SMS
 */
export async function isUserInSmsCooldown(userId: string): Promise<boolean> {
  const cooldownStart = new Date(
    Date.now() - COOLDOWN_CONFIG.perUserMinutes * 60 * 1000
  );

  const [recentSms] = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.profileId, userId),
        eq(notificationDeliveries.channel, 'sms'),
        inArray(notificationDeliveries.status, ['sent', 'delivered', 'pending']),
        gte(notificationDeliveries.scheduledAt, cooldownStart)
      )
    )
    .limit(1);

  return !!recentSms;
}

/**
 * Check if an organization has exceeded its SMS rate limit
 *
 * @param organizationId - Organization to check
 * @returns True if org is rate limited
 */
export async function isOrgSmsRateLimited(
  organizationId: string
): Promise<boolean> {
  const windowStart = new Date(
    Date.now() - COOLDOWN_CONFIG.orgWindowMinutes * 60 * 1000
  );

  // Count SMS sent in the rate limit window
  // Join through alerts -> units -> areas -> sites to get org
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notificationDeliveries)
    .innerJoin(alerts, eq(notificationDeliveries.alertId, alerts.id))
    .innerJoin(units, eq(alerts.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(
      and(
        eq(sites.organizationId, organizationId),
        eq(notificationDeliveries.channel, 'sms'),
        inArray(notificationDeliveries.status, ['sent', 'delivered', 'pending']),
        gte(notificationDeliveries.scheduledAt, windowStart)
      )
    );

  const count = Number(result[0]?.count || 0);
  return count >= COOLDOWN_CONFIG.maxSmsPerOrgWindow;
}

/**
 * Get escalation contacts for an organization up to a priority threshold
 *
 * @param organizationId - Organization to get contacts for
 * @param maxPriority - Maximum priority to include
 * @returns Array of escalation contacts
 */
export async function getEscalationContacts(
  organizationId: string,
  maxPriority: number
): Promise<EscalationContact[]> {
  return db
    .select()
    .from(escalationContacts)
    .where(
      and(
        eq(escalationContacts.organizationId, organizationId),
        eq(escalationContacts.isActive, true),
        maxPriority < 999
          ? sql`${escalationContacts.priority} <= ${maxPriority}`
          : sql`1=1` // Include all when maxPriority is 999
      )
    )
    .orderBy(asc(escalationContacts.priority));
}

/**
 * Get alerts that are ready for escalation
 *
 * Finds alerts that:
 * - Are in 'active' or 'acknowledged' status
 * - Have not reached max escalation level for their severity
 * - Have exceeded the escalation time delay since last escalation (or trigger)
 * - Are not in per-alert cooldown
 *
 * @returns Array of alerts ready for escalation with organization context
 */
export async function getAlertsReadyForEscalation(): Promise<
  Array<{ alert: Alert; organizationId: string }>
> {
  const now = new Date();
  const results: Array<{ alert: Alert; organizationId: string }> = [];

  // Get all active/acknowledged alerts with org context
  const activeAlerts = await db
    .select({
      alert: alerts,
      organizationId: sites.organizationId,
    })
    .from(alerts)
    .innerJoin(units, eq(alerts.unitId, units.id))
    .innerJoin(areas, eq(units.areaId, areas.id))
    .innerJoin(sites, eq(areas.siteId, sites.id))
    .where(inArray(alerts.status, ['active', 'acknowledged']))
    .orderBy(asc(alerts.triggeredAt));

  for (const { alert, organizationId } of activeAlerts) {
    const rule = getEscalationRule(alert.severity);

    // Skip if no escalation rule or already at max level
    if (!rule || alert.escalationLevel >= rule.maxLevel) {
      continue;
    }

    // Calculate time since last escalation (or trigger if never escalated)
    const lastEscalationTime = alert.escalatedAt || alert.triggeredAt;
    const timeSinceLastEscalation =
      now.getTime() - lastEscalationTime.getTime();
    const escalationThresholdMs = rule.escalateAfterMinutes * 60 * 1000;

    // Check if enough time has passed
    if (timeSinceLastEscalation >= escalationThresholdMs) {
      results.push({ alert, organizationId });
    }
  }

  return results;
}

/**
 * Build SMS message for an escalated alert
 *
 * @param alert - Alert to build message for
 * @param level - New escalation level
 * @returns Formatted SMS message
 */
function buildEscalationMessage(alert: Alert, level: number): string {
  const severityLabel = alert.severity.toUpperCase();
  const levelLabel =
    level === 1 ? '' : ` (Escalation Level ${level})`;

  let message = `${severityLabel} ALERT${levelLabel}: `;

  if (alert.message) {
    message += alert.message;
  } else {
    message += 'Temperature excursion detected';
  }

  if (alert.triggerTemperature !== null) {
    const tempFormatted = (alert.triggerTemperature / 10).toFixed(1);
    message += ` - Current: ${tempFormatted}°`;
  }

  return message;
}

/**
 * Escalate an alert to the next level
 *
 * Performs:
 * 1. Cooldown checks (per-alert, per-org)
 * 2. Escalation level increment
 * 3. SMS notification queueing to appropriate contacts
 *
 * @param alertId - Alert to escalate
 * @param organizationId - Organization the alert belongs to
 * @returns Escalation result with status and details
 */
export async function escalateAlert(
  alertId: string,
  organizationId: string
): Promise<EscalationResult> {
  // Check per-alert cooldown
  if (await isAlertInCooldown(alertId)) {
    return {
      success: false,
      alert: null,
      newLevel: 0,
      smsQueued: 0,
      skipReason: 'Alert is in cooldown',
    };
  }

  // Check org SMS rate limit
  if (await isOrgSmsRateLimited(organizationId)) {
    return {
      success: false,
      alert: null,
      newLevel: 0,
      smsQueued: 0,
      skipReason: 'Organization SMS rate limit exceeded',
    };
  }

  // Get current alert state
  const [alert] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alert) {
    return {
      success: false,
      alert: null,
      newLevel: 0,
      smsQueued: 0,
      skipReason: 'Alert not found',
    };
  }

  // Check if alert can escalate
  const rule = getEscalationRule(alert.severity);
  if (!rule) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: `No escalation rule for severity: ${alert.severity}`,
    };
  }

  if (alert.escalationLevel >= rule.maxLevel) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: 'Already at maximum escalation level',
    };
  }

  // Calculate new escalation level
  const newLevel = alert.escalationLevel + 1;
  const now = new Date();

  // Update alert with new escalation level
  const [updatedAlert] = await db
    .update(alerts)
    .set({
      escalationLevel: newLevel,
      escalatedAt: now,
      status: newLevel > 0 ? 'escalated' : alert.status,
      updatedAt: now,
    })
    .where(eq(alerts.id, alertId))
    .returning();

  if (!updatedAlert) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: 'Failed to update alert',
    };
  }

  // Queue SMS notifications
  let smsQueued = 0;

  if (rule.sendSms) {
    const priorityThreshold = getContactPriorityThreshold(alert.severity, newLevel);

    if (priorityThreshold >= 0) {
      smsQueued = await queueEscalationSms(
        organizationId,
        updatedAlert,
        newLevel,
        priorityThreshold
      );
    }
  }

  console.log(
    `[AlertEscalation] Alert ${alertId} escalated to level ${newLevel}. ` +
    `SMS queued: ${smsQueued}`
  );

  return {
    success: true,
    alert: updatedAlert,
    newLevel,
    smsQueued,
  };
}

/**
 * Queue SMS notifications for an escalated alert
 *
 * @param organizationId - Organization ID
 * @param alert - Escalated alert
 * @param level - New escalation level
 * @param maxPriority - Maximum contact priority to include
 * @returns Number of SMS notifications queued
 */
async function queueEscalationSms(
  organizationId: string,
  alert: Alert,
  level: number,
  maxPriority: number
): Promise<number> {
  const queueService = getQueueService();
  if (!queueService || !queueService.isRedisEnabled()) {
    console.log('[AlertEscalation] Queue service not available - SMS not sent');
    return 0;
  }

  // Get escalation contacts within priority threshold
  const contacts = await getEscalationContacts(organizationId, maxPriority);
  if (contacts.length === 0) {
    console.log('[AlertEscalation] No escalation contacts found');
    return 0;
  }

  const message = buildEscalationMessage(alert, level);
  let queued = 0;

  for (const contact of contacts) {
    // Check per-user cooldown if contact has a linked profile
    if (contact.profileId && await isUserInSmsCooldown(contact.profileId)) {
      console.log(
        `[AlertEscalation] User ${contact.profileId} in SMS cooldown - skipping`
      );
      continue;
    }

    // Validate phone number format (E.164)
    if (!contact.phone.startsWith('+')) {
      console.log(
        `[AlertEscalation] Invalid phone format for contact ${contact.id} - skipping`
      );
      continue;
    }

    // Create notification delivery record
    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({
        alertId: alert.id,
        profileId: contact.profileId,
        channel: 'sms',
        recipient: contact.phone,
        status: 'pending',
      })
      .returning();

    // Queue SMS job
    await queueService.addSmsJob({
      organizationId,
      phoneNumber: contact.phone,
      message,
      alertId: alert.id,
      deliveryId: delivery.id,
      userId: contact.profileId || undefined,
      alertType: alert.alertType,
    });

    queued++;

    // Log with masked phone number
    console.log(
      `[AlertEscalation] Queued SMS for contact ${contact.name} ` +
      `(${contact.phone.slice(0, 5)}***${contact.phone.slice(-2)})`
    );
  }

  return queued;
}

/**
 * Process all alerts ready for escalation
 *
 * This function is intended to be called by a scheduled job (cron).
 * It finds all alerts ready for escalation and processes them.
 *
 * @returns Summary of escalation processing
 */
export async function processEscalations(): Promise<{
  processed: number;
  escalated: number;
  smsQueued: number;
  errors: number;
}> {
  const summary = {
    processed: 0,
    escalated: 0,
    smsQueued: 0,
    errors: 0,
  };

  try {
    const alertsToEscalate = await getAlertsReadyForEscalation();
    console.log(
      `[AlertEscalation] Found ${alertsToEscalate.length} alerts ready for escalation`
    );

    for (const { alert, organizationId } of alertsToEscalate) {
      summary.processed++;

      try {
        const result = await escalateAlert(alert.id, organizationId);

        if (result.success) {
          summary.escalated++;
          summary.smsQueued += result.smsQueued;
        } else {
          console.log(
            `[AlertEscalation] Skipped alert ${alert.id}: ${result.skipReason}`
          );
        }
      } catch (error) {
        console.error(`[AlertEscalation] Error escalating alert ${alert.id}:`, error);
        summary.errors++;
      }
    }
  } catch (error) {
    console.error('[AlertEscalation] Error fetching alerts for escalation:', error);
    summary.errors++;
  }

  console.log(
    `[AlertEscalation] Processing complete. ` +
    `Processed: ${summary.processed}, Escalated: ${summary.escalated}, ` +
    `SMS queued: ${summary.smsQueued}, Errors: ${summary.errors}`
  );

  return summary;
}

/**
 * Manually escalate an alert to a specific level
 *
 * Used for manual intervention by administrators.
 * Bypasses time-based checks but respects cooldowns.
 *
 * @param alertId - Alert to escalate
 * @param organizationId - Organization the alert belongs to
 * @param targetLevel - Target escalation level
 * @returns Escalation result
 */
export async function manualEscalate(
  alertId: string,
  organizationId: string,
  targetLevel: number
): Promise<EscalationResult> {
  // Get current alert
  const [alert] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alert) {
    return {
      success: false,
      alert: null,
      newLevel: 0,
      smsQueued: 0,
      skipReason: 'Alert not found',
    };
  }

  const rule = getEscalationRule(alert.severity);
  if (!rule) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: `No escalation rule for severity: ${alert.severity}`,
    };
  }

  // Clamp target level to valid range
  const clampedLevel = Math.min(Math.max(targetLevel, 0), rule.maxLevel);

  if (clampedLevel <= alert.escalationLevel) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: 'Target level must be higher than current level',
    };
  }

  // Check org rate limit (we still want to prevent SMS storms)
  if (await isOrgSmsRateLimited(organizationId)) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: 'Organization SMS rate limit exceeded',
    };
  }

  const now = new Date();

  // Update alert
  const [updatedAlert] = await db
    .update(alerts)
    .set({
      escalationLevel: clampedLevel,
      escalatedAt: now,
      status: 'escalated',
      updatedAt: now,
    })
    .where(eq(alerts.id, alertId))
    .returning();

  if (!updatedAlert) {
    return {
      success: false,
      alert,
      newLevel: alert.escalationLevel,
      smsQueued: 0,
      skipReason: 'Failed to update alert',
    };
  }

  // Queue SMS notifications
  let smsQueued = 0;

  if (rule.sendSms) {
    const priorityThreshold = getContactPriorityThreshold(alert.severity, clampedLevel);

    if (priorityThreshold >= 0) {
      smsQueued = await queueEscalationSms(
        organizationId,
        updatedAlert,
        clampedLevel,
        priorityThreshold
      );
    }
  }

  console.log(
    `[AlertEscalation] Alert ${alertId} manually escalated to level ${clampedLevel}. ` +
    `SMS queued: ${smsQueued}`
  );

  return {
    success: true,
    alert: updatedAlert,
    newLevel: clampedLevel,
    smsQueued,
  };
}

/**
 * Get escalation status for an alert
 *
 * @param alertId - Alert to check
 * @returns Escalation status information
 */
export async function getEscalationStatus(alertId: string): Promise<{
  currentLevel: number;
  maxLevel: number;
  canEscalate: boolean;
  nextEscalationAt: Date | null;
  inCooldown: boolean;
} | null> {
  const [alert] = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, alertId))
    .limit(1);

  if (!alert) {
    return null;
  }

  const rule = getEscalationRule(alert.severity);
  if (!rule) {
    return {
      currentLevel: alert.escalationLevel,
      maxLevel: 0,
      canEscalate: false,
      nextEscalationAt: null,
      inCooldown: false,
    };
  }

  const inCooldown = await isAlertInCooldown(alertId);
  const canEscalate =
    alert.escalationLevel < rule.maxLevel && !inCooldown;

  // Calculate next escalation time
  let nextEscalationAt: Date | null = null;
  if (canEscalate) {
    const lastEscalation = alert.escalatedAt || alert.triggeredAt;
    nextEscalationAt = new Date(
      lastEscalation.getTime() + rule.escalateAfterMinutes * 60 * 1000
    );
  }

  return {
    currentLevel: alert.escalationLevel,
    maxLevel: rule.maxLevel,
    canEscalate,
    nextEscalationAt,
    inCooldown,
  };
}
