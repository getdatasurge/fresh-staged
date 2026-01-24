import { useQuery } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { qk } from "@/lib/queryKeys";

export interface AlertRules {
  manual_interval_minutes: number;
  manual_grace_minutes: number;
  expected_reading_interval_seconds: number;
  offline_trigger_multiplier: number;
  offline_trigger_additional_minutes: number;
  door_open_warning_minutes: number;
  door_open_critical_minutes: number;
  door_open_max_mask_minutes_per_day: number;
  excursion_confirm_minutes_door_closed: number;
  excursion_confirm_minutes_door_open: number;
  max_excursion_minutes: number;
  // New missed check-in thresholds (org-level)
  offline_warning_missed_checkins: number;
  offline_critical_missed_checkins: number;
  manual_log_missed_checkins_threshold: number;
  source_unit: boolean;
  source_site: boolean;
  source_org: boolean;
}

export interface AlertRulesRow {
  id: string;
  organization_id: string | null;
  site_id: string | null;
  unit_id: string | null;
  manual_interval_minutes: number | null;
  manual_grace_minutes: number | null;
  expected_reading_interval_seconds: number | null;
  offline_trigger_multiplier: number | null;
  offline_trigger_additional_minutes: number | null;
  door_open_warning_minutes: number | null;
  door_open_critical_minutes: number | null;
  door_open_max_mask_minutes_per_day: number | null;
  excursion_confirm_minutes_door_closed: number | null;
  excursion_confirm_minutes_door_open: number | null;
  max_excursion_minutes: number | null;
  // New missed check-in thresholds
  offline_warning_missed_checkins: number | null;
  offline_critical_missed_checkins: number | null;
  manual_log_missed_checkins_threshold: number | null;
}

// Default values when no rules are configured
// Using 5-minute check-in cadence with missed check-in thresholds
export const DEFAULT_ALERT_RULES: AlertRules = {
  manual_interval_minutes: 240, // 4 hours (Standard mode)
  manual_grace_minutes: 0,
  expected_reading_interval_seconds: 300, // 5 minutes
  offline_trigger_multiplier: 2.0,         // Legacy - kept for backward compatibility
  offline_trigger_additional_minutes: 1,   // Legacy - kept for backward compatibility
  door_open_warning_minutes: 3,
  door_open_critical_minutes: 10,
  door_open_max_mask_minutes_per_day: 60,
  excursion_confirm_minutes_door_closed: 10,
  excursion_confirm_minutes_door_open: 20,
  max_excursion_minutes: 60,
  // New missed check-in thresholds
  offline_warning_missed_checkins: 1,      // Offline warning after 1 missed check-in
  offline_critical_missed_checkins: 5,     // Offline critical after 5 missed check-ins
  manual_log_missed_checkins_threshold: 5, // Manual logging required after 5 missed check-ins
  source_unit: false,
  source_site: false,
  source_org: false,
};

/**
 * Compute missed check-ins based on last check-in time and interval
 * Returns 999 for null lastCheckinAt to indicate "never seen" (treated as critical offline)
 */
export function computeMissedCheckins(lastCheckinAt: string | null, intervalMinutes: number): number {
  // If never checked in, treat as "always offline" - return max missed
  if (!lastCheckinAt) return 999;
  const elapsed = Date.now() - new Date(lastCheckinAt).getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  // Add 30-second buffer to avoid flapping
  const bufferedElapsed = Math.max(0, elapsed - 30000);
  return Math.max(0, Math.floor(bufferedElapsed / intervalMs) - 1);
}

/**
 * Compute offline severity based on missed check-ins and thresholds
 */
export function computeOfflineSeverity(
  missedCheckins: number,
  rules: AlertRules
): "none" | "warning" | "critical" {
  if (missedCheckins >= rules.offline_critical_missed_checkins) return "critical";
  if (missedCheckins >= rules.offline_warning_missed_checkins) return "warning";
  return "none";
}

/**
 * Compute offline trigger in milliseconds based on rules
 */
export function computeOfflineTriggerMs(rules: AlertRules): number {
  return (
    rules.expected_reading_interval_seconds * rules.offline_trigger_multiplier * 1000 +
    rules.offline_trigger_additional_minutes * 60 * 1000
  );
}

/**
 * Compute manual required trigger in minutes (interval + grace)
 */
export function computeManualTriggerMinutes(rules: AlertRules): number {
  return rules.manual_interval_minutes + rules.manual_grace_minutes;
}

