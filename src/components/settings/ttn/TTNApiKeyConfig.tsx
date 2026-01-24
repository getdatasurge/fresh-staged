import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  AlertTriangle,
  Info,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { TTNValidationResultPanel, REQUIRED_SCOPES } from "@/components/ttn/TTNValidationResultPanel";
import type { TTNValidationResult } from "@/components/ttn/TTNValidationResultPanel";
import type { TTNSettings, TTN_REGIONS } from "@/hooks/useTTNSettings";
import type { BootstrapResult } from "@/hooks/useTTNApiKey";

const InfoTooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">{children}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface TTNApiKeyConfigProps {
  settings: TTNSettings | null;
  region: string;
  newApiKey: string;
  setNewApiKey: (key: string) => void;
  newApplicationId: string;
  setNewApplicationId: (id: string) => void;
  apiKeyValidation: { valid: boolean; warning?: string };
  isSavingApiKey: boolean;
  isValidating: boolean;
  isLoading: boolean;
  validationResult: TTNValidationResult | null;
  bootstrapResult: BootstrapResult | null;
  readOnly: boolean;
  onValidate: () => void;
  onSave: () => void;
  onRefresh: () => void;
}

function formatSourceLabel(source: string | null): string {
  if (!source) return "Unknown";
  return source === "emulator" ? "Emulator" : "FrostGuard";
}

function generateTTNSetupInstructions(region: string, applicationId: string): string {
  const regions = [
    { value: "nam1", label: "North America (nam1)" },
    { value: "eu1", label: "Europe (eu1)" },
    { value: "au1", label: "Australia (au1)" },
  ];
  const clusterLabel = regions.find(r => r.value === region)?.label || region;

  return `TTN API Key Setup Instructions for FrostGuard

1. Open TTN Console: https://console.cloud.thethings.network
2. Select region: ${clusterLabel}
3. Navigate to: Applications → ${applicationId}
4. Click: API Keys (left sidebar)
5. Click: "+ Add API Key"
6. Name it: "FrostGuard Integration"
7. Select one of:
   ☐ "Grant all current and future rights" (recommended)
   OR check these specific rights:
   ☑ Read application info
   ☑ Read devices
   ☑ Write devices
   ☑ Read uplink traffic
   ☑ Write downlink traffic
   ☑ Manage application settings (for webhooks)
8. Click "Create API Key"
9. IMPORTANT: Copy the full key immediately (it won't be shown again)
10. Paste into FrostGuard and click "Validate"

Application ID: ${applicationId}
Cluster: ${region}
`;
}

/**
 * API Key configuration form section
 */
