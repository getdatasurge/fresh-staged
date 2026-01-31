/**
 * Gateways Domain Hooks
 *
 * tRPC-based hooks for gateway management operations.
 * Uses direct useTRPC() hooks per Phase 19 patterns.
 *
 * Migrated to tRPC in Phase 21 (Plan 05).
 *
 * Note: Some operations still use Supabase edge functions (provision, deprovision)
 * until backend routers for those operations are available.
 */

import { debugLog } from '@/lib/debugLogger';
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { useOrgScope } from './useOrgScope';

/**
 * Hook to fetch all gateways for an organization
 */
export function useGateways(orgIdParam?: string | null) {
  const { orgId: scopeOrgId, isReady } = useOrgScope();
  const trpc = useTRPC();
  const orgId = orgIdParam ?? scopeOrgId;

  const queryOptions = trpc.ttnGateways.list.queryOptions({
    organizationId: orgId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: isReady && !!orgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to fetch a single gateway by ID
 */
export function useGateway(gatewayId: string | null, orgId?: string | null) {
  const { orgId: scopeOrgId } = useOrgScope();
  const trpc = useTRPC();
  const effectiveOrgId = orgId ?? scopeOrgId;

  const queryOptions = trpc.ttnGateways.get.queryOptions({
    organizationId: effectiveOrgId!,
    gatewayId: gatewayId!,
  });

  return useQuery({
    ...queryOptions,
    enabled: !!gatewayId && !!effectiveOrgId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to register a new gateway
 */
export function useCreateGateway() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  // Generate a valid TTN gateway ID from name and EUI
  const generateGatewayId = (name: string, gatewayEui: string): string => {
    // Slugify name
    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim()
      .slice(0, 20);

    // Take last 8 characters of EUI
    const euiSuffix = gatewayEui.toLowerCase().slice(-8);

    return `${slug}-${euiSuffix}`.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      data: {
        name: string;
        gatewayEui: string;
        description?: string;
        frequencyPlanId?: string;
        location?: {
          latitude: number;
          longitude: number;
          altitude?: number;
        };
      };
    }) => {
      const gatewayId = generateGatewayId(variables.data.name, variables.data.gatewayEui);
      return client.ttnGateways.register.mutate({
        organizationId: variables.organizationId,
        data: {
          ...variables.data,
          gatewayId,
        },
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate gateways list to refetch updated data
      const listOptions = trpc.ttnGateways.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Gateway registered successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to register gateway: ${error.message}`);
    },
  });
}

/**
 * Hook to update a gateway
 */
export function useUpdateGateway() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      organizationId: string;
      gatewayId: string;
      data: {
        name?: string;
        description?: string;
        location?: {
          latitude: number;
          longitude: number;
          altitude?: number;
        };
      };
    }) => {
      return client.ttnGateways.update.mutate({
        organizationId: variables.organizationId,
        gatewayId: variables.gatewayId,
        data: variables.data,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate gateways list
      const listOptions = trpc.ttnGateways.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      // Invalidate specific gateway query
      const getOptions = trpc.ttnGateways.get.queryOptions({
        organizationId: variables.organizationId,
        gatewayId: variables.gatewayId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
      toast.success('Gateway updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update gateway: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a gateway
 */
export function useDeleteGateway() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { organizationId: string; gatewayId: string }) => {
      return client.ttnGateways.deregister.mutate({
        organizationId: variables.organizationId,
        gatewayId: variables.gatewayId,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate gateways list to refetch updated data
      const listOptions = trpc.ttnGateways.list.queryOptions({
        organizationId: variables.organizationId,
      });
      queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Gateway deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete gateway: ${error.message}`);
    },
  });
}

/**
 * Hook to refresh gateway status from TTN
 */
export function useRefreshGatewayStatus() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { organizationId: string; gatewayId: string }) => {
      return client.ttnGateways.refreshStatus.mutate({
        organizationId: variables.organizationId,
        gatewayId: variables.gatewayId,
      });
    },
    onSuccess: (_data, variables) => {
      // Invalidate specific gateway query
      const getOptions = trpc.ttnGateways.get.queryOptions({
        organizationId: variables.organizationId,
        gatewayId: variables.gatewayId,
      });
      queryClient.invalidateQueries({
        queryKey: getOptions.queryKey,
      });
      toast.success('Gateway status refreshed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to refresh gateway status: ${error.message}`);
    },
  });
}

interface ProvisionErrorDetails {
  message: string;
  hint?: string;
  requestId?: string;
}

