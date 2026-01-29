/**
 * Event Timeline Widget
 *
 * Unified timeline of alerts, manual logs, and door events.
 * Includes filter chips. Uses tRPC for data fetching.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Clock,
  AlertTriangle,
  ClipboardList,
  DoorOpen,
  Activity,
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import type { WidgetProps } from "../types";
import { format, isToday, isYesterday } from "date-fns";

interface TimelineEvent {
  id: string;
  type: "alert" | "reading" | "manual_log" | "door";
  title: string;
  description?: string;
  timestamp: string | Date;
}

type FilterType = "alert" | "manual_log" | "door";

const EVENTS_PER_PAGE = 20;

function formatDateHeader(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

function groupEventsByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  events.forEach(event => {
    const timestamp = typeof event.timestamp === 'string' ? new Date(event.timestamp) : event.timestamp;
    const dateKey = format(timestamp, "yyyy-MM-dd");
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(event);
  });
  return groups;
}

export function EventTimelineWidget({ entityId, organizationId }: WidgetProps) {
  const [filters, setFilters] = useState<Record<FilterType, boolean>>({
    alert: true,
    manual_log: true,
    door: true,
  });

  const trpc = useTRPC();

  // Query alerts
  const alertsQueryOptions = trpc.alerts.list.queryOptions({
    organizationId: organizationId!,
    unitId: entityId,
    limit: EVENTS_PER_PAGE,
  });

  const alertsQuery = useQuery({
    ...alertsQueryOptions,
    enabled: !!entityId && !!organizationId && filters.alert,
  });

  // Query manual logs
  const logsQueryOptions = trpc.readings.listManual.queryOptions({
    organizationId: organizationId!,
    unitId: entityId,
    limit: EVENTS_PER_PAGE,
  });

  const logsQuery = useQuery({
    ...logsQueryOptions,
    enabled: !!entityId && !!organizationId && filters.manual_log,
  });

  // Query door events
  const doorEventsQueryOptions = trpc.readings.listDoorEvents.queryOptions({
    organizationId: organizationId!,
    unitId: entityId,
    limit: EVENTS_PER_PAGE,
  });

  const doorEventsQuery = useQuery({
    ...doorEventsQueryOptions,
    enabled: !!entityId && !!organizationId && filters.door,
  });

  const isLoading = alertsQuery.isLoading || logsQuery.isLoading || doorEventsQuery.isLoading;

  // Combine and transform events
  const events = useMemo((): TimelineEvent[] => {
    const allEvents: TimelineEvent[] = [];

    // Add alerts
    if (filters.alert && alertsQuery.data) {
      alertsQuery.data.forEach(a => {
        allEvents.push({
          id: `alert-${a.id}`,
          type: 'alert',
          title: a.title,
          description: `${a.severity} alert`,
          timestamp: a.triggeredAt || a.createdAt,
        });
      });
    }

    // Add manual logs
    if (filters.manual_log && logsQuery.data) {
      logsQuery.data.forEach(l => {
        allEvents.push({
          id: `log-${l.id}`,
          type: 'manual_log',
          title: `Manual log: ${l.temperature}°`,
          description: l.notes || undefined,
          timestamp: l.loggedAt,
        });
      });
    }

    // Add door events
    if (filters.door && doorEventsQuery.data) {
      doorEventsQuery.data.forEach(d => {
        allEvents.push({
          id: `door-${d.id}`,
          type: 'door',
          title: `Door ${d.state}`,
          timestamp: d.occurredAt,
        });
      });
    }

    // Sort by timestamp descending
    allEvents.sort((a, b) => {
      const aTime = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp.getTime();
      const bTime = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp.getTime();
      return bTime - aTime;
    });

    return allEvents.slice(0, EVENTS_PER_PAGE);
  }, [filters, alertsQuery.data, logsQuery.data, doorEventsQuery.data]);

  const toggleFilter = (type: FilterType) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const filterLabels: Record<FilterType, string> = {
    alert: "Alerts",
    manual_log: "Logs",
    door: "Door",
  };

  const typeConfig = {
    alert: { icon: AlertTriangle, color: "text-destructive" },
    reading: { icon: Activity, color: "text-blue-500" },
    manual_log: { icon: ClipboardList, color: "text-green-500" },
    door: { icon: DoorOpen, color: "text-orange-500" },
  };

  const filteredEvents = events.filter(e => filters[e.type as FilterType]);
  const groupedEvents = groupEventsByDate(filteredEvents);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Event Timeline
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
      <CardHeader className="pb-2 space-y-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Event Timeline
        </CardTitle>
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(filters) as FilterType[]).map(type => (
            <Button
              key={type}
              variant={filters[type] ? "secondary" : "outline"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => toggleFilter(type)}
            >
              {filterLabels[type]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground text-sm py-8">
            No events match filters
          </div>
        ) : (
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4">
              {Array.from(groupedEvents.entries()).map(([dateKey, dateEvents]) => (
                <div key={dateKey}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {formatDateHeader(new Date(dateKey))}
                  </p>
                  <div className="space-y-2">
                    {dateEvents.map((event) => {
                      const config = typeConfig[event.type];
                      const Icon = config.icon;
                      const timestamp = typeof event.timestamp === 'string'
                        ? new Date(event.timestamp)
                        : event.timestamp;
                      return (
                        <div
                          key={event.id}
                          className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className={`mt-0.5 ${config.color}`}>
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{event.title}</p>
                            {event.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {event.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(timestamp, "h:mm a")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
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
