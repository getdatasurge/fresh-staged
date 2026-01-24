/**
 * Organizations API - tRPC-based
 *
 * @deprecated These wrapper functions are deprecated. Use useTRPC() directly in components:
 *
 * @example
 * ```tsx
 * import { useTRPC } from '@/lib/trpc';
 *
 * function MyComponent() {
 *   const { data: org } = useTRPC().organizations.get.useQuery({
 *     organizationId: 'uuid'
 *   });
 *   // ...
 * }
 * ```
 *
 * This file provides backward compatibility during migration.
 * Components should migrate to direct tRPC hook usage.
 */

import type { TRPCClient } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../backend/src/trpc/router';

// Type aliases for backward compatibility
export type { AppRouter };

/**
 * Type inference helpers from tRPC router
 */
type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

// Export types for backward compatibility with existing components
export type OrganizationResponse = RouterOutput['organizations']['get'];
export type MemberResponse = RouterOutput['organizations']['listMembers'][number];
// Extract just the data portion from the update input - exclude void case
type UpdateInput = Exclude<RouterInput['organizations']['update'], void>;
export type UpdateOrganizationRequest = UpdateInput['data'];

/**
 * Organizations API object
 *
 * @deprecated Use useTRPC() hook directly in components instead
 */
export const organizationsApi = {
  /**
   * Get organization by ID
   *
   * @deprecated Use useTRPC().organizations.get.useQuery() instead
   *
   * @param orgId - Organization UUID
   * @param trpcClient - tRPC client instance (from useTRPCClient())
   * @returns Organization details
   */
  getOrganization: async (
    orgId: string,
    trpcClient: TRPCClient<AppRouter>
  ): Promise<OrganizationResponse> => {
    return trpcClient.organizations.get.query({ organizationId: orgId });
  },

  /**
   * Update organization
   *
   * @deprecated Use useTRPC().organizations.update.useMutation() instead
   *
   * @param orgId - Organization UUID
   * @param updates - Organization update data
   * @param trpcClient - tRPC client instance (from useTRPCClient())
   * @returns Updated organization
   */
  updateOrganization: async (
    orgId: string,
    updates: UpdateOrganizationRequest,
    trpcClient: TRPCClient<AppRouter>
  ): Promise<OrganizationResponse> => {
    return trpcClient.organizations.update.mutate({
      organizationId: orgId,
      data: updates,
    });
  },

  /**
   * List organization members
   *
   * @deprecated Use useTRPC().organizations.listMembers.useQuery() instead
   *
   * @param orgId - Organization UUID
   * @param trpcClient - tRPC client instance (from useTRPCClient())
   * @returns Array of organization members
   */
  listMembers: async (
    orgId: string,
    trpcClient: TRPCClient<AppRouter>
  ): Promise<MemberResponse[]> => {
    return trpcClient.organizations.listMembers.query({ organizationId: orgId });
  },

  /**
   * Get organization stats
   *
   * @deprecated Use useTRPC().organizations.stats.useQuery() instead
   *
   * @param orgId - Organization UUID
   * @param trpcClient - tRPC client instance (from useTRPCClient())
   * @returns Organization dashboard statistics
   */
  getStats: async (
    orgId: string,
    trpcClient: TRPCClient<AppRouter>
  ): Promise<RouterOutput['organizations']['stats']> => {
    return trpcClient.organizations.stats.query({ organizationId: orgId });
  },
};