/**
 * Helper to parse and format gateway provisioning errors
 */
function parseGatewayProvisionError(error: unknown): ProvisionErrorDetails {
  // Try to extract structured error from response
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;

    // Check for hint and request_id from edge function response
    const hint = typeof err.hint === 'string' ? err.hint : undefined;
    const requestId = typeof err.request_id === 'string' ? err.request_id : undefined;
    const errorCode = typeof err.error_code === 'string' ? err.error_code : undefined;
    const errorMessage = typeof err.error === 'string' ? err.error : undefined;

    if (errorCode || errorMessage) {
      let message = errorMessage || 'Provisioning failed';

      // Map error codes to user-friendly messages
      switch (errorCode) {
        case 'TTN_PERMISSION_DENIED':
          message = 'TTN API key lacks gateway permissions';
          break;
        case 'EUI_CONFLICT':
          message = 'Gateway EUI is already registered elsewhere';
          break;
        case 'INVALID_API_KEY':
          message = 'TTN API key is invalid or expired';
          break;
        case 'TTN_NOT_CONFIGURED':
          message = 'TTN connection not configured';
          break;
        case 'API_KEY_MISSING':
          message = 'TTN API key not configured';
          break;
      }

      return { message, hint, requestId };
    }
  }

  // Fallback for string errors
  const errorStr = error instanceof Error ? error.message : String(error);

  if (errorStr.includes('PERMISSION') || errorStr.includes('403')) {
    return {
      message: 'TTN API key lacks gateway permissions',
      hint: "Regenerate your TTN API key with 'Write gateway access' permission",
    };
  }
  if (errorStr.includes('CONFLICT') || errorStr.includes('409')) {
    return {
      message: 'Gateway EUI already registered',
      hint: 'This EUI is registered to another account. Use TTN Console to claim or delete it.',
    };
  }
  if (errorStr.includes('401')) {
    return {
      message: 'TTN API key invalid',
      hint: 'Generate a new API key in TTN Console',
    };
  }

  return { message: errorStr };
}

/**
 * Hook to provision a gateway to TTN
 *
 * Note: This uses the tRPC register mutation which handles TTN provisioning.
 */
export function useProvisionGateway() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [provisioningId, setProvisioningId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      gatewayId,
      organizationId,
      gatewayEui,
      name,
    }: {
      gatewayId: string;
      organizationId: string;
      gatewayEui: string;
      name: string;
    }) => {
      const requestId = crypto.randomUUID().slice(0, 8);
      const startTime = Date.now();

      setProvisioningId(gatewayId);

      debugLog.info('ttn', 'TTN_PROVISION_GATEWAY_REQUEST', {
        request_id: requestId,
        gateway_id: gatewayId,
        org_id: organizationId,
      });

      try {
        const result = await client.ttnGateways.register.mutate({
          organizationId,
          data: {
            name,
            gatewayEui,
          },
        });

        const durationMs = Date.now() - startTime;

        debugLog.info('ttn', 'TTN_PROVISION_GATEWAY_SUCCESS', {
          request_id: requestId,
          gateway_id: gatewayId,
          ttn_gateway_id: result.gatewayId,
          duration_ms: durationMs,
        });

        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        debugLog.error('ttn', 'TTN_PROVISION_GATEWAY_ERROR', {
          request_id: requestId,
          gateway_id: gatewayId,
          error: error instanceof Error ? error.message : String(error),
          duration_ms: durationMs,
        });
        throw error;
      } finally {
        setProvisioningId(null);
      }
    },
    onSuccess: async (_data, variables) => {
      const listOptions = trpc.ttnGateways.list.queryOptions({
        organizationId: variables.organizationId,
      });
      await queryClient.invalidateQueries({
        queryKey: listOptions.queryKey,
      });
      toast.success('Gateway registered in TTN successfully');
    },
    onError: (error: Error & { details?: unknown }) => {
      const parsed = parseGatewayProvisionError(error.cause || error);

      // Build toast message with hint if available
      let toastMessage = `Gateway registration failed: ${parsed.message}`;
      if (parsed.hint) {
        toastMessage += `. ${parsed.hint}`;
      }
      if (parsed.requestId) {
        toastMessage += ` (ref: ${parsed.requestId})`;
      }

      toast.error(toastMessage, {
        duration: 8000, // Longer duration for actionable errors
      });
    },
  });

  return {
    ...mutation,
    provisioningId,
    isProvisioning: (id: string) => provisioningId === id,
  };
}
