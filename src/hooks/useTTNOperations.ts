/**
 * TTN Operations Hooks
 *
 * Migrated to tRPC in Phase 21
 * Uses ttnSettings router for toggle and test operations
 *
 * Note: Provisioning operations still use edge functions (to be migrated in future phase)
 */
import { useState, useCallback } from 'react';
import { useUser } from '@stackframe/react';
import { useTRPCClient } from '@/lib/trpc';
import { toast } from 'sonner';
import { hashConfigValues } from '@/types/ttnState';
import { useTTNConfig } from '@/contexts/TTNConfigContext';
import type { TTNSettings } from './useTTNSettings';

interface UseTTNOperationsOptions {
  organizationId: string | null;
  region: string;
  settings: TTNSettings | null;
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;
  onSettingsRefresh: () => Promise<void>;
}

interface UseTTNOperationsReturn {
  isProvisioning: boolean;
  isTesting: boolean;
  isSaving: boolean;
  handleProvision: (isRetry?: boolean, fromStep?: string) => Promise<void>;
  handleTest: () => Promise<void>;
  handleToggleEnabled: (enabled: boolean) => Promise<void>;
}

/**
 * Hook to manage TTN provisioning, testing, and toggle operations
 */
export function useTTNOperations({
  organizationId,
  region,
  settings,
  isEnabled,
  setIsEnabled,
  onSettingsRefresh,
}: UseTTNOperationsOptions): UseTTNOperationsReturn {
  const client = useTRPCClient();
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const user = useUser();
  const { setCanonical, setInvalid } = useTTNConfig();

  // TODO: Provisioning will be reintroduced via backend TTN services
  const handleProvision = useCallback(
    async (_isRetry?: boolean, _fromStep?: string) => {
      if (!organizationId || !user) return;

      setIsProvisioning(true);
      try {
        toast.error('TTN provisioning is temporarily unavailable while Supabase is removed.');
        setInvalid('TTN provisioning temporarily unavailable');
      } finally {
        setIsProvisioning(false);
      }
    },
    [organizationId, user, setInvalid],
  );

  const handleTest = useCallback(async () => {
    if (!organizationId || !user) return;

    setIsTesting(true);
    try {
      const result = await client.ttnSettings.test.mutate({
        organizationId: organizationId,
      });

      if (result.success) {
        toast.success('Connection successful!');
      } else {
        toast.error(result.error || 'Connection test failed');
      }
      await onSettingsRefresh();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Test error:', err);
      toast.error(errMessage || 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  }, [organizationId, user, client, onSettingsRefresh]);

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!organizationId || !user) return;

      setIsSaving(true);
      try {
        await client.ttnSettings.update.mutate({
          organizationId: organizationId,
          data: { is_enabled: enabled },
        });

        setIsEnabled(enabled);
        toast.success(enabled ? 'TTN integration enabled' : 'TTN integration disabled');

        const hash = hashConfigValues({
          cluster: region,
          application_id: settings?.ttn_application_id,
          api_key_last4: settings?.api_key_last4,
          is_enabled: enabled,
        });
        console.log('[TTN Config] Toggle enabled, setting canonical', { hash, enabled });
        setCanonical(hash);
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('Toggle error:', err);
        toast.error(errMessage || 'Failed to update settings');
        setInvalid(errMessage || 'Failed to update settings');
      } finally {
        setIsSaving(false);
      }
    },
    [
      organizationId,
      region,
      settings?.ttn_application_id,
      settings?.api_key_last4,
      user,
      client,
      setIsEnabled,
      setCanonical,
      setInvalid,
    ],
  );

  return {
    isProvisioning,
    isTesting,
    isSaving,
    handleProvision,
    handleTest,
    handleToggleEnabled,
  };
}
