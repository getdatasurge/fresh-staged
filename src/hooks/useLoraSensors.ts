/**
 * LoRa Sensors Domain Hooks
 *
 * tRPC-based hooks for LoRa sensor management operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Migrated to tRPC in Phase 21 (Plan 05).
 */

import { debugLog } from '@/lib/debugLogger';
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useOrgScope } from './useOrgScope';

/**
 * Hook to fetch all LoRa sensors for an organization
 */
export function useLoraSensors(orgIdParam?: string | null) {
  const { orgId: scopeOrgId, isReady } = useOrgScope();
  const trpc = useTRPC();
  const orgId = orgIdParam ?? scopeOrgId;

  const queryOptions = trpc.ttnDevices.list.queryOptions({
    organizationId: orgId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: isReady && !!orgId,
    staleTime: 60_000, // 1 minute
    select: (data) => {
      // Debug logging for sensor sync diagnostics
      debugLog.info('query', 'LORA_SENSORS_FETCH', {
        org_id: orgId,
        count: data?.length ?? 0,
      });
      return data;
    },
  });
}

/**
 * Hook to fetch a single LoRa sensor by ID
 */
export function useLoraSensor(sensorId: string | null, orgId?: string | null) {
  const { orgId: scopeOrgId } = useOrgScope();
  const trpc = useTRPC();
  const effectiveOrgId = orgId ?? scopeOrgId;

  const queryOptions = trpc.ttnDevices.get.queryOptions({
    organizationId: effectiveOrgId!,
    deviceId: sensorId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!sensorId && !!effectiveOrgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch a LoRa sensor by DevEUI
 *
 * Note: This is a convenience wrapper that filters the device list by DevEUI.
 * For individual device lookup, consider using useLoraSensor with the device ID.
 */
export function useLoraSensorByDevEui(devEui: string | null, orgId?: string | null) {
  const { orgId: scopeOrgId, isReady } = useOrgScope();
  const trpc = useTRPC();
  const effectiveOrgId = orgId ?? scopeOrgId;

  const queryOptions = trpc.ttnDevices.list.queryOptions({
    organizationId: effectiveOrgId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!devEui && !!effectiveOrgId && isReady,
    select: (data) => data?.find((d) => d.devEui === devEui) ?? null,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch LoRa sensors linked to a specific unit
 *
 * Note: This filters the device list by unitId.
 */
export function useLoraSensorsByUnit(unitId: string | null, orgId?: string | null) {
  const { orgId: scopeOrgId, isReady } = useOrgScope();
  const trpc = useTRPC();
  const effectiveOrgId = orgId ?? scopeOrgId;

  const queryOptions = trpc.ttnDevices.list.queryOptions({
    organizationId: effectiveOrgId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!unitId && !!effectiveOrgId && isReady,
    select: (data) => data?.filter((d) => d.unitId === unitId) ?? [],
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to provision a LoRa sensor (create in TTN with provided credentials)
 */
export function useCreateLoraSensor() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  // Generate a valid TTN device ID from name and DevEUI
  const generateDeviceId = (name: string, devEui: string): string => {
    // Slugify name
    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim()
      .slice(0, 20);

    // Take last 8 characters of DevEUI
    const euiSuffix = devEui.toLowerCase().slice(-8);

    return `${slug}-${euiSuffix}`.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: {
        name: string;
        devEui: string;
        joinEui: string;
        appKey: string;
        siteId?: string;
        unitId?: string;
      };
    }) => {
      const deviceId = generateDeviceId(variables.data.name, variables.data.devEui);
      return client.ttnDevices.provision.mutate({
        organizationId: variables.organizationId,
        data: {
          ...variables.data,
          deviceId,
        },
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate devices list
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('LoRa sensor created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create LoRa sensor: ${error.message}`);
    },
  });
}

/**
 * Hook to update a LoRa sensor
 */
export function useUpdateLoraSensor() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      deviceId: string;
      data: {
        name?: string;
        siteId?: string;
        unitId?: string;
      };
      previousUnitId?: string | null;
    }) => {
      const result = await client.ttnDevices.update.mutate({
        organizationId: variables.organizationId,
        deviceId: variables.deviceId,
        data: variables.data,
      });
      return { ...result, previousUnitId: variables.previousUnitId };
    },
    onSuccess: (_data, variables) => {
      // Invalidate devices list
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific device query
      const getOptions = trpc.ttnDevices.get.queryOptions({
        organizationId: variables.organizationId,
        deviceId: variables.deviceId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
      toast.success('LoRa sensor updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update LoRa sensor: ${error.message}`);
    },
  });
}

/**
 * Hook to archive (deprovision) a LoRa sensor
 */
export function useDeleteLoraSensor() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      deviceId: string;
      unitId?: string | null;
    }) => {
      await client.ttnDevices.deprovision.mutate({
        organizationId: variables.organizationId,
        deviceId: variables.deviceId,
      });
      return { orgId: variables.organizationId, unitId: variables.unitId };
    },
    onSuccess: (data) => {
      // Invalidate devices list
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: data.orgId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Sensor archived. TTN cleanup will run in the background.');
    },
    onError: (error: Error) => {
      toast.error(`Failed to archive sensor: ${error.message}`);
    },
  });
}

/**
 * Hook to link a LoRa sensor to a unit
 */
export function useLinkSensorToUnit() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      sensorId: string;
      unitId: string | null;
      previousUnitId?: string | null;
    }) => {
      const result = await client.ttnDevices.update.mutate({
        organizationId: variables.organizationId,
        deviceId: variables.sensorId,
        data: {
          unitId: variables.unitId ?? undefined,
        },
      });
      return {
        ...result,
        organizationId: variables.organizationId,
        previousUnitId: variables.previousUnitId,
      };
    },
    onSuccess: (data, variables) => {
      // Invalidate devices list
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success(data.unitId ? 'Sensor linked to unit' : 'Sensor unlinked from unit');
    },
    onError: (error: Error) => {
      toast.error(`Failed to link sensor: ${error.message}`);
    },
  });
}

