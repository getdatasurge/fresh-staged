/**
 * Units Status Grid Widget
 *
 * Displays a grid of all units in the site with their current status.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Thermometer, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTRPC } from '@/lib/trpc';
import type { WidgetProps } from '../types';

interface UnitStatus {
  id: string;
  name: string;
  unit_type: string;
  temp_limit_high: number;
  last_temp_reading: number | null;
  last_reading_at: string | null;
  area_name: string;
}

export function UnitsStatusGridWidget({ entityId, organizationId }: WidgetProps) {
  const trpc = useTRPC();

  // Fetch all units for the organization
  const queryOptions = trpc.units.listByOrg.queryOptions({
    organizationId: organizationId!,
  });

  const { data: allUnits, isLoading } = useQuery({
    ...queryOptions,
    enabled: !!organizationId,
    staleTime: 60_000, // 1 minute
  });

  // Filter for site (entityId is siteId for site-level widgets) and transform to expected shape
  const units = useMemo<UnitStatus[]>(() => {
    if (!allUnits || !entityId) return [];
    return allUnits
      .filter((u) => u.siteId === entityId && u.isActive)
      .slice(0, 50)
      .map((u) => ({
        id: u.id,
        name: u.name,
        unit_type: u.unitType,
        temp_limit_high: u.tempMax,
        last_temp_reading: u.lastTemperature,
        last_reading_at: u.lastReadingAt ? new Date(u.lastReadingAt).toISOString() : null,
        area_name: u.areaName,
      }));
  }, [allUnits, entityId]);

  const getUnitStatus = (unit: UnitStatus) => {
    const now = Date.now();
    const lastReading = unit.last_reading_at ? new Date(unit.last_reading_at).getTime() : 0;
    const ageMinutes = (now - lastReading) / 1000 / 60;

    // Offline if no reading in last 30 minutes
    if (!unit.last_reading_at || ageMinutes > 30) {
      return { label: 'Offline', color: 'text-muted-foreground', bg: 'bg-muted' };
    }

    // Over limit
    if (unit.last_temp_reading && unit.last_temp_reading > unit.temp_limit_high) {
      return { label: 'Alarm', color: 'text-alarm', bg: 'bg-alarm/10' };
    }

    return { label: 'OK', color: 'text-safe', bg: 'bg-safe/10' };
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Thermometer className="w-5 h-5 text-accent" />
          Units Status
          <Badge variant="secondary" className="ml-2 text-xs">
            {units.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100%-4rem)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4">
            {units.map((unit) => {
              const status = getUnitStatus(unit);
              const isOnline = status.label !== 'Offline';

              return (
                <Link key={unit.id} to={`/units/${unit.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{unit.name}</span>
                        {isOnline ? (
                          <Wifi className="w-3 h-3 text-safe flex-shrink-0" />
                        ) : (
                          <WifiOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{unit.area_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {unit.last_temp_reading !== null && (
                        <span className={`font-bold ${status.color}`}>
                          {unit.last_temp_reading.toFixed(0)}°F
                        </span>
                      )}
                      <Badge className={`${status.bg} ${status.color} border-0 text-xs`}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
            {units.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <Thermometer className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No units in this site</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
