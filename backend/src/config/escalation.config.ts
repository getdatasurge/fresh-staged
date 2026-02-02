/**
 * Alert escalation configuration
 *
 * Defines escalation rules, timing, and cooldown settings for the alert system.
 * Escalation is based on severity and time since the alert was triggered.
 *
 * Escalation Levels:
 * - Level 0: Initial alert (no SMS)
 * - Level 1: First escalation (SMS to priority 0 contacts)
 * - Level 2: Second escalation (SMS to priority 0-1 contacts)
 * - Level 3: Final escalation (SMS to all active contacts)
 *
 * Cooldowns prevent alert storms by limiting how frequently:
 * - The same alert can escalate
 * - A user can receive SMS notifications
 * - An organization can send SMS alerts
 */

/**
 * Escalation rule defining when and how to escalate based on severity
 */
export interface EscalationRule {
  /** Alert severity this rule applies to */
  severity: 'info' | 'warning' | 'critical';
  /** Maximum escalation level for this severity */
  maxLevel: number;
  /** Minutes after last escalation (or trigger) before escalating */
  escalateAfterMinutes: number;
  /** Whether to send SMS at this severity level */
  sendSms: boolean;
  /** Priority threshold for contacts at each escalation level */
  contactPriorityByLevel: Record<number, number>;
}

/**
 * Cooldown configuration to prevent alert storms
 */
export interface CooldownConfig {
  /** Minutes to wait between escalating the same alert */
  perAlertMinutes: number;
  /** Minutes between SMS to the same user */
  perUserMinutes: number;
  /** Minutes to track org-wide SMS rate */
  orgWindowMinutes: number;
  /** Max SMS per org within the window */
  maxSmsPerOrgWindow: number;
}

/**
 * Escalation rules by severity
 *
 * Rules define how alerts escalate based on their severity level.
 * Higher severity = faster escalation + more contacts notified.
 */
export const ESCALATION_RULES: Record<string, EscalationRule> = {
  info: {
    severity: 'info',
    maxLevel: 0, // Info alerts don't escalate
    escalateAfterMinutes: 0,
    sendSms: false,
    contactPriorityByLevel: {},
  },
  warning: {
    severity: 'warning',
    maxLevel: 2,
    escalateAfterMinutes: 30, // 30 minutes between escalations
    sendSms: true,
    contactPriorityByLevel: {
      1: 0, // Level 1: priority 0 contacts only
      2: 1, // Level 2: priority 0-1 contacts
    },
  },
  critical: {
    severity: 'critical',
    maxLevel: 3,
    escalateAfterMinutes: 15, // 15 minutes between escalations (faster)
    sendSms: true,
    contactPriorityByLevel: {
      1: 0, // Level 1: priority 0 contacts
      2: 1, // Level 2: priority 0-1 contacts
      3: 999, // Level 3: all active contacts (max priority)
    },
  },
};

/**
 * Cooldown configuration to prevent alert storms
 *
 * These limits prevent excessive notifications:
 * - Per-alert: Same alert can only escalate once per period
 * - Per-user: Same user can only receive SMS once per period
 * - Per-org: Rate limit on total SMS sent by organization
 */
export const COOLDOWN_CONFIG: CooldownConfig = {
  perAlertMinutes: 15, // Alert can only escalate every 15 min
  perUserMinutes: 15, // User can only receive SMS every 15 min
  orgWindowMinutes: 60, // 1 hour window for org rate limiting
  maxSmsPerOrgWindow: 50, // Max 50 SMS per org per hour
};

/**
 * Get escalation rule for a severity level
 *
 * @param severity - Alert severity
 * @returns Escalation rule or null if severity not configured
 */
export function getEscalationRule(severity: string): EscalationRule | null {
  return ESCALATION_RULES[severity] || null;
}

/**
 * Calculate next escalation time for an alert
 *
 * @param lastEscalatedAt - When the alert last escalated (or was triggered)
 * @param severity - Alert severity
 * @returns Date when the alert should next escalate, or null if max level reached
 */
export function getNextEscalationTime(
  lastEscalatedAt: Date,
  severity: string,
  currentLevel: number,
): Date | null {
  const rule = getEscalationRule(severity);
  if (!rule || currentLevel >= rule.maxLevel) {
    return null;
  }

  return new Date(lastEscalatedAt.getTime() + rule.escalateAfterMinutes * 60 * 1000);
}

/**
 * Get the maximum contact priority to notify at a given escalation level
 *
 * @param severity - Alert severity
 * @param level - Current escalation level
 * @returns Maximum contact priority to include, or -1 if no SMS should be sent
 */
export function getContactPriorityThreshold(severity: string, level: number): number {
  const rule = getEscalationRule(severity);
  if (!rule || !rule.sendSms || level < 1) {
    return -1; // Don't send SMS
  }

  return rule.contactPriorityByLevel[level] ?? -1;
}
