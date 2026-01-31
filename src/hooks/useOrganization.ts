/**
 * Organization tRPC Usage Patterns
 *
 * This file documents how to use tRPC for organization data access.
 * Direct tRPC usage is recommended over wrapper hooks for type safety.
 *
 * ## Pattern 1: Query Organization Data
 *
 * ```tsx
 * import { useTRPC } from '@/lib/trpc';
 *
 * function OrganizationProfile({ orgId }: { orgId: string }) {
 *   const trpc = useTRPC();
 *
 *   // Get organization details
 *   const getOptions = trpc.organizations.get.queryOptions({ organizationId: orgId });
 *   const { data: org, isLoading } = useQuery(getOptions);
 *
 *   // Or use the deprecated organizationsApi wrapper
 *   // import { useTRPCClient } from '@/lib/trpc';
 *   // const client = useTRPCClient();
 *   // const org = await organizationsApi.getOrganization(orgId, client);
 *
 *   return <div>{org?.name}</div>;
 * }
 * ```
 *
 * ## Pattern 2: Organization Stats for Dashboard
 *
 * ```tsx
 * function OrganizationDashboard({ orgId }: { orgId: string }) {
 *   const trpc = useTRPC();
 *
 *   const statsOptions = trpc.organizations.stats.queryOptions(
 *     { organizationId: orgId }
 *   );
 *
 *   const { data: stats, isLoading } = useQuery({
 *     ...statsOptions,
 *     staleTime: 30 * 1000, // Cache for 30 seconds
 *     refetchOnWindowFocus: true, // Refresh when user returns
 *   });
 *
 *   return (
 *     <div>
 *       <p>Units: {stats?.unitCounts.total}</p>
 *       <p>Alerts: {stats?.alertCounts.pending}</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * ## Pattern 3: List Organization Members
 *
 * ```tsx
 * function MembersList({ orgId }: { orgId: string }) {
 *   const trpc = useTRPC();
 *
 *   const membersOptions = trpc.organizations.listMembers.queryOptions({
 *     organizationId: orgId
 *   });
 *
 *   const { data: members } = useQuery({
 *     ...membersOptions,
 *     staleTime: 60 * 1000, // Cache for 1 minute
 *   });
 *
 *   return (
 *     <ul>
 *       {members?.map(m => <li key={m.userId}>{m.fullName}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 *
 * ## Pattern 4: Update Organization (Mutation)
 *
 * ```tsx
 * function OrganizationSettings({ orgId }: { orgId: string }) {
 *   const trpc = useTRPC();
 *   const queryClient = useQueryClient();
 *
 *   const updateMutation = useMutation({
 *     mutationFn: async (data: { name?: string; timezone?: string }) => {
 *       const client = useTRPCClient();
 *       return client.organizations.update.mutate({
 *         organizationId: orgId,
 *         data
 *       });
 *     },
 *     onSuccess: () => {
 *       // Invalidate queries to refetch fresh data
 *       queryClient.invalidateQueries({
 *         queryKey: trpc.organizations.get.getQueryKey({ organizationId: orgId })
 *       });
 *     }
 *   });
 *
 *   const handleUpdate = () => {
 *     updateMutation.mutate({ name: 'New Org Name' });
 *   };
 *
 *   return <button onClick={handleUpdate}>Update</button>;
 * }
 * ```
 *
 * ## Cache Configuration Recommendations
 *
 * - **Organization data**: `staleTime: 60 * 1000` (1 minute) - Changes infrequently
 * - **Stats data**: `staleTime: 30 * 1000` (30 seconds) - More dynamic, refresh often
 * - **Member list**: `staleTime: 60 * 1000` (1 minute) - Changes infrequently
 *
 * ## Migration from Ky-based API
 *
 * ### Old Pattern (Ky + organizationsApi)
 * ```tsx
 * const { accessToken } = await user.getAuthJson();
 * const org = await organizationsApi.getOrganization(orgId, accessToken);
 * ```
 *
 * ### New Pattern (tRPC)
 * ```tsx
 * const trpc = useTRPC();
 * const options = trpc.organizations.get.queryOptions({ organizationId: orgId });
 * const { data: org } = useQuery(options);
 * ```
 *
 * Benefits:
 * - Type safety from backend to frontend
 * - Automatic request deduplication
 * - Built-in caching with TanStack Query
 * - No manual token management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/lib/trpc';

/**
 * Fetch organization details
 *
 * @param organizationId - Organization UUID
 * @returns React Query result with organization data
 *
 * @example
 * ```tsx
 * const { data: org, isLoading, error } = useOrganization('uuid');
 * ```
 */
export function useOrganization(organizationId: string) {
  const trpc = useTRPC();

  const queryOptions = trpc.organizations.get.queryOptions({ organizationId });

  return useQuery({
    ...queryOptions,
    // Cache organization data for 1 minute
    staleTime: 60 * 1000,
    // Keep data in cache for 5 minutes
    gcTime: 5 * 60 * 1000,
    // Don't refetch on window focus for org data
    refetchOnWindowFocus: false,
    // Only enable query if organizationId is provided
    enabled: !!organizationId,
  });
}

/**
 * Fetch organization dashboard statistics
 *
 * @param organizationId - Organization UUID
 * @returns React Query result with organization stats
 *
 * @example
 * ```tsx
 * const { data: stats, isLoading } = useOrganizationStats('uuid');
 * ```
 */
export function useOrganizationStats(organizationId: string) {
  const trpc = useTRPC();

  const queryOptions = trpc.organizations.stats.queryOptions({ organizationId });

  return useQuery({
    ...queryOptions,
    // Stats are more volatile - cache for 30 seconds
    staleTime: 30 * 1000,
    // Refetch stats on window focus (important for dashboard)
    refetchOnWindowFocus: true,
    // Only enable query if organizationId is provided
    enabled: !!organizationId,
  });
}

/**
 * Fetch organization members
 *
 * @param organizationId - Organization UUID
 * @returns React Query result with member list
 *
 * @example
 * ```tsx
 * const { data: members, isLoading } = useOrganizationMembers('uuid');
 * ```
 */
export function useOrganizationMembers(organizationId: string) {
  const trpc = useTRPC();

  const queryOptions = trpc.organizations.listMembers.queryOptions({ organizationId });

  return useQuery({
    ...queryOptions,
    // Cache member list for 1 minute
    staleTime: 60 * 1000,
    // Keep data in cache for 5 minutes
    gcTime: 5 * 60 * 1000,
    // Don't refetch on window focus for member list
    refetchOnWindowFocus: false,
    // Only enable query if organizationId is provided
    enabled: !!organizationId,
  });
}

/**
 * Update organization settings
 *
 * @returns Mutation hook for updating organization
 *
 * @example
 * ```tsx
 * const updateOrg = useUpdateOrganization();
 *
 * const handleUpdate = async () => {
 *   await updateOrg.mutateAsync({
 *     organizationId: 'uuid',
 *     data: { name: 'New Name' }
 *   });
 * };
 * ```
 */
export function useUpdateOrganization() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: {
        name?: string;
        timezone?: string;
        complianceMode?: 'standard' | 'haccp';
        logoUrl?: string;
      };
    }) => {
      return client.organizations.update.mutate(variables);
    },
    onSuccess: (_data, variables) => {
      // Invalidate organization query to refetch updated data
      const getOptions = trpc.organizations.get.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
      // Also invalidate member list in case organization changes affect it
      const membersOptions = trpc.organizations.listMembers.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: membersOptions.queryKey,
      });
    },
  });
}
