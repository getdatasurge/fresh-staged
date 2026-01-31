import {
  deleteSyncedLogs,
  getPendingLogs,
  markLogSynced,
  PendingManualLog,
  savePendingLog,
} from '@/lib/offlineStorage';
import { useTRPC } from '@/lib/trpc';
import { useUser } from '@stackframe/react';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

export function useOfflineSync() {
  const user = useUser();
  const trpc = useTRPC();
  const createManualMutation = useMutation(trpc.readings.createManual.mutationOptions());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingLogs();
      setPendingCount(pending.length);
    } catch (error) {
      console.error('Error getting pending logs:', error);
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Auto-sync when coming back online (only trigger on online status change)
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPendingLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const saveLogOffline = useCallback(
    async (log: Omit<PendingManualLog, 'synced'>) => {
      await savePendingLog({ ...log, synced: 0 }); // Use 0 instead of false
      await refreshPendingCount();
    },
    [refreshPendingCount],
  );

  const syncPendingLogs = useCallback(async () => {
    if (isSyncing || !isOnline || !user) return;

    setIsSyncing(true);
    try {
      const pending = await getPendingLogs();

      for (const log of pending) {
        try {
          await createManualMutation.mutateAsync({
            unitId: log.unit_id,
            temperature: log.temperature,
            notes: log.notes || undefined,
            recordedAt: log.logged_at,
          });

          await markLogSynced(log.id);
        } catch (error) {
          console.error('Error syncing individual log:', error);
          // If it's a validation error, we might want to discard it?
          // For now just stop the loop if it's a network error
        }
      }

      await deleteSyncedLogs();
      await refreshPendingCount();
    } catch (error) {
      console.error('Error during sync:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [user, isSyncing, isOnline, refreshPendingCount, createManualMutation]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    saveLogOffline,
    syncPendingLogs,
    refreshPendingCount,
  };
}
