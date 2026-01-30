import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export const DEFAULT_ALERT_RULES: AlertRules = {
  manual_interval_minutes: 240,
  manual_grace_minutes: 0,
  expected_reading_interval_seconds: 300,
  offline_trigger_multiplier: 2.0,
  offline_trigger_additional_minutes: 1,
  door_open_warning_minutes: 3,
  door_open_critical_minutes: 10,
  door_open_max_mask_minutes_per_day: 60,
  excursion_confirm_minutes_door_closed: 10,
  excursion_confirm_minutes_door_open: 20,
  max_excursion_minutes: 60,
  offline_warning_missed_checkins: 1,
  offline_critical_missed_checkins: 5,
  manual_log_missed_checkins_threshold: 5,
  source_unit: false,
  source_site: false,
  source_org: false,
};

/**
 * Compute missed checkins based on last checkin time and interval
 * Returns 999 for null lastCheckinAt to indicate "never seen" (treated as critical offline)
 */
export function computeMissedCheckins(
  lastCheckinAt: string | null,
  intervalMinutes: number,
): number {
  // If never checked in, treat as "always offline" - return max missed
  if (!lastCheckinAt) return 999;
  const elapsed = Date.now() - new Date(lastCheckinAt).getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  // Add 30-second buffer to avoid flapping
  const bufferedElapsed = Math.max(0, elapsed - 30000);
  return Math.max(0, Math.floor(bufferedElapsed / intervalMs) - 1);
}

/**
 * Compute offline severity based on missed checkins and thresholds
 */
export function computeOfflineSeverity(
  missedCheckins: number,
  rules: AlertRules,
): 'none' | 'warning' | 'critical' {
  if (missedCheckins >= rules.offline_critical_missed_checkins) return 'critical';
  if (missedCheckins >= rules.offline_warning_missed_checkins) return 'warning';
  return 'none';
}

// Helper: Map backend camelCase to frontend snake_case
function mapBackendToFrontend(rule: any): AlertRulesRow {
  if (!rule) return null as any;
  return {
    id: rule.id,
    organization_id: rule.organizationId,
    site_id: rule.siteId,
    unit_id: rule.unitId,
    manual_interval_minutes: rule.manualIntervalMinutes,
    manual_grace_minutes: rule.manualGraceMinutes,
    expected_reading_interval_seconds: rule.expectedReadingIntervalSeconds,
    offline_trigger_multiplier: rule.offlineTriggerMultiplier,
    offline_trigger_additional_minutes: rule.offlineTriggerAdditionalMinutes,
    door_open_warning_minutes: rule.doorOpenWarningMinutes,
    door_open_critical_minutes: rule.doorOpenCriticalMinutes,
    door_open_max_mask_minutes_per_day: rule.doorOpenMaxMaskMinutesPerDay,
    excursion_confirm_minutes_door_closed: rule.excursionConfirmMinutesDoorClosed,
    excursion_confirm_minutes_door_open: rule.excursionConfirmMinutesDoorOpen,
    max_excursion_minutes: rule.maxExcursionMinutes,
    offline_warning_missed_checkins: rule.offlineWarningMissedCheckins,
    offline_critical_missed_checkins: rule.offlineCriticalMissedCheckins,
    manual_log_missed_checkins_threshold: rule.manualLogMissedCheckinsThreshold,
  };
}

// Helper: Map frontend snake_case to backend camelCase
function mapFrontendToBackend(rules: Partial<AlertRulesRow>): any {
  return {
    manualIntervalMinutes: rules.manual_interval_minutes,
    manualGraceMinutes: rules.manual_grace_minutes,
    expectedReadingIntervalSeconds: rules.expected_reading_interval_seconds,
    offlineTriggerMultiplier: rules.offline_trigger_multiplier,
    offlineTriggerAdditionalMinutes: rules.offline_trigger_additional_minutes,
    doorOpenWarningMinutes: rules.door_open_warning_minutes,
    doorOpenCriticalMinutes: rules.door_open_critical_minutes,
    doorOpenMaxMaskMinutesPerDay: rules.door_open_max_mask_minutes_per_day,
    excursionConfirmMinutesDoorClosed: rules.excursion_confirm_minutes_door_closed,
    excursionConfirmMinutesDoorOpen: rules.excursion_confirm_minutes_door_open,
    maxExcursionMinutes: rules.max_excursion_minutes,
    offlineWarningMissedCheckins: rules.offline_warning_missed_checkins,
    offlineCriticalMissedCheckins: rules.offline_critical_missed_checkins,
    manualLogMissedCheckinsThreshold: rules.manual_log_missed_checkins_threshold,
  };
}

export function useUnitAlertRules(unitId: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.alertRules.get.queryOptions({ unitId: unitId! }, { enabled: !!unitId }),
    select: (data) => {
      if (!data) return DEFAULT_ALERT_RULES;
      const row = mapBackendToFrontend(data);
      return { ...DEFAULT_ALERT_RULES, ...row, source_unit: true }; // Simplified logic
    },
  });
}

export function useOrgAlertRules(orgId: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.alertRules.get.queryOptions({ organizationId: orgId! }, { enabled: !!orgId }),
    select: mapBackendToFrontend,
  });
}

export function useSiteAlertRules(siteId: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.alertRules.get.queryOptions({ siteId: siteId! }, { enabled: !!siteId }),
    select: mapBackendToFrontend,
  });
}

export function useUnitAlertRulesOverride(unitId: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.alertRules.get.queryOptions({ unitId: unitId! }, { enabled: !!unitId }),
    select: mapBackendToFrontend,
  });
}

// Hook for upserting rules
export function useUpsertAlertRules() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      scope: { organization_id?: string; site_id?: string; unit_id?: string };
      rules: Partial<AlertRulesRow>;
    }) => {
      return trpcClient.alertRules.upsert.mutate({
        organizationId: args.scope.organization_id,
        siteId: args.scope.site_id,
        unitId: args.scope.unit_id,
        data: mapFrontendToBackend(args.rules),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['alertRules']] }); // Approximate invalidation
    },
  });
}

// Hook for deleting rules
export function useDeleteAlertRules() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scope: { organization_id?: string; site_id?: string; unit_id?: string }) => {
      return trpcClient.alertRules.delete.mutate({
        organizationId: scope.organization_id,
        siteId: scope.site_id,
        unitId: scope.unit_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['alertRules']] });
    },
  });
}

// Hook for clearing field (if needed, or use upsert with null? Editor uses clearField endpoint usually or update with null)
// We added clearField to router.
export function useClearRuleField() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { ruleId: string; field: string }) => {
      // Map field name from frontend snake_case to backend fields
      // Actually backend service expects snake_case for allow list but camelCase properties?
      // Step 344 service: allow list has snake_case (e.g. manual_interval_minutes).
      // And db driver uses snake_case column names.
      // So passing snake_case field name should work if DB column is snake_case.
      return trpcClient.alertRules.clearField.mutate(args);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [['alertRules']] });
    },
  });
}
