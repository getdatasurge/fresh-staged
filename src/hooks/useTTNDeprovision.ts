/**
 * TTN Deprovision Hooks
 *
 * Status: BLOCKED - Requires backend job queue implementation
 *
 * Current implementation:
 * - Queries ttn_deprovision_jobs table directly via Supabase
 * - Uses ttn-list-devices edge function to scan for orphaned devices
 * - Inserts jobs directly into ttn_deprovision_jobs table
 *
 * Migration blockers:
 * - Backend needs BullMQ job queue integration for deprovision workflow
 * - Backend needs TTN SDK integration to list devices and delete devices
 * - Backend needs procedures to manage deprovision jobs (list, create, retry)
 *
 * Edge functions used:
 * - ttn-list-devices (scans TTN for devices, identifies orphans)
 *
 * Direct DB access:
 * - ttn_deprovision_jobs table (read/write)
 * - get_deprovision_job_stats RPC function
 *
 * Migration path:
 * 1. Add TTN SDK to backend
 * 2. Create ttn-deprovision.service.ts with BullMQ job management
 * 3. Create ttnDeprovision router with procedures (listJobs, createJob, retryJob, scanOrphans)
 * 4. Migrate this hook to use tRPC procedures
 *
 * Estimated effort: Large (requires BullMQ job queue + TTN SDK integration)
 * Priority: Low (deprovision is infrequent admin operation)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { qk } from "@/lib/queryKeys";

export interface DeprovisionJob {
  id: string;
  organization_id: string;
  sensor_id: string | null;
  dev_eui: string;
  ttn_device_id: string | null;
  ttn_application_id: string;
  reason: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  site_id: string | null;
  unit_id: string | null;
  sensor_name: string | null;
}

export interface TTNDevice {
  device_id: string;
  dev_eui: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
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

/**
 * Hook to fetch TTN deprovision jobs for an organization
 */
export function useTTNDeprovisionJobs(orgId: string | null, statusFilter?: string[]) {
  const user = useUser();

  return useQuery({
    queryKey: qk.org(orgId).ttnDeprovisionJobs(statusFilter),
    queryFn: async (): Promise<DeprovisionJob[]> => {
      if (!orgId || !user) return [];

      return [] as DeprovisionJob[];
    },
    enabled: !!orgId && !!user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Hook to get job statistics
 */
export function useTTNJobStats(orgId: string | null) {
  const user = useUser();

  return useQuery({
    queryKey: qk.org(orgId).ttnJobStats(),
    queryFn: async (): Promise<JobStats> => {
      if (!orgId || !user) return {
        pending: 0, running: 0, retrying: 0, failed: 0, blocked: 0, succeeded: 0, needs_attention: 0
      };

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
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

/**
 * Hook to scan TTN for orphaned devices
 */
export function useScanTTNOrphans() {
  const user = useUser();

  return useMutation({
    mutationFn: async (organizationId: string): Promise<{
      ttn_application_id: string;
      devices: TTNDevice[];
      orphans: TTNDevice[];
      frostguard_sensors: number;
    }> => {
      if (!user) throw new Error("Not authenticated");
      const { accessToken } = await user.getAuthJson();

      throw new Error("TTN deprovision scan unavailable during Supabase removal");
    },
  });
}

/**
 * Hook to manually enqueue a deprovision job for orphan cleanup
 */
export function useEnqueueOrphanCleanup() {
  const user = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      orphans,
      ttnApplicationId,
    }: {
      organizationId: string;
      orphans: TTNDevice[];
      ttnApplicationId: string;
    }): Promise<number> => {
      if (!user) throw new Error("Not authenticated");

      throw new Error("TTN deprovision queue unavailable during Supabase removal");
    },
    onSuccess: async (_, variables) => {
      // Invalidate TTN job queries for this org
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.org(variables.organizationId).ttnDeprovisionJobs() }),
        queryClient.invalidateQueries({ queryKey: qk.org(variables.organizationId).ttnJobStats() }),
        // Legacy keys for migration
        queryClient.invalidateQueries({ queryKey: ["ttn-deprovision-jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["ttn-job-stats"] }),
      ]);
    },
  });
}

/**
 * Hook to retry a failed job
 */
export function useRetryDeprovisionJob(orgId: string | null) {
  const user = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string): Promise<void> => {
      if (!user) throw new Error("Not authenticated");

      throw new Error("TTN deprovision retry unavailable during Supabase removal");
    },
    onSuccess: async () => {
      // Invalidate TTN job queries for this org
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.org(orgId).ttnDeprovisionJobs() }),
        queryClient.invalidateQueries({ queryKey: qk.org(orgId).ttnJobStats() }),
        // Legacy keys for migration
        queryClient.invalidateQueries({ queryKey: ["ttn-deprovision-jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["ttn-job-stats"] }),
      ]);
    },
  });
}
