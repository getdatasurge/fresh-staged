/**
 * SMS Configuration Domain Hooks
 *
 * tRPC-based hooks for organization SMS alerting configuration.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Created in Phase 21 (Plan 05).
 *
 * @example
 * ```tsx
 * // Get SMS configuration for organization
 * const { data: config } = useSmsConfig(organizationId);
 *
 * // Check if SMS is configured
 * if (config && 'configured' in config && !config.configured) {
 *   // Show setup prompt
 * }
 *
 * // Create or update SMS configuration (admin/owner only)
 * const upsertConfig = useUpsertSmsConfig();
 * await upsertConfig.mutateAsync({
 *   organizationId: 'uuid',
 *   data: {
 *     smsEnabled: true,
 *     smsDailyLimit: 100,
 *     smsRateLimitWindow: 15,
 *     smsMaxPerWindow: 5,
 *   }
 * });
 * ```
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

/**
 * SMS configuration response
 * Either full config or unconfigured message
 */
export type SmsConfigResponse =
  | {
      configured: false;
      message: string;
    }
  | {
      id: string;
      organizationId: string;
      smsEnabled: boolean;
      smsDailyLimit: number;
      smsRateLimitWindow: number;
      smsMaxPerWindow: number;
      createdAt: Date;
      updatedAt: Date;
    };

/**
 * Input for creating/updating SMS configuration
 */
export interface UpsertSmsConfigInput {
  smsEnabled?: boolean;
  smsDailyLimit?: number;
  smsRateLimitWindow?: number;
  smsMaxPerWindow?: number;
}

/**
 * Hook to fetch organization's SMS configuration
 *
 * @param organizationId - Organization UUID
 * @param options - Query options including enabled flag
 * @returns React Query result with SMS config or unconfigured message
 */
export function useSmsConfig(
  organizationId: string | undefined,
  options?: { enabled?: boolean }
) {
  const trpc = useTRPC();

  const queryOptions = trpc.smsConfig.get.queryOptions({
    organizationId: organizationId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!organizationId && (options?.enabled !== false),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Hook to create or update organization's SMS configuration
 *
 * Requires admin or owner role.
 *
 * @returns Mutation hook for upserting SMS config
 */
export function useUpsertSmsConfig() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: UpsertSmsConfigInput;
    }) => {
      return client.smsConfig.upsert.mutate({
        organizationId: variables.organizationId,
        data: variables.data,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate SMS config query
      const queryOptions = trpc.smsConfig.get.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: queryOptions.queryKey,
      });
    },
  });
}

/**
 * Helper to check if SMS is configured
 */
export function isSmsConfigured(
  config: SmsConfigResponse | undefined
): config is Exclude<SmsConfigResponse, { configured: false }> {
  return config !== undefined && !('configured' in config && !config.configured);
}
