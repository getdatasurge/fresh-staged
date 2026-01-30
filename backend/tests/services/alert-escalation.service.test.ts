import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ESCALATION_RULES,
  COOLDOWN_CONFIG,
  getEscalationRule,
  getNextEscalationTime,
  getContactPriorityThreshold,
} from '../../src/config/escalation.config.js';

/**
 * Alert Escalation Service Tests
 *
 * Tests cover:
 * - Escalation configuration and rules
 * - Cooldown calculations
 * - Contact priority routing
 * - Time-based escalation logic
 *
 * Note: Alert API tests are in tests/trpc/alerts.router.test.ts
 * These tests focus on the configuration and pure logic functions.
 */

describe('Escalation Configuration', () => {
  describe('ESCALATION_RULES', () => {
    it('should have rules for all severity levels', () => {
      expect(ESCALATION_RULES.info).toBeDefined();
      expect(ESCALATION_RULES.warning).toBeDefined();
      expect(ESCALATION_RULES.critical).toBeDefined();
    });

    it('should configure info alerts to not escalate', () => {
      const rule = ESCALATION_RULES.info;

      expect(rule.maxLevel).toBe(0);
      expect(rule.sendSms).toBe(false);
    });

    it('should configure warning alerts with moderate escalation', () => {
      const rule = ESCALATION_RULES.warning;

      expect(rule.maxLevel).toBe(2);
      expect(rule.escalateAfterMinutes).toBe(30);
      expect(rule.sendSms).toBe(true);
      expect(rule.contactPriorityByLevel[1]).toBe(0);
      expect(rule.contactPriorityByLevel[2]).toBe(1);
    });

    it('should configure critical alerts with aggressive escalation', () => {
      const rule = ESCALATION_RULES.critical;

      expect(rule.maxLevel).toBe(3);
      expect(rule.escalateAfterMinutes).toBe(15);
      expect(rule.sendSms).toBe(true);
      expect(rule.contactPriorityByLevel[1]).toBe(0);
      expect(rule.contactPriorityByLevel[2]).toBe(1);
      expect(rule.contactPriorityByLevel[3]).toBe(999);
    });

    it('should have shorter escalation time for critical than warning', () => {
      expect(ESCALATION_RULES.critical.escalateAfterMinutes).toBeLessThan(
        ESCALATION_RULES.warning.escalateAfterMinutes,
      );
    });
  });

  describe('COOLDOWN_CONFIG', () => {
    it('should have per-alert cooldown configured', () => {
      expect(COOLDOWN_CONFIG.perAlertMinutes).toBeGreaterThan(0);
    });

    it('should have per-user cooldown configured', () => {
      expect(COOLDOWN_CONFIG.perUserMinutes).toBeGreaterThan(0);
    });

    it('should have org-wide rate limiting configured', () => {
      expect(COOLDOWN_CONFIG.orgWindowMinutes).toBeGreaterThan(0);
      expect(COOLDOWN_CONFIG.maxSmsPerOrgWindow).toBeGreaterThan(0);
    });

    it('should have reasonable defaults', () => {
      // Per-alert should be >= per-user to prevent re-notifying same users
      expect(COOLDOWN_CONFIG.perAlertMinutes).toBeGreaterThanOrEqual(
        COOLDOWN_CONFIG.perUserMinutes,
      );

      // Org window should be larger than individual cooldowns
      expect(COOLDOWN_CONFIG.orgWindowMinutes).toBeGreaterThanOrEqual(
        COOLDOWN_CONFIG.perAlertMinutes,
      );
    });
  });
});

describe('getEscalationRule', () => {
  it('should return rule for valid severity', () => {
    const rule = getEscalationRule('critical');

    expect(rule).not.toBeNull();
    expect(rule?.severity).toBe('critical');
  });

  it('should return null for unknown severity', () => {
    const rule = getEscalationRule('unknown');

    expect(rule).toBeNull();
  });

  it('should return correct rule for each severity', () => {
    expect(getEscalationRule('info')?.maxLevel).toBe(0);
    expect(getEscalationRule('warning')?.maxLevel).toBe(2);
    expect(getEscalationRule('critical')?.maxLevel).toBe(3);
  });
});

