/**
 * TODO: Full migration to new backend
 * - This may become part of unit update endpoint
 * - Or a dedicated /api/orgs/:orgId/units/:unitId/primary-sensor endpoint
 *
 * Current status: Stack Auth for identity, Supabase for data (Phase 5)
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY
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

      // TODO Phase 6: Migrate to new API when backend endpoint available
      console.warn('[useSetPrimarySensor] Using Supabase - TODO: migrate to new API');

      // Get the type group for this sensor
      const typeGroup = getSameTypeGroup(sensorType);

      // First, unset any existing primary sensors of the same type group for this unit
      const { error: unsetError } = await supabase
        .from("lora_sensors")
        .update({ is_primary: false })
        .eq("unit_id", unitId)
        .eq("is_primary", true)
        .in("sensor_type", typeGroup);

      if (unsetError) throw unsetError;

      // Then set this sensor as primary
      const { data, error } = await supabase
        .from("lora_sensors")
        .update({ is_primary: true })
        .eq("id", sensorId)
        .select()
        .single();

      if (error) throw error;
      return data as LoraSensor;
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