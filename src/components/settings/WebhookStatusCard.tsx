import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Webhook,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Settings2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

interface WebhookStatusCardProps {
  organizationId: string | null;
  canEdit: boolean;
}

interface WebhookConfig {
  webhookUrl: string;
  status: 'pending' | 'active' | 'error';
  configuredAt: string;
}

const statusConfig = {
  active: {
    icon: CheckCircle,
    label: 'Active',
    className: 'bg-safe/15 text-safe border-safe/30',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    className: 'bg-warning/15 text-warning border-warning/30',
  },
  error: {
    icon: XCircle,
    label: 'Error',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  not_configured: {
    icon: AlertTriangle,
    label: 'Not Configured',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function WebhookStatusCard({ organizationId, canEdit }: WebhookStatusCardProps) {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const trpc = useTRPC();

  // Load saved config from localStorage on mount
  useEffect(() => {
    if (organizationId) {
      const savedConfig = localStorage.getItem(`webhook-config-${organizationId}`);
      if (savedConfig) {
        try {
          setConfig(JSON.parse(savedConfig));
        } catch {
          // Invalid stored config, ignore
        }
      }
    }
  }, [organizationId]);

  // Configure webhook mutation using tRPC
  const configureWebhook = useMutation(
    trpc.telnyx.configureWebhook.mutationOptions({
      onSuccess: (data) => {
        if (data.success && data.webhookUrl) {
          const newConfig: WebhookConfig = {
            webhookUrl: data.webhookUrl,
            status: 'active',
            configuredAt: new Date().toISOString(),
          };
          setConfig(newConfig);
          // Persist to localStorage for session persistence
          if (organizationId) {
            localStorage.setItem(`webhook-config-${organizationId}`, JSON.stringify(newConfig));
          }
          toast.success('Webhook configured successfully!');
        } else {
          toast.error(data.error || 'Failed to configure webhook');
        }
      },
      onError: (error) => {
        toast.error(`Failed to configure webhook: ${error.message}`);
      },
    }),
  );

  const handleConfigure = async () => {
    if (!organizationId) return;
    setIsConfiguring(true);
    try {
      await configureWebhook.mutateAsync({ organizationId });
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleRefresh = () => {
    // Re-trigger configuration check by clearing and reloading
    if (organizationId) {
      const savedConfig = localStorage.getItem(`webhook-config-${organizationId}`);
      if (savedConfig) {
        try {
          setConfig(JSON.parse(savedConfig));
        } catch {
          setConfig(null);
        }
      }
    }
  };

  const status = config?.status || 'not_configured';
  const statusInfo =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.not_configured;
  const StatusIcon = statusInfo.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Status
            </CardTitle>
            <CardDescription>Telnyx delivery status webhook for SMS tracking</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRefresh} className="h-8 w-8">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className={statusInfo.className}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusInfo.label}
            </Badge>
          </div>

          {/* Webhook URL */}
          {config?.webhookUrl && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Webhook URL</span>
              <span
                className="text-sm font-mono text-xs truncate max-w-[200px]"
                title={config.webhookUrl}
              >
                {config.webhookUrl}
              </span>
            </div>
          )}

          {/* Configure Button */}
          {canEdit && (
            <div className="pt-2">
              {!config || status === 'not_configured' || status === 'error' ? (
                <Button
                  onClick={handleConfigure}
                  disabled={isConfiguring}
                  className="w-full"
                  variant={status === 'error' ? 'destructive' : 'default'}
                >
                  {isConfiguring ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Configuring...
                    </>
                  ) : (
                    <>
                      <Settings2 className="h-4 w-4 mr-2" />
                      {status === 'error' ? 'Reconfigure Webhook' : 'Configure Webhook'}
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-center text-muted-foreground">
                  Webhook is active and receiving delivery status updates
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