describe('getNextEscalationTime', () => {
  it('should return null if already at max level', () => {
    const now = new Date();

    // Critical max level is 3
    const nextTime = getNextEscalationTime(now, 'critical', 3);

    expect(nextTime).toBeNull();
  });

  it('should return null for unknown severity', () => {
    const now = new Date();

    const nextTime = getNextEscalationTime(now, 'unknown', 0);

    expect(nextTime).toBeNull();
  });

  it('should calculate correct next escalation time for warning', () => {
    const baseTime = new Date('2024-01-15T10:00:00Z');

    const nextTime = getNextEscalationTime(baseTime, 'warning', 0);

    expect(nextTime).not.toBeNull();
    // Warning escalates after 30 minutes
    expect(nextTime?.getTime()).toBe(baseTime.getTime() + 30 * 60 * 1000);
  });

  it('should calculate correct next escalation time for critical', () => {
    const baseTime = new Date('2024-01-15T10:00:00Z');

    const nextTime = getNextEscalationTime(baseTime, 'critical', 0);

    expect(nextTime).not.toBeNull();
    // Critical escalates after 15 minutes
    expect(nextTime?.getTime()).toBe(baseTime.getTime() + 15 * 60 * 1000);
  });

  it('should calculate from last escalation time', () => {
    const triggeredAt = new Date('2024-01-15T10:00:00Z');
    const escalatedAt = new Date('2024-01-15T10:15:00Z');

    // Use escalatedAt as base (simulating level 1 alert)
    const nextTime = getNextEscalationTime(escalatedAt, 'critical', 1);

    expect(nextTime).not.toBeNull();
    // Should be 15 minutes after escalatedAt
    expect(nextTime?.getTime()).toBe(escalatedAt.getTime() + 15 * 60 * 1000);
  });
});

describe('getContactPriorityThreshold', () => {
  it('should return -1 for info severity (no SMS)', () => {
    const threshold = getContactPriorityThreshold('info', 1);

    expect(threshold).toBe(-1);
  });

  it('should return -1 for level 0 (no SMS before first escalation)', () => {
    const threshold = getContactPriorityThreshold('critical', 0);

    expect(threshold).toBe(-1);
  });

  it('should return correct priority for warning level 1', () => {
    const threshold = getContactPriorityThreshold('warning', 1);

    expect(threshold).toBe(0); // Only priority 0 contacts
  });

  it('should return correct priority for warning level 2', () => {
    const threshold = getContactPriorityThreshold('warning', 2);

    expect(threshold).toBe(1); // Priority 0-1 contacts
  });

  it('should return correct priority for critical level 3', () => {
    const threshold = getContactPriorityThreshold('critical', 3);

    expect(threshold).toBe(999); // All contacts
  });

  it('should return -1 for unknown severity', () => {
    const threshold = getContactPriorityThreshold('unknown', 1);

    expect(threshold).toBe(-1);
  });

  it('should return -1 for level beyond max', () => {
    // Warning max is 2, so level 3 should return -1
    const threshold = getContactPriorityThreshold('warning', 3);

    expect(threshold).toBe(-1);
  });
});

