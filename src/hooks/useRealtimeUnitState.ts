import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { socket, type UnitStateChangeEvent } from '@/lib/socket';
import { useRealtimeStatus } from '@/providers/RealtimeProvider';
import { qk } from '@/lib/queryKeys';

/**
 * Hook for handling real-time unit state changes via Socket.IO
 *
 * Updates unit status in React Query cache and shows toast notifications
 * when units change state (e.g., normal -> warning, online -> offline)
 */
export function useRealtimeUnitState(organizationId: string | undefined) {
  const { isConnected } = useRealtimeStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConnected || !organizationId) return;

    function handleUnitStateChanged(data: UnitStateChangeEvent) {
      // Update unit status cache
      queryClient.setQueryData(qk.unit(data.unitId).status(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          state: data.newState,
          status: data.newState,
        };
      });

      // Invalidate unit list queries to refresh unit cards
      queryClient.invalidateQueries({
        queryKey: qk.org(organizationId).units(),
      });

      // Invalidate organization stats (unit counts)
      queryClient.invalidateQueries({
        queryKey: qk.org(organizationId).stats(),
      });

      // Show toast for significant state changes
      if (data.newState === 'offline') {
        toast.warning(`Unit went offline`, {
          description: data.reason,
          duration: 5000,
        });
      } else if (data.previousState === 'offline' && data.newState === 'normal') {
        toast.success(`Unit back online`, {
          description: 'Connection restored',
          duration: 3000,
        });
      } else if (data.newState === 'critical' && data.previousState !== 'critical') {
        toast.error(`Unit in critical state`, {
          description: data.reason,
          duration: 8000,
        });
      } else if (data.newState === 'warning' && data.previousState === 'normal') {
        toast.warning(`Unit warning`, {
          description: data.reason,
          duration: 5000,
        });
      } else if (data.newState === 'normal' && data.previousState !== 'normal') {
        toast.success(`Unit returned to normal`, {
          description: data.reason,
          duration: 3000,
        });
      }
    }

    socket.on('unit:state:changed', handleUnitStateChanged);

    return () => {
      socket.off('unit:state:changed', handleUnitStateChanged);
    };
  }, [isConnected, organizationId, queryClient]);
}
