/**
 * Sites Domain Hooks
 *
 * tRPC-based hooks for site management operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * @example
 * ```tsx
 * // Query sites for an organization
 * const { data: sites, isLoading } = useSites(organizationId);
 *
 * // Get a specific site
 * const { data: site } = useSite(organizationId, siteId);
 *
 * // Create a new site
 * const createSite = useCreateSite();
 * await createSite.mutateAsync({ organizationId, data: { name: 'Main Kitchen' } });
 * ```
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';

/**
 * List all sites for an organization
 *
 * @param organizationId - Organization UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with sites array
 */
export function useSites(organizationId: string | undefined, options?: { enabled?: boolean }) {
  const trpc = useTRPC();

  const queryOptions = trpc.sites.list.queryOptions({
    organizationId: organizationId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && options?.enabled !== false,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Get a specific site by ID
 *
 * @param organizationId - Organization UUID
 * @param siteId - Site UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with site data
 */
export function useSite(
  organizationId: string | undefined,
  siteId: string | undefined,
  options?: { enabled?: boolean },
) {
  const trpc = useTRPC();

  const queryOptions = trpc.sites.get.queryOptions({
    organizationId: organizationId!,
    siteId: siteId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && !!siteId && options?.enabled !== false,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Create a new site
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for creating sites
 *
 * @example
 * ```tsx
 * const createSite = useCreateSite();
 * await createSite.mutateAsync({
 *   organizationId: 'uuid',
 *   data: { name: 'Main Kitchen', address: '123 Main St' }
 * });
 * ```
 */
export function useCreateSite() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: {
        name: string;
        address?: string;
        timezone?: string;
      };
    }) => {
      return client.sites.create.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate sites list to refetch updated data
      const listOptions = trpc.sites.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
    },
  });
}

/**
 * Update an existing site
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for updating sites
 *
 * @example
 * ```tsx
 * const updateSite = useUpdateSite();
 * await updateSite.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid',
 *   data: { name: 'Updated Kitchen' }
 * });
 * ```
 */
export function useUpdateSite() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      siteId: string;
      data: {
        name?: string;
        address?: string;
        timezone?: string;
      };
    }) => {
      return client.sites.update.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate sites list
      const listOptions = trpc.sites.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific site query
      const getOptions = trpc.sites.get.queryOptions({
        organizationId: variables.organizationId,
        siteId: variables.siteId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
    },
  });
}

/**
 * Delete a site (soft delete)
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for deleting sites
 *
 * @example
 * ```tsx
 * const deleteSite = useDeleteSite();
 * await deleteSite.mutateAsync({
 *   organizationId: 'uuid',
 *   siteId: 'uuid'
 * });
 * ```
 */
export function useDeleteSite() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { organizationId: string; siteId: string }) => {
      return client.sites.delete.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate sites list to refetch updated data
      const listOptions = trpc.sites.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
    },
  });
}
