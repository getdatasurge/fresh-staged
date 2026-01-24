import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Radio, Loader2, XCircle, RefreshCw, Plus } from "lucide-react";
import type { TTNSettings } from "@/hooks/useTTNSettings";

interface TTNProvisioningCardProps {
  settings: TTNSettings | null;
  isProvisioning: boolean;
  isProvisioningStatus: boolean;
  isFailed: boolean;
  readOnly: boolean;
  onProvision: (isRetry?: boolean, fromStep?: string) => void;
  onRefresh: () => void;
}

/**
 * Card for TTN provisioning states (idle, provisioning, failed)
 */
export function TTNProvisioningCard({
  settings,
  isProvisioning,
  isProvisioningStatus,
  isFailed,
  readOnly,
  onProvision,
  onRefresh,
}: TTNProvisioningCardProps) {
  // Provisioning In Progress State
  if (isProvisioningStatus) {
    return (
      <div className="p-6 rounded-lg border-2 border-primary/30 bg-primary/5">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
          <div>
            <h3 className="font-medium">Provisioning TTN Application...</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Creating your dedicated TTN application. This may take up to 60 seconds.
            </p>
            {settings?.provisioning_last_step && (
              <p className="text-xs text-muted-foreground mt-2">
                Current step: <span className="font-mono">{settings.provisioning_last_step}</span>
              </p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={onRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Status
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Failed State
  if (isFailed) {
    return (
      <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
        <div className="flex items-start gap-3">
          <XCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="font-medium text-destructive">Provisioning Failed</p>
              <p className="text-sm text-muted-foreground mt-1">{settings?.provisioning_error}</p>
              {settings?.provisioning_last_step && (
                <p className="text-xs text-muted-foreground mt-1">
                  Failed at step: <span className="font-mono">{settings.provisioning_last_step}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!readOnly && settings?.provisioning_can_retry && settings?.provisioning_last_step && (
                <Button
                  onClick={() => onProvision(true, settings.provisioning_last_step!)}
                  variant="outline"
                  size="sm"
                  disabled={isProvisioning}
                >
                  {isProvisioning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Retry from {settings.provisioning_last_step}
                </Button>
              )}
              {!readOnly && (
                <Button
                  onClick={() => onProvision(false)}
                  variant="ghost"
                  size="sm"
                  disabled={isProvisioning}
                >
                  Start Fresh
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not Provisioned State (idle)
  return (
    <div className="p-6 rounded-lg border-2 border-dashed border-muted-foreground/30">
      <div className="text-center space-y-4">
        <Radio className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <div>
          <h3 className="font-medium">TTN Application Not Provisioned</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create a dedicated TTN application for your organization to receive sensor data
          </p>
        </div>

        {/* NAM1 Only - Display cluster info (read-only) */}
        <div className="max-w-xs mx-auto space-y-2">
          <Label className="text-sm">TTN Cluster</Label>
          <div className="flex items-center justify-center p-3 rounded-md border bg-muted/30">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              NAM1 (North America)
            </Badge>
          </div>
        </div>

        <Button onClick={() => onProvision(false)} disabled={isProvisioning || readOnly} size="lg">
          {isProvisioning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Provision TTN Application
        </Button>
      </div>
    </div>
  );
}
