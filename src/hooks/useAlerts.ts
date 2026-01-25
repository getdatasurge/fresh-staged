/**
 * Alerts Domain Hooks
 *
 * tRPC-based hooks for alert management operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * @example
 * ```tsx
 * // Query alerts with filters
 * const { data: alerts } = useAlerts(organizationId, {
 *   status: 'pending',
 *   siteId: 'uuid'
 * });
 *
 * // Get a specific alert
 * const { data: alert } = useAlert(organizationId, alertId);
 *
 * // Acknowledge an alert
 * const ack = useAcknowledgeAlert();
 * await ack.mutateAsync({ organizationId, alertId, notes: 'Investigating' });
 *
 * // Resolve an alert
 * const resolve = useResolveAlert();
 * await resolve.mutateAsync({
 *   organizationId, alertId,
 *   resolution: 'Compressor repaired',
 *   correctiveAction: 'Replaced failing compressor fan'
 * });
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';

/**
 * Alert status values for filtering
 */
export type AlertStatusFilter = 'pending' | 'acknowledged' | 'resolved' | 'escalated';

/**
 * Alert severity values for filtering
 */
export type AlertSeverityFilter = 'warning' | 'critical';

/**
 * Filters for listing alerts
 */
export interface AlertFilters {
  status?: AlertStatusFilter;
  severity?: AlertSeverityFilter;
  unitId?: string;
  siteId?: string;
  page?: number;
  limit?: number;
  start?: string;
  end?: string;
}

/**
 * List alerts for an organization with optional filters
 *
 * @param organizationId - Organization UUID
 * @param filters - Optional filters for status, severity, unit, site, pagination
 * @param options - Query options including enabled flag
 * @returns React Query result with alerts array
 */
export function useAlerts(
  organizationId: string | undefined,
  filters?: AlertFilters,
  options?: { enabled?: boolean }
) {
  const trpc = useTRPC();

  const queryOptions = trpc.alerts.list.queryOptions({
    organizationId: organizationId!,
    status: filters?.status,
    severity: filters?.severity,
    unitId: filters?.unitId,
    siteId: filters?.siteId,
    page: filters?.page,
    limit: filters?.limit,
    start: filters?.start,
    end: filters?.end,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && (options?.enabled !== false),
    // Alerts are time-sensitive - use shorter stale time
    staleTime: 30_000, // 30 seconds
    gcTime: 2 * 60_000, // 2 minutes
    // Refetch on window focus for real-time alerting
    refetchOnWindowFocus: true,
  });
}

/**
 * Get a specific alert by ID
 *
 * @param organizationId - Organization UUID
 * @param alertId - Alert UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with alert data
 */
export function useAlert(
  organizationId: string | undefined,
  alertId: string | undefined,
  options?: { enabled?: boolean }
) {
  const trpc = useTRPC();

  const queryOptions = trpc.alerts.get.queryOptions({
    organizationId: organizationId!,
    alertId: alertId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!alertId && (options?.enabled !== false),
    staleTime: 30_000, // 30 seconds
    gcTime: 2 * 60_000, // 2 minutes
  });
}

/**
 * Acknowledge an alert
 *
 * Requires staff, manager, admin, or owner role.
 *
 * @returns Mutation hook for acknowledging alerts
 *
 * @example
 * ```tsx
 * const ack = useAcknowledgeAlert();
 * await ack.mutateAsync({
 *   organizationId: 'uuid',
 *   alertId: 'uuid',
 *   notes: 'Investigating the temperature spike'
 * });
 * ```
 */
export function useAcknowledgeAlert() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      alertId: string;
      notes?: string;
    }) => {
      return client.alerts.acknowledge.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate alerts list to refetch updated data
      const listOptions = trpc.alerts.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific alert query
      const getOptions = trpc.alerts.get.queryOptions({
        organizationId: variables.organizationId,
        alertId: variables.alertId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
    },
  });
}

/**
 * Resolve an alert with resolution details
 *
 * Requires staff, manager, admin, or owner role.
 *
 * @returns Mutation hook for resolving alerts
 *
 * @example
 * ```tsx
 * const resolve = useResolveAlert();
 * await resolve.mutateAsync({
 *   organizationId: 'uuid',
 *   alertId: 'uuid',
 *   resolution: 'Compressor repaired',
 *   correctiveAction: 'Replaced failing compressor fan and added monitoring'
 * });
 * ```
 */
export function useResolveAlert() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      alertId: string;
      resolution: string;
      correctiveAction?: string;
    }) => {
      return client.alerts.resolve.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate alerts list to refetch updated data
      const listOptions = trpc.alerts.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific alert query
      const getOptions = trpc.alerts.get.queryOptions({
        organizationId: variables.organizationId,
        alertId: variables.alertId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
    },
  });
}

/**
 * List alerts for a specific unit
 *
 * Convenience wrapper around useAlerts with unitId filter.
 *
 * @param organizationId - Organization UUID
 * @param unitId - Unit UUID
 * @param filters - Additional filters excluding unitId
 * @param options - Query options including enabled flag
 * @returns React Query result with alerts array
 */
export function useUnitAlerts(
  organizationId: string | undefined,
  unitId: string | undefined,
  filters?: Omit<AlertFilters, 'unitId'>,
  options?: { enabled?: boolean }
) {
  return useAlerts(
    organizationId,
    { ...filters, unitId: unitId },
    { enabled: !!organizationId && !!unitId && (options?.enabled !== false) }
  );
}
