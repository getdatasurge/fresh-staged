import type { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';

/**
 * Data stored on each socket connection
 * Populated from JWT during authentication middleware
 */
export interface SocketData {
  userId: string;
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
  'alert:triggered': (data: {
    alertId: string;
    unitId: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    timestamp: string;
  }) => void;

  'alert:acknowledged': (data: {
    alertId: string;
    acknowledgedBy: string;
    timestamp: string;
  }) => void;

  'alert:resolved': (data: {
    alertId: string;
    resolvedBy: string;
    timestamp: string;
  }) => void;

  // Error events
  error: (data: { message: string; code?: string }) => void;
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
 * Extend Fastify instance to include Socket.io server
 */
declare module 'fastify' {
  interface FastifyInstance {
    io: TypedSocketIOServer;
  }
}
