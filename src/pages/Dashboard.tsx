import DashboardLayout from "@/components/DashboardLayout"
import { RBACDebugPanel } from "@/components/debug/RBACDebugPanel"
import LogTempModal, { LogTempUnit } from "@/components/LogTempModal"
import { Badge as UIBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffectiveIdentity } from "@/hooks/useEffectiveIdentity"
import { useUnitAlerts } from "@/hooks/useUnitAlerts"
import { computeUnitStatus, UnitStatusInfo } from "@/hooks/useUnitStatus"
import { useTRPC } from "@/lib/trpc"
import { useUser } from "@stackframe/react"
import { formatDistanceToNow } from "date-fns"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardEdit,
  ClipboardList,
  Loader2,
  MapPin,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Thermometer,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

interface DashboardStats {
  totalUnits: number;
  unitsOk: number;
  unitsWithAlerts: number;
  totalSites: number;
}

import { STATUS_CONFIG } from "@/lib/statusConfig"

const Dashboard = () => {
  const navigate = useNavigate();
  const user = useUser();
  const trpc = useTRPC();
  const { effectiveOrgId, isImpersonating, isInitialized } = useEffectiveIdentity();

  // Queries
  const statsQuery = trpc.organizations.stats.useQuery(
    { organizationId: effectiveOrgId || "" },
    { enabled: !!effectiveOrgId }
  );
  
  const unitsQuery = trpc.units.listByOrg.useQuery(
    { organizationId: effectiveOrgId || "" },
    { enabled: !!effectiveOrgId }
  );

  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Log temp modal state
  const [selectedUnit, setSelectedUnit] = useState<LogTempUnit | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Map tRPC units to local format
  const units = useMemo(() => {
    if (!unitsQuery.data) return [];
    
    return unitsQuery.data.map(u => ({
      id: u.id,
      name: u.name,
      unit_type: u.unitType,
      status: u.status,
      last_temp_reading: u.lastTemperature,
      last_reading_at: u.lastReadingAt?.toISOString() || null,
      temp_limit_high: u.tempMax,
      temp_limit_low: u.tempMin,
      manual_log_cadence: u.manualMonitoringInterval || 240, // default 4 hours
      last_manual_log_at: u.lastManualLogAt?.toISOString() || null,
      sensor_reliable: u.isActive, // placeholder for legacy field
      manual_logging_enabled: u.manualMonitoringRequired !== false,
      consecutive_checkins: 10, // placeholder
      area: { name: u.areaName, site: { name: u.siteName } },
      computed: computeUnitStatus({
        id: u.id,
        name: u.name,
        unit_type: u.unitType,
        status: u.status,
        last_temp_reading: u.lastTemperature,
        last_reading_at: u.lastReadingAt?.toISOString() || null,
        temp_limit_high: u.tempMax,
        temp_limit_low: u.tempMin,
        manual_log_cadence: u.manualMonitoringInterval || 240,
        last_manual_log_at: u.lastManualLogAt?.toISOString() || null,
        area: { name: u.areaName, site: { name: u.siteName } }
      } as any)
    }));
  }, [unitsQuery.data]);

  const unitsRequiringAction = useMemo(() => 
    units.filter(u => u.computed.actionRequired),
  [units]);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!user) {
      navigate("/auth", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (isInitialized && !effectiveOrgId) {
      navigate("/auth/callback", { replace: true });
    }
    if (effectiveOrgId) {
      setOrganizationId(effectiveOrgId);
    }
  }, [effectiveOrgId, isInitialized, navigate]);

  useEffect(() => {
    if (isInitialized && (!statsQuery.isLoading && !unitsQuery.isLoading)) {
      setIsLoading(false);
    }
  }, [isInitialized, statsQuery.isLoading, unitsQuery.isLoading]);

  const handleRefetch = useCallback(() => {
    statsQuery.refetch();
    unitsQuery.refetch();
  }, [statsQuery, unitsQuery]);

  const handleLogSuccess = () => {
    handleRefetch();
  };

  const dashboardStats: DashboardStats = {
    totalUnits: statsQuery.data?.unitCounts.total || 0,
    unitsOk: 0, // Computed by useUnitAlerts below
    unitsWithAlerts: 0, // Computed by useUnitAlerts below
    totalSites: statsQuery.data?.siteCount || 0,
  };

  // Use unified alert computation - single source of truth
  const alertsSummary = useUnitAlerts(units);

  const formatTemp = (temp: number | null) => {
    if (temp === null) return "--";
    return `${temp.toFixed(1)}°F`;
  };

  const getTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getComplianceBadge = (unit: UnitStatusInfo & { computed: ReturnType<typeof computeUnitStatus> }) => {
    if (unit.status === "ok" && !unit.computed.actionRequired) {
      return (
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold gap-1 text-safe border-safe/30 bg-safe/5">
          <ShieldCheck className="w-3 h-3" />
          Compliant
        </span>
      );
    } else if (unit.computed.manualRequired) {
      return (
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold gap-1 text-warning border-warning/30 bg-warning/5">
          <ClipboardList className="w-3 h-3" />
          Log Due
        </span>
      );
    } else if (["alarm_active", "excursion"].includes(unit.status)) {
      return (
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold gap-1 text-alarm border-alarm/30 bg-alarm/5">
          <ShieldAlert className="w-3 h-3" />
          Non-Compliant
        </span>
      );
    }
    return null;
  };


  const getLastLogDisplay = (unit: UnitStatusInfo) => {
    if (!unit.last_manual_log_at) {
      return <span className="text-muted-foreground">No logs</span>;
    }
    
    const computed = computeUnitStatus(unit);

    return (
      <span className={computed.manualRequired ? "text-warning" : "text-muted-foreground"}>
        {formatDistanceToNow(new Date(unit.last_manual_log_at), { addSuffix: true })}
      </span>
    );
  };

  const handleLogTemp = (unit: UnitStatusInfo, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    <DashboardLayout>
      {/* RBAC Debug Panel - only visible with ?debug_rbac=1 */}
      <RBACDebugPanel />
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="stat-card card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Units</p>
                <p className="text-3xl font-bold text-foreground">{dashboardStats.totalUnits}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Thermometer className="w-6 h-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">All OK</p>
                <p className="text-3xl font-bold text-safe">{alertsSummary.unitsOk}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-safe/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-safe" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alerts</p>
                <p className={`text-3xl font-bold ${alertsSummary.totalCount > 0 ? "text-alarm" : "text-foreground"}`}>{alertsSummary.totalCount}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${alertsSummary.totalCount > 0 ? "bg-alarm/10" : "bg-muted"}`}>
                <AlertTriangle className={`w-6 h-6 ${alertsSummary.totalCount > 0 ? "text-alarm" : "text-muted-foreground"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sites</p>
                <p className="text-3xl font-bold text-foreground">{dashboardStats.totalSites}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Units Requiring Action - grouped by severity */}
      {alertsSummary.totalCount > 0 && (
        <>
          {/* Critical Alerts (Manual Required, Alarm Active) */}
          {alertsSummary.criticalCount > 0 && (
            <Card className="mb-4 border-alarm/50 bg-alarm/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-alarm">
                  <AlertCircle className="w-5 h-5" />
                  Critical ({alertsSummary.criticalCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {alertsSummary.alerts
                    .filter(a => a.severity === "critical")
                    .slice(0, 5)
                    .map((alert) => {
                      const unit = units.find(u => u.id === alert.unit_id);
                      if (!unit) return null;
                      const showLogButton = alert.type === "MANUAL_REQUIRED";
                      
                      return (
                        <div key={alert.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-background hover:bg-muted/50 transition-colors">
                          <Link to={`/units/${alert.unit_id}`} className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-alarm/10 flex items-center justify-center flex-shrink-0">
                              <Thermometer className="w-5 h-5 text-alarm" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-foreground">{alert.unit_name}</span>
                                <UIBadge variant="destructive" className="text-xs">{alert.type === "MANUAL_REQUIRED" ? "Log Required" : "Alarm"}</UIBadge>
                              </div>
                              <p className="text-xs text-muted-foreground">{alert.site_name} · {alert.area_name}</p>
                              {/* Show message on mobile and desktop - no truncation */}
                              <p className="text-xs text-muted-foreground mt-1 break-words leading-relaxed">
                                {alert.message}
                              </p>
                            </div>
                          </Link>
                          <div className="flex items-center gap-2 flex-shrink-0 pl-13 sm:pl-0">
                            {showLogButton && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-alarm/50 text-alarm hover:bg-alarm/10"
                                onClick={(e) => handleLogTemp(unit, e)}
                              >
                                <ClipboardEdit className="w-4 h-4 mr-1" />
                                Log
                              </Button>
                            )}
                            <Link to={`/units/${alert.unit_id}`}>
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warning Alerts (Offline, Excursion) */}
          {alertsSummary.warningCount > 0 && (
            <Card className="mb-6 border-warning/50 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-warning">
                  <WifiOff className="w-5 h-5" />
                  Warnings ({alertsSummary.warningCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {alertsSummary.alerts
                    .filter(a => a.severity === "warning")
                    .slice(0, 5)
                    .map((alert) => {
                      return (
                        <div key={alert.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-background hover:bg-muted/50 transition-colors">
                          <Link to={`/units/${alert.unit_id}`} className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
                              {alert.type === "OFFLINE" ? (
                                <WifiOff className="w-5 h-5 text-warning" />
                              ) : (
                                <Thermometer className="w-5 h-5 text-warning" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-foreground">{alert.unit_name}</span>
                                <UIBadge variant="secondary" className="text-xs bg-warning/10 text-warning border-0">
                                  {alert.type === "OFFLINE" ? "Offline" : "Excursion"}
                                </UIBadge>
                              </div>
                              <p className="text-xs text-muted-foreground">{alert.site_name} · {alert.area_name}</p>
                              {/* Show message - no truncation, fully wrapping */}
                              <p className="text-xs text-muted-foreground mt-1 break-words leading-relaxed">
                                {alert.message}
                              </p>
                            </div>
                          </Link>
                          <div className="flex items-center gap-2 flex-shrink-0 pl-13 sm:pl-0">
                            <Link to={`/units/${alert.unit_id}`}>
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}

      {/* Units List */}
      {units.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">All Refrigeration Units</h2>
            <Link to="/sites">
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Unit
              </Button>
            </Link>
          </div>
          <div className="grid gap-3">
            {units.map((unit) => {
              // Use computed status when offline, otherwise use database status
              const effectiveStatus = unit.computed.offlineSeverity !== 'none' 
                ? 'offline' 
                : unit.status;
              const status = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.offline;
              const isOnline = unit.computed.sensorOnline;
              return (
                <Link key={unit.id} to={`/units/${unit.id}`}>
                  <Card className="unit-card card-hover cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl ${status.bgColor} flex items-center justify-center`}>
                            <Thermometer className={`w-6 h-6 ${status.color}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground">{unit.name}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${status.bgColor} ${status.color}`}>{status.label}</span>
                              {getComplianceBadge(unit)}
                            </div>
                            <p className="text-sm text-muted-foreground">{unit.area.site.name} · {unit.area.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <div className={`temp-display text-xl font-semibold ${unit.last_temp_reading && unit.last_temp_reading > unit.temp_limit_high ? "text-alarm" : status.color}`}>
                              {formatTemp(unit.last_temp_reading)}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {isOnline ? <Wifi className="w-3 h-3 text-safe" /> : <WifiOff className="w-3 h-3" />}
                              {getTimeAgo(unit.last_reading_at)}
                            </div>
                          </div>
                          <div className="text-right hidden md:block">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                              <ClipboardList className="w-3 h-3" />
                              Last Log
                            </div>
                            <div className="text-xs">
                              {getLastLogDisplay(unit)}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Get Started</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add your first site and refrigeration units to begin monitoring
            </p>
            <Link to="/sites">
              <Button className="bg-accent hover:bg-accent/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Site
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Log Temp Modal */}
      <LogTempModal
        unit={selectedUnit}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleLogSuccess}
      />
    </DashboardLayout>
  );
};

export default Dashboard;
