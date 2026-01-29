import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, AlertTriangle, Clock } from "lucide-react";

interface EmulatorResyncCardProps {
  organizationId: string | null;
}

interface TtnPayload {
  enabled?: boolean;
  provisioning_status?: string;
  cluster?: string | null;
  application_id?: string | null;
  webhook_url?: string | null;
  api_key_last4?: string | null;
  webhook_secret_last4?: string | null;
}

export function EmulatorResyncCard({ organizationId }: EmulatorResyncCardProps) {
  const trpc = useTRPC();
  const client = useTRPCClient();

  const syncLogQueryOptions = trpc.users.getLastSyncLog.queryOptions();
  const { data: lastSync, refetch: refetchSync } = useQuery({
    ...syncLogQueryOptions,
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const resyncMutation = useMutation({
    mutationFn: () => client.users.triggerEmulatorSync.mutate(),
    onSuccess: () => {
      toast.success("Sync triggered - check Emulator in a few seconds");
      // Wait a moment then refetch to show new sync status
      setTimeout(() => {
        refetchSync();
      }, 2000);
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    },
  });

  const handleResync = () => {
    if (!organizationId) {
      toast.error("No organization found");
      return;
    }
    resyncMutation.mutate();
  };

  const ttnPayload = lastSync?.payload?.ttn as TtnPayload | undefined;
  const hasTtnConfig = ttnPayload?.enabled && ttnPayload?.application_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Emulator Sync
        </CardTitle>
        <CardDescription>
          Manually trigger user sync to propagate TTN settings to the Emulator project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={handleResync}
            disabled={resyncMutation.isPending || !organizationId}
            variant="outline"
          >
            {resyncMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Force Sync to Emulator
              </>
            )}
          </Button>
        </div>

        {lastSync && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Last Sync</span>
              <div className="flex items-center gap-2">
                {lastSync.status === "sent" ? (
                  <Badge variant="outline" className="text-safe border-safe">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Sent
                  </Badge>
                ) : lastSync.status === "failed" ? (
                  <Badge variant="outline" className="text-alarm border-alarm">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Failed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-warning border-warning">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                )}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {new Date(lastSync.createdAt).toLocaleString()}
            </div>

            {lastSync.lastError && (
              <div className="p-2 rounded bg-alarm/10 text-alarm text-sm">
                Error: {lastSync.lastError}
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-sm font-medium mb-2">TTN Data in Payload</p>
              {hasTtnConfig ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Enabled:</span>{" "}
                    <span className="font-mono">{ttnPayload.enabled ? "Yes" : "No"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <span className="font-mono">{ttnPayload.provisioning_status || "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cluster:</span>{" "}
                    <span className="font-mono">{ttnPayload.cluster || "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">App ID:</span>{" "}
                    <span className="font-mono">{ttnPayload.application_id || "-"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Webhook URL:</span>{" "}
                    <span className="font-mono text-xs break-all">{ttnPayload.webhook_url || "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">API Key:</span>{" "}
                    <span className="font-mono">
                      {ttnPayload.api_key_last4 ? `****${ttnPayload.api_key_last4}` : "Not set"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Webhook Secret:</span>{" "}
                    <span className="font-mono">
                      {ttnPayload.webhook_secret_last4 ? `****${ttnPayload.webhook_secret_last4}` : "Not set"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No TTN configuration in last sync payload
                </p>
              )}
            </div>
          </div>
        )}

        {!lastSync && organizationId && (
          <p className="text-sm text-muted-foreground">
            No sync history found. Click "Force Sync" to trigger initial sync.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
