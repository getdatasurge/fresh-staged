import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useEffectiveIdentity } from '@/hooks/useEffectiveIdentity';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  MapPin,
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { computeUnitAlerts, UnitAlertsSummary } from '@/hooks/useUnitAlerts';
import { UnitStatusInfo } from '@/hooks/useUnitStatus';

interface SiteData {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  units: UnitStatusInfo[];
  alertSummary: UnitAlertsSummary;
  complianceScore: number;
}

interface OrgSummary {
  name: string;
  totalSites: number;
  totalUnits: number;
  totalAlerts: number;
  overallCompliance: number;
}

const OrganizationDashboard = () => {
  const navigate = useNavigate();
  const { effectiveOrgId, isInitialized } = useEffectiveIdentity();
  const trpc = useTRPC();

  // Redirect to onboarding if no org
  if (isInitialized && !effectiveOrgId) {
    navigate('/onboarding');
  }

  // Fetch organization details via tRPC
  const orgQuery = useQuery(
    trpc.organizations.get.queryOptions(
      { organizationId: effectiveOrgId || '' },
      { enabled: isInitialized && !!effectiveOrgId },
    ),
  );

  // Fetch sites via tRPC
  const sitesQuery = useQuery(
    trpc.sites.list.queryOptions(
      { organizationId: effectiveOrgId || '' },
      { enabled: isInitialized && !!effectiveOrgId },
    ),
  );

  // Fetch units via tRPC
  const unitsQuery = useQuery(
    trpc.units.listByOrg.queryOptions(
      { organizationId: effectiveOrgId || '' },
      { enabled: isInitialized && !!effectiveOrgId },
    ),
  );

  // Process sites and compute compliance using useMemo
  const { sites, orgSummary } = useMemo(() => {
    if (!sitesQuery.data || !unitsQuery.data) {
      return { sites: [], orgSummary: null };
    }

    // Transform units to UnitStatusInfo format and group by siteId
    const unitsBySiteId: Record<string, UnitStatusInfo[]> = {};
    unitsQuery.data.forEach((u) => {
      if (!unitsBySiteId[u.siteId]) {
        unitsBySiteId[u.siteId] = [];
      }
      unitsBySiteId[u.siteId].push({
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
        area: {
          name: u.areaName,
          site: { name: u.siteName },
        },
      });
    });

    // Process sites with their units
    const processedSites: SiteData[] = sitesQuery.data.map((site) => {
      const siteUnits = unitsBySiteId[site.id] || [];
      const alertSummary = computeUnitAlerts(siteUnits);

      // Compliance = units without CRITICAL alerts / total units
      const unitsWithCritical = alertSummary.alerts
        .filter((a) => a.severity === 'critical')
        .reduce((acc, alert) => {
          acc.add(alert.unit_id);
          return acc;
        }, new Set<string>()).size;

      const complianceScore =
        siteUnits.length > 0
          ? Math.round(((siteUnits.length - unitsWithCritical) / siteUnits.length) * 100)
          : 100;

      return {
        id: site.id,
        name: site.name,
        address: site.address || null,
        city: site.city || null,
        state: site.state || null,
        units: siteUnits,
        alertSummary,
        complianceScore,
      };
    });

    // Sort by compliance (lowest first to highlight problem sites)
    processedSites.sort((a, b) => a.complianceScore - b.complianceScore);

    // Calculate org-wide summary
    const totalUnits = processedSites.reduce((sum, s) => sum + s.units.length, 0);
    const totalAlerts = processedSites.reduce((sum, s) => sum + s.alertSummary.criticalCount, 0);
    const overallCompliance =
      totalUnits > 0
        ? Math.round(
            processedSites.reduce((sum, s) => sum + s.complianceScore * s.units.length, 0) /
              totalUnits,
          )
        : 100;

    return {
      sites: processedSites,
      orgSummary: {
        name: orgQuery.data?.name || 'Organization',
        totalSites: processedSites.length,
        totalUnits,
        totalAlerts,
        overallCompliance,
      } as OrgSummary,
    };
  }, [sitesQuery.data, unitsQuery.data, orgQuery.data]);

  const loading = !isInitialized || sitesQuery.isLoading || unitsQuery.isLoading;

  const getComplianceColor = (score: number) => {
    if (score >= 95) return 'text-safe';
    if (score >= 80) return 'text-warning';
    return 'text-alarm';
  };

  const getComplianceBg = (score: number) => {
    if (score >= 95) return 'bg-safe';
    if (score >= 80) return 'bg-warning';
    return 'bg-alarm';
  };

  if (loading) {
    return (
      <DashboardLayout title="Organization Overview">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Organization Overview">
      {/* Org Summary Stats */}
      {orgSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <MapPin className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{orgSummary.totalSites}</p>
                  <p className="text-sm text-muted-foreground">Sites</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Thermometer className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{orgSummary.totalUnits}</p>
                  <p className="text-sm text-muted-foreground">Units</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-alarm/10">
                  <AlertTriangle className="w-5 h-5 text-alarm" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{orgSummary.totalAlerts}</p>
                  <p className="text-sm text-muted-foreground">Critical Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${getComplianceBg(orgSummary.overallCompliance)}/10`}
                >
                  <TrendingUp
                    className={`w-5 h-5 ${getComplianceColor(orgSummary.overallCompliance)}`}
                  />
                </div>
                <div>
                  <p
                    className={`text-2xl font-bold ${getComplianceColor(orgSummary.overallCompliance)}`}
                  >
                    {orgSummary.overallCompliance}%
                  </p>
                  <p className="text-sm text-muted-foreground">Compliance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sites Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Sites Overview
        </h2>

        {sites.length === 0 ? (
          <Card className="p-8 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No sites yet</h3>
            <p className="text-muted-foreground">Add your first site to start monitoring.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <Link key={site.id} to={`/sites/${site.id}`}>
                <Card className="unit-card h-full hover:border-accent/50 transition-all cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{site.name}</CardTitle>
                        {(site.city || site.state) && (
                          <p className="text-sm text-muted-foreground">
                            {[site.city, site.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Stats Row */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Thermometer className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{site.units.length}</span>
                        <span className="text-muted-foreground">units</span>
                      </div>
                      {site.alertSummary.criticalCount > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {site.alertSummary.criticalCount}
                        </Badge>
                      )}
                      {site.alertSummary.warningCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-warning text-warning flex items-center gap-1"
                        >
                          {site.alertSummary.warningCount} warnings
                        </Badge>
                      )}
                    </div>

                    {/* Compliance Score */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Compliance</span>
                        <span
                          className={`font-semibold ${getComplianceColor(site.complianceScore)}`}
                        >
                          {site.complianceScore}%
                        </span>
                      </div>
                      <Progress
                        value={site.complianceScore}
                        className={`h-2 ${site.complianceScore >= 95 ? '[&>div]:bg-safe' : site.complianceScore >= 80 ? '[&>div]:bg-warning' : '[&>div]:bg-alarm'}`}
                      />
                    </div>

                    {/* Status Summary */}
                    <div className="flex items-center gap-2 text-xs">
                      {site.alertSummary.unitsOk > 0 && (
                        <div className="flex items-center gap-1 text-safe">
                          <CheckCircle2 className="w-3 h-3" />
                          {site.alertSummary.unitsOk} OK
                        </div>
                      )}
                      {site.alertSummary.unitsWithAlerts > 0 && (
                        <div className="flex items-center gap-1 text-alarm">
                          <AlertTriangle className="w-3 h-3" />
                          {site.alertSummary.unitsWithAlerts} need attention
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default OrganizationDashboard;
