/**
 * Notification Policies Domain Hooks
 *
 * tRPC-based hooks for notification policy management.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Migrated to tRPC in Phase 21 (Plan 05).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';

// Alert types that can have notification policies
export const ALERT_TYPES = [
  'temp_excursion',
  'monitoring_interrupted',
  'missed_manual_entry',
  'low_battery',
  'sensor_fault',
  'door_open',
  'alarm_active',
  'suspected_cooling_failure',
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  temp_excursion: 'Temperature Excursion',
  monitoring_interrupted: 'Monitoring Interrupted',
  missed_manual_entry: 'Missed Manual Entry',
  low_battery: 'Low Battery',
  sensor_fault: 'Sensor Fault',
  door_open: 'Door Left Open',
  alarm_active: 'Alarm Active',
  suspected_cooling_failure: 'Suspected Cooling Failure',
};

export type NotificationChannel = 'WEB_TOAST' | 'IN_APP_CENTER' | 'EMAIL' | 'SMS';

export interface EscalationStep {
  delay_minutes: number;
  channels: ('EMAIL' | 'SMS')[];
  contact_priority?: number;
  repeat: boolean;
}

export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export interface NotificationPolicy {
  id?: string;
  organization_id?: string | null;
  site_id?: string | null;
  unit_id?: string | null;
  alert_type: string;
  initial_channels: NotificationChannel[];
  requires_ack: boolean;
  ack_deadline_minutes: number | null;
  escalation_steps: EscalationStep[];
  send_resolved_notifications: boolean;
  reminders_enabled: boolean;
  reminder_interval_minutes: number | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string | null;
  quiet_hours_end_local: string | null;
  severity_threshold: 'INFO' | 'WARNING' | 'CRITICAL';
  allow_warning_notifications: boolean;
  // Recipient targeting
  notify_roles: AppRole[];
  notify_site_managers: boolean;
  notify_assigned_users: boolean;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface EffectiveNotificationPolicy extends Omit<
  NotificationPolicy,
  'id' | 'organization_id' | 'site_id' | 'unit_id' | 'created_at' | 'updated_at'
> {
  source_unit: boolean;
  source_site: boolean;
  source_org: boolean;
}

// Default policy values
export const DEFAULT_NOTIFICATION_POLICY: Omit<NotificationPolicy, 'alert_type'> = {
  initial_channels: ['IN_APP_CENTER'],
  requires_ack: false,
  ack_deadline_minutes: null,
  escalation_steps: [],
  send_resolved_notifications: false,
  reminders_enabled: false,
  reminder_interval_minutes: null,
  quiet_hours_enabled: false,
  quiet_hours_start_local: null,
  quiet_hours_end_local: null,
  severity_threshold: 'WARNING',
  allow_warning_notifications: false,
  notify_roles: ['owner', 'admin'],
  notify_site_managers: true,
  notify_assigned_users: false,
};

/**
 * Hook to fetch org-level notification policies
 */
