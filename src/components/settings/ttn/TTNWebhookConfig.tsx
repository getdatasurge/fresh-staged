import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Globe,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  AlertTriangle,
  Info,
  Pencil,
  X,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_WEBHOOK_EVENTS } from "@/hooks/useTTNWebhook";
import { WEBHOOK_URL, type TTNSettings } from "@/hooks/useTTNSettings";

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

interface TTNWebhookConfigProps {
  settings: TTNSettings;
  isEditingWebhook: boolean;
  webhookDraft: { url: string; events: string[] };
  webhookValidation: { isValid: boolean; errors: string[]; warnings: string[] };
  isSavingWebhook: boolean;
  isRegenerating: boolean;
  readOnly: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onEventToggle: (eventId: string, checked: boolean) => void;
  onUrlChange: (url: string) => void;
  onSave: () => void;
  onRegenerate: () => void;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied to clipboard`);
}

/**
 * Webhook configuration section
 */
export function TTNWebhookConfig({
  settings,
  isEditingWebhook,
  webhookDraft,
  webhookValidation,
  isSavingWebhook,
  isRegenerating,
  readOnly,
  onStartEditing,
  onCancelEditing,
  onEventToggle,
  onUrlChange,
  onSave,
  onRegenerate,
}: TTNWebhookConfigProps) {
  return (
    <div className="space-y-4 p-4 rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-medium">Webhook Configuration</Label>
        </div>
        <div className="flex items-center gap-2">
          {settings.has_webhook_secret && !isEditingWebhook && (
            <>
              <Badge variant="outline" className="bg-safe/10 text-safe border-safe/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                Configured
              </Badge>
              <Button variant="ghost" size="sm" onClick={onStartEditing} disabled={readOnly}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </>
          )}
          {isEditingWebhook && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
              Editing
            </Badge>
          )}
        </div>
      </div>

      {/* Edit Mode Warning Banner */}
      {isEditingWebhook && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
            <p className="text-sm text-warning">
              Changes will update the webhook in TTN immediately upon save.
            </p>
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {isEditingWebhook && webhookValidation.errors.length > 0 && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <ul className="text-sm text-destructive space-y-1">
            {webhookValidation.errors.map((error, i) => (
              <li key={i} className="flex items-center gap-2">
                <XCircle className="h-3 w-3" />
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Validation Warnings */}
      {isEditingWebhook && webhookValidation.warnings.length > 0 && webhookValidation.errors.length === 0 && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
          <ul className="text-sm text-warning space-y-1">
            {webhookValidation.warnings.map((warning, i) => (
              <li key={i} className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" />
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Webhook Status Summary - Read Only Mode */}
      {settings.has_webhook_secret && !isEditingWebhook && (
        <div className="grid gap-2 text-sm p-3 bg-muted/50 rounded-md">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Webhook ID:</span>
            <code className="bg-muted px-2 py-0.5 rounded text-xs">
              {settings.webhook_id || "freshtracker"}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Secret:</span>
            <code className="bg-muted px-2 py-0.5 rounded text-xs">
              ****{settings.webhook_secret_last4 || "****"}
            </code>
          </div>
          {settings.webhook_events && settings.webhook_events.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Events:</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {settings.webhook_events.map(event => (
                  <Badge key={event} variant="secondary" className="text-xs">
                    {event.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Webhook URL - Editable in Edit Mode */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Webhook URL</Label>
          <InfoTooltip>
            {isEditingWebhook
              ? "Enter the URL where TTN will send sensor data"
              : "This URL is automatically configured in your TTN application webhook"
            }
          </InfoTooltip>
        </div>
        <div className="flex gap-2">
          <Input
            value={isEditingWebhook ? webhookDraft.url : (settings.webhook_url || WEBHOOK_URL)}
            readOnly={!isEditingWebhook}
            onChange={(e) => onUrlChange(e.target.value)}
            className={cn(
              "font-mono text-xs",
              !isEditingWebhook && "bg-muted"
            )}
          />
          {!isEditingWebhook && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(settings.webhook_url || WEBHOOK_URL, "Webhook URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Event Selection - Only in Edit Mode */}
      {isEditingWebhook && (
        <div className="space-y-3">
          <Label className="text-sm">Enabled Events</Label>
          <div className="grid grid-cols-2 gap-3">
            {AVAILABLE_WEBHOOK_EVENTS.map((event) => (
              <div key={event.id} className="flex items-center space-x-2">
                <Checkbox
                  id={event.id}
                  checked={webhookDraft.events.includes(event.id)}
                  onCheckedChange={(checked) => onEventToggle(event.id, !!checked)}
                />
                <Label htmlFor={event.id} className="text-sm cursor-pointer">
                  {event.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Mode Actions */}
      {isEditingWebhook && (
        <div className="flex items-center gap-2 pt-3 border-t">
          <Button
            variant="outline"
            onClick={onCancelEditing}
            disabled={isSavingWebhook}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!webhookValidation.isValid || isSavingWebhook}
          >
            {isSavingWebhook ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save Changes
          </Button>
        </div>
      )}

      {/* Regenerate Webhook Secret - Only in Read Mode */}
      {!isEditingWebhook && (
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <p className="text-sm font-medium">Regenerate Webhook Secret</p>
            <p className="text-xs text-muted-foreground">
              Updates the secret in both FrostGuard and TTN
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating || !settings.has_webhook_secret || readOnly}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? "animate-spin" : ""}`} />
            Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}