export function TTNApiKeyConfig({
  settings,
  region,
  newApiKey,
  setNewApiKey,
  newApplicationId,
  setNewApplicationId,
  apiKeyValidation,
  isSavingApiKey,
  isValidating,
  isLoading,
  validationResult,
  bootstrapResult,
  readOnly,
  onValidate,
  onSave,
  onRefresh,
}: TTNApiKeyConfigProps) {
  const handleCopySetupInstructions = async () => {
    const appId = newApplicationId.trim() || settings?.ttn_application_id || "<your-app-id>";
    const instructions = generateTTNSetupInstructions(region, appId);
    try {
      await navigator.clipboard.writeText(instructions);
      toast.success("Setup instructions copied!", {
        description: "Paste into your notes or share with team members"
      });
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-base font-medium">TTN API Configuration</Label>
          <InfoTooltip>Enter your TTN Application ID and API key. Webhook will be configured automatically.</InfoTooltip>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopySetupInstructions}
            className="text-xs h-7 px-2"
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy Setup Instructions
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading} className="h-7 px-2">
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Current Configuration Status */}
      {settings?.has_api_key && (
        <div className="text-sm space-y-2 p-3 bg-muted/50 rounded-md">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current key:</span>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-0.5 rounded text-xs">****{settings.api_key_last4}</code>
              {settings.last_updated_source && (
                <Badge variant="outline" className="text-xs">
                  {formatSourceLabel(settings.last_updated_source)}
                </Badge>
              )}
            </div>
          </div>
          {settings.api_key_updated_at && (
            <p className="text-xs text-muted-foreground">
              Updated: {new Date(settings.api_key_updated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Bootstrap Success Banner */}
      {bootstrapResult?.ok && bootstrapResult.webhook_action && (
        <div className="p-3 rounded-lg bg-safe/10 border border-safe/30">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-safe" />
            <span className="text-sm font-medium text-safe">
              {bootstrapResult.webhook_action === "created"
                ? "Webhook created in TTN!"
                : "Webhook updated in TTN!"}
            </span>
          </div>
          {bootstrapResult.permissions && (
            <p className="text-xs text-muted-foreground mt-1">
              Permissions validated: {bootstrapResult.permissions.rights?.length || 0} rights granted
            </p>
          )}
        </div>
      )}

      {/* Bootstrap Error Banner */}
      {bootstrapResult && !bootstrapResult.ok && bootstrapResult.error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div className="flex-1">
              <span className="text-sm font-medium text-destructive">
                {bootstrapResult.error.message}
              </span>
              {bootstrapResult.error.hint && (
                <p className="text-xs text-muted-foreground mt-1">
                  {bootstrapResult.error.hint}
                </p>
              )}
              {bootstrapResult.error.missing_permissions && bootstrapResult.error.missing_permissions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium">Missing permissions:</p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside mt-1">
                    {bootstrapResult.error.missing_permissions.map(p => (
                      <li key={p}>{p.replace("RIGHT_APPLICATION_", "").toLowerCase().replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="space-y-3">
        {/* NAM1 Only - Display cluster info (read-only) */}
        <div className="space-y-1.5">
          <Label className="text-sm">TTN Cluster</Label>
          <div className="flex items-center p-2.5 rounded-md border bg-muted/30">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              NAM1 (North America)
            </Badge>
          </div>
        </div>

        {/* Application ID */}
        <div className="space-y-1.5">
          <Label className="text-sm">Application ID</Label>
          <Input
            placeholder="my-ttn-application-id"
            value={newApplicationId}
            onChange={(e) => setNewApplicationId(e.target.value)}
            className="font-mono text-xs"
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            Find this in TTN Console → Applications
          </p>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label className="text-sm">API Key</Label>
          <Input
            type="password"
            placeholder="NNSXS.XXXXXXXXXX..."
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            className="font-mono text-xs"
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            Create a key with: Read/Write application settings, Read/Write devices, Read uplinks
          </p>
          {/* API Key Format Warning */}
          {newApiKey.trim() && apiKeyValidation.warning && (
            <div className="flex items-start gap-2 p-2 rounded bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">{apiKeyValidation.warning}</p>
            </div>
          )}
        </div>

        {/* Preflight Validation Result Panel */}
        {validationResult && (
          <TTNValidationResultPanel
            result={validationResult}
            applicationId={newApplicationId.trim() || settings?.ttn_application_id || ""}
          />
        )}

        {/* Validate & Save Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onValidate}
            disabled={isValidating || !newApplicationId.trim() || readOnly}
            className="flex-1"
          >
            {isValidating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Validate
              </>
            )}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button
                    onClick={onSave}
                    disabled={
                      isSavingApiKey ||
                      !newApiKey.trim() ||
                      !newApplicationId.trim() ||
                      (validationResult !== null && !validationResult.valid) ||
                      readOnly
                    }
                    className="w-full"
                  >
                    {isSavingApiKey ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Configuring...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save & Configure
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {validationResult && !validationResult.valid && (
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">Cannot save - fix these issues:</p>
                  <ul className="text-xs space-y-0.5">
                    {validationResult.permissions?.missing_core?.map(p => {
                      const scope = REQUIRED_SCOPES.find(s => s.right === p);
                      return (
                        <li key={p}>• Missing: {scope?.label || p.replace("RIGHT_APPLICATION_", "").toLowerCase().replace(/_/g, " ")}</li>
                      );
                    })}
                    {validationResult.error && !validationResult.permissions?.missing_core?.length && (
                      <li>• {validationResult.error.message}</li>
                    )}
                  </ul>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
