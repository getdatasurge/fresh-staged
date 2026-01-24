import type { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';

/**
 * Data stored on each socket connection
 * Populated from JWT during authentication middleware
 */
export interface SocketData {
  userId: string;
  profileId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
  email: string;
}

/**
 * Events sent from server to client
 */
export interface ServerToClientEvents {
  // Connection acknowledgment
  'connection:ack': (data: { socketId: string; timestamp: string }) => void;

  // Sensor data events
  'sensor:reading': (data: {
    unitId: string;
    temperature: number;
    humidity?: number;
    timestamp: string;
  }) => void;

  'sensor:readings:batch': (data: {
    unitId: string;
    readings: Array<{
      temperature: number;
      humidity?: number;
      timestamp: string;
    }>;
    count: number;
  }) => void;

  // Alert events
  'alert:triggered': (data: AlertNotification) => void;

  'alert:acknowledged': (data: {
    alertId: string;
    acknowledgedBy: string;
    timestamp: string;
  }) => void;

  'alert:resolved': (data: {
    alertId: string;
    unitId: string;
    resolvedAt: string;
  }) => void;

  'alert:escalated': (data: {
    alertId: string;
    unitId: string;
    escalationLevel: number;
  }) => void;

  // Error events
  error: (data: { message: string; code?: string }) => void;
}

/**
 * Sensor reading data structure (matches SensorStreamService)
 */
export interface SensorReading {
  id: string;
  unitId: string;
  deviceId: string | null;
  temperature: number;
  humidity: number | null;
  battery: number | null;
  signalStrength: number | null;
  recordedAt: Date;
  source: string;
}

/**
 * Alert notification payload
 */
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

/**
 * Events sent from client to server
 */
export interface ClientToServerEvents {
  // Subscription management
  'subscribe:organization': (organizationId: string) => void;
  'unsubscribe:organization': (organizationId: string) => void;
  'subscribe:site': (siteId: string) => void;
  'unsubscribe:site': (siteId: string) => void;
  'subscribe:unit': (unitId: string) => void;
  'unsubscribe:unit': (unitId: string) => void;

  // Get latest cached reading for a unit
  'get:latest': (unitId: string, callback: (reading: SensorReading | null) => void) => void;

  // Ping/heartbeat
  ping: (callback: (timestamp: number) => void) => void;
}

/**
 * Socket.io server type with typed events and data
 */
export type TypedSocketIOServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Extend Fastify instance to include Socket.io server and services
 */
declare module 'fastify' {
  interface FastifyInstance {
    io: TypedSocketIOServer;
    socketService: import('../services/socket.service.js').SocketService;
    sensorStreamService: import('../services/sensor-stream.service.js').SensorStreamService;
  }
}