export function useOrgNotificationPolicies(orgId: string | null) {
  const trpc = useTRPC();

  const queryOptions = trpc.notificationPolicies.listByOrg.queryOptions({
    organizationId: orgId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!orgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch site-level notification policies
 */
export function useSiteNotificationPolicies(siteId: string | null, orgId?: string) {
  const trpc = useTRPC();

  const queryOptions = trpc.notificationPolicies.listBySite.queryOptions({
    organizationId: orgId!,
    siteId: siteId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!siteId && !!orgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch unit-level notification policies
 */
export function useUnitNotificationPolicies(unitId: string | null, orgId?: string) {
  const trpc = useTRPC();

  const queryOptions = trpc.notificationPolicies.listByUnit.queryOptions({
    organizationId: orgId!,
    unitId: unitId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!unitId && !!orgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch effective notification policy for a unit + alert type
 * Uses the inheritance chain: unit -> site -> org
 */
export function useEffectiveNotificationPolicy(
  unitId: string | null,
  alertType: string | null,
  orgId?: string,
) {
  const trpc = useTRPC();

  const queryOptions = trpc.notificationPolicies.getEffective.queryOptions({
    organizationId: orgId!,
    unitId: unitId!,
    alertType: alertType!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!unitId && !!alertType && !!orgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook for upserting notification policy with mutation
 */
export function useUpsertNotificationPolicy() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scope,
      alertType,
      policy,
      orgId,
    }: {
      scope: { organization_id?: string; site_id?: string; unit_id?: string };
      alertType: string;
      policy: Partial<NotificationPolicy>;
      orgId: string;
    }) => {
      return client.notificationPolicies.upsert.mutate({
        organizationId: orgId,
        scope,
        alertType,
        policy,
      });
    },
    onSuccess: async (_data, variables) => {
      // Invalidate all notification policy queries for the affected scopes
      if (variables.scope.organization_id) {
        const orgQueryOptions = trpc.notificationPolicies.listByOrg.queryOptions({
          organizationId: variables.scope.organization_id,
        });
        await queryClient.invalidateQueries({
          queryKey: orgQueryOptions.queryKey,
        });
      }
      if (variables.scope.site_id) {
        const siteQueryOptions = trpc.notificationPolicies.listBySite.queryOptions({
          organizationId: variables.orgId,
          siteId: variables.scope.site_id,
        });
        await queryClient.invalidateQueries({
          queryKey: siteQueryOptions.queryKey,
        });
      }
      if (variables.scope.unit_id) {
        const unitQueryOptions = trpc.notificationPolicies.listByUnit.queryOptions({
          organizationId: variables.orgId,
          unitId: variables.scope.unit_id,
        });
        await queryClient.invalidateQueries({
          queryKey: unitQueryOptions.queryKey,
        });
        // Also invalidate effective policy queries for this unit
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key.some((k) => typeof k === 'object' && k !== null && 'unitId' in k)
            );
          },
        });
      }
    },
  });
}

/**
 * Hook for deleting notification policy with mutation
 */
export function useDeleteNotificationPolicy() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scope,
      alertType,
      orgId,
    }: {
      scope: { organization_id?: string; site_id?: string; unit_id?: string };
      alertType: string;
      orgId: string;
    }) => {
      return client.notificationPolicies.delete.mutate({
        organizationId: orgId,
        scope,
        alertType,
      });
    },
    onSuccess: async (_data, variables) => {
      // Invalidate all notification policy queries for the affected scopes
      if (variables.scope.organization_id) {
        const orgQueryOptions = trpc.notificationPolicies.listByOrg.queryOptions({
          organizationId: variables.scope.organization_id,
        });
        await queryClient.invalidateQueries({
          queryKey: orgQueryOptions.queryKey,
        });
      }
      if (variables.scope.site_id) {
        const siteQueryOptions = trpc.notificationPolicies.listBySite.queryOptions({
          organizationId: variables.orgId,
          siteId: variables.scope.site_id,
        });
        await queryClient.invalidateQueries({
          queryKey: siteQueryOptions.queryKey,
        });
      }
      if (variables.scope.unit_id) {
        const unitQueryOptions = trpc.notificationPolicies.listByUnit.queryOptions({
          organizationId: variables.orgId,
          unitId: variables.scope.unit_id,
        });
        await queryClient.invalidateQueries({
          queryKey: unitQueryOptions.queryKey,
        });
        // Also invalidate effective policy queries for this unit
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key.some((k) => typeof k === 'object' && k !== null && 'unitId' in k)
            );
          },
        });
      }
    },
  });
}

/**
 * Get policy for specific alert type from array
 */
export function getPolicyForAlertType(
  policies: NotificationPolicy[] | undefined,
  alertType: string,
): NotificationPolicy | undefined {
  return policies?.find((p) => p.alert_type === alertType);
}
