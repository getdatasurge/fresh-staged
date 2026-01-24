import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useRealtimeStatus } from '@/providers/RealtimeProvider';

export function useRealtimeSubscription(
  type: 'site' | 'unit',
  id: string | undefined
) {
  const { isConnected } = useRealtimeStatus();

  useEffect(() => {
    if (!isConnected || !id) return;

    // Subscribe to room
    socket.emit(type === 'site' ? 'subscribe:site' : 'subscribe:unit', id);

    return () => {
      // Unsubscribe on cleanup
      socket.emit(type === 'site' ? 'unsubscribe:site' : 'unsubscribe:unit', id);
    };
  }, [isConnected, type, id]);
}
