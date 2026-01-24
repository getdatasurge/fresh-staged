/**
 * TODO: Full migration to new backend
 * - Replace edge function calls with backend job queue
 *
 * Current status: Stack Auth for identity, edge functions for operations (Phase 5)
 */
import { useState, useCallback } from "react";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY
import { toast } from "sonner";
import { hashConfigValues } from "@/types/ttnState";
import { useTTNConfig } from "@/contexts/TTNConfigContext";
import type { TTNSettings } from "./useTTNSettings";

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
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const user = useUser();
  const { setCanonical, setInvalid } = useTTNConfig();

  // Helper for edge function calls with Stack Auth token
  const invokeEdgeFunction = useCallback(async (functionName: string, payload: any) => {
    if (!user) throw new Error('Not authenticated');
    const { accessToken } = await user.getAuthJson();

    // TODO Phase 6: Replace with backend API calls
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { organization_id: organizationId, ...payload },
      headers: { 'x-stack-access-token': accessToken },
    });

    if (error) throw error;
    return data;
  }, [user, organizationId]);

  const handleProvision = useCallback(async (isRetry: boolean = false, fromStep?: string) => {
    if (!organizationId || !user) return;

    setIsProvisioning(true);
    try {
      // TODO Phase 6: Replace with backend API job queue
      const data = await invokeEdgeFunction("ttn-provision-org", {
        action: isRetry ? "retry" : "provision",
        ttn_region: region,
        from_step: fromStep,
      });

      if (data?.success) {
        toast.success("TTN Application provisioned successfully!");

        const hash = hashConfigValues({
          cluster: region,
          application_id: data.application_id || settings?.ttn_application_id,
          is_enabled: true,
        });
        console.log('[TTN Config] Provisioning complete, setting canonical', { hash });
        setCanonical(hash);

        await onSettingsRefresh();
      } else {
        const errorMsg = data?.error || data?.message || "Provisioning failed";
        const hint = data?.hint || "";
        const isRetryable = data?.retryable;

        if (errorMsg.includes("TTN admin credentials not configured")) {
          toast.error("TTN credentials not configured", {
            description: "Please contact your administrator to set up TTN_ADMIN_API_KEY and TTN_USER_ID secrets.",
          });
        } else if (errorMsg.includes("timed out")) {
          toast.error("Request timed out", {
            description: isRetryable ? "TTN is taking too long to respond. You can retry." : errorMsg,
          });
        } else {
          toast.error(hint ? `${errorMsg}: ${hint}` : errorMsg);
        }

        await onSettingsRefresh();
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Provisioning error:", err);

      if (errMessage?.includes("TTN admin credentials")) {
        toast.error("TTN credentials not configured. Please contact your administrator.");
      } else {
        toast.error(errMessage || "Failed to provision TTN application");
      }

      await onSettingsRefresh();
    } finally {
      setIsProvisioning(false);
    }
  }, [organizationId, region, settings?.ttn_application_id, user, invokeEdgeFunction, setCanonical, onSettingsRefresh]);

  const handleTest = useCallback(async () => {
    if (!organizationId || !user) return;

    setIsTesting(true);
    try {
      // TODO Phase 6: Replace with backend API endpoint
      const data = await invokeEdgeFunction("manage-ttn-settings", {
        action: "test",
      });

      if (data?.success) {
        toast.success("Connection successful!");
      } else {
        toast.error(data?.error || data?.message || "Connection test failed");
      }
      await onSettingsRefresh();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Test error:", err);
      toast.error(errMessage || "Connection test failed");
    } finally {
      setIsTesting(false);
    }
  }, [organizationId, user, invokeEdgeFunction, onSettingsRefresh]);

  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    if (!organizationId || !user) return;

    setIsSaving(true);
    try {
      // TODO Phase 6: Replace with backend API endpoint
      const data = await invokeEdgeFunction("manage-ttn-settings", {
        action: "update",
        is_enabled: enabled
      });

      if (data?.success !== false) {
        setIsEnabled(enabled);
        toast.success(enabled ? "TTN integration enabled" : "TTN integration disabled");

        const hash = hashConfigValues({
          cluster: region,
          application_id: settings?.ttn_application_id,
          api_key_last4: settings?.api_key_last4,
          is_enabled: enabled,
        });
        console.log('[TTN Config] Toggle enabled, setting canonical', { hash, enabled });
        setCanonical(hash);
      } else {
        throw new Error(data?.error || "Failed to update settings");
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Toggle error:", err);
      toast.error(errMessage || "Failed to update settings");
      setInvalid(errMessage || "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  }, [organizationId, region, settings?.ttn_application_id, settings?.api_key_last4, user, invokeEdgeFunction, setIsEnabled, setCanonical, setInvalid]);

  return {
    isProvisioning,
    isTesting,
    isSaving,
    handleProvision,
    handleTest,
    handleToggleEnabled,
  };
}
