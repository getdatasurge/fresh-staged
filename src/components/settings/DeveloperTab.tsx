import { AlertTriangle } from 'lucide-react';
import { SensorSimulatorPanel } from '@/components/admin/SensorSimulatorPanel';
import { DebugModeToggle } from '@/components/debug';
import { EmulatorResyncCard } from '@/components/settings/EmulatorResyncCard';
import { EmulatorSyncHistory } from '@/components/settings/EmulatorSyncHistory';
import { TTNConnectionSettings } from '@/components/settings/TTNConnectionSettings';
import { TTNCredentialsPanel } from '@/components/settings/TTNCredentialsPanel';
import { TTNProvisioningLogs } from '@/components/settings/TTNProvisioningLogs';
import { Card, CardContent } from '@/components/ui/card';

interface DeveloperTabProps {
  organizationId: string | null;
  canViewDeveloperTools: boolean;
  canManageTTN: boolean;
  userRole: string | null;
}

export function DeveloperTab({
  organizationId,
  canViewDeveloperTools,
  canManageTTN,
  userRole,
}: DeveloperTabProps) {
  if (!canViewDeveloperTools) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-warning mb-4" />
          <h3 className="font-medium">Developer Tools Unavailable</h3>
          <p className="text-sm text-muted-foreground mt-2">
            This section requires Owner, Admin, or Manager role. Current role:{' '}
            {userRole || 'Not loaded'}
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Debug: Org ID {organizationId?.slice(0, 8) || 'none'}...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {canManageTTN && <DebugModeToggle />}
      <TTNCredentialsPanel
        key={organizationId || 'no-org'}
        organizationId={organizationId}
        readOnly={!canManageTTN}
      />
      <TTNConnectionSettings organizationId={organizationId} readOnly={!canManageTTN} />
      {canManageTTN && (
        <>
          <TTNProvisioningLogs organizationId={organizationId} />
          <EmulatorResyncCard organizationId={organizationId} />
          <EmulatorSyncHistory organizationId={organizationId} />
          <SensorSimulatorPanel organizationId={organizationId} />
        </>
      )}
    </>
  );
}
