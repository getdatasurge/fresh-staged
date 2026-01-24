import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { socket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useUser } from '@stackframe/react';

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

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!user) {
      disconnectSocket();
      return;
    }

    // Get access token from Stack Auth
    const connectWithAuth = async () => {
      try {
        const token = await user.getAccessToken();
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
      setIsConnected(true);
      setIsConnecting(false);
      console.log('Socket.io connected');
    }

    function onDisconnect(reason: string) {
      setIsConnected(false);
      console.log('Socket.io disconnected:', reason);
    }

    function onConnectError(error: Error) {
      setIsConnecting(false);
      setConnectionError(error.message);
      console.error('Socket.io connection error:', error.message);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

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
      disconnectSocket();
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{ isConnected, isConnecting, connectionError }}>
      {children}
    </RealtimeContext.Provider>
  );
}
