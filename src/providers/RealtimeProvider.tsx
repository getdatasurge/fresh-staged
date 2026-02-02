import { useUser } from '@stackframe/react';
import { createContext, useContext, useEffect, useMemo, useState, useRef, ReactNode } from 'react';
import { useOrgScope } from '@/hooks/useOrgScope';
import { useRealtimeAlerts } from '@/hooks/useRealtimeAlerts';
import { useRealtimeSensorData } from '@/hooks/useRealtimeSensorData';
import { useRealtimeUnitState } from '@/hooks/useRealtimeUnitState';
import { socket, connectSocket, disconnectSocket, setTokenGetter } from '@/lib/socket';

interface RealtimeContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  isConnected: false,
  isConnecting: false,
  connectionError: null,
});

// eslint-disable-next-line react-refresh/only-export-components
export function useRealtimeStatus() {
  return useContext(RealtimeContext);
}

/**
 * Internal component that sets up real-time event handlers
 * Separated to cleanly handle organization scope hooks
 */
function RealtimeHandlers() {
  const { orgId } = useOrgScope();

  // Set up real-time data handlers
  useRealtimeSensorData(orgId);
  useRealtimeAlerts(orgId);
  useRealtimeUnitState(orgId);

  return null;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const userRef = useRef(user);
  userRef.current = user;

  const userId = user?.id;
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectErrorCountRef = useRef(0);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!userId) {
      disconnectSocket();
      return;
    }

    // Reset error count on new connection attempt
    connectErrorCountRef.current = 0;

    // Register token getter so socket.io auth callback fetches fresh JWT
    // on every connect and reconnect attempt (no race condition)
    setTokenGetter(() => {
      const currentUser = userRef.current;
      if (!currentUser) return Promise.resolve(null);
      return currentUser.getAccessToken();
    });

    setIsConnecting(true);
    setConnectionError(null);
    connectSocket();

    // Connection handlers - register OUTSIDE of connect event to avoid duplicates
    function onConnect() {
      connectErrorCountRef.current = 0;
      setIsConnected(true);
      setIsConnecting(false);
      console.log('Socket.io connected');
    }

    function onDisconnect(reason: string) {
      setIsConnected(false);
      console.log('Socket.io disconnected:', reason);
    }

    function onConnectError(error: Error) {
      connectErrorCountRef.current += 1;
      setIsConnecting(false);
      setConnectionError(error.message);
      // Only log the first error and a final summary to avoid console spam
      if (connectErrorCountRef.current === 1) {
        console.warn('Socket.io connection error:', error.message);
      } else if (connectErrorCountRef.current === 5) {
        console.warn(
          `Socket.io: giving up after ${connectErrorCountRef.current} failed attempts (${error.message})`,
        );
      }
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // Check if already connected (reconnect scenario)
    if (socket.connected) {
      setIsConnected(true);
      setIsConnecting(false);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      setTokenGetter(null);
      disconnectSocket();
    };
  }, [userId]);

  const value = useMemo(
    () => ({ isConnected, isConnecting, connectionError }),
    [isConnected, isConnecting, connectionError],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {isConnected && <RealtimeHandlers />}
      {children}
    </RealtimeContext.Provider>
  );
}
