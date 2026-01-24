import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { computeUnitStatus, UnitStatusInfo, OfflineSeverity } from "./useUnitStatus";
import { AlertRules, DEFAULT_ALERT_RULES } from "./useAlertRules";
import { alertsApi } from "@/lib/api/alerts";
import { useOrgScope } from "@/hooks/useOrgScope";
import { qk } from "@/lib/queryKeys";
import type { AlertResponse, AlertStatus } from "@/lib/api-types";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType =
  | "MANUAL_REQUIRED"
  | "OFFLINE_WARNING"
  | "OFFLINE_CRITICAL"
  | "OFFLINE" // Legacy - kept for compatibility
  | "EXCURSION"
  | "ALARM_ACTIVE"
  | "LOW_BATTERY"
  | "SUSPECTED_COOLING_FAILURE"
  | "TEMP_EXCURSION";

export interface ComputedAlert {
  id: string; // unit_id + alert_type for dedup
  unit_id: string;
  unit_name: string;
  site_name: string;
  area_name: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  created_at: string;
  isDiagnostic?: boolean; // For suspected cooling failure
  doorContext?: string; // "door open" or "door closed" for temp alerts
  missedCheckins?: number; // For offline alerts
}

export interface UnitAlertsSummary {
  alerts: ComputedAlert[];
  criticalCount: number;
  warningCount: number;
  totalCount: number;
  unitsOk: number;
  unitsWithAlerts: number;
}

// Extended unit info with door and battery data
export interface ExtendedUnitStatusInfo extends UnitStatusInfo {
  door_state?: "open" | "closed" | "unknown" | null;
  door_last_changed_at?: string | null;
  door_open_grace_minutes?: number;
  battery_level?: number | null;
  battery_last_reported_at?: string | null;
  // Sensor reliability (inherited from UnitStatusInfo but may be directly set)
  sensor_reliable?: boolean;
  manual_logging_enabled?: boolean;
}

/**
 * Computes alerts from unit status - single source of truth for Dashboard + Alerts page
 */
