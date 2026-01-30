import { io, Socket } from 'socket.io-client';

// Token getter function registered by RealtimeProvider
let tokenGetter: (() => Promise<string | null>) | null = null;

// Type-safe socket with event interfaces
interface ServerToClientEvents {
  'sensor:reading': (data: SensorReading) => void;
  'sensor:readings:batch': (data: { unitId: string; readings: SensorReading[]; count: number }) => void;
  'alert:triggered': (data: AlertNotification) => void;
  'alert:resolved': (data: { alertId: string; unitId: string; resolvedAt: string }) => void;
  'alert:escalated': (data: { alertId: string; unitId: string; escalationLevel: number }) => void;
  'unit:state:changed': (data: UnitStateChangeEvent) => void;
  'connection:ack': (data: { socketId: string; timestamp: string }) => void;
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
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin),
  {
    autoConnect: false, // Connect manually after auth
    transports: ['websocket'], // Skip polling→websocket upgrade
    reconnection: true,
    reconnectionAttempts: 5, // Stop after 5 failures to avoid infinite error spam
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    auth: (cb) => {
      if (tokenGetter) {
        tokenGetter()
          .then((token) => cb({ token: token || '' }))
          .catch(() => cb({ token: '' }));
      } else {
        cb({ token: '' });
      }
    },
  }
);

export function setTokenGetter(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter;
}

export function connectSocket() {
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
  severity: 'warning' | 'critical';
  message: string;
  triggerTemperature: number;
  thresholdViolated: 'min' | 'max';
  triggeredAt: string;
}

export type UnitDashboardState = 'normal' | 'warning' | 'critical' | 'offline';

export interface UnitStateChangeEvent {
  unitId: string;
  previousState: UnitDashboardState;
  newState: UnitDashboardState;
  timestamp: string;
  reason: string;
}