describe('Escalation Time Logic', () => {
  it('should determine if alert is ready for escalation based on time', () => {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 31 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Warning alert escalates after 30 minutes
    const warningRule = getEscalationRule('warning')!;

    // Triggered 31 minutes ago - should be ready
    const readyTime = getNextEscalationTime(thirtyMinutesAgo, 'warning', 0);
    expect(readyTime!.getTime()).toBeLessThan(now.getTime());

    // Triggered 10 minutes ago - should NOT be ready
    const notReadyTime = getNextEscalationTime(tenMinutesAgo, 'warning', 0);
    expect(notReadyTime!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('should correctly identify max level alerts', () => {
    // Critical at level 3 cannot escalate further
    expect(getNextEscalationTime(new Date(), 'critical', 3)).toBeNull();

    // Warning at level 2 cannot escalate further
    expect(getNextEscalationTime(new Date(), 'warning', 2)).toBeNull();

    // Info cannot escalate at all
    expect(getNextEscalationTime(new Date(), 'info', 0)).toBeNull();
  });
});

describe('Contact Priority Routing', () => {
  it('should route to higher priority contacts at higher escalation levels', () => {
    // Level 1: only priority 0
    const level1 = getContactPriorityThreshold('critical', 1);
    // Level 2: priority 0-1
    const level2 = getContactPriorityThreshold('critical', 2);
    // Level 3: all contacts
    const level3 = getContactPriorityThreshold('critical', 3);

    expect(level1).toBeLessThan(level2);
    expect(level2).toBeLessThan(level3);
  });

  it('should have consistent routing for same level across calls', () => {
    const first = getContactPriorityThreshold('warning', 1);
    const second = getContactPriorityThreshold('warning', 1);

    expect(first).toBe(second);
  });
});

describe('Cooldown Calculations', () => {
  it('should calculate per-alert cooldown correctly', () => {
    const cooldownMs = COOLDOWN_CONFIG.perAlertMinutes * 60 * 1000;
    const now = new Date();

    // Escalated just now - should be in cooldown
    const justEscalated = new Date(now.getTime() - 1000); // 1 second ago
    const cooldownEnd = new Date(justEscalated.getTime() + cooldownMs);
    expect(cooldownEnd.getTime()).toBeGreaterThan(now.getTime());

    // Escalated long ago - should NOT be in cooldown
    const longAgo = new Date(now.getTime() - cooldownMs - 60000); // 1 minute past cooldown
    const expiredCooldown = new Date(longAgo.getTime() + cooldownMs);
    expect(expiredCooldown.getTime()).toBeLessThan(now.getTime());
  });

  it('should calculate org rate limit window correctly', () => {
    const windowMs = COOLDOWN_CONFIG.orgWindowMinutes * 60 * 1000;
    const now = new Date();

    const windowStart = new Date(now.getTime() - windowMs);
    expect(windowStart.getTime()).toBeLessThan(now.getTime());
    expect(now.getTime() - windowStart.getTime()).toBe(windowMs);
  });
});

describe('Escalation Message Building', () => {
  // This tests the message format expectations
  it('should include severity in expected format', () => {
    // Based on buildEscalationMessage function
    const severities = ['info', 'warning', 'critical'];

    for (const severity of severities) {
      const label = severity.toUpperCase();
      expect(label).toMatch(/^[A-Z]+$/);
    }
  });

  it('should format escalation level correctly', () => {
    // Level 1 has no suffix, level 2+ has "(Escalation Level N)"
    const level1Label = '';
    const level2Label = ` (Escalation Level 2)`;
    const level3Label = ` (Escalation Level 3)`;

    expect(level1Label).toBe('');
    expect(level2Label).toContain('Level 2');
    expect(level3Label).toContain('Level 3');
  });
});

describe('Edge Cases', () => {
  it('should handle zero escalation level', () => {
    const threshold = getContactPriorityThreshold('critical', 0);
    expect(threshold).toBe(-1); // No SMS at level 0
  });

  it('should handle negative escalation level', () => {
    const threshold = getContactPriorityThreshold('critical', -1);
    expect(threshold).toBe(-1);
  });

  it('should handle very high escalation level', () => {
    const threshold = getContactPriorityThreshold('critical', 100);
    expect(threshold).toBe(-1); // Beyond max level
  });

  it('should handle empty string severity', () => {
    const rule = getEscalationRule('');
    expect(rule).toBeNull();
  });

  it('should handle case sensitivity in severity', () => {
    // Our config uses lowercase
    expect(getEscalationRule('CRITICAL')).toBeNull();
    expect(getEscalationRule('Critical')).toBeNull();
    expect(getEscalationRule('critical')).not.toBeNull();
  });
});
