/**
 * Socket.io service for room management and broadcasting
 *
 * Provides centralized room management and message broadcasting across
 * Socket.io instances using Redis adapter for horizontal scaling.
 *
 * Features:
 * - Redis pub/sub adapter for multi-instance deployments
 * - Organization-based room isolation
 * - Site and unit subscription management
 * - Type-safe broadcasting methods
 *
 * Usage:
 * ```typescript
 * const socketService = new SocketService(io);
 * await socketService.initialize();
 *
 * // Auto-join user to their organization
 * socketService.joinOrganization(socket);
 *
 * // Broadcast to organization
 * socketService.emitToOrg(orgId, 'alert:triggered', alertData);
 * ```
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

/**
 * SocketService class for managing WebSocket connections and broadcasting
 *
 * Handles:
 * - Redis adapter setup for horizontal scaling
 * - Room-based multi-tenancy (organization, site, unit isolation)
 * - Type-safe event broadcasting
 */
export class SocketService {
  private io: SocketIOServer;
  private pubClient?: RedisClientType;
  private subClient?: RedisClientType;
  private redisEnabled = false;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * Initialize Socket.io service with Redis adapter
   *
   * Attempts to connect to Redis using environment variables:
   * - REDIS_URL: Full connection string (takes precedence)
   * - REDIS_HOST: Redis host (default: localhost)
   * - REDIS_PORT: Redis port (default: 6379)
   *
   * If Redis is not configured, logs warning and continues without adapter.
   * This allows local development without Redis.
   *
   * @throws Error if Redis connection fails after configuration is provided
   */
  async initialize(): Promise<void> {
    // Check for Redis configuration
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    // Skip Redis setup if no configuration provided
    if (!redisUrl && !process.env.REDIS_HOST) {
      console.log(
        '[SocketService] Redis not configured - running in single-instance mode. ' +
          'Set REDIS_URL or REDIS_HOST for multi-instance support.',
      );
      return;
    }

    try {
      // Create Redis pub/sub clients
      const clientConfig = redisUrl
        ? { url: redisUrl }
        : { socket: { host: redisHost, port: redisPort } };

      this.pubClient = createClient(clientConfig);
      this.subClient = this.pubClient.duplicate();

      // Setup error handlers
      this.pubClient.on('error', (err) => {
        console.error('[SocketService] Redis pub client error:', err);
      });

      this.subClient.on('error', (err) => {
        console.error('[SocketService] Redis sub client error:', err);
      });

      // Connect both clients
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      // Configure Redis adapter for Socket.io
      this.io.adapter(createAdapter(this.pubClient, this.subClient));

      this.redisEnabled = true;
      console.log('[SocketService] Redis adapter configured for Socket.io scaling');
    } catch (error) {
      console.error('[SocketService] Failed to connect to Redis:', error);
      console.warn('[SocketService] Falling back to single-instance mode');

      // Clean up clients on failure
      await this.pubClient?.disconnect().catch(() => {});
      await this.subClient?.disconnect().catch(() => {});

      this.pubClient = undefined;
      this.subClient = undefined;
    }
  }

  /**
   * Join socket to organization room
   *
   * Automatically called on connection. All authenticated sockets
   * are joined to their organization room for org-wide broadcasts.
   *
   * Room format: `org:{organizationId}`
   *
   * @param socket - Socket instance with authenticated data
   */
  joinOrganization(socket: Socket): void {
    const { organizationId } = socket.data;
    if (!organizationId) {
      console.warn('[SocketService] Cannot join organization - no organizationId in socket.data');
      return;
    }

    const room = `org:${organizationId}`;
    socket.join(room);
  }

  /**
   * Join socket to site-specific room
   *
   * Called when client subscribes to a specific site.
   * Site rooms are scoped within organization for security.
   *
   * Room format: `org:{organizationId}:site:{siteId}`
   *
   * @param socket - Socket instance with authenticated data
   * @param siteId - Site UUID to subscribe to
   */
  joinSite(socket: Socket, siteId: string): void {
    const { organizationId } = socket.data;
    if (!organizationId) {
      console.warn('[SocketService] Cannot join site - no organizationId in socket.data');
      return;
    }

    const room = `org:${organizationId}:site:${siteId}`;
    socket.join(room);
  }

  /**
   * Join socket to unit-specific room
   *
   * Called when client subscribes to a specific refrigeration unit.
   * Unit rooms are scoped within organization for security.
   *
   * Room format: `org:{organizationId}:unit:{unitId}`
   *
   * @param socket - Socket instance with authenticated data
   * @param unitId - Unit UUID to subscribe to
   */
  joinUnit(socket: Socket, unitId: string): void {
    const { organizationId } = socket.data;
    if (!organizationId) {
      console.warn('[SocketService] Cannot join unit - no organizationId in socket.data');
      return;
    }

    const room = `org:${organizationId}:unit:${unitId}`;
    socket.join(room);
  }

  /**
   * Leave a specific room
   *
   * Called when client unsubscribes from site or unit.
   *
   * @param socket - Socket instance
   * @param room - Room name to leave
   */
  leaveRoom(socket: Socket, room: string): void {
    socket.leave(room);
  }

  /**
   * Broadcast event to all sockets in an organization
   *
   * Sends event to all connected clients belonging to the organization,
   * across all Socket.io instances (via Redis adapter if configured).
   *
   * @param organizationId - Organization UUID
   * @param event - Event name (must match ServerToClientEvents)
   * @param data - Event payload
   */
  emitToOrg(organizationId: string, event: string, data: any): void {
    const room = `org:${organizationId}`;
    this.io.to(room).emit(event, data);
  }

  /**
   * Broadcast event to all sockets subscribed to a site
   *
   * @param organizationId - Organization UUID
   * @param siteId - Site UUID
   * @param event - Event name (must match ServerToClientEvents)
   * @param data - Event payload
   */
  emitToSite(organizationId: string, siteId: string, event: string, data: any): void {
    const room = `org:${organizationId}:site:${siteId}`;
    this.io.to(room).emit(event, data);
  }

  /**
   * Broadcast event to all sockets subscribed to a unit
   *
   * @param organizationId - Organization UUID
   * @param unitId - Unit UUID
   * @param event - Event name (must match ServerToClientEvents)
   * @param data - Event payload
   */
  emitToUnit(organizationId: string, unitId: string, event: string, data: any): void {
    const room = `org:${organizationId}:unit:${unitId}`;
    this.io.to(room).emit(event, data);
  }

  /**
   * Get Redis connection status
   *
   * @returns True if Redis adapter is configured and connected
   */
  isRedisEnabled(): boolean {
    return this.redisEnabled;
  }

  /**
   * Gracefully shutdown Redis clients
   *
   * Called during application shutdown to close Redis connections.
   */
  async shutdown(): Promise<void> {
    if (this.pubClient || this.subClient) {
      console.log('[SocketService] Disconnecting Redis clients...');
      await Promise.all([
        this.pubClient?.disconnect().catch(() => {}),
        this.subClient?.disconnect().catch(() => {}),
      ]);
      console.log('[SocketService] Redis clients disconnected');
    }
  }
}

/**
 * Singleton SocketService instance
 * Set by socket.plugin.ts during initialization
 */
let instance: SocketService | null = null;

/**
 * Set the singleton SocketService instance
 *
 * @param service - SocketService instance to set as singleton
 */
export function setSocketService(service: SocketService): void {
  instance = service;
}

/**
 * Get the singleton SocketService instance
 *
 * @returns SocketService instance or null if not initialized
 */
export function getSocketService(): SocketService | null {
  return instance;
}
