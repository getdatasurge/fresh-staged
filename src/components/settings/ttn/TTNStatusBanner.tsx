import React from "react";
import { CheckCircle } from "lucide-react";
import type { TTNSettings } from "@/hooks/useTTNSettings";

interface TTNStatusBannerProps {
  settings: TTNSettings;
}

/**
 * Success banner showing TTN application is ready
 */
export function TTNStatusBanner({ settings }: TTNStatusBannerProps) {
  return (
    <div className="p-4 rounded-lg bg-safe/10 border border-safe/30">
      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-safe mt-0.5" />
        <div className="flex-1 space-y-2">
          <p className="font-medium text-safe">TTN Application Ready</p>
          <div className="grid gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Application ID:</span>
              <code className="bg-muted px-2 py-0.5 rounded text-xs">{settings.ttn_application_id}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Region:</span>
              <span>North America (nam1)</span>
            </div>
            {settings.provisioned_at && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provisioned:</span>
                <span>{new Date(settings.provisioned_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