// Helper to get user-friendly error message for TTN provisioning errors
const getProvisionErrorMessage = (error: string): string => {
  if (error.includes('PERMISSION_MISSING') || error.includes('403')) {
    return 'TTN API key missing required permissions. Regenerate key with devices:write permission.';
  }
  if (error.includes('CONFIG_MISSING') || error.includes('TTN not configured')) {
    return 'TTN not configured. Go to Developer settings to set up TTN connection.';
  }
  if (error.includes('connectivity failed') || error.includes('network')) {
    return 'Could not reach TTN. Check your network or TTN application settings.';
  }
  if (error.includes('SENSOR_KEYS_MISSING')) {
    return 'Sensor missing OTAA credentials (AppKey). Edit sensor to add credentials.';
  }

  // Parse specific TTN "already registered" errors with device/application details
  if (error.includes('end_device_euis_taken') || error.includes('already registered')) {
    // Try to extract device_id and application from the error message
    const deviceIdMatch = error.match(/device[_\s]?id[:\s]+['"]?([a-z0-9-]+)['"]?/i);
    const applicationMatch = error.match(/application[_\s]?(?:id)?[:\s]+['"]?([a-z0-9-]+)['"]?/i);
    const devEuiMatch = error.match(/DevEUI[:\s]+['"]?([A-Fa-f0-9]+)['"]?/i);

    let details = 'Device already registered in TTN';

    if (deviceIdMatch || applicationMatch) {
      details = 'Device already exists in TTN';
      if (deviceIdMatch) {
        details += ` as '${deviceIdMatch[1]}'`;
      }
      if (applicationMatch) {
        details += ` in application '${applicationMatch[1]}'`;
      }
      details += ". Use 'Check Status' to sync, or delete the device in TTN Console first.";
    } else if (devEuiMatch) {
      details = `DevEUI ${devEuiMatch[1]} is already registered in TTN. Use 'Check Status' to sync.`;
    }

    return details;
  }

  if (error.includes('409')) {
    return "Device already registered in TTN. Use 'Check Status' to sync.";
  }

  return error;
};

/**
 * Hook to provision a LoRa sensor to TTN
 *
 * Uses ttnDevices.provision for creating new devices in TTN.
 */
export function useProvisionLoraSensor() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [provisioningId, setProvisioningId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (variables: {
      sensorId: string;
      organizationId: string;
      devEui: string;
      joinEui: string;
      appKey: string;
      name: string;
    }) => {
      setProvisioningId(variables.sensorId);
      const requestId = crypto.randomUUID().slice(0, 8);
      const startTime = Date.now();

      // Generate device ID
      const generateDeviceId = (name: string, devEui: string): string => {
        // Slugify name
        const slug = name
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .trim()
          .slice(0, 20);

        // Take last 8 characters of DevEUI
        const euiSuffix = devEui.toLowerCase().slice(-8);

        return `${slug}-${euiSuffix}`.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
      };

      const deviceId = generateDeviceId(variables.name, variables.devEui);

      debugLog.info('ttn', 'TTN_PROVISION_SENSOR_REQUEST', {
        request_id: requestId,
        sensor_id: variables.sensorId,
        org_id: variables.organizationId,
      });

      try {
        const result = await client.ttnDevices.provision.mutate({
          organizationId: variables.organizationId,
          data: {
            deviceId,
            name: variables.name,
            devEui: variables.devEui,
            joinEui: variables.joinEui,
            appKey: variables.appKey,
          },
        });

        const durationMs = Date.now() - startTime;

        debugLog.info('ttn', 'TTN_PROVISION_SENSOR_SUCCESS', {
          request_id: requestId,
          sensor_id: variables.sensorId,
          ttn_device_id: result.deviceId,
          duration_ms: durationMs,
        });

        return {
          ...result,
          orgId: variables.organizationId,
          sensorId: variables.sensorId,
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;

        debugLog.error('ttn', 'TTN_PROVISION_SENSOR_ERROR', {
          request_id: requestId,
          sensor_id: variables.sensorId,
          error: err instanceof Error ? err.message : String(err),
          duration_ms: durationMs,
        });

        throw err;
      }
    },
    onSuccess: async (data) => {
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: data.orgId,
      });
      await queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });

      toast.success('Sensor provisioned to TTN - awaiting network join');
      setProvisioningId(null);
    },
    onError: (error: Error) => {
      const friendlyMessage = getProvisionErrorMessage(error.message);
      toast.error(`TTN provisioning failed: ${friendlyMessage}`);
      setProvisioningId(null);
    },
  });

  return {
    ...mutation,
    provisioningId,
    isProvisioning: (sensorId: string) => provisioningId === sensorId,
  };
}

/**
 * Hook to bootstrap a LoRa sensor with auto-generated credentials
 */
export function useBootstrapLoraSensor() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [bootstrappingId, setBootstrappingId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      name: string;
      siteId?: string;
      unitId?: string;
    }) => {
      setBootstrappingId(crypto.randomUUID());
      const requestId = crypto.randomUUID().slice(0, 8);
      const startTime = Date.now();

      debugLog.info('ttn', 'TTN_BOOTSTRAP_SENSOR_REQUEST', {
        request_id: requestId,
        org_id: variables.organizationId,
      });

      try {
        const result = await client.ttnDevices.bootstrap.mutate({
          organizationId: variables.organizationId,
          data: {
            name: variables.name,
            siteId: variables.siteId,
            unitId: variables.unitId,
          },
        });

        const durationMs = Date.now() - startTime;

        debugLog.info('ttn', 'TTN_BOOTSTRAP_SENSOR_SUCCESS', {
          request_id: requestId,
          ttn_device_id: result.deviceId,
          duration_ms: durationMs,
        });

        return {
          ...result,
          orgId: variables.organizationId,
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;

        debugLog.error('ttn', 'TTN_BOOTSTRAP_SENSOR_ERROR', {
          request_id: requestId,
          error: err instanceof Error ? err.message : String(err),
          duration_ms: durationMs,
        });

        throw err;
      }
    },
    onSuccess: async (data) => {
      const listOptions = trpc.ttnDevices.list.queryOptions({
        organizationId: data.orgId,
      });
      await queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });

      toast.success('Sensor bootstrapped with auto-generated credentials');
      setBootstrappingId(null);
    },
    onError: (error: Error) => {
      const friendlyMessage = getProvisionErrorMessage(error.message);
      toast.error(`TTN bootstrap failed: ${friendlyMessage}`);
      setBootstrappingId(null);
    },
  });

  return {
    ...mutation,
    bootstrappingId,
    isBootstrapping: bootstrappingId !== null,
  };
}
