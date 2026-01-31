import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLoraSensors } from '@/hooks/useLoraSensors';
import { useOrgScope } from '@/hooks/useOrgScope';
import { addDays, format, isBefore } from 'date-fns';
import { AlertTriangle, Battery, Calendar, Loader2, Wrench } from 'lucide-react';
import type { WidgetProps } from '../types';

interface MaintenanceItem {
  id: string;
  type: 'battery' | 'low_battery_alert' | 'calibration';
  title: string;
  unitName: string;
  estimatedDate: Date;
  priority: 'low' | 'medium' | 'high';
}

export function MaintenanceCalendarWidget({ site }: WidgetProps) {
  const { orgId } = useOrgScope();

  // Fetch sensors
  const { data: sensors, isLoading: isLoadingSensors } = useLoraSensors(orgId);

  const maintenanceItems = sensors
    ? sensors
        .map((sensor) => {
          // For now, just add dummy data since we don't have battery level in sensor data
          const batteryLevel = 50;
          const daysRemaining = Math.max(0, batteryLevel * 10);
          const estimatedDate = addDays(new Date(), daysRemaining);

          const priority = batteryLevel < 20 ? 'high' : batteryLevel < 40 ? 'medium' : 'low';
          return {
            id: `battery-${sensor.id}`,
            type: 'battery' as const,
            title: 'Battery Replacement',
            unitName: sensor.name,
            estimatedDate,
            priority: priority as 'low' | 'medium' | 'high',
          };
        })
        .filter((item) => isBefore(item.estimatedDate, addDays(new Date(), 30)))
    : [];

  // Sort by date (earliest first) then by priority
  maintenanceItems.sort((a, b) => {
    const dateDiff = a.estimatedDate.getTime() - b.estimatedDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const getIcon = (type: MaintenanceItem['type']) => {
    switch (type) {
      case 'battery':
        return <Battery className="h-4 w-4" />;
      case 'low_battery_alert':
        return <AlertTriangle className="h-4 w-4" />;
      case 'calibration':
        return <Wrench className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: MaintenanceItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-destructive';
      case 'medium':
        return 'text-amber-500';
      case 'low':
        return 'text-muted-foreground';
    }
  };

  if (isLoadingSensors) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Maintenance Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Maintenance Calendar
        </CardTitle>
        <p className="text-xs text-muted-foreground">Next 30 days</p>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {maintenanceItems.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground text-sm py-8">
            No maintenance scheduled
          </div>
        ) : (
          <ScrollArea className="h-full pr-2">
            <div className="space-y-2">
              {maintenanceItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className={`mt-0.5 ${getPriorityColor(item.priority)}`}>
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.unitName}</p>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(item.estimatedDate, 'MMM d')}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
