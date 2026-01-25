/**
 * TTN Webhook Hooks
 *
 * TODO: Migrate to tRPC when TTN webhook router is available
 * - Currently uses update-ttn-webhook and ttn-provision-org Supabase edge functions
 * - Backend router for TTN webhook management not yet created
 * - Planned for future migration when backend routes are available
 *
 * Current status: Stack Auth for identity, Supabase edge functions (Phase 21)
 */
import { useState, useCallback } from "react";
import { useUser } from "@stackframe/react";
import { supabase } from "@/integrations/supabase/client";  // TEMPORARY
import { toast } from "sonner";
import { hashConfigValues } from "@/types/ttnState";
import { useTTNConfig } from "@/contexts/TTNConfigContext";
import { WEBHOOK_URL, type TTNSettings } from "./useTTNSettings";

/**
 * Available webhook events for TTN integration
 */
export const AVAILABLE_WEBHOOK_EVENTS = [
  { id: "uplink_message", label: "Uplink Message" },
  { id: "join_accept", label: "Join Accept" },
  { id: "downlink_ack", label: "Downlink Ack" },
  { id: "downlink_nack", label: "Downlink Nack" },
  { id: "location_solved", label: "Location Solved" },
] as const;

interface WebhookDraft {
  url: string;
  events: string[];
}

interface WebhookValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface UseTTNWebhookOptions {
  organizationId: string | null;
  region: string;
  settings: TTNSettings | null;
  onSettingsRefresh: () => Promise<void>;
}

interface UseTTNWebhookReturn {
  isEditingWebhook: boolean;
  webhookDraft: WebhookDraft;
  webhookValidation: WebhookValidation;
  isSavingWebhook: boolean;
  isRegenerating: boolean;
  startEditingWebhook: () => void;
  cancelEditingWebhook: () => void;
  handleEventToggle: (eventId: string, checked: boolean) => void;
  handleWebhookUrlChange: (url: string) => void;
  handleSaveWebhook: () => Promise<void>;
  handleRegenerateWebhookSecret: () => Promise<void>;
}

/**
 * Validate webhook draft configuration
 */
function validateWebhookDraft(draft: WebhookDraft): WebhookValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // URL validation
  try {
    const url = new URL(draft.url || "");
    if (url.protocol !== "https:") {
      errors.push("Webhook URL must use HTTPS");
    }
    // Warn if not FrostGuard endpoint
    if (!draft.url?.includes("ttn-webhook")) {
      warnings.push("URL does not match expected FrostGuard endpoint pattern");
    }
  } catch {
    errors.push("Invalid URL format");
  }

  // Events validation
  if (!draft.events || draft.events.length === 0) {
    errors.push("At least one event type must be selected");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Hook to manage TTN webhook editing and configuration
 */
export function useTTNWebhook({
  organizationId,
  region,
  settings,
  onSettingsRefresh,
}: UseTTNWebhookOptions): UseTTNWebhookReturn {
  const [isEditingWebhook, setIsEditingWebhook] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState<WebhookDraft>({
    url: "",
    events: [],
  });
  const [webhookValidation, setWebhookValidation] = useState<WebhookValidation>({
    isValid: true,
    errors: [],
    warnings: [],
  });
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const user = useUser();
  const { setCanonical, setInvalid } = useTTNConfig();

  const startEditingWebhook = useCallback(() => {
    setWebhookDraft({
      url: settings?.webhook_url || WEBHOOK_URL,
      events: settings?.webhook_events || ["uplink_message", "join_accept"],
    });
    setWebhookValidation({ isValid: true, errors: [], warnings: [] });
    setIsEditingWebhook(true);
  }, [settings?.webhook_url, settings?.webhook_events]);

  const cancelEditingWebhook = useCallback(() => {
    setIsEditingWebhook(false);
    setWebhookDraft({ url: "", events: [] });
    setWebhookValidation({ isValid: true, errors: [], warnings: [] });
  }, []);

  const handleEventToggle = useCallback((eventId: string, checked: boolean) => {
    const newEvents = checked
      ? [...webhookDraft.events, eventId]
      : webhookDraft.events.filter((e) => e !== eventId);
    const newDraft = { ...webhookDraft, events: newEvents };
    setWebhookDraft(newDraft);
    setWebhookValidation(validateWebhookDraft(newDraft));
  }, [webhookDraft]);

  const handleWebhookUrlChange = useCallback((url: string) => {
    const newDraft = { ...webhookDraft, url };
    setWebhookDraft(newDraft);
    setWebhookValidation(validateWebhookDraft(newDraft));
  }, [webhookDraft]);

  const handleSaveWebhook = useCallback(async () => {
    if (!organizationId || !webhookValidation.isValid || !user) return;

    setIsSavingWebhook(true);
    try {
      const { accessToken } = await user.getAuthJson();

      // TODO Phase 6: Migrate to new backend API endpoint
      const { data, error } = await supabase.functions.invoke("update-ttn-webhook", {
        body: {
          organization_id: organizationId,
          webhook_url: webhookDraft.url,
          enabled_events: webhookDraft.events,
        },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success("Webhook configuration updated", {
          description: `${data.changes?.length || 0} field(s) changed`,
        });
        setIsEditingWebhook(false);

        const hash = hashConfigValues({
          cluster: region,
          application_id: settings?.ttn_application_id,
          api_key_last4: settings?.api_key_last4,
          is_enabled: settings?.is_enabled,
        });
        console.log('[TTN Config] Webhook saved, setting canonical', { hash });
        setCanonical(hash);

        await onSettingsRefresh();
      } else {
        toast.error(data?.error?.message || "Failed to update webhook", {
          description: data?.error?.hint,
        });
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Webhook update error:", err);
      toast.error(errMessage || "Failed to update webhook configuration");
      setInvalid(errMessage || "Failed to update webhook configuration");
    } finally {
      setIsSavingWebhook(false);
    }
  }, [organizationId, webhookValidation.isValid, webhookDraft, region, settings, user, setCanonical, setInvalid, onSettingsRefresh]);

  const handleRegenerateWebhookSecret = useCallback(async () => {
    if (!organizationId || !user) return;

    setIsRegenerating(true);
    try {
      const { accessToken } = await user.getAuthJson();

      // TODO Phase 6: Migrate to new backend API endpoint
      const { data, error } = await supabase.functions.invoke("ttn-provision-org", {
        body: {
          action: "regenerate_webhook_secret",
          organization_id: organizationId,
        },
        headers: { 'x-stack-access-token': accessToken },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Webhook secret regenerated and updated in TTN");
        await onSettingsRefresh();
      } else {
        toast.error(data?.error || "Failed to regenerate webhook secret");
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Regenerate error:", err);
      toast.error(errMessage || "Failed to regenerate webhook secret");
    } finally {
      setIsRegenerating(false);
    }
  }, [organizationId, user, onSettingsRefresh]);

  return {
    isEditingWebhook,
    webhookDraft,
    webhookValidation,
    isSavingWebhook,
    isRegenerating,
    startEditingWebhook,
    cancelEditingWebhook,
    handleEventToggle,
    handleWebhookUrlChange,
    handleSaveWebhook,
    handleRegenerateWebhookSecret,
  };
}
