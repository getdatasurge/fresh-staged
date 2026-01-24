import React, { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Radio, Loader2, AlertTriangle, Info } from "lucide-react";
import { useTTNConfig } from "@/contexts/TTNConfigContext";
import { TTNConfigSourceBadge } from "@/components/ttn/TTNConfigSourceBadge";
import { TTNDiagnosticsDownload } from "@/components/ttn/TTNDiagnosticsDownload";

// Extracted hooks
import { useTTNSettings } from "@/hooks/useTTNSettings";
import { useTTNApiKey } from "@/hooks/useTTNApiKey";
import { useTTNWebhook } from "@/hooks/useTTNWebhook";
import { useTTNOperations } from "@/hooks/useTTNOperations";

// Extracted sub-components
import {
  TTNProvisioningCard,
  TTNStatusBanner,
  TTNConnectionTest,
  TTNApiKeyConfig,
  TTNWebhookConfig,
} from "./ttn";

interface TTNConnectionSettingsProps {
  organizationId: string | null;
  readOnly?: boolean;
}

export function TTNConnectionSettings({ organizationId, readOnly = false }: TTNConnectionSettingsProps) {
  // Settings hook - manages loading, state, and health checks
  const {
    settings,
    isLoading,
    region,
    isEnabled,
    setIsEnabled,
    loadSettings,
    bootstrapHealthError,
    isProvisioned,
    isFailed,
    isProvisioningStatus,
  } = useTTNSettings({ organizationId });

  // API key hook - manages validation and saving
  const apiKey = useTTNApiKey({
    organizationId,
    region,
    settings,
    onSettingsRefresh: loadSettings,
  });

  // Initialize application ID from settings when loaded
  useEffect(() => {
    if (settings?.ttn_application_id && !apiKey.newApplicationId) {
      apiKey.setNewApplicationId(settings.ttn_application_id);
    }
  }, [settings?.ttn_application_id, apiKey.newApplicationId, apiKey.setNewApplicationId]);

  // Webhook hook - manages webhook editing
  const webhook = useTTNWebhook({
    organizationId,
    region,
    settings,
    onSettingsRefresh: loadSettings,
  });

  // Operations hook - manages provisioning, testing, toggle
  const operations = useTTNOperations({
    organizationId,
    region,
    settings,
    isEnabled,
    setIsEnabled,
    onSettingsRefresh: loadSettings,
  });

  // TTN Config Context for badge display
  const { context: ttnContext } = useTTNConfig();

  // Compute effective state for badge display
  const effectiveState = (ttnContext.state === 'invalid' && apiKey.validationResult?.valid === true)
    ? 'validated'
    : ttnContext.state;

  // Webhook permission issues - separate from overall validity
  const webhookIssues = apiKey.validationResult?.permissions && (
    !apiKey.validationResult.permissions.can_configure_webhook
  );

  // Early return states
  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            TTN Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No organization selected.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            TTN Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            TTN Connection
          </CardTitle>
          <div className="flex items-center gap-2">
            <TTNConfigSourceBadge context={{ ...ttnContext, state: effectiveState }} size="sm" />
            <TTNDiagnosticsDownload
              context={{ ...ttnContext, state: effectiveState }}
              organizationId={organizationId}
              settings={settings ? {
                cluster: 'nam1',
                application_id: settings.ttn_application_id || undefined,
                api_key_last4: settings.api_key_last4 || undefined,
                webhook_url: settings.webhook_url || undefined,
                is_enabled: settings.is_enabled,
              } : undefined}
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
        <CardDescription>
          Connect your LoRaWAN sensors via The Things Network
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Read-only notice for managers */}
        {readOnly && (
          <div className="p-3 rounded-lg bg-muted border border-border/50 flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">View-only access. Contact an admin to make changes.</span>
          </div>
        )}

        {/* Bootstrap Service Health Warning */}
        {bootstrapHealthError && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-warning">TTN Bootstrap Service Issue</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {bootstrapHealthError}. Some TTN configuration features may not work correctly.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Webhook Permissions Warning */}
        {isProvisioned && webhookIssues && !bootstrapHealthError && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-warning">Webhook Not Configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The API key lacks webhook permissions. Sensor data ingestion will not work until webhooks are configured.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong>Resolution:</strong> Re-provision with "Start Fresh" to get a new API key with full permissions,
                  or manually configure the webhook in TTN Console.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Provisioning States (idle, provisioning, failed) */}
        {!isProvisioned && (
          <TTNProvisioningCard
            settings={settings}
            isProvisioning={operations.isProvisioning}
            isProvisioningStatus={isProvisioningStatus}
            isFailed={isFailed}
            readOnly={readOnly}
            onProvision={operations.handleProvision}
            onRefresh={loadSettings}
          />
        )}

        {/* Provisioned State */}
        {isProvisioned && settings && (
          <>
            {/* Status Banner */}
            <TTNStatusBanner settings={settings} />

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="space-y-0.5">
                <Label>Integration Active</Label>
                <p className="text-sm text-muted-foreground">
                  {isEnabled ? "Receiving sensor data from TTN" : "Integration is disabled"}
                </p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={operations.handleToggleEnabled}
                disabled={operations.isSaving || readOnly}
              />
            </div>

            {/* API Key Configuration */}
            <TTNApiKeyConfig
              settings={settings}
              region={region}
              newApiKey={apiKey.newApiKey}
              setNewApiKey={apiKey.setNewApiKey}
              newApplicationId={apiKey.newApplicationId}
              setNewApplicationId={apiKey.setNewApplicationId}
              apiKeyValidation={apiKey.apiKeyValidation}
              isSavingApiKey={apiKey.isSavingApiKey}
              isValidating={apiKey.isValidating}
              isLoading={isLoading}
              validationResult={apiKey.validationResult}
              bootstrapResult={apiKey.bootstrapResult}
              readOnly={readOnly}
              onValidate={apiKey.runPreflightValidation}
              onSave={apiKey.handleSaveApiKey}
              onRefresh={loadSettings}
            />

            {/* Webhook Configuration */}
            <TTNWebhookConfig
              settings={settings}
              isEditingWebhook={webhook.isEditingWebhook}
              webhookDraft={webhook.webhookDraft}
              webhookValidation={webhook.webhookValidation}
              isSavingWebhook={webhook.isSavingWebhook}
              isRegenerating={webhook.isRegenerating}
              readOnly={readOnly}
              onStartEditing={webhook.startEditingWebhook}
              onCancelEditing={webhook.cancelEditingWebhook}
              onEventToggle={webhook.handleEventToggle}
              onUrlChange={webhook.handleWebhookUrlChange}
              onSave={webhook.handleSaveWebhook}
              onRegenerate={webhook.handleRegenerateWebhookSecret}
            />

            {/* Connection Test */}
            <TTNConnectionTest
              settings={settings}
              isTesting={operations.isTesting}
              onTest={operations.handleTest}
            />
          </>
        )}

        {/* Info about next steps */}
        {isProvisioned && !isEnabled && (
          <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="font-medium text-warning">Integration Disabled</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Enable the integration above to start receiving sensor data from your TTN devices.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
