import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { Server as SocketIOServer } from 'socket.io';
import type { TypedSocketIOServer } from '../types/socket.js';
import { setupSocketAuth } from '../middleware/socket-auth.js';
import { SocketService } from '../services/socket.service.js';
import { SensorStreamService } from '../services/sensor-stream.service.js';

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
    origin?: string | string[] | RegExp | RegExp[] | (string | RegExp)[];
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

  // Create SocketService instance (initialize later in ready hook)
  const socketService = new SocketService(io);

  // Create SensorStreamService instance
  const sensorStreamService = new SensorStreamService(socketService);

  // Decorate Fastify instance with io, socketService, and sensorStreamService
  fastify.decorate('io', io);
  fastify.decorate('socketService', socketService);
  fastify.decorate('sensorStreamService', sensorStreamService);

  // Setup authentication, service, and handlers after server is ready
  fastify.ready(async () => {
    // Setup JWT authentication middleware
    setupSocketAuth(io);

    // Initialize SocketService with Redis adapter
    await socketService.initialize();

    // Setup connection logging and room management
    io.on('connection', (socket) => {
      fastify.log.info({
        event: 'socket:connected',
        socketId: socket.id,
        userId: socket.data.userId,
        organizationId: socket.data.organizationId,
        role: socket.data.role,
        transport: socket.conn.transport.name,
      });

      // Auto-join organization room
      socketService.joinOrganization(socket);

      // Send connection acknowledgment
      socket.emit('connection:ack', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      // Ping/pong for connection health monitoring
      socket.on('ping', (callback) => {
        callback(Date.now());
      });

      // Get latest cached sensor reading for a unit
      socket.on('get:latest', (unitId: string, callback) => {
        const latest = sensorStreamService.getLatestReading(unitId);
        callback(latest || null);
      });

      // Handle client subscription events
      socket.on('subscribe:site', (siteId: string) => {
        socketService.joinSite(socket, siteId);
        fastify.log.info({
          event: 'socket:subscribe:site',
          socketId: socket.id,
          userId: socket.data.userId,
          siteId,
        });
      });

      socket.on('subscribe:unit', (unitId: string) => {
        socketService.joinUnit(socket, unitId);
        fastify.log.info({
          event: 'socket:subscribe:unit',
          socketId: socket.id,
          userId: socket.data.userId,
          unitId,
        });
      });

      socket.on('unsubscribe:site', (siteId: string) => {
        const room = `org:${socket.data.organizationId}:site:${siteId}`;
        socketService.leaveRoom(socket, room);
        fastify.log.info({
          event: 'socket:unsubscribe:site',
          socketId: socket.id,
          userId: socket.data.userId,
          siteId,
        });
      });

      socket.on('unsubscribe:unit', (unitId: string) => {
        const room = `org:${socket.data.organizationId}:unit:${unitId}`;
        socketService.leaveRoom(socket, room);
        fastify.log.info({
          event: 'socket:unsubscribe:unit',
          socketId: socket.id,
          userId: socket.data.userId,
          unitId,
        });
      });

      socket.on('disconnect', (reason) => {
        // Clean up listeners to prevent memory leaks
        socket.removeAllListeners();

        fastify.log.info({
          event: 'socket:disconnected',
          socketId: socket.id,
          userId: socket.data.userId,
          reason,
        });
      });
    });
  });

  // Graceful shutdown: disconnect sockets and Redis before closing
  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting all Socket.io clients...');
    io.local.disconnectSockets(true);

    // Stop SensorStreamService flush interval
    if (fastify.sensorStreamService) {
      fastify.sensorStreamService.stop();
    }

    // Shutdown SocketService Redis clients
    if (fastify.socketService) {
      await fastify.socketService.shutdown();
    }

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
