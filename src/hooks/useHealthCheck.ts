import { HealthStatus, SystemHealth } from '@/lib/health/types';
import { useTRPC, useTRPCClient } from '@/lib/trpc';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseHealthCheckOptions {
  autoRefresh?: boolean;
  intervalMs?: number;
  quickCheck?: boolean;
}

interface UseHealthCheckResult {
  systemHealth: SystemHealth | null;
  isChecking: boolean;
  lastError: Error | null;
  runCheck: () => Promise<void>;
  toggleAutoRefresh: () => void;
  autoRefreshEnabled: boolean;
}

const DEFAULT_INTERVAL = 60000; // 1 minute

export function useHealthCheck(
  orgId: string | null,
  options: UseHealthCheckOptions = {},
): UseHealthCheckResult {
  const { autoRefresh = false, intervalMs = DEFAULT_INTERVAL, quickCheck = false } = options;

  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(autoRefresh);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const trpc = useTRPC();
  const client = useTRPCClient();

  const runCheck = useCallback(async () => {
    if (isChecking) return;

    setIsChecking(true);
    setLastError(null);

    try {
      const checkFn = quickCheck ? client.health.quick.query : client.health.all.query;

      const result = await checkFn({ organizationId: orgId || undefined });
      setSystemHealth(result);
    } catch (err) {
      setLastError(err instanceof Error ? err : new Error('Health check failed'));
      console.error('[HealthCheck] Error running health check:', err);
    } finally {
      setIsChecking(false);
    }
  }, [orgId, quickCheck, isChecking, client]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled((prev) => !prev);
  }, []);

  // Setup auto-refresh interval
  useEffect(() => {
    if (autoRefreshEnabled && intervalMs > 0) {
      // Run immediately on enable
      runCheck();

      intervalRef.current = setInterval(() => {
        runCheck();
      }, intervalMs);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [autoRefreshEnabled, intervalMs, runCheck]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    systemHealth,
    isChecking,
    lastError,
    runCheck,
    toggleAutoRefresh,
    autoRefreshEnabled,
  };
}

/**
 * Hook for displaying health status badge in header
 */
export function useQuickHealthStatus(orgId: string | null): {
  status: HealthStatus;
  isChecking: boolean;
} {
  const { systemHealth, isChecking } = useHealthCheck(orgId, {
    autoRefresh: true,
    intervalMs: 300000, // 5 minutes
    quickCheck: true,
  });

  return {
    status: systemHealth?.overall ?? 'unknown',
    isChecking,
  };
}