/**
 * Get effective alert rules for a specific unit
 *
 * Phase 5 Note: Returns DEFAULT_ALERT_RULES for all units.
 * Alert evaluation happens server-side using these defaults.
 * Alert rules CRUD endpoints don't exist yet (deferred to Phase 6+).
 *
 * TODO (Phase 6+): Implement alert rules CRUD API and fetch custom thresholds
 */
export function useUnitAlertRules(unitId: string | null) {
  const user = useUser();

  return useQuery({
    queryKey: qk.unit(unitId).alertRules(),
    queryFn: async (): Promise<AlertRules> => {
      if (!unitId) return DEFAULT_ALERT_RULES;

      // Phase 5: Return defaults - no backend endpoint yet
      // Backend Phase 4 built alert evaluation using DEFAULT_ALERT_RULES
      // Alert rules configuration (admin functionality) is Phase 6+ work
      console.log("[useUnitAlertRules] Phase 5: Returning defaults (rules CRUD is Phase 6+)");

      return DEFAULT_ALERT_RULES;
    },
    enabled: !!unitId && !!user,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get organization-level alert rules
 *
 * Phase 5 Note: Returns null (no rules configured).
 * Alert rules CRUD is Phase 6+ functionality.
 *
 * TODO (Phase 6+): Implement alert rules API endpoints
 */
export function useOrgAlertRules(orgId: string | null) {
  const user = useUser();

  return useQuery({
    queryKey: qk.org(orgId).alertRules(),
    queryFn: async (): Promise<AlertRulesRow | null> => {
      if (!orgId) return null;

      // Phase 5: No backend endpoint for alert rules CRUD
      // Alert configuration is admin-level functionality deferred to Phase 6+
      console.log("[useOrgAlertRules] Phase 5: No rules endpoint (CRUD is Phase 6+)");

      return null;
    },
    enabled: !!orgId && !!user,
  });
}

/**
 * Get site-level alert rules
 *
 * Phase 5 Note: Returns null (no rules configured).
 * Alert rules CRUD is Phase 6+ functionality.
 *
 * TODO (Phase 6+): Implement alert rules API endpoints
 */
export function useSiteAlertRules(siteId: string | null) {
  const user = useUser();

  return useQuery({
    queryKey: qk.site(siteId).alertRules(),
    queryFn: async (): Promise<AlertRulesRow | null> => {
      if (!siteId) return null;

      // Phase 5: No backend endpoint for alert rules CRUD
      console.log("[useSiteAlertRules] Phase 5: No rules endpoint (CRUD is Phase 6+)");

      return null;
    },
    enabled: !!siteId && !!user,
  });
}

/**
 * Get unit-level alert rules override
 *
 * Phase 5 Note: Returns null (no rules configured).
 * Alert rules CRUD is Phase 6+ functionality.
 *
 * TODO (Phase 6+): Implement alert rules API endpoints
 */
export function useUnitAlertRulesOverride(unitId: string | null) {
  const user = useUser();

  return useQuery({
    queryKey: qk.unit(unitId).alertRulesOverride(),
    queryFn: async (): Promise<AlertRulesRow | null> => {
      if (!unitId) return null;

      // Phase 5: No backend endpoint for alert rules CRUD
      console.log("[useUnitAlertRulesOverride] Phase 5: No rules endpoint (CRUD is Phase 6+)");

      return null;
    },
    enabled: !!unitId && !!user,
  });
}

/**
 * Upsert alert rules (create or update)
 *
 * Phase 5 Note: No-op mutation - backend endpoints don't exist yet.
 * Alert rules CRUD is Phase 6+ functionality.
 *
 * TODO (Phase 6+): Implement POST/PUT /api/orgs/:orgId/alert-rules
 */
export async function upsertAlertRules(
  scope: { organization_id?: string; site_id?: string; unit_id?: string },
  rules: Partial<AlertRulesRow>
): Promise<{ error: Error | null }> {
  console.warn("[upsertAlertRules] Phase 5: No-op (alert rules CRUD is Phase 6+)");

  // Return success but do nothing - alert evaluation uses DEFAULT_ALERT_RULES
  // This prevents errors in existing UI that may call this function
  return { error: null };
}

/**
 * Delete alert rules override
 *
 * Phase 5 Note: No-op mutation - backend endpoints don't exist yet.
 * Alert rules CRUD is Phase 6+ functionality.
 *
 * TODO (Phase 6+): Implement DELETE /api/orgs/:orgId/alert-rules
 */
export async function deleteAlertRules(
  scope: { organization_id?: string; site_id?: string; unit_id?: string }
): Promise<{ error: Error | null }> {
  console.warn("[deleteAlertRules] Phase 5: No-op (alert rules CRUD is Phase 6+)");

  // Return success but do nothing
  return { error: null };
}
