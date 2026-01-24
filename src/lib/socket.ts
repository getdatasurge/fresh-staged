import { io, Socket } from 'socket.io-client';

// Type-safe socket with event interfaces
interface ServerToClientEvents {
  'sensor:reading': (data: SensorReading) => void;
  'sensor:readings:batch': (data: { unitId: string; readings: SensorReading[]; count: number }) => void;
  'alert:triggered': (data: AlertNotification) => void;
  'alert:resolved': (data: { alertId: string; unitId: string }) => void;
}

interface ClientToServerEvents {
  'subscribe:site': (siteId: string) => void;
  'unsubscribe:site': (siteId: string) => void;
  'subscribe:unit': (unitId: string) => void;
  'unsubscribe:unit': (unitId: string) => void;
  'get:latest': (unitId: string, callback: (reading: SensorReading | null) => void) => void;
}

// Export typed socket
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL || 'http://localhost:3000',
  {
    autoConnect: false, // Connect manually after auth
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  }
);

export function connectSocket(token: string) {
  socket.auth = { token };
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}

// Sensor reading type (match backend)
export interface SensorReading {
  id: string;
  unitId: string;
  deviceId: string | null;
  temperature: number;
  humidity: number | null;
  battery: number | null;
  signalStrength: number | null;
  recordedAt: string;
  source: string;
}

export interface AlertNotification {
  alertId: string;
  unitId: string;
  alertType: string;
  severity: string;
  message: string;
  triggeredAt: string;
}
