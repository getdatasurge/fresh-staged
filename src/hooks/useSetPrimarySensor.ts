/**
 * TODO: Full migration to new backend
 * - This may become part of unit update endpoint
 * - Or a dedicated /api/orgs/:orgId/units/:unitId/primary-sensor endpoint
 *
 * Current status: Stack Auth for identity, Supabase for data (Phase 5)
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { LoraSensor, LoraSensorType } from "@/types/ttn";
import { toast } from "sonner";
import { qk } from "@/lib/queryKeys";
import { invalidateSensorAssignment } from "@/lib/invalidation";

/**
 * Get sensor types in the same "primary group" for mutual exclusivity
 * - Temperature-capable sensors share primary status
 * - Door-only sensors have their own primary (if no combo sensor)
 */
function getSameTypeGroup(sensorType: LoraSensorType): LoraSensorType[] {
  if (sensorType === 'door' || sensorType === 'contact') {
    return ['door', 'contact'];
  }
  // Temperature-capable sensors (temperature, temperature_humidity, combo)
  return ['temperature', 'temperature_humidity', 'combo'];
}

/**
 * Hook to set a sensor as the primary sensor for its unit
 */
export function useSetPrimarySensor() {
  const queryClient = useQueryClient();
  const user = useUser();

  return useMutation({
    mutationFn: async ({
      sensorId,
      unitId,
      sensorType,
    }: {
      sensorId: string;
      unitId: string;
      sensorType: LoraSensorType;
    }): Promise<LoraSensor> => {
      if (!user) throw new Error('Not authenticated');
      throw new Error('Primary sensor updates are unavailable during Supabase removal');
    },
    onSuccess: async (data) => {
      // Use centralized invalidation for sensor assignment changes
      await invalidateSensorAssignment(
        queryClient,
        data.id,
        data.organization_id,
        data.unit_id
      );
      toast.success(`${data.name} set as primary sensor`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to set primary sensor: ${error.message}`);
    },
  });
}