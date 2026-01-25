/**
 * Areas Domain Hooks
 *
 * tRPC-based hooks for area management operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Areas are scoped to sites: org -> site -> area.
 *
 * @example
 * ```tsx
 * // Query areas for a site
 * const { data: areas, isLoading } = useAreas(organizationId, siteId);
 *
 * // Get a specific area
 * const { data: area } = useArea(organizationId, siteId, areaId);
 *
 * // Create a new area
 * const createArea = useCreateArea();
 * await createArea.mutateAsync({
 *   organizationId, siteId,
 *   data: { name: 'Walk-in Cooler', areaType: 'refrigerator' }
 * });
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';

/**
 * List all areas for a site
 *
 * @param organizationId - Organization UUID
 * @param siteId - Site UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with areas array
 */
export function useAreas(
  organizationId: string | undefined,
  siteId: string | undefined,
  options?: { enabled?: boolean }
) {
  const trpc = useTRPC();

  const queryOptions = trpc.areas.list.queryOptions({
    organizationId: organizationId!,
    siteId: siteId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!siteId && (options?.enabled !== false),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Get a specific area by ID
 *
 * @param organizationId - Organization UUID
 * @param siteId - Site UUID
 * @param areaId - Area UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with area data
 */
export function useArea(
  organizationId: string | undefined,
  siteId: string | undefined,
  areaId: string | undefined,
  options?: { enabled?: boolean }
) {
  const trpc = useTRPC();

  const queryOptions = trpc.areas.get.queryOptions({
    organizationId: organizationId!,
    siteId: siteId!,
    areaId: areaId!,
  });

  return useQuery({
    ...queryOptions,
    enabled:
      !!organizationId &&
      !!siteId &&
      !!areaId &&
      (options?.enabled !== false),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Create a new area in a site
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for creating areas
 *
 * @example
 * ```tsx
 * const createArea = useCreateArea();
 * await createArea.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   data: { name: 'Walk-in Cooler', areaType: 'refrigerator' }
 * });
 * ```
 */
export function useCreateArea() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      data: {
        name: string;
        areaType?: string;
      };
    }) => {
      return client.areas.create.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate areas list to refetch updated data
      const listOptions = trpc.areas.list.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
    },
  });
}

/**
 * Update an existing area
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for updating areas
 *
 * @example
 * ```tsx
 * const updateArea = useUpdateArea();
 * await updateArea.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   areaId: 'uuid',
 *   data: { name: 'Updated Cooler' }
 * });
 * ```
 */
export function useUpdateArea() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      areaId: string;
      data: {
        name?: string;
        areaType?: string;
      };
    }) => {
      return client.areas.update.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate areas list
      const listOptions = trpc.areas.list.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific area query
      const getOptions = trpc.areas.get.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
        areaId: variables.areaId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
    },
  });
}

/**
 * Delete an area (soft delete)
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for deleting areas
 *
 * @example
 * ```tsx
 * const deleteArea = useDeleteArea();
 * await deleteArea.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   areaId: 'uuid'
 * });
 * ```
 */
export function useDeleteArea() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      areaId: string;
    }) => {
      return client.areas.delete.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate areas list to refetch updated data
      const listOptions = trpc.areas.list.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
    },
  });
}
