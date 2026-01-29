/**
 * Unit Compliance Score Widget
 *
 * Shows overall compliance percentage with breakdown.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Thermometer, ClipboardList, Bell } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import type { WidgetProps } from "../types";

interface ComplianceMetrics {
  readingCompliance: number;
  manualLogCompliance: number;
  alertResponseCompliance: number;
  overall: number;
}

export function UnitComplianceScoreWidget({ entityId, organizationId }: WidgetProps) {
  const trpc = useTRPC();

  // Calculate time range: last 24 hours
  const dayAgo = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    []
  );

  // Query readings via tRPC
  const readingsQueryOptions = trpc.readings.list.queryOptions({
    organizationId: organizationId!,
    unitId: entityId!,
    start: dayAgo,
    limit: 200,
  });

  const readingsQuery = useQuery({
    ...readingsQueryOptions,
    enabled: !!entityId && !!organizationId,
  });

  // Query manual logs via tRPC
  const logsQueryOptions = trpc.readings.listManual.queryOptions({
    organizationId: organizationId!,
    unitId: entityId,
    start: dayAgo,
  });

  const logsQuery = useQuery({
    ...logsQueryOptions,
    enabled: !!entityId && !!organizationId,
  });

  // Query alerts via tRPC
  const alertsQueryOptions = trpc.alerts.list.queryOptions({
    organizationId: organizationId!,
    unitId: entityId,
    start: dayAgo,
  });

  const alertsQuery = useQuery({
    ...alertsQueryOptions,
    enabled: !!entityId && !!organizationId,
  });

  const isLoading =
    readingsQuery.isLoading || logsQuery.isLoading || alertsQuery.isLoading;

  // Compute metrics from tRPC data
  const metrics = useMemo<ComplianceMetrics | null>(() => {
    if (
      readingsQuery.data === undefined &&
      logsQuery.data === undefined &&
      alertsQuery.data === undefined
    ) {
      return null;
    }

    const readingCount = readingsQuery.data?.length ?? 0;
    const expectedReadings = 144; // 24h * 6 per hour
    const readingCompliance = Math.min(
      100,
      (readingCount / expectedReadings) * 100
    );

    const logCount = logsQuery.data?.length ?? 0;
    const expectedLogs = 6; // 4-hour intervals
    const manualLogCompliance = Math.min(100, (logCount / expectedLogs) * 100);

    const alerts = alertsQuery.data ?? [];
    const totalAlerts = alerts.length;
    const resolvedAlerts = alerts.filter((a) => a.resolvedAt).length;
    const alertResponseCompliance =
      totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 100;

    // Calculate overall (weighted average)
    const overall =
      readingCompliance * 0.4 +
      manualLogCompliance * 0.3 +
      alertResponseCompliance * 0.3;

    return {
      readingCompliance,
      manualLogCompliance,
      alertResponseCompliance,
      overall,
    };
  }, [readingsQuery.data, logsQuery.data, alertsQuery.data]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Compliance Score
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center text-muted-foreground text-sm py-4">
          Loading...
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Compliance Score
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center text-muted-foreground text-sm py-4">
          Unable to calculate compliance
        </CardContent>
      </Card>
    );
  }

  const scoreColor = metrics.overall >= 90 
    ? "text-green-500" 
    : metrics.overall >= 70 
      ? "text-yellow-500" 
      : "text-destructive";

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Compliance Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className={`text-4xl font-bold ${scoreColor}`}>
            {Math.round(metrics.overall)}%
          </p>
          <p className="text-xs text-muted-foreground">Overall Compliance</p>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Thermometer className="h-3 w-3" />
                Sensor Readings
              </span>
              <span className="font-medium">{Math.round(metrics.readingCompliance)}%</span>
            </div>
            <Progress value={metrics.readingCompliance} className="h-1.5" />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ClipboardList className="h-3 w-3" />
                Manual Logs
              </span>
              <span className="font-medium">{Math.round(metrics.manualLogCompliance)}%</span>
            </div>
            <Progress value={metrics.manualLogCompliance} className="h-1.5" />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Bell className="h-3 w-3" />
                Alert Response
              </span>
              <span className="font-medium">{Math.round(metrics.alertResponseCompliance)}%</span>
            </div>
            <Progress value={metrics.alertResponseCompliance} className="h-1.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
