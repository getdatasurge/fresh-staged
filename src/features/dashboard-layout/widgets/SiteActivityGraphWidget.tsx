/**
 * Site Activity Graph Widget
 *
 * Shows reading frequency sparklines for all units in the site.
 * Helps visualize sensor activity patterns at a glance.
 */

import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import { subHours, format, startOfHour } from "date-fns";
import type { WidgetProps } from "../types";

interface UnitActivity {
  id: string;
  name: string;
  areaName: string;
  hourlyReadings: number[]; // 24 hours of reading counts
  totalReadings: number;
  lastReadingAt: string | null;
}

export function SiteActivityGraphWidget({ organizationId, site }: WidgetProps) {
  const trpc = useTRPC();
  const now = useMemo(() => new Date(), []);
  const startTime = useMemo(() => subHours(now, 24), [now]);

  // Fetch all units for the organization via tRPC
  const unitsQueryOptions = trpc.units.listByOrg.queryOptions({
    organizationId: organizationId!,
  });

  const { data: allUnits, isLoading: unitsLoading } = useQuery({
    ...unitsQueryOptions,
    enabled: !!organizationId && !!site?.id,
    staleTime: 60_000,
  });

  // Filter units for this site
  const siteUnits = useMemo(
    () => allUnits?.filter((u) => u.siteId === site?.id && u.isActive) ?? [],
    [allUnits, site?.id]
  );

  // Fetch readings for each unit via parallel queries
  const readingsQueries = useQueries({
    queries: siteUnits.map((unit) => ({
      ...trpc.readings.list.queryOptions({
        organizationId: organizationId!,
        unitId: unit.id,
        start: startTime.toISOString(),
        limit: 500,
      }),
      enabled: !!organizationId && siteUnits.length > 0,
      staleTime: 60_000,
    })),
  });

  const readingsLoading = readingsQueries.some((q) => q.isLoading);
  const isLoading = unitsLoading || (siteUnits.length > 0 && readingsLoading);

  // Build activity data from tRPC responses
  const activityData = useMemo(() => {
    if (!siteUnits.length) return [];

    // Group readings by unit and hour
    const unitReadings: Record<
      string,
      { byHour: Record<string, number>; total: number }
    > = {};

    siteUnits.forEach((u) => {
      unitReadings[u.id] = { byHour: {}, total: 0 };
    });

    siteUnits.forEach((unit, idx) => {
      const readings = readingsQueries[idx]?.data ?? [];
      readings.forEach((r) => {
        if (!unitReadings[unit.id]) return;
        const hourKey = format(
          startOfHour(new Date(r.recordedAt)),
          "yyyy-MM-dd HH:00"
        );
        unitReadings[unit.id].byHour[hourKey] =
          (unitReadings[unit.id].byHour[hourKey] || 0) + 1;
        unitReadings[unit.id].total++;
      });
    });

    // Build activity data
    const result: UnitActivity[] = siteUnits.map((unit) => {
      const hourlyReadings: number[] = [];

      // Build 24 hours of data
      for (let i = 23; i >= 0; i--) {
        const hourStart = subHours(now, i);
        const hourKey = format(startOfHour(hourStart), "yyyy-MM-dd HH:00");
        hourlyReadings.push(unitReadings[unit.id].byHour[hourKey] || 0);
      }

      return {
        id: unit.id,
        name: unit.name,
        areaName: unit.areaName || "",
        hourlyReadings,
        totalReadings: unitReadings[unit.id].total,
        lastReadingAt: unit.lastReadingAt,
      };
    });

    // Sort by total readings (most active first)
    return result.sort((a, b) => b.totalReadings - a.totalReadings);
  }, [siteUnits, readingsQueries, now]);

  // Simple SVG sparkline component
  const Sparkline = ({ data }: { data: number[] }) => {
    const max = Math.max(...data, 1);
    const width = 100;
    const height = 20;
    const points = data
      .map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (val / max) * height;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <svg width={width} height={height} className="shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
        />
      </svg>
    );
  };

  if (isLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Site Activity Graph
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-24 ml-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activityData || activityData.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Site Activity Graph
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No activity data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Site Activity Graph
          </CardTitle>
          <span className="text-xs text-muted-foreground">Last 24 hours</span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-2 pr-4">
            {activityData.map((unit) => (
              <div 
                key={unit.id} 
                className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{unit.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{unit.areaName}</p>
                </div>
                <Sparkline data={unit.hourlyReadings} />
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {unit.totalReadings} reads
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
