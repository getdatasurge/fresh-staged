import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { Server as SocketIOServer } from 'socket.io';
import type { TypedSocketIOServer } from '../types/socket.js';

/**
 * Socket.io plugin for Fastify
 *
 * Integrates Socket.io v4 with Fastify 5 for real-time WebSocket communication.
 * Since fastify-socket.io only supports Fastify 4.x, this plugin provides
 * direct integration.
 *
 * Features:
 * - CORS configuration matching Fastify app
 * - Multi-tenant isolation via rooms
 * - Connection lifecycle logging
 * - TypeScript types for events and socket data
 *
 * Usage:
 *   app.register(socketPlugin);
 *   app.ready().then(() => {
 *     setupSocketHandlers(app.io);
 *   });
 */

export interface SocketPluginOptions {
  cors?: {
    origin: string | string[] | RegExp | RegExp[];
    credentials?: boolean;
  };
}

const socketPlugin: FastifyPluginAsync<SocketPluginOptions> = async (
  fastify: FastifyInstance,
  opts: SocketPluginOptions
) => {
  // Get CORS configuration from options or use defaults matching app CORS
  const corsConfig = opts.cors ?? {
    origin: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
      /^http:\/\/172\.\d+\.\d+\.\d+:\d+$/, // WSL IP addresses
    ],
    credentials: true,
  };

  // Create Socket.io server instance
  const io: TypedSocketIOServer = new SocketIOServer(fastify.server, {
    cors: corsConfig,
    // Performance optimizations
    transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
    pingTimeout: 20000, // 20 seconds
    pingInterval: 25000, // 25 seconds
  });

  // Decorate Fastify instance with io
  fastify.decorate('io', io);

  // Setup basic connection logging
  io.on('connection', (socket) => {
    fastify.log.info({
      event: 'socket:connected',
      socketId: socket.id,
      transport: socket.conn.transport.name,
    });

    socket.on('disconnect', (reason) => {
      fastify.log.info({
        event: 'socket:disconnected',
        socketId: socket.id,
        reason,
      });
    });
  });

  // Graceful shutdown: disconnect all sockets before closing
  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting all Socket.io clients...');
    io.local.disconnectSockets(true);
    await new Promise<void>((resolve) => {
      io.close(() => {
        fastify.log.info('Socket.io server closed');
        resolve();
      });
    });
  });

  fastify.log.info('Socket.io plugin registered');
};

export default fastifyPlugin(socketPlugin, {
  name: 'socket-io',
  fastify: '5.x',
});

/**
 * Setup Socket.io event handlers
 *
 * Call this function after app.ready() to configure Socket.io handlers.
 * Must be called after the Fastify server is ready because Socket.io
 * needs access to the HTTP server.
 *
 * @param io - The Socket.io server instance from fastify.io
 */
export function setupSocketHandlers(io: TypedSocketIOServer): void {
  // Handler will be enhanced in subsequent plans with:
  // - JWT authentication middleware
  // - Room subscription management
  // - Real-time sensor data streaming
  // - Alert notifications

  io.on('connection', (socket) => {
    // Send connection acknowledgment
    socket.emit('connection:ack', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Handle subscription events (placeholder for now)
    socket.on('subscribe:organization', (organizationId: string) => {
      socket.join(`org:${organizationId}`);
      console.log(`Socket ${socket.id} joined organization ${organizationId}`);
    });

    socket.on('unsubscribe:organization', (organizationId: string) => {
      socket.leave(`org:${organizationId}`);
      console.log(`Socket ${socket.id} left organization ${organizationId}`);
    });

    socket.on('subscribe:site', (siteId: string) => {
      // Room name will include org ID when auth is added
      socket.join(`site:${siteId}`);
      console.log(`Socket ${socket.id} subscribed to site ${siteId}`);
    });

    socket.on('unsubscribe:site', (siteId: string) => {
      socket.leave(`site:${siteId}`);
      console.log(`Socket ${socket.id} unsubscribed from site ${siteId}`);
    });

    socket.on('subscribe:unit', (unitId: string) => {
      socket.join(`unit:${unitId}`);
      console.log(`Socket ${socket.id} subscribed to unit ${unitId}`);
    });

    socket.on('unsubscribe:unit', (unitId: string) => {
      socket.leave(`unit:${unitId}`);
      console.log(`Socket ${socket.id} unsubscribed from unit ${unitId}`);
    });

    // Ping/pong for connection health monitoring
    socket.on('ping', (callback) => {
      callback(Date.now());
    });
  });
}