export function computeUnitAlerts(
  units: (UnitStatusInfo | ExtendedUnitStatusInfo)[],
  rulesMap?: Map<string, AlertRules>
): UnitAlertsSummary {
  const alerts: ComputedAlert[] = [];
  let unitsOk = 0;
  const unitIdsWithAlerts = new Set<string>();

  for (const unit of units) {
    const rules = rulesMap?.get(unit.id) || DEFAULT_ALERT_RULES;
    const computed = computeUnitStatus(unit, rules);
    let hasAlert = false;

    // Type guard for extended info
    const extUnit = unit as ExtendedUnitStatusInfo;
    const doorState = extUnit.door_state || "unknown";
    const doorContext = doorState === "open" ? " (door open)" : doorState === "closed" ? " (door closed)" : "";

    // Check sensor reliability for manual logging gating
    const isManualLoggingEnabled = unit.manual_logging_enabled !== false;

    // OFFLINE - Split into warning and critical based on missed check-ins
    if (computed.offlineSeverity === "critical") {
      alerts.push({
        id: `${unit.id}-OFFLINE_CRITICAL`,
        unit_id: unit.id,
        unit_name: unit.name,
        site_name: unit.area.site.name,
        area_name: unit.area.name,
        type: "OFFLINE_CRITICAL",
        severity: "critical",
        title: "Sensor Offline (Critical)",
        message: `Missed ${computed.missedCheckins} check-ins (threshold: ${rules.offline_critical_missed_checkins})`,
        created_at: new Date().toISOString(),
        missedCheckins: computed.missedCheckins,
      });
      hasAlert = true;
    } else if (computed.offlineSeverity === "warning") {
      alerts.push({
        id: `${unit.id}-OFFLINE_WARNING`,
        unit_id: unit.id,
        unit_name: unit.name,
        site_name: unit.area.site.name,
        area_name: unit.area.name,
        type: "OFFLINE_WARNING",
        severity: "warning",
        title: "Sensor Offline (Warning)",
        message: `Missed ${computed.missedCheckins} check-in${computed.missedCheckins > 1 ? 's' : ''} - monitoring may be interrupted`,
        created_at: new Date().toISOString(),
        missedCheckins: computed.missedCheckins,
      });
      hasAlert = true;
    }

    // MANUAL_REQUIRED - CRITICAL (only if threshold met AND manual log is due)
    // Key change: only show when missed check-ins >= threshold AND 4 hours since last reading
    if (computed.manualRequired && isManualLoggingEnabled) {
      const hoursOverdue = computed.manualOverdueMinutes >= 60
        ? Math.floor(computed.manualOverdueMinutes / 60)
        : 0;
      const minutesOverdue = computed.manualOverdueMinutes % 60;

      alerts.push({
        id: `${unit.id}-MANUAL_REQUIRED`,
        unit_id: unit.id,
        unit_name: unit.name,
        site_name: unit.area.site.name,
        area_name: unit.area.name,
        type: "MANUAL_REQUIRED",
        severity: "critical",
        title: "Manual Logging Required",
        message: computed.minutesSinceManualLog === null
          ? "No manual log recorded - temperature reading needed"
          : hoursOverdue > 0
            ? `Manual log is ${hoursOverdue}h ${minutesOverdue}m overdue`
            : `Manual log is ${minutesOverdue}m overdue`,
        created_at: new Date().toISOString(),
      });
      hasAlert = true;
    }

    // ALARM_ACTIVE - CRITICAL (with door context)
    if (unit.status === "alarm_active") {
      alerts.push({
        id: `${unit.id}-ALARM_ACTIVE`,
        unit_id: unit.id,
        unit_name: unit.name,
        site_name: unit.area.site.name,
        area_name: unit.area.name,
        type: "ALARM_ACTIVE",
        severity: "critical",
        title: `Temperature Alarm${doorContext}`,
        message: `Temperature at ${unit.last_temp_reading?.toFixed(1) || "--"}°F exceeds limit of ${unit.temp_limit_high}°F`,
        created_at: new Date().toISOString(),
        doorContext: doorState !== "unknown" ? doorState : undefined,
      });
      hasAlert = true;
    }

    // EXCURSION - WARNING (with door context)
    if (unit.status === "excursion") {
      alerts.push({
        id: `${unit.id}-EXCURSION`,
        unit_id: unit.id,
        unit_name: unit.name,
        site_name: unit.area.site.name,
        area_name: unit.area.name,
        type: "EXCURSION",
        severity: "warning",
        title: `Temperature Excursion${doorContext}`,
        message: `Temperature at ${unit.last_temp_reading?.toFixed(1) || "--"}°F is out of range`,
        created_at: new Date().toISOString(),
        doorContext: doorState !== "unknown" ? doorState : undefined,
      });
      hasAlert = true;
    }

    // LOW_BATTERY - WARNING at <20%, CRITICAL at <10%
    if (extUnit.battery_level !== undefined && extUnit.battery_level !== null) {
      if (extUnit.battery_level < 10) {
        alerts.push({
          id: `${unit.id}-LOW_BATTERY`,
          unit_id: unit.id,
          unit_name: unit.name,
          site_name: unit.area.site.name,
          area_name: unit.area.name,
          type: "LOW_BATTERY",
          severity: "critical",
          title: "Critical Battery Level",
          message: `Battery at ${extUnit.battery_level}% - replace immediately`,
          created_at: new Date().toISOString(),
        });
        hasAlert = true;
      } else if (extUnit.battery_level < 20) {
        alerts.push({
          id: `${unit.id}-LOW_BATTERY`,
          unit_id: unit.id,
          unit_name: unit.name,
          site_name: unit.area.site.name,
          area_name: unit.area.name,
          type: "LOW_BATTERY",
          severity: "warning",
          title: "Low Battery Warning",
          message: `Battery at ${extUnit.battery_level}% - plan replacement soon`,
          created_at: new Date().toISOString(),
        });
        hasAlert = true;
      }
    }

    if (hasAlert) {
      unitIdsWithAlerts.add(unit.id);
    } else {
      unitsOk++;
    }
  }

  // Sort: critical first, then warning
  alerts.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (a.severity !== "critical" && b.severity === "critical") return 1;
    return 0;
  });

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return {
    alerts,
    criticalCount,
    warningCount,
    totalCount: alerts.length,
    unitsOk,
    unitsWithAlerts: unitIdsWithAlerts.size,
  };
}

