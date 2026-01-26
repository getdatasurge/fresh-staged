/**
 * TTN Settings Hooks
 *
 * Migrated to tRPC in Phase 21
 * Uses ttnSettings router for settings management
 */
import { useState, useCallback, useEffect } from "react";
import { useUser } from "@stackframe/react";
import { useTRPCClient } from "@/lib/trpc";
import { toast } from "sonner";
import { hashConfigValues } from "@/types/ttnState";
import { useTTNConfig } from "@/contexts/TTNConfigContext";

/**
 * TTN Connection Test Result from the API
 */
export interface TTNTestResult {
  success: boolean;
  error?: string;
  hint?: string;
  applicationName?: string;
  statusCode?: number;
  testedAt?: string;
  clusterTested?: string;
  effectiveApplicationId?: string;
  apiKeyLast4?: string;
  request_id?: string;
  message?: string;
}

/**
 * TTN Settings state from the database
 */
export interface TTNSettings {
  exists: boolean;
  is_enabled: boolean;
  ttn_region: string | null;
  ttn_application_id: string | null;
  provisioning_status: 'idle' | 'provisioning' | 'ready' | 'failed';
  provisioning_step: string | null;
  provisioning_started_at: string | null;
  provisioning_last_heartbeat_at: string | null;
  provisioning_attempt_count: number;
  provisioning_error: string | null;
  last_http_status: number | null;
  last_http_body: string | null;
  provisioning_last_step: string | null;
  provisioning_can_retry: boolean;
  provisioned_at: string | null;
  has_api_key: boolean;
  api_key_last4: string | null;
  api_key_updated_at: string | null;
  has_webhook_secret: boolean;
  webhook_secret_last4: string | null;
  webhook_url: string | null;
  webhook_id: string | null;
  webhook_events: string[] | null;
  last_connection_test_at: string | null;
  last_connection_test_result: TTNTestResult | null;
  last_updated_source: string | null;
  last_test_source: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const WEBHOOK_URL = `${API_BASE_URL}/api/webhooks/ttn`;

export const TTN_REGIONS = [
  { value: "nam1", label: "North America (nam1)" },
  { value: "eu1", label: "Europe (eu1)" },
  { value: "au1", label: "Australia (au1)" },
] as const;

interface UseTTNSettingsOptions {
  organizationId: string | null;
}

interface UseTTNSettingsReturn {
  settings: TTNSettings | null;
  isLoading: boolean;
  region: string;
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;
  loadSettings: () => Promise<void>;
  bootstrapHealthError: string | null;
  checkBootstrapHealth: () => Promise<void>;
  isProvisioned: boolean;
  isFailed: boolean;
  isProvisioningStatus: boolean;
}

/**
 * Hook to manage TTN settings loading and state
 */
export function useTTNSettings({ organizationId }: UseTTNSettingsOptions): UseTTNSettingsReturn {
  const client = useTRPCClient();
  const [settings, setSettings] = useState<TTNSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const [bootstrapHealthError, setBootstrapHealthError] = useState<string | null>(null);

  const user = useUser();

  // NAM1 ONLY - hardcoded cluster, no region selection
  const region = "nam1";

  const { setCanonical, setInvalid, resetToDraft } = useTTNConfig();

  const loadSettings = useCallback(async () => {
    if (!organizationId || !user) return;

    setIsLoading(true);
    try {
      // Query via tRPC
      const data = await client.ttnSettings.get.query({
        organizationId: organizationId,
      });

      if (data) {
        // Map legacy status values (already handled by backend)
        const loadedSettings: TTNSettings = {
          exists: true,
          is_enabled: data.is_enabled ?? false,
          ttn_region: data.ttn_region ?? null,
          ttn_application_id: data.ttn_application_id ?? null,
          provisioning_status: data.provisioning_status as TTNSettings['provisioning_status'],
          provisioning_step: data.provisioning_step ?? null,
          provisioning_started_at: data.provisioning_started_at ?? null,
          provisioning_last_heartbeat_at: data.provisioning_last_heartbeat_at ?? null,
          provisioning_attempt_count: data.provisioning_attempt_count ?? 0,
          provisioning_error: data.provisioning_error ?? null,
          last_http_status: data.last_http_status ?? null,
          last_http_body: data.last_http_body ?? null,
          provisioning_last_step: data.provisioning_last_step ?? null,
          provisioning_can_retry: data.provisioning_can_retry ?? true,
          provisioned_at: data.provisioned_at ?? null,
          has_api_key: data.has_api_key ?? false,
          api_key_last4: data.api_key_last4 ?? null,
          api_key_updated_at: data.api_key_updated_at ?? null,
          has_webhook_secret: data.has_webhook_secret ?? false,
          webhook_secret_last4: data.webhook_secret_last4 ?? null,
          webhook_url: data.webhook_url ?? WEBHOOK_URL,
          webhook_id: data.webhook_id ?? null,
          webhook_events: data.webhook_events ?? null,
          last_connection_test_at: data.last_connection_test_at ?? null,
          last_connection_test_result: data.last_connection_test_result as TTNTestResult | null,
          last_updated_source: data.last_updated_source ?? null,
          last_test_source: data.last_test_source ?? null,
        };

        setSettings(loadedSettings);
        setIsEnabled(data.is_enabled ?? false);

        // Mark context as canonical if we have valid settings from DB
        if (data.ttn_application_id && data.has_api_key) {
          const hash = hashConfigValues({
            cluster: 'nam1',
            application_id: data.ttn_application_id,
            api_key_last4: data.api_key_last4,
            is_enabled: data.is_enabled,
          });
          console.log('[TTN Config] Loaded from DB, setting canonical', {
            org_id: organizationId,
            app_id: data.ttn_application_id,
            has_api_key: data.has_api_key,
            hash
          });
          setCanonical(hash);
        } else {
          resetToDraft();
        }
      } else {
        // No settings exist yet
        setSettings(null);
        setIsEnabled(false);
        resetToDraft();
      }
    } catch (err) {
      console.error("Error loading TTN settings:", err);
      toast.error("Failed to load TTN settings");
      setInvalid("Failed to load TTN settings");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, user, client, setCanonical, setInvalid, resetToDraft]);

  const checkBootstrapHealth = useCallback(async () => {
    setBootstrapHealthError(null);
  }, []);

  // Load settings and check health on mount
  useEffect(() => {
    loadSettings();
    checkBootstrapHealth();
  }, [loadSettings, checkBootstrapHealth]);

  // Computed states
  const isProvisioned = Boolean(
    settings?.ttn_application_id &&
    settings?.has_api_key
  );
  const isFailed = settings?.provisioning_status === 'failed';
  const isProvisioningStatus = settings?.provisioning_status === 'provisioning';

  return {
    settings,
    isLoading,
    region,
    isEnabled,
    setIsEnabled,
    loadSettings,
    bootstrapHealthError,
    checkBootstrapHealth,
    isProvisioned,
    isFailed,
    isProvisioningStatus,
  };
}
