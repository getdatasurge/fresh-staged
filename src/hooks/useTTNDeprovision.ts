/**
 * TTN Deprovision Hooks
 *
 * Uses tRPC for device deprovisioning operations
 *
 * Current implementation:
 * - Uses ttnDevices router for individual device deprovisioning
 * - Note: Orphaned device detection and batch deprovisioning require job queue implementation
 */
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { useUser } from '@stackframe/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface DeprovisionJob {
  id: string;
}

export interface JobStats {
  pending: number;
  running: number;
  retrying: number;
  failed: number;
  blocked: number;
  succeeded: number;
  needs_attention: number;
}

export function useTTNDeprovisionJobs(orgId: string | null, statusFilter?: string[]) {
  const user = useUser();

  return useQuery({
    queryKey: ['ttnDeprovisionJobs', orgId, statusFilter],
    queryFn: async (): Promise<DeprovisionJob[]> => {
      if (!orgId || !user) return [];
      return [] as DeprovisionJob[];
    },
    enabled: !!orgId && !!user,
    refetchInterval: 30000,
  });
}

export function useTTNJobStats(orgId: string | null) {
  const user = useUser();

  return useQuery({
    queryKey: ['ttnJobStats', orgId],
    queryFn: async (): Promise<JobStats> => {
      if (!orgId || !user) {
        return {
          pending: 0,
          running: 0,
          retrying: 0,
          failed: 0,
          blocked: 0,
          succeeded: 0,
          needs_attention: 0,
        };
      }

      return {
        pending: 0,
        running: 0,
        retrying: 0,
        failed: 0,
        blocked: 0,
        succeeded: 0,
        needs_attention: 0,
      };
    },
    enabled: !!orgId && !!user,
    refetchInterval: 10000,
  });
}

export function useScanTTNOrphans() {
  const user = useUser();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      if (!user) throw new Error('Not authenticated');
      throw new Error('TTN deprovision scan unavailable during Supabase removal');
    },
  });
}

export function useEnqueueOrphanCleanup() {
  const user = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      orphans: any[];
      ttnApplicationId: string;
    }): Promise<number> => {
      if (!user) throw new Error('Not authenticated');
      throw new Error('TTN deprovision queue unavailable during Supabase removal');
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ttnDeprovisionJobs', variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ['ttnJobStats', variables.organizationId],
      });
    },
  });
}

export function useRetryDeprovisionJob(orgId: string | null) {
  const user = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');
      throw new Error('TTN deprovision retry unavailable during Supabase removal');
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['ttnDeprovisionJobs', orgId] });
      queryClient.invalidateQueries({ queryKey: ['ttnJobStats', orgId] });
    },
  });
}

/**
 * Hook to deprovision a single TTN device
 */
export function useDeprovisionTTNDevice() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { organizationId: string; deviceId: string }) => {
      return client.ttnDevices.deprovision.mutate({
        organizationId: variables.organizationId,
        deviceId: variables.deviceId,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate TTN devices list to refetch updated data
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Device deprovisioned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to deprovision device: ${error.message}`);
    },
  });
}

/**
 * Hook to permanently delete a TTN device
 */
export function usePermanentlyDeleteTTNDevice() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { organizationId: string; deviceId: string }) => {
      return client.ttnDevices.permanentlyDelete.mutate({
        organizationId: variables.organizationId,
        deviceId: variables.deviceId,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate TTN devices list to refetch updated data
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Device permanently deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete device: ${error.message}`);
    },
  });
}

/**
 * Hook to restore a soft-deleted TTN device
 */
export function useRestoreTTNDevice() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { organizationId: string; deviceId: string }) => {
      return client.ttnDevices.restore.mutate({
        organizationId: variables.organizationId,
        deviceId: variables.deviceId,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate TTN devices list to refetch updated data
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Device restored successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore device: ${error.message}`);
    },
  });
}