/**
 * Hook to compute alerts from units - use in components
 */
export function useUnitAlerts(
  units: (UnitStatusInfo | ExtendedUnitStatusInfo)[],
  rulesMap?: Map<string, AlertRules>
): UnitAlertsSummary {
  return useMemo(() => computeUnitAlerts(units, rulesMap), [units, rulesMap]);
}

/**
 * Fetch alerts from backend for a specific unit
 * Uses alertsApi from Phase 4 backend implementation
 */
export function useFetchUnitAlerts(
  unitId: string | null,
  params?: {
    status?: AlertStatus | AlertStatus[];
    page?: number;
    limit?: number;
  }
) {
  const user = useUser();
  const { orgId, isReady } = useOrgScope();

  return useQuery({
    queryKey: qk.unit(unitId).alerts(params?.status, params?.page, params?.limit),
    queryFn: async (): Promise<AlertResponse[]> => {
      if (!orgId || !unitId) return [];

      const { accessToken } = await user.getAuthJson();

      return alertsApi.listUnitAlerts(
        orgId,
        unitId,
        {
          status: params?.status,
          page: params?.page,
          limit: params?.limit,
        },
        accessToken
      );
    },
    enabled: isReady && !!unitId && !!user,
    staleTime: 10000, // Cache for 10 seconds
  });
}

/**
 * Fetch all alerts for organization with optional filters
 * Uses alertsApi from Phase 4 backend implementation
 */
export function useFetchAlerts(
  params?: {
    status?: AlertStatus | AlertStatus[];
    unitId?: string;
    siteId?: string;
    page?: number;
    limit?: number;
  }
) {
  const user = useUser();
  const { orgId, isReady } = useOrgScope();

  return useQuery({
    queryKey: qk.org(orgId).alerts(
      params?.status,
      params?.unitId,
      params?.siteId,
      params?.page,
      params?.limit
    ),
    queryFn: async (): Promise<AlertResponse[]> => {
      if (!orgId) return [];

      const { accessToken } = await user.getAuthJson();

      return alertsApi.listAlerts(
        orgId,
        {
          status: params?.status,
          unitId: params?.unitId,
          siteId: params?.siteId,
          page: params?.page,
          limit: params?.limit,
        },
        accessToken
      );
    },
    enabled: isReady && !!user,
    staleTime: 10000, // Cache for 10 seconds
  });
}

/**
 * Acknowledge an alert
 * POST /api/orgs/:orgId/alerts/:alertId/acknowledge
 */
export function useAcknowledgeAlert() {
  const user = useUser();
  const { orgId } = useOrgScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, notes }: { alertId: string; notes?: string }) => {
      if (!orgId) throw new Error("No organization context");

      const { accessToken } = await user.getAuthJson();
      return alertsApi.acknowledgeAlert(orgId, alertId, notes, accessToken);
    },
    onSuccess: () => {
      // Invalidate alerts queries to refetch
      queryClient.invalidateQueries({ queryKey: qk.org(orgId).alerts() });
    },
  });
}

/**
 * Resolve an alert with corrective action
 * POST /api/orgs/:orgId/alerts/:alertId/resolve
 */
export function useResolveAlert() {
  const user = useUser();
  const { orgId } = useOrgScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      alertId,
      resolution,
      correctiveAction,
    }: {
      alertId: string;
      resolution: string;
      correctiveAction?: string;
    }) => {
      if (!orgId) throw new Error("No organization context");

      const { accessToken } = await user.getAuthJson();
      return alertsApi.resolveAlert(orgId, alertId, resolution, correctiveAction, accessToken);
    },
    onSuccess: () => {
      // Invalidate alerts queries to refetch
      queryClient.invalidateQueries({ queryKey: qk.org(orgId).alerts() });
    },
  });
}
