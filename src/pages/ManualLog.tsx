import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import LogTempModal, { LogTempUnit } from '@/components/LogTempModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Thermometer,
  Loader2,
  WifiOff,
  Wifi,
  CloudOff,
  RefreshCw,
  Check,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useUser } from '@stackframe/react';
import { computeUnitStatus, UnitStatusInfo } from '@/hooks/useUnitStatus';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';

interface UnitForLogging extends UnitStatusInfo {}

const ManualLog = () => {
  const navigate = useNavigate();
  const user = useUser();
  const { toast } = useToast();
  const { isOnline, pendingCount, isSyncing, syncPendingLogs } = useOfflineSync();
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();
  const trpc = useTRPC();
  const [selectedUnit, setSelectedUnit] = useState<LogTempUnit | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Redirect to auth if not logged in
  if (!user) {
    navigate('/auth');
  }

  // Fetch units via tRPC
  const unitsQuery = useQuery(
    trpc.units.listByOrg.queryOptions(
      { organizationId: effectiveOrgId || '' },
      { enabled: isInitialized && !!effectiveOrgId && !!user },
    ),
  );

  // Transform tRPC camelCase response to snake_case UnitStatusInfo interface
  const units: UnitForLogging[] = useMemo(() => {
    if (!unitsQuery.data) return [];

    return unitsQuery.data.map((u) => ({
      id: u.id,
      name: u.name,
      unit_type: u.unitType,
      status: u.status,
      temp_limit_high: u.tempMax,
      temp_limit_low: u.tempMin,
      manual_log_cadence: u.manualMonitoringInterval || 14400,
      last_manual_log_at: u.lastManualLogAt?.toISOString() || null,
      last_reading_at: u.lastReadingAt?.toISOString() || null,
      last_temp_reading: u.lastTemperature,
      sensor_reliable: true, // Default - listByOrg doesn't include this field
      manual_logging_enabled: u.manualMonitoringRequired,
      consecutive_checkins: 0, // Default - listByOrg doesn't include this field
      area: {
        name: u.areaName,
        site: { name: u.siteName },
      },
    }));
  }, [unitsQuery.data]);

  // Sort units by action required
  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const aStatus = computeUnitStatus(a);
      const bStatus = computeUnitStatus(b);
      if (aStatus.manualRequired && !bStatus.manualRequired) return -1;
      if (!aStatus.manualRequired && bStatus.manualRequired) return 1;
      return 0;
    });
  }, [units]);

  const isLoading = !isInitialized || unitsQuery.isLoading;

  const formatCadence = (seconds: number) => {
    const hours = seconds / 3600;
    if (hours < 1) return `${Math.round(seconds / 60)} min`;
    if (hours === 1) return '1 hour';
    return `${hours} hours`;
  };

  // Compute which units need logging using unified logic
  const unitsWithStatus = units.map((u) => ({
    ...u,
    computed: computeUnitStatus(u),
  }));

  const unitsRequiringLog = unitsWithStatus.filter((u) => u.computed.manualRequired);

  const handleUnitClick = (unit: UnitForLogging) => {
    setSelectedUnit({
      id: unit.id,
      name: unit.name,
      unit_type: unit.unit_type,
      status: unit.status,
      temp_limit_high: unit.temp_limit_high,
      temp_limit_low: unit.temp_limit_low,
      manual_log_cadence: unit.manual_log_cadence,
      area: unit.area,
    });
    setModalOpen(true);
  };

  const handleLogSuccess = () => {
    // Reload units to get fresh data
    unitsQuery.refetch();
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Manual Temperature Log">
      {/* Offline/Sync Status Bar */}
      <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-card border border-border">
        <div className="flex items-center gap-3">
          {isOnline ? (
            <div className="flex items-center gap-2 text-safe">
              <Wifi className="w-4 h-4" />
              <span className="text-sm font-medium">Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-warning">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm font-medium">Offline Mode</span>
            </div>
          )}
          {pendingCount > 0 && (
            <Badge variant="secondary" className="bg-warning/10 text-warning">
              <CloudOff className="w-3 h-3 mr-1" />
              {pendingCount} pending
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => unitsQuery.refetch()}
            disabled={unitsQuery.isLoading}
            title="Refresh units"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {pendingCount > 0 && isOnline && (
            <Button variant="outline" size="sm" onClick={syncPendingLogs} disabled={isSyncing}>
              {isSyncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sync Now
            </Button>
          )}
        </div>
      </div>

      {/* Manual Logging Required Alert */}
      {unitsRequiringLog.length > 0 && (
        <Card className="mb-6 border-alarm/50 bg-alarm/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-alarm">
              <AlertTriangle className="w-5 h-5" />
              Manual Logging Required ({unitsRequiringLog.length} units)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-3">
              The following units require immediate manual temperature logs due to sensor issues or
              missed log intervals.
            </p>
            <div className="grid gap-2">
              {unitsRequiringLog.slice(0, 3).map((unit) => (
                <div
                  key={unit.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background cursor-pointer hover:bg-muted/50 transition-colors"
                  role="button"
                  tabIndex={0}
                  aria-label={`Log temperature for ${unit.name}`}
                  onClick={() => handleUnitClick(unit)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUnitClick(unit);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Thermometer className="w-4 h-4 text-alarm" />
                    <div>
                      <span className="font-medium text-foreground">{unit.name}</span>
                      <p className="text-xs text-muted-foreground">{unit.area.site.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="destructive" className="mb-1">
                      {unit.computed.minutesSinceManualLog === null
                        ? 'Never logged'
                        : `${Math.floor(unit.computed.manualOverdueMinutes / 60)}h overdue`}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Every {formatCadence(unit.manual_log_cadence)}
                    </p>
                  </div>
                </div>
              ))}
              {unitsRequiringLog.length > 3 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{unitsRequiringLog.length - 3} more units need logging
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Units Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {unitsWithStatus.map((unit) => {
          const { computed } = unit;
          const needsAttention = computed.manualRequired;

          return (
            <Card
              key={unit.id}
              className={`cursor-pointer transition-all ${
                needsAttention ? 'border-warning/50 bg-warning/5' : 'card-hover'
              }`}
              onClick={() => handleUnitClick(unit)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        needsAttention ? 'bg-warning/10' : 'bg-accent/10'
                      }`}
                    >
                      <Thermometer
                        className={`w-5 h-5 ${needsAttention ? 'text-warning' : 'text-accent'}`}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{unit.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {unit.area.site.name} · {unit.area.name}
                      </p>
                    </div>
                  </div>
                  {needsAttention && <AlertTriangle className="w-4 h-4 text-warning" />}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize">
                      {unit.unit_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · Every {formatCadence(unit.manual_log_cadence)}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1 text-xs ${computed.manualRequired ? 'text-warning' : 'text-safe'}`}
                  >
                    {computed.manualRequired ? (
                      <Clock className="w-3 h-3" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    {computed.manualRequired
                      ? computed.minutesSinceManualLog === null
                        ? 'Never'
                        : 'Overdue'
                      : `${Math.floor((computed.minutesSinceManualLog || 0) / 60)}h ago`}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {units.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Thermometer className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No units available for logging</p>
          </CardContent>
        </Card>
      )}

      {/* Log Entry Modal */}
      <LogTempModal
        unit={selectedUnit}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleLogSuccess}
      />
    </DashboardLayout>
  );
};

export default ManualLog;
