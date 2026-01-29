/**
 * Manual Log Status Widget
 *
 * Shows next log due, overdue indicator, streak, and compliance percentage.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTRPC } from "@/lib/trpc";
import type { WidgetProps } from "../types";
import { formatDistanceToNow, isAfter, addHours } from "date-fns";

export function ManualLogStatusWidget({ entityId, organizationId, site }: WidgetProps) {
  const trpc = useTRPC();

  // Fetch manual logs for last 24 hours
  const dayAgo = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);

  const queryOptions = trpc.readings.listManual.queryOptions({
    organizationId: organizationId!,
    unitId: entityId!,
    limit: 50,
    start: dayAgo,
  });

  const { data: logs, isLoading } = useQuery({
    ...queryOptions,
    enabled: !!entityId && !!organizationId,
    staleTime: 60_000, // 1 minute
  });

  // Compute lastLog and logCount from the query result
  const lastLog = useMemo(() => {
    if (!logs || logs.length === 0) return null;
    return { logged_at: logs[0].recordedAt.toISOString() };
  }, [logs]);

  const logCount = logs?.length ?? 0;

  const cadenceHours = site?.manual_log_cadence_seconds 
    ? site.manual_log_cadence_seconds / 3600 
    : 4; // Default 4 hours

  const expectedLogsPerDay = 24 / cadenceHours;
  const compliancePercent = Math.min(100, (logCount / expectedLogsPerDay) * 100);

  const nextDue = lastLog 
    ? addHours(new Date(lastLog.logged_at), cadenceHours)
    : new Date();
  const isOverdue = isAfter(new Date(), nextDue);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Manual Log Status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center text-muted-foreground text-sm py-4">
          Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Manual Log Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          {isOverdue ? (
            <AlertTriangle className="h-8 w-8 text-destructive" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          )}
          <div>
            <p className="text-sm font-medium">
              {isOverdue ? "Overdue" : "On Track"}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastLog ? (
                <>Next due {formatDistanceToNow(nextDue, { addSuffix: true })}</>
              ) : (
                "No logs recorded"
              )}
            </p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Today's compliance</span>
            <span className="font-medium">{Math.round(compliancePercent)}%</span>
          </div>
          <Progress value={compliancePercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {logCount} of {Math.round(expectedLogsPerDay)} expected logs
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
