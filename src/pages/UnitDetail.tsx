import DashboardLayout from "@/components/DashboardLayout"
import { HierarchyBreadcrumb } from "@/components/HierarchyBreadcrumb"
import { LayoutHeaderDropdown } from "@/components/LayoutHeaderDropdown"
import LogTempModal from "@/components/LogTempModal"
import { UnitDebugBanner } from "@/components/debug"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import BatteryHealthCard from "@/components/unit/BatteryHealthCard"
import UnitAlertThresholdsSection from "@/components/unit/UnitAlertThresholdsSection"
import UnitSensorsCard from "@/components/unit/UnitSensorsCard"
import UnitSettingsSection from "@/components/unit/UnitSettingsSection"
import { EntityDashboard } from "@/features/dashboard-layout"
import { useToast } from "@/hooks/use-toast"
import { DEFAULT_ALERT_RULES, useUnitAlertRules } from "@/hooks/useAlertRules"
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity"
import { useEntityDashboardUrl } from "@/hooks/useEntityDashboardUrl"
import { useLoraSensorsByUnit } from "@/hooks/useLoraSensors"
import { useSoftDelete } from "@/hooks/useSoftDelete"
import { computeUnitAlerts } from "@/hooks/useUnitAlerts"
import { UnitStatusInfo, computeUnitStatus } from "@/hooks/useUnitStatus"
import { usePermissions } from "@/hooks/useUserRole"
import { useTRPC, useTRPCClient } from "@/lib/trpc"
import { invalidateUnitCaches } from "@/lib/unitCacheInvalidation"
import { useUser } from "@stackframe/react"
import { useQueryClient } from "@tanstack/react-query"
import { format, subDays, subHours } from "date-fns"
import {
  AlertTriangle,
  ClipboardEdit,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  Settings,
  Trash2
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

interface UnitData {
  id: string;
  name: string;
  unit_type: string;
  status: string;
  temp_limit_high: number;
  temp_limit_low: number | null;
  last_temp_reading: number | null;
  last_reading_at: string | null;
  last_manual_log_at: string | null;
  manual_log_cadence: number;
  door_state?: "open" | "closed" | "unknown" | null;
  door_last_changed_at?: string | null;
  door_sensor_enabled?: boolean;
  door_open_grace_minutes?: number;
  area: { id: string; name: string; site: { id: string; name: string; organization_id: string } };
}

interface SensorReading {
  id: string;
  temperature: number;
  humidity: number | null;
  recorded_at: string;
}

interface ManualLog {
  id: string;
  temperature: number;
  notes: string | null;
  logged_at: string;
  is_in_range: boolean | null;
}

interface EventLog {
  id: string;
  event_type: string;
  event_data: any;
  recorded_at: string;
}

interface UnitAlert {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  clearCondition: string;
}

import { getAlertClearCondition } from "@/lib/alertConfig"

const UnitDetail = () => {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useUser();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const { effectiveOrgId, isInitialized: identityInitialized } = useEffectiveIdentity();
  const { layoutKey } = useEntityDashboardUrl();
  const { canDeleteEntities, isLoading: permissionsLoading } = usePermissions();
  const { softDeleteUnit, getActiveChildrenCount } = useSoftDelete();

  const [timeRange, setTimeRange] = useState("24h");
  const [isExporting, setIsExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Queries using tRPC
  const unitQuery = trpc.units.getWithHierarchy.useQuery(
    { unitId: unitId!, organizationId: effectiveOrgId! },
    { enabled: !!unitId && !!effectiveOrgId && identityInitialized }
  );

  const fromDate = useMemo(() => {
    const now = new Date();
    switch (timeRange) {
      case "1h": return subHours(now, 1).toISOString();
      case "6h": return subHours(now, 6).toISOString();
      case "24h": return subHours(now, 24).toISOString();
      case "7d": return subDays(now, 7).toISOString();
      case "30d": return subDays(now, 30).toISOString();
      default: return subHours(now, 24).toISOString();
    }
  }, [timeRange]);

  const readingsQuery = trpc.readings.list.useQuery(
    { 
      unitId: unitId!, 
      organizationId: effectiveOrgId!,
      start: fromDate,
      limit: 500
    },
    { enabled: !!unitId && !!effectiveOrgId && identityInitialized }
  );

  const manualLogsQuery = trpc.readings.listManual.useQuery(
    {
      unitId: unitId!,
      organizationId: effectiveOrgId!,
      start: fromDate,
      limit: 50
    },
    { enabled: !!unitId && !!effectiveOrgId && identityInitialized }
  );

  const eventsQuery = trpc.audit.list.useQuery(
    {
      unitId: unitId!,
      organizationId: effectiveOrgId!,
      start: fromDate,
      limit: 50
    },
    { enabled: !!unitId && !!effectiveOrgId && identityInitialized }
  );

  const deviceQuery = trpc.ttnDevices.getByUnit.useQuery(
    { 
      unitId: unitId!, 
      organizationId: effectiveOrgId! 
    },
    { enabled: !!unitId && !!effectiveOrgId && identityInitialized }
  );

  // Sibling units query (needs a list units in area procedure, but we can filter listByOrg for now or I'll add listByArea)
  // Actually I have trpc.units.list which takes areaId.
  const siblingsQuery = trpc.units.list.useQuery(
    {
      organizationId: effectiveOrgId!,
      siteId: unitQuery.data?.siteId!,
      areaId: unitQuery.data?.areaId!,
    },
    { enabled: !!unitQuery.data?.areaId && !!effectiveOrgId }
  );

  const isLoading = unitQuery.isLoading || identityInitialized === false;
  const { data: loraSensors } = useLoraSensorsByUnit(unitId || null);
  const { data: alertRules } = useUnitAlertRules(unitId || null);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Poll for updates as a simple replacement for Supabase Realtime
  useEffect(() => {
    if (!unitId || !isTabVisible) return;

    const interval = setInterval(() => {
      unitQuery.refetch();
      readingsQuery.refetch();
      manualLogsQuery.refetch();
      eventsQuery.refetch();
      deviceQuery.refetch();
      setRefreshTick(prev => prev + 1);
    }, 30000); // 30s polling

    return () => clearInterval(interval);
  }, [unitId, isTabVisible, unitQuery, readingsQuery, manualLogsQuery, eventsQuery, deviceQuery]);

  // Derived data from tRPC queries
  const unit = useMemo(() => {
    if (!unitQuery.data) return null;
    return {
      id: unitQuery.data.id,
      name: unitQuery.data.name,
      unit_type: unitQuery.data.unitType,
      status: unitQuery.data.status,
      temp_limit_high: unitQuery.data.tempMax,
      temp_limit_low: unitQuery.data.tempMin,
      last_temp_reading: unitQuery.data.lastTemperature,
      last_reading_at: unitQuery.data.lastReadingAt?.toISOString() || null,
      last_manual_log_at: (unitQuery.data as any).lastManualLogAt?.toISOString() || null,
      manual_log_cadence: unitQuery.data.manualMonitoringInterval || 240,
      area: {
        id: unitQuery.data.areaId,
        name: (unitQuery.data as any).areaName,
        site: {
          id: (unitQuery.data as any).siteId,
          name: (unitQuery.data as any).siteName,
          organization_id: effectiveOrgId!,
        }
      }
    } as UnitData;
  }, [unitQuery.data, effectiveOrgId]);

  const siblingUnits = useMemo(() => {
    if (!siblingsQuery.data) return [];
    return siblingsQuery.data
      .filter(u => u.id !== unitId)
      .map(u => ({
        id: u.id,
        name: u.name,
        href: `/units/${u.id}`,
      }));
  }, [siblingsQuery.data, unitId]);

  const readings = useMemo(() => {
    return readingsQuery.data?.map(r => ({
      id: r.id,
      temperature: r.temperature,
      humidity: r.humidity,
      recorded_at: r.recordedAt.toISOString(),
    })) || [];
  }, [readingsQuery.data]);

  const manualLogs = useMemo(() => {
    return manualLogsQuery.data?.map(l => ({
      id: l.id,
      temperature: l.temperature,
      notes: l.notes,
      logged_at: l.recordedAt.toISOString(),
      is_in_range: true, 
    })) || [];
  }, [manualLogsQuery.data]);

  const events = useMemo(() => {
    return eventsQuery.data?.map(e => ({
      id: e.id,
      event_type: e.eventType,
      event_data: e.eventData,
      recorded_at: e.recordedAt.toISOString(),
    })) || [];
  }, [eventsQuery.data]);

  // Tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);


  const device = useMemo(() => {
    if (!deviceQuery.data) return null;
    return {
      id: deviceQuery.data.id,
      unit_id: deviceQuery.data.unitId,
      last_seen_at: deviceQuery.data.lastSeenAt?.toISOString() || null,
      serial_number: deviceQuery.data.devEui,
      battery_level: 100, 
      signal_strength: -50,
      status: deviceQuery.data.status,
    } as any;
  }, [deviceQuery.data]);

  const primaryLoraSensor = useMemo(() => {
    if (!loraSensors?.length) return null;
    const primary = loraSensors.find(s => s.is_primary);
    if (primary) return primary;
    const tempSensors = loraSensors.filter(s => 
      ['temperature', 'temperature_humidity', 'combo'].includes(s.sensor_type || '')
    );
    return tempSensors.sort((a, b) => 
      new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime()
    )[0] || loraSensors[0];
  }, [loraSensors]);

  const doorSensor = useMemo(() => 
    loraSensors?.find(s => s.sensor_type === 'door' || s.sensor_type === 'contact') || null,
    [loraSensors]
  );

  const doorEventsQuery = trpc.readings.listDoorEvents.useQuery(
    { organizationId: effectiveOrgId!, unitId: unitId!, limit: 1 },
    { enabled: !!unitId && !!effectiveOrgId && identityInitialized }
  );

  const effectiveDoorState = useMemo(() => {
    const latestEvent = doorEventsQuery.data?.[0];
    if (latestEvent && unitQuery.data?.doorLastChangedAt) {
      const eventTime = new Date(latestEvent.occurredAt).getTime();
      const unitTime = new Date(unitQuery.data.doorLastChangedAt).getTime();
      if (eventTime >= unitTime) {
        return { state: latestEvent.state, since: latestEvent.occurredAt.toISOString() };
      }
    }
    return {
      state: unitQuery.data?.doorState || "unknown",
      since: unitQuery.data?.doorLastChangedAt?.toISOString() || null
    };
  }, [doorEventsQuery.data, unitQuery.data]);

  const [lastKnownGood, setLastKnownGood] = useState<{
    temp: number | null;
    at: null | string;
    source: "sensor" | "manual" | null;
  }>({ temp: null, at: null, source: null });


  useEffect(() => {
    if (!readings.length && !manualLogs.length) return;
    
    const lastSensor = readings[readings.length - 1];
    const lastManual = manualLogs[0];

    const sensorTime = lastSensor ? new Date(lastSensor.recorded_at).getTime() : 0;
    const manualTime = lastManual ? new Date(lastManual.logged_at).getTime() : 0;

    if (sensorTime > manualTime && lastSensor) {
      setLastKnownGood({ temp: lastSensor.temperature, at: lastSensor.recorded_at, source: "sensor" });
    } else if (lastManual) {
      setLastKnownGood({ temp: lastManual.temperature, at: lastManual.logged_at, source: "manual" });
    }
  }, [readings, manualLogs]);

  const unitAlerts = useMemo(() => {
    if (!unit) return [];
    
    const unitStatusInfo: UnitStatusInfo = {
      id: unit.id,
      name: unit.name,
      unit_type: unit.unit_type,
      status: unit.status,
      temp_limit_high: unit.temp_limit_high,
      temp_limit_low: unit.temp_limit_low,
      manual_log_cadence: unit.manual_log_cadence,
      last_manual_log_at: unit.last_manual_log_at,
      last_reading_at: unit.last_reading_at,
      last_temp_reading: unit.last_temp_reading,
      area: {
        name: unit.area.name,
        site: { name: unit.area.site.name },
      },
    };

    const computedSummary = computeUnitAlerts([unitStatusInfo]);
    
    return computedSummary.alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      message: a.message,
      clearCondition: getAlertClearCondition(a.type),
    }));
  }, [unit]);

  const queryClient = useQueryClient();
  const DEV = import.meta.env.DEV;
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshUnitData = useCallback(() => {
    unitQuery.refetch();
    readingsQuery.refetch();
    manualLogsQuery.refetch();
    eventsQuery.refetch();
    deviceQuery.refetch();
    doorEventsQuery.refetch();
    setRefreshTick(prev => prev + 1);
  }, [unitQuery, readingsQuery, manualLogsQuery, eventsQuery, deviceQuery, doorEventsQuery]);

  const derivedStatus = useMemo(() => {
    if (!unit) return null;
    const effectiveRules = alertRules || DEFAULT_ALERT_RULES;
    const unitStatusInfo: UnitStatusInfo = {
      id: unit.id,
      name: unit.name,
      unit_type: unit.unit_type,
      status: unit.status,
      temp_limit_high: unit.temp_limit_high,
      temp_limit_low: unit.temp_limit_low,
      manual_log_cadence: unit.manual_log_cadence,
      last_manual_log_at: unit.last_manual_log_at,
      last_reading_at: unit.last_reading_at,
      last_temp_reading: unit.last_temp_reading,
      last_checkin_at: primaryLoraSensor?.last_seen_at || unit.last_reading_at,
      checkin_interval_minutes: effectiveRules.expected_reading_interval_seconds / 60,
      area: {
        name: unit.area.name,
        site: { name: unit.area.site.name },
      },
    };

    const computed = computeUnitStatus(unitStatusInfo, effectiveRules);
    const sensorId = primaryLoraSensor?.id || device?.id || null;
    const now = Date.now();
    const lastSeenAt = primaryLoraSensor?.last_seen_at || null;
    const lastReadingAtVal = unit?.last_reading_at || null;
    const effectiveLastCheckin = lastSeenAt || lastReadingAtVal;
    
    return {
      sensorId,
      isOnline: computed.offlineSeverity === "none",
      status: computed.offlineSeverity === "none" ? "online" : computed.offlineSeverity === "warning" ? "offline_warning" : "offline_critical",
      statusLabel: computed.offlineSeverity === "none" ? (computed.statusLabel || "OK") : "Offline",
      statusColor: computed.statusColor,
      statusBgColor: computed.statusBgColor,
      offlineSeverity: computed.offlineSeverity,
      missedCheckins: computed.missedCheckins,
      lastSeenAt,
      lastSeenAgeSec: effectiveLastCheckin ? Math.floor((now - new Date(effectiveLastCheckin).getTime()) / 1000) : null,
      lastReadingAt: lastReadingAtVal,
      lastReadingAgeSec: lastReadingAtVal ? Math.floor((now - new Date(lastReadingAtVal).getTime()) / 1000) : null,
      checkinIntervalMinutes: effectiveRules.expected_reading_interval_seconds / 60,
      rawComputed: computed
    };
  }, [unit, alertRules, primaryLoraSensor, device]);

  const exportToCSV = async (reportType: "daily" | "exceptions" = "daily") => {
    if (!unit) return;
    setIsExporting(true);
    toast({ title: "Migration in progress", description: "CSV exports are moving to tRPC." });
    setIsExporting(false);
  };

  const formatTemp = (temp: number | null) => {
    if (temp === null) return "--";
    return `${temp.toFixed(1)}°F`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied to clipboard" });
  };

  const handleDeleteUnit = async () => {
    if (!user?.id || !unitId || !effectiveOrgId || !unitQuery.data) return;
    try {
      await trpcClient.units.delete.mutate({
        organizationId: effectiveOrgId,
        siteId: (unitQuery.data as any).siteId,
        areaId: unitQuery.data!.areaId,
        unitId: unitId,
      });
      toast({ title: "Unit deleted" });
      navigate(`/sites/${(unitQuery.data as any).siteId}/areas/${unitQuery.data!.areaId}`);
    } catch (err) {
      console.error("Error deleting unit:", err);
      toast({ title: "Failed to delete unit", variant: "destructive" });
    }
  };


  if (isLoading && !unit) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12 min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!unit) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unit not found</p>
        </div>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>
      {/* STEP 0: UnitDebugBanner - DEV ONLY diagnostic banner */}
      {DEV && (
        <UnitDebugBanner
          unitId={unitId}
          orgId={unit.area.site.organization_id}
          siteId={unit.area.site.id}
          areaId={unit.area.id}
          readingsCount={readings.length}
          sensorsCount={loraSensors?.length ?? 0}
          doorState={unit.door_state}
          realtimeConnected={realtimeConnected}
          lastError={lastError}
        />
      )}
      {/* Route indicator for debugging/verification */}
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
        <span className="font-mono bg-muted px-2 py-0.5 rounded">/units/{unitId}{layoutKey !== 'default' ? `/layout/${layoutKey}` : ''}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5"
          onClick={handleCopyLink}
        >
          <Copy className="w-3 h-3" />
        </Button>
        {DEV && (
          <Button
            variant="outline"
            size="sm"
            className="h-5 px-2 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 dark:text-yellow-300"
            onClick={() => {
              console.log('[SMOKE] manual refresh triggered');
              refreshUnitData();
              invalidateUnitCaches(queryClient, unitId!);
            }}
          >
            🔄 Simulate Update (DEV)
          </Button>
        )}
      </div>
      <HierarchyBreadcrumb
        items={[
          { label: "All Equipment", href: "/units" },
          { label: unit.area.site.name, href: `/sites/${unit.area.site.id}` },
          { label: unit.area.name, href: `/sites/${unit.area.site.id}/areas/${unit.area.id}` },
          { label: unit.name, isCurrentPage: true, siblings: siblingUnits },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* Layout Selector Dropdown */}
            <LayoutHeaderDropdown
              entityType="unit"
              entityId={unitId!}
              organizationId={unit.area.site.organization_id}
              currentLayoutKey={layoutKey}
            />
            <Button
              variant="default"
              className="bg-accent hover:bg-accent/90"
              onClick={() => setModalOpen(true)}
            >
              <ClipboardEdit className="w-4 h-4 mr-2" />
              Log Temp
            </Button>
            <Button 
              variant="outline" 
              onClick={() => exportToCSV("daily")} 
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Daily Log
            </Button>
            <Button 
              variant="outline" 
              onClick={() => exportToCSV("exceptions")} 
              disabled={isExporting}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Exceptions
            </Button>
            {canDeleteEntities && !permissionsLoading && (
              <Button 
                variant="ghost" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      {/* Tab-based layout */}
      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="w-4 h-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab - Customizable Grid */}
        <TabsContent value="dashboard" className="space-y-4">
          <EntityDashboard
            entityType="unit"
            entityId={unitId!}
            organizationId={unit.area.site.organization_id}
            siteId={unit.area.site.id}
            unit={{
              id: unit.id,
              name: unit.name,
              unit_type: unit.unit_type,
              temp_limit_high: unit.temp_limit_high,
              temp_limit_low: unit.temp_limit_low,
              last_temp_reading: unit.last_temp_reading,
              last_reading_at: unit.last_reading_at,
              // STEP C: Use effectiveDoorState from latest door_event
              door_state: effectiveDoorState.state,
              door_last_changed_at: effectiveDoorState.since,
            }}
            sensor={primaryLoraSensor ? {
              id: primaryLoraSensor.id,
              name: primaryLoraSensor.name,
              last_seen_at: primaryLoraSensor.last_seen_at,
              battery_level: primaryLoraSensor.battery_level,
              signal_strength: primaryLoraSensor.signal_strength,
              status: primaryLoraSensor.status,
              sensor_type: primaryLoraSensor.sensor_type,
            } : undefined}
            readings={readings}
            derivedStatus={derivedStatus}
            alerts={unitAlerts}
            loraSensors={loraSensors?.map(s => ({
              id: s.id,
              name: s.name,
              battery_level: s.battery_level,
              signal_strength: s.signal_strength,
              last_seen_at: s.last_seen_at,
              status: s.status,
            })) || []}
            lastKnownGood={lastKnownGood}
            onLogTemp={() => setModalOpen(true)}
            refreshTick={refreshTick}
          />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          {/* Unit Settings */}
          <UnitSettingsSection
            unitId={unit.id}
            unitType={unit.unit_type}
            tempLimitLow={unit.temp_limit_low}
            tempLimitHigh={unit.temp_limit_high}
            notes={(unit as any).notes}
            doorSensorEnabled={(unit as any).door_sensor_enabled}
            doorOpenGraceMinutes={(unit as any).door_open_grace_minutes}
            onSettingsUpdated={refreshUnitData}
          />

          {/* Alert Thresholds */}
          <UnitAlertThresholdsSection
            unitId={unit.id}
            siteId={unit.area.site.id}
            onSettingsUpdated={refreshUnitData}
          />

          {/* Connected LoRa Sensors */}
          {unit.area.site.organization_id && (
            <UnitSensorsCard
              unitId={unit.id}
              organizationId={(unit.area.site as any).organization_id}
              siteId={unit.area.site.id}
              doorState={(unit as any).door_state}
              doorLastChangedAt={(unit as any).door_last_changed_at}
            />
          )}

          {/* Battery Health */}
          {device?.id && (
            <BatteryHealthCard deviceId={device.id} />
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {/* Time Range Selector for History */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Event History</h3>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1h</SelectItem>
                <SelectItem value="6h">Last 6h</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sub-tabs for Manual Logs and Events */}
          <Tabs defaultValue="manual" className="space-y-4">
            <TabsList>
              <TabsTrigger value="manual">
                <FileText className="w-4 h-4 mr-2" />
                Manual Logs ({manualLogs.length})
              </TabsTrigger>
              <TabsTrigger value="events">
                <Clock className="w-4 h-4 mr-2" />
                Events ({events.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              {manualLogs.length > 0 ? (
                <div className="space-y-2">
                  {manualLogs.map((log) => (
                    <Card key={log.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(log.logged_at), "MMM d, yyyy · h:mm a")}
                          </p>
                          {log.notes && <p className="text-sm mt-1">{log.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${
                            log.is_in_range === false ? "text-alarm" : "text-safe"
                          }`}>
                            {log.temperature}°F
                          </p>
                          {log.is_in_range === false && (
                            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-destructive text-destructive-foreground">Out of range</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <FileText className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No manual logs in this time period</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => setModalOpen(true)}
                    >
                      Log Temperature
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="events">
              {events.length > 0 ? (
                <div className="space-y-2">
                  {events.map((event) => (
                    <Card key={event.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground capitalize">
                              {event.event_type.replace(/_/g, " ")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(event.recorded_at), "MMM d, yyyy · h:mm a")}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <Clock className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No events in this time period</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Log Temp Modal */}
      {unit && user && (
        <LogTempModal
          unit={{
            id: unit.id,
            name: unit.name,
            unit_type: unit.unit_type,
            status: unit.status,
            temp_limit_high: unit.temp_limit_high,
            temp_limit_low: unit.temp_limit_low,
            manual_log_cadence: 14400,
            area: unit.area,
          }}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onSuccess={refreshUnitData}
        />
      )}

      {/* Delete Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        entityType="unit"
        entityName={unit.name}
        onConfirm={handleDeleteUnit}
      />
    </DashboardLayout>
  );
};

export default UnitDetail;
