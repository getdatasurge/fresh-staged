import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { socket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useUser } from '@stackframe/react';
import { useRealtimeSensorData } from '@/hooks/useRealtimeSensorData';
import { useRealtimeAlerts } from '@/hooks/useRealtimeAlerts';
import { useRealtimeUnitState } from '@/hooks/useRealtimeUnitState';
import { useOrgScope } from '@/hooks/useOrgScope';

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

    // Get access token from Stack Auth using ref (always fresh)
    const connectWithAuth = async () => {
      try {
        const currentUser = userRef.current;
        if (!currentUser) return;
        const token = await currentUser.getAccessToken();
        if (!token) {
          console.warn('No access token available for WebSocket connection');
          return;
        }

        setIsConnecting(true);
        setConnectionError(null);
        connectSocket(token);
      } catch (error) {
        console.error('Failed to get access token:', error);
        setConnectionError('Failed to authenticate');
        setIsConnecting(false);
      }
    };

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
        console.warn(`Socket.io: giving up after ${connectErrorCountRef.current} failed attempts (${error.message})`);
      }
    }

    // Refresh token before each reconnect attempt so we never send a stale JWT
    function onReconnectAttempt() {
      const currentUser = userRef.current;
      if (currentUser) {
        currentUser.getAccessToken().then((token) => {
          if (token) {
            socket.auth = { token };
          }
        }).catch(() => {
          // Token refresh failed — socket.io will retry with existing auth
        });
      }
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);

    // Check if already connected (reconnect scenario)
    if (socket.connected) {
      setIsConnected(true);
      setIsConnecting(false);
    } else {
      // Initial connection
      connectWithAuth();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      disconnectSocket();
    };
  }, [userId]);

  return (
    <RealtimeContext.Provider value={{ isConnected, isConnecting, connectionError }}>
      {isConnected && <RealtimeHandlers />}
      {children}
    </RealtimeContext.Provider>
  );
}
