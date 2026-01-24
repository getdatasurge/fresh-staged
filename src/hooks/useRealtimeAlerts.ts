import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { socket, type AlertNotification } from '@/lib/socket';
import { useRealtimeStatus } from '@/providers/RealtimeProvider';
import { AlertToast } from '@/components/common/AlertToast';
import { qk } from '@/lib/queryKeys';

export function useRealtimeAlerts(organizationId: string | undefined) {
  const { isConnected } = useRealtimeStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConnected || !organizationId) return;

    function handleAlertTriggered(data: AlertNotification) {
      // Show toast notification
      toast.custom(
        (t) => (
          <AlertToast
            type="triggered"
            message={data.message}
            severity={data.severity}
          />
        ),
        {
          duration: data.severity === 'critical' ? 10000 : 5000,
          id: `alert-${data.alertId}`,
        }
      );

      // Invalidate alerts query to refetch
      queryClient.invalidateQueries({ queryKey: qk.org(organizationId).alerts() });

      // Update unit status
      queryClient.setQueryData(
        qk.unit(data.unitId).status(),
        (old: any) => old ? { ...old, status: 'excursion' } : old
      );
    }

    function handleAlertResolved(data: { alertId: string; unitId: string; resolvedAt: string }) {
      toast.custom(
        (t) => (
          <AlertToast
            type="resolved"
            message="Temperature returned to acceptable range"
          />
        ),
        { duration: 5000 }
      );

      // Invalidate alerts query
      queryClient.invalidateQueries({ queryKey: qk.org(organizationId).alerts() });

      // Update unit status
      queryClient.setQueryData(
        qk.unit(data.unitId).status(),
        (old: any) => old ? { ...old, status: 'restoring' } : old
      );
    }

    function handleAlertEscalated(data: { alertId: string; unitId: string; escalationLevel: number }) {
      toast.error(`Alert escalated to level ${data.escalationLevel}`, {
        duration: 10000,
      });

      // Invalidate alerts query
      queryClient.invalidateQueries({ queryKey: qk.org(organizationId).alerts() });

      // Update unit status to alarm_active
      queryClient.setQueryData(
        qk.unit(data.unitId).status(),
        (old: any) => old ? { ...old, status: 'alarm_active' } : old
      );
    }

    socket.on('alert:triggered', handleAlertTriggered);
    socket.on('alert:resolved', handleAlertResolved);
    socket.on('alert:escalated', handleAlertEscalated);

    return () => {
      socket.off('alert:triggered', handleAlertTriggered);
      socket.off('alert:resolved', handleAlertResolved);
      socket.off('alert:escalated', handleAlertEscalated);
    };
  }, [isConnected, organizationId, queryClient]);
}
