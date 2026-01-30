/**
 * Units Domain Hooks
 *
 * tRPC-based hooks for unit management operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Units are nested: org -> site -> area -> unit.
 *
 * @example
 * ```tsx
 * // Query units for an area
 * const { data: units, isLoading } = useUnits(organizationId, siteId, areaId);
 *
 * // Get a specific unit
 * const { data: unit } = useUnit(organizationId, siteId, areaId, unitId);
 *
 * // Create a new unit
 * const createUnit = useCreateUnit();
 * await createUnit.mutateAsync({
 *   organizationId, siteId, areaId,
 *   data: { name: 'Freezer 1', unitType: 'freezer', tempMin: -25, tempMax: -18 }
 * });
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';

/**
 * List all units for an area
 *
 * @param organizationId - Organization UUID
 * @param siteId - Site UUID
 * @param areaId - Area UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with units array
 */
export function useUnits(
  organizationId: string | undefined,
  siteId: string | undefined,
  areaId: string | undefined,
  options?: { enabled?: boolean },
) {
  const trpc = useTRPC();

  const queryOptions = trpc.units.list.queryOptions({
    organizationId: organizationId!,
    siteId: siteId!,
    areaId: areaId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!siteId && !!areaId && options?.enabled !== false,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Get a specific unit by ID
 *
 * @param organizationId - Organization UUID
 * @param siteId - Site UUID
 * @param areaId - Area UUID
 * @param unitId - Unit UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with unit data
 */
export function useUnit(
  organizationId: string | undefined,
  siteId: string | undefined,
  areaId: string | undefined,
  unitId: string | undefined,
  options?: { enabled?: boolean },
) {
  const trpc = useTRPC();

  const queryOptions = trpc.units.get.queryOptions({
    organizationId: organizationId!,
    siteId: siteId!,
    areaId: areaId!,
    unitId: unitId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!siteId && !!areaId && !!unitId && options?.enabled !== false,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Create a new unit in an area
 *
 * Requires manager, admin, or owner role.
 *
 * @returns Mutation hook for creating units
 *
 * @example
 * ```tsx
 * const createUnit = useCreateUnit();
 * await createUnit.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   areaId: 'uuid',
 *   data: { name: 'Freezer 1', unitType: 'freezer', tempMin: -25, tempMax: -18 }
 * });
 * ```
 */
export function useCreateUnit() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      areaId: string;
      data: {
        name: string;
        unitType:
          | 'fridge'
          | 'freezer'
          | 'display_case'
          | 'walk_in_cooler'
          | 'walk_in_freezer'
          | 'blast_chiller';
        tempMin: number;
        tempMax: number;
        tempUnit?: 'F' | 'C';
        manualMonitoringRequired?: boolean;
        manualMonitoringInterval?: number | null;
        sortOrder?: number;
      };
    }) => {
      return client.units.create.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate units list to refetch updated data
      const listOptions = trpc.units.list.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
        areaId: variables.areaId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
    },
  });
}

/**
 * Update an existing unit
 *
 * Requires manager, admin, or owner role.
 *
 * @returns Mutation hook for updating units
 *
 * @example
 * ```tsx
 * const updateUnit = useUpdateUnit();
 * await updateUnit.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   areaId: 'uuid',
 *   unitId: 'uuid',
 *   data: { name: 'Updated Freezer', tempMax: -16 }
 * });
 * ```
 */
export function useUpdateUnit() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      areaId: string;
      unitId: string;
      data: {
        name?: string;
        unitType?:
          | 'fridge'
          | 'freezer'
          | 'display_case'
          | 'walk_in_cooler'
          | 'walk_in_freezer'
          | 'blast_chiller';
        tempMin?: number;
        tempMax?: number;
        tempUnit?: 'F' | 'C';
        manualMonitoringRequired?: boolean;
        manualMonitoringInterval?: number | null;
        sortOrder?: number;
      };
    }) => {
      return client.units.update.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate units list
      const listOptions = trpc.units.list.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
        areaId: variables.areaId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific unit query
      const getOptions = trpc.units.get.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
        areaId: variables.areaId,
        unitId: variables.unitId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
    },
  });
}

/**
 * Delete a unit (soft delete)
 *
 * Requires manager, admin, or owner role.
 *
 * @returns Mutation hook for deleting units
 *
 * @example
 * ```tsx
 * const deleteUnit = useDeleteUnit();
 * await deleteUnit.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   areaId: 'uuid',
 *   unitId: 'uuid'
 * });
 * ```
 */
export function useDeleteUnit() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      areaId: string;
      unitId: string;
    }) => {
      return client.units.delete.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate units list to refetch updated data
      const listOptions = trpc.units.list.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
        areaId: variables.areaId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
    },
  });
}
