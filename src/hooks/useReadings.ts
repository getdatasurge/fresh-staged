/**
 * Readings Domain Hooks
 *
 * tRPC-based hooks for sensor reading queries.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * NOTE: Bulk ingestion (POST /api/ingest/readings) stays as REST with API key auth.
 * These hooks are for querying readings only.
 *
 * @example
 * ```tsx
 * // Query readings for a unit with filters
 * const { data: readings } = useReadings(organizationId, unitId, {
 *   page: 1,
 *   limit: 100,
 *   start: '2024-01-01T00:00:00Z',
 *   end: '2024-01-02T00:00:00Z'
 * });
 *
 * // Get the latest reading for a unit
 * const { data: latest } = useLatestReading(organizationId, unitId);
 * ```
 */

import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

/**
 * Query readings for a unit with pagination and date filters
 *
 * @param organizationId - Organization UUID
 * @param unitId - Unit UUID
 * @param filters - Optional pagination and date filters
 * @param options - Query options including enabled flag
 * @returns React Query result with readings array
 */
export function useReadings(
  organizationId: string | undefined,
  unitId: string | undefined,
  filters?: {
    page?: number;
    limit?: number;
    start?: string;
    end?: string;
  },
  options?: { enabled?: boolean },
) {
  const trpc = useTRPC();

  const queryOptions = trpc.readings.list.queryOptions({
    organizationId: organizationId!,
    unitId: unitId!,
    page: filters?.page,
    limit: filters?.limit,
    start: filters?.start,
    end: filters?.end,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!unitId && options?.enabled !== false,
    // Readings update frequently - use shorter stale time
    staleTime: 30_000, // 30 seconds
    gcTime: 2 * 60_000, // 2 minutes
  });
}

/**
 * Get the latest reading for a unit
 *
 * Convenience hook for dashboards and real-time displays.
 *
 * @param organizationId - Organization UUID
 * @param unitId - Unit UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with latest reading or null
 */
export function useLatestReading(
  organizationId: string | undefined,
  unitId: string | undefined,
  options?: { enabled?: boolean },
) {
  const trpc = useTRPC();

  const queryOptions = trpc.readings.latest.queryOptions({
    organizationId: organizationId!,
    unitId: unitId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!unitId && options?.enabled !== false,
    // Latest reading should be very fresh
    staleTime: 30_000, // 30 seconds
    gcTime: 60_000, // 1 minute
    // Refetch on window focus for real-time feel
    refetchOnWindowFocus: true,
  });
}

/**
 * List door events for a unit
 *
 * @param organizationId - Organization UUID
 * @param unitId - Unit UUID
 * @param limit - Number of events to return
 * @param options - Query options including enabled flag
 * @returns React Query result with door events array
 */
export function useDoorEvents(
  organizationId: string | undefined,
  unitId: string | undefined,
  limit?: number,
  options?: { enabled?: boolean },
) {
  const trpc = useTRPC();

  const queryOptions = trpc.readings.listDoorEvents.queryOptions({
    organizationId: organizationId!,
    unitId: unitId!,
    limit,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!unitId && options?.enabled !== false,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}
