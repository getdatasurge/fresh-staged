/**
 * TTN Webhook Hooks
 *
 * Status: BLOCKED - Requires backend implementation
 *
 * Current implementation:
 * - Uses update-ttn-webhook edge function to update webhook configuration in TTN
 * - Uses ttn-provision-org edge function to regenerate webhook secret
 *
 * Migration blockers:
 * - Backend needs TTN SDK integration (@ttn-lw/grpc-web-api-client)
 * - Backend needs webhook update procedures (call TTN API to update webhook events/URL)
 * - Backend needs webhook secret regeneration procedures
 *
 * Edge functions used:
 * - update-ttn-webhook (updates webhook events and URL in TTN)
 * - ttn-provision-org (regenerate_webhook_secret action)
 *
 * Migration path:
 * 1. Add TTN SDK to backend dependencies
 * 2. Create webhook service with TTN API integration
 * 3. Add procedures to ttnSettings router (updateWebhook, regenerateWebhookSecret)
 * 4. Migrate this hook to use tRPC procedures
 *
 * Estimated effort: Medium (requires external API integration)
 * Priority: Low (webhook config is one-time setup)
 */
import { useTTNConfig } from "@/contexts/TTNConfigContext";
import { trpc } from "@/trpc/client";
import { hashConfigValues } from "@/types/ttnState";
import { useUser } from "@stackframe/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
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
  
  const updateWebhookMutation = trpc.ttnSettings.updateWebhook.useMutation();
  // const regenerateSecretMutation = trpc.ttnSettings.regenerateWebhookSecret.useMutation(); // Not yet implemented in router

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

      const result = await updateWebhookMutation.mutateAsync({
        organizationId,
        url: webhookDraft.url,
        events: webhookDraft.events,
      });
      
      const data = result;
      const error = null;

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
      toast.error("Webhook secret regeneration is unavailable during Supabase removal.");
    } finally {
      setIsRegenerating(false);
    }
  }, [organizationId, user]);


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
