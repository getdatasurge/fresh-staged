/**
 * Preferences Domain Hooks
 *
 * tRPC-based hooks for user preferences management.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Created in Phase 21 (Plan 05).
 *
 * @example
 * ```tsx
 * // Get digest preferences
 * const { data: prefs } = useDigestPreferences();
 *
 * // Update digest preferences
 * const updatePrefs = useUpdateDigestPreferences();
 * await updatePrefs.mutateAsync({
 *   digestDaily: true,
 *   digestDailyTime: '08:00'
 * });
 *
 * // Disable all digests (unsubscribe)
 * const disableAll = useDisableAllDigests();
 * await disableAll.mutateAsync();
 * ```
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

/**
 * Digest preferences shape from backend
 */
export interface DigestPreferences {
  digestDaily: boolean;
  digestWeekly: boolean;
  digestDailyTime: string;
  digestSiteIds: string[] | null;
  timezone: string;
  emailEnabled: boolean;
}

/**
 * Input for updating digest preferences
 */
export interface UpdateDigestPreferencesInput {
  digestDaily?: boolean;
  digestWeekly?: boolean;
  digestDailyTime?: string;
  digestSiteIds?: string[] | null;
  timezone?: string;
}

/**
 * Hook to fetch user's digest preferences
 *
 * @param options - Query options including enabled flag
 * @returns React Query result with digest preferences
 */
export function useDigestPreferences(options?: { enabled?: boolean }) {
  const trpc = useTRPC();

  const queryOptions = trpc.preferences.getDigest.queryOptions();

  return useQuery({
    ...queryOptions,
    enabled: options?.enabled !== false,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Hook to update user's digest preferences
 *
 * Updates preferences and syncs BullMQ schedulers automatically.
 *
 * @returns Mutation hook for updating preferences
 */
export function useUpdateDigestPreferences() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: UpdateDigestPreferencesInput) => {
      return client.preferences.updateDigest.mutate(preferences);
    },
    onSuccess: () => {
      // Invalidate digest preferences query
      const queryOptions = trpc.preferences.getDigest.queryOptions();
      queryClient.invalidateQueries({
        queryKey: queryOptions.queryKey,
      });
    },
  });
}

/**
 * Hook to disable all digest emails
 *
 * Used for one-click unsubscribe from email digest notifications.
 * Removes both daily and weekly schedulers immediately.
 *
 * @returns Mutation hook for disabling all digests
 */
export function useDisableAllDigests() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return client.preferences.disableAllDigests.mutate();
    },
    onSuccess: () => {
      // Invalidate digest preferences query
      const queryOptions = trpc.preferences.getDigest.queryOptions();
      queryClient.invalidateQueries({
        queryKey: queryOptions.queryKey,
      });
    },
  });
}
