import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RefreshCw, CheckCircle, XCircle, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TTNSettings } from "@/hooks/useTTNSettings";

interface TTNConnectionTestProps {
  settings: TTNSettings;
  isTesting: boolean;
  onTest: () => void;
}

/**
 * Connection test section with result display
 */
export function TTNConnectionTest({ settings, isTesting, onTest }: TTNConnectionTestProps) {
  const testResult = settings.last_connection_test_result;

  const copyDiagnostics = () => {
    if (!testResult?.request_id) return;

    const diagnostics = JSON.stringify({
      request_id: testResult.request_id,
      error: testResult.error,
      hint: testResult.hint,
      statusCode: testResult.statusCode,
      cluster: testResult.clusterTested,
      testedAt: testResult.testedAt,
    }, null, 2);
    navigator.clipboard.writeText(diagnostics);
    toast.success("Diagnostics copied to clipboard");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-muted-foreground" />
        <Label>Connection Test</Label>
      </div>

      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${
          testResult.success
            ? "bg-safe/10 border border-safe/30"
            : "bg-destructive/10 border border-destructive/30"
        }`}>
          <div className="flex items-start gap-2">
            {testResult.success ? (
              <CheckCircle className="h-4 w-4 text-safe mt-0.5 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 space-y-1">
              <span className="font-medium">
                {testResult.success
                  ? (testResult.applicationName
                      ? `Connected to ${testResult.applicationName}`
                      : "Connection successful")
                  : (testResult.error || testResult.message || "Connection failed")}
              </span>

              {!testResult.success && testResult.hint && (
                <p className="text-xs text-muted-foreground">
                  {testResult.hint}
                </p>
              )}

              {testResult.clusterTested && (
                <p className="text-xs text-muted-foreground">
                  Cluster: {testResult.clusterTested}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-current/10">
            {settings.last_connection_test_at && (
              <p className="text-xs text-muted-foreground">
                Tested: {new Date(settings.last_connection_test_at).toLocaleString()}
              </p>
            )}
            {!testResult.success && testResult.request_id && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={copyDiagnostics}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Diagnostics
              </Button>
            )}
          </div>
        </div>
      )}

      <Button
        variant="outline"
        onClick={onTest}
        disabled={isTesting}
      >
        {isTesting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Test Connection
      </Button>
    </div>
  );
}
