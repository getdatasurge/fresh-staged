import { CheckCircle, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useUser } from '@stackframe/react';

interface UnitDebugBannerProps {
  unitId: string | undefined;
  orgId: string | undefined;
  siteId: string | undefined;
  areaId: string | undefined;
  readingsCount: number;
  sensorsCount: number;
  doorState: string | null | undefined;
  realtimeConnected: boolean;
  lastError: string | null;
}

/**
 * DEV-ONLY diagnostic banner for Unit Dashboard debugging.
 * Shows auth status, data counts, and connection state at a glance.
 */
export function UnitDebugBanner({
  unitId,
  orgId,
  siteId,
  areaId,
  readingsCount,
  sensorsCount,
  doorState,
  realtimeConnected,
  lastError,
}: UnitDebugBannerProps) {
  const user = useUser();

  // RLS check replaced with user auth check (Supabase RLS no longer used)
  const rlsCheck: 'pending' | 'ok' | 'fail' = user?.id ? 'ok' : 'fail';

  // Door events count removed - Supabase query no longer available
  const doorEventsCount: number | null = null;

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle className="w-3 h-3 text-green-500" />
    ) : (
      <XCircle className="w-3 h-3 text-red-500" />
    );

  const hasSession = !!user?.id;
  const hasOrgId = !!orgId;
  const hasSiteId = !!siteId;
  const hasAreaId = !!areaId;
  const hasReadings = readingsCount > 0;
  const hasSensors = sensorsCount > 0;
  const hasDoorEvents = (doorEventsCount ?? 0) > 0;

  // Determine scenario
  let scenario = 'Unknown';
  if (!hasSession) {
    scenario = 'A) No session - will redirect to /auth';
  } else if (!hasOrgId || !hasSiteId) {
    scenario = 'B) Unit loads but org/site missing - join failed';
  } else if (!hasReadings && !hasSensors) {
    scenario = 'C) Missing required data - no readings or sensors';
  } else if (readingsCount === 0 && sensorsCount > 0) {
    scenario = 'D) Sensors exist but readings = 0 - time window issue?';
  } else if (!hasDoorEvents && doorState !== null) {
    scenario = 'E) Door state set but no door_events - events query issue';
  } else if (hasReadings && hasSensors) {
    scenario = '✓ All data present - should render correctly';
  }

  return (
    <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-md p-2 mb-3 text-xs font-mono">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
        <span className="font-semibold text-yellow-800 dark:text-yellow-200">
          UnitDebugBanner (DEV ONLY)
        </span>
        {realtimeConnected ? (
          <Wifi className="w-3 h-3 text-green-500" />
        ) : (
          <WifiOff className="w-3 h-3 text-red-500" />
        )}
        <span className="text-yellow-700 dark:text-yellow-300">
          RT: {realtimeConnected ? 'connected' : 'disconnected'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-yellow-800 dark:text-yellow-200">
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasSession} />
          <span>session: {hasSession ? user?.id?.slice(0, 8) + '...' : 'none'}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={rlsCheck === 'ok'} />
          <span>RLS: {rlsCheck}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasOrgId} />
          <span>orgId: {orgId?.slice(0, 8) ?? 'none'}...</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasSiteId} />
          <span>siteId: {siteId?.slice(0, 8) ?? 'none'}...</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasAreaId} />
          <span>areaId: {areaId?.slice(0, 8) ?? 'none'}...</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasReadings} />
          <span>readings: {readingsCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasSensors} />
          <span>sensors: {sensorsCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon ok={hasDoorEvents} />
          <span>doorEvents: {doorEventsCount ?? '?'}</span>
        </div>
        <div className="col-span-2 flex items-center gap-1">
          <span>door_state: {doorState ?? 'null'}</span>
        </div>
      </div>

      <div className="mt-1 pt-1 border-t border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300">
        <strong>Scenario:</strong> {scenario}
      </div>

      {lastError && (
        <div className="mt-1 text-red-600 dark:text-red-400">
          <strong>Last Error:</strong> {lastError}
        </div>
      )}
    </div>
  );
}
