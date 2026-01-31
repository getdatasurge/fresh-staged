# Real-Time Communication Research: Socket.io for FreshTrack Pro v2.0

**Project:** FreshTrack Pro - IoT Temperature Monitoring for Food Safety
**Current Stack:** Fastify, React, TanStack Query, Redis, PostgreSQL, Drizzle ORM
**Researched:** 2026-01-24
**Overall Confidence:** HIGH

## Executive Summary

This research addresses implementing real-time features in FreshTrack Pro v2.0 for live sensor data updates and alert notifications without page refresh. The recommended approach uses **Socket.io v4** integrated with **Fastify** via the `fastify-socket.io` plugin, scaled horizontally using the **Redis adapter** for multi-instance deployments.

Socket.io is the industry-standard solution for real-time bidirectional communication, with 2,365+ code examples in Context7 documentation (High source reputation, 76.9-92 benchmark score). The integration pattern with Fastify is well-established, and the Redis adapter enables production-scale multi-tenant architectures.

**Key Findings:**

- Socket.io + Fastify integration is straightforward via `fastify-socket.io` plugin
- Redis adapter enables horizontal scaling with pub/sub architecture
- Multi-tenant isolation achieved through namespaces and rooms
- React integration uses imperative TanStack Query methods for cache updates
- Production requires careful memory management and connection lifecycle handling

---

## 1. Socket.io + Fastify Integration

### Installation

**Confidence:** HIGH (verified from Context7 and official GitHub)

```bash
# Backend dependencies
npm install fastify-socket.io socket.io

# Redis adapter for scaling (production)
npm install @socket.io/redis-adapter redis

# Optional performance optimizations
npm install bufferutil utf-8-validate
```

**Sources:**

- [Socket.io v4 Documentation](https://socket.io/docs/v4/server-initialization) (Context7)
- [fastify-socket.io GitHub](https://github.com/ducktors/fastify-socket.io)

### Basic Fastify Integration

**Pattern:** Register plugin, wait for `ready()`, then access `fastify.io`

```typescript
// backend/src/app.ts
import Fastify, { FastifyInstance } from 'fastify';
import fastifySocketIO from 'fastify-socket.io';

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? false,
  });

  // Register Socket.io plugin
  app.register(fastifySocketIO, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // ... other middleware and plugins ...

  // Socket.io setup MUST happen after app.ready()
  app.ready().then(() => {
    setupSocketIO(app.io);
  });

  return app;
}

function setupSocketIO(io: Server) {
  // Authentication middleware (runs on handshake)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = await verifyJWT(token);
      socket.data.userId = decoded.userId;
      socket.data.organizationId = decoded.organizationId;
      socket.data.role = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join organization room for multi-tenant isolation
    const { organizationId } = socket.data;
    socket.join(`org:${organizationId}`);

    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });
}
```

**Key Implementation Notes:**

1. **Lifecycle Order:** The `io` decorator is undefined until `app.ready()` resolves. Must setup Socket.io handlers inside the ready callback.

2. **PreClose Hook:** The plugin automatically registers a `preClose` hook that disconnects all local sockets before Fastify shutdown. Can be customized:

```typescript
app.register(fastifySocketIO, {
  preClose: (done) => {
    app.io.local.disconnectSockets(true);
    done();
  },
});
```

3. **TypeScript Types:** The plugin intentionally doesn't provide types for the `io` decorator, allowing custom type definitions with Socket.io's type system.

**Sources:**

- [Socket.io Server Initialization](https://socket.io/docs/v4/server-initialization) (Context7)
- [fastify-socket.io Documentation](https://github.com/ducktors/fastify-socket.io)

---

## 2. Redis Adapter for Scaling

### Why Redis Adapter is Required

**Problem:** Socket.io servers don't communicate between themselves. When horizontally scaled behind a load balancer, a message emitted from one server won't reach clients connected to other servers.

**Solution:** The Redis adapter uses pub/sub to broadcast messages across all server instances.

**Confidence:** HIGH (verified from Context7 official docs)

### Architecture Pattern

```
┌─────────────┐
│Load Balancer│ (sticky sessions via IP hash)
└──────┬──────┘
       │
   ┌───┴───┬────────┬────────┐
   │       │        │        │
┌──▼──┐ ┌──▼──┐  ┌──▼──┐  ┌──▼──┐
│App 1│ │App 2│  │App 3│  │App N│  Socket.io servers
└──┬──┘ └──┬──┘  └──┬──┘  └──┬──┘
   │       │        │        │
   └───┬───┴────────┴────────┘
       │
   ┌───▼───┐
   │ Redis │ Pub/Sub for message broadcast
   └───────┘
```

### Redis Adapter Configuration

**Recommended:** Use **Sharded Redis Adapter** for Redis 7.0+ (higher performance)

```typescript
// backend/src/services/socket.service.ts
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createShardedAdapter } from '@socket.io/redis-adapter';

export async function configureRedisAdapter(io: Server) {
  const pubClient = createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(
    createShardedAdapter(pubClient, subClient, {
      publishOnSpecificResponseChannel: true, // More efficient - responses only to requesting server
    }),
  );

  console.log('Redis adapter configured for Socket.io');
}
```

**For Redis < 7.0:** Use standard adapter

```typescript
import { createAdapter } from '@socket.io/redis-adapter';

io.adapter(createAdapter(pubClient, subClient));
```

### Sticky Sessions Requirement

**Critical:** Sticky sessions are REQUIRED when using multiple Socket.io instances, even with Redis adapter.

**Why:** The HTTP long-polling transport (fallback when WebSocket unavailable) requires sticky sessions. Without them, clients can't maintain continuous connections.

**Implementation Options:**

**Nginx Configuration:**

```nginx
http {
  upstream socket_nodes {
    # IP-based sticky sessions
    hash $remote_addr consistent;

    server app01:3000;
    server app02:3000;
    server app03:3000;
  }

  server {
    listen 3000;

    location / {
      proxy_pass http://socket_nodes;

      # WebSocket support
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";

      # Forward headers
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header Host $host;
    }
  }
}
```

**HAProxy Configuration:**

```haproxy
backend nodes
  option httpchk HEAD /health
  http-check expect status 200
  cookie io prefix indirect nocache  # Sticky via 'io' cookie from handshake
  server app01 app01:3000 check cookie app01
  server app02 app02:3000 check cookie app02
  server app03 app03:3000 check cookie app03
```

**Sources:**

- [Socket.io Redis Adapter](https://socket.io/docs/v4/redis-adapter) (Context7)
- [Using Multiple Nodes](https://socket.io/docs/v4/using-multiple-nodes) (Context7)
- [Horizontal Scaling with Socket.io](https://dev.to/kawanedres/horizontal-scaling-with-socketio-1lca)

---

## 3. Multi-Tenant Architecture with Rooms & Namespaces

### Isolation Strategy

**Confidence:** HIGH (verified from Context7 and production case studies)

FreshTrack Pro requires data isolation between organizations (multi-tenancy). Socket.io provides two mechanisms:

1. **Namespaces** - Separate communication channels (like `/orders`, `/users`)
2. **Rooms** - Groups within namespaces for broadcasting to subsets

### Recommended Pattern for FreshTrack Pro

**Use Rooms for Organization Isolation (not dynamic namespaces)**

**Why:**

- Simpler implementation with single namespace
- Better performance (fewer namespace instances)
- Easier to broadcast organization-wide events
- Redis adapter works seamlessly with rooms

```typescript
// Socket.io event handlers
io.on('connection', (socket) => {
  const { organizationId, userId } = socket.data; // From auth middleware

  // Auto-join organization room
  socket.join(`org:${organizationId}`);

  console.log(`User ${userId} joined organization ${organizationId}`);

  // Subscribe to specific site updates
  socket.on('subscribe:site', (siteId: string) => {
    socket.join(`org:${organizationId}:site:${siteId}`);
  });

  // Subscribe to specific unit updates (IoT device)
  socket.on('subscribe:unit', (unitId: string) => {
    socket.join(`org:${organizationId}:unit:${unitId}`);
  });

  socket.on('unsubscribe:site', (siteId: string) => {
    socket.leave(`org:${organizationId}:site:${siteId}`);
  });

  socket.on('unsubscribe:unit', (unitId: string) => {
    socket.leave(`org:${organizationId}:unit:${unitId}`);
  });
});
```

### Broadcasting Patterns

```typescript
// Emit sensor reading to organization (all members)
io.to(`org:${organizationId}`).emit('sensor:reading', {
  unitId,
  temperature,
  humidity,
  timestamp,
});

// Emit to specific site viewers only
io.to(`org:${organizationId}:site:${siteId}`).emit('sensor:reading', data);

// Emit alert to organization
io.to(`org:${organizationId}`).emit('alert:triggered', {
  alertId,
  unitId,
  severity,
  message,
});

// Emit to single user (private notification)
const sockets = await io.in(`org:${organizationId}`).fetchSockets();
const userSocket = sockets.find((s) => s.data.userId === userId);
if (userSocket) {
  userSocket.emit('notification:private', { message });
}
```

### Alternative: Dynamic Namespaces (Not Recommended for This Use Case)

Socket.io supports regex-based dynamic namespaces:

```typescript
// Creates namespace per workspace/tenant
const workspaces = io.of(/^\/\w+$/);

workspaces.on('connection', (socket) => {
  const workspace = socket.nsp;
  workspace.emit('hello');
});
```

**When to Use:**

- Completely separate logical systems per tenant
- Different middleware/handlers per namespace
- Need to count connections per tenant easily

**Why Not for FreshTrack Pro:**

- Adds complexity without clear benefit
- Room-based approach handles isolation well
- Single namespace easier to maintain
- Better scalability with Redis adapter

**Sources:**

- [Socket.io Namespaces](https://socket.io/docs/v4/namespaces) (Context7)
- [Socket.io Rooms](https://socket.io/docs/v4/rooms) (Context7)
- [Multi-tenant Fastify Auth](https://peerlist.io/shrey_/articles/building-better-auth-in-fastify-multitenant-saas-and-secure-api-authentication)

---

## 4. React Client Integration with TanStack Query

### The Challenge

**Problem:** Socket.io is stream-based, not promise-based. You cannot directly use `useQuery` with Socket.io events.

**Solution:** Use Socket.io for push events + TanStack Query's imperative API for cache updates.

**Confidence:** HIGH (verified from official TanStack Query blog and discussions)

### Integration Patterns

**Pattern 1: Socket.io Triggers Cache Updates (Recommended)**

```typescript
// hooks/useRealtimeSensorData.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '@/lib/socket';

export function useRealtimeSensorData(organizationId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Join organization room
    socket.emit('subscribe:organization', organizationId);

    // Listen for sensor readings
    socket.on('sensor:reading', (data) => {
      // Update cache directly
      queryClient.setQueryData(
        ['sensor-readings', data.unitId],
        (oldData: SensorReading[] | undefined) => {
          if (!oldData) return [data];
          return [data, ...oldData.slice(0, 99)]; // Keep last 100 readings
        },
      );
    });

    // Listen for alerts
    socket.on('alert:triggered', (alert) => {
      // Invalidate to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['alerts'] });

      // Or update cache directly
      queryClient.setQueryData(['alerts'], (old: Alert[] | undefined) => {
        return old ? [alert, ...old] : [alert];
      });
    });

    return () => {
      socket.off('sensor:reading');
      socket.off('alert:triggered');
      socket.emit('unsubscribe:organization', organizationId);
    };
  }, [organizationId, queryClient]);
}
```

**Pattern 2: Socket.io as Refetch Trigger**

```typescript
// When you want to refetch from API instead of using socket data directly
useEffect(() => {
  socket.on('data:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['sensor-data'] });
  });

  return () => socket.off('data:updated');
}, [queryClient]);
```

**Pattern 3: Acknowledgment Events with Promises (For RPC-style calls)**

```typescript
// Use Socket.io's emitWithAck for request/response patterns
const { mutate } = useMutation({
  mutationFn: async (command: DeviceCommand) => {
    const response = await socket.emitWithAck('device:command', command);
    return response;
  },
});
```

### Socket.io Client Setup

```typescript
// lib/socket.ts
import { io } from 'socket.io-client';

export const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
  autoConnect: false, // Connect manually after auth
  auth: {
    token: '', // Set this after login
  },
});

// Connection lifecycle
export function connectSocket(token: string) {
  socket.auth = { token };
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
```

### Connection Lifecycle in React

```typescript
// App.tsx or AuthProvider
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { connectSocket, disconnectSocket, socket } from '@/lib/socket';

export function AppWithRealtime() {
  const { user, token } = useAuth();

  useEffect(() => {
    if (user && token) {
      connectSocket(token);

      socket.on('connect', () => {
        console.log('Socket.io connected');
      });

      socket.on('connect_error', (error) => {
        console.error('Socket.io connection error:', error.message);

        if (!socket.active) {
          // Connection denied by server - token invalid
          // Handle logout or token refresh
        }
      });

      return () => {
        disconnectSocket();
      };
    }
  }, [user, token]);

  return <YourApp />;
}
```

### Important Best Practices

**1. Register Event Listeners Outside `connect` Event**

```typescript
// ❌ WRONG - Creates duplicate listeners on reconnect
socket.on('connect', () => {
  socket.on('data', handleData); // BAD!
});

// ✅ CORRECT - Listeners registered once
socket.on('connect', () => {
  console.log('Connected');
});

socket.on('data', handleData); // GOOD!
```

**2. Set High `staleTime` for Real-time Updated Data**

```typescript
// Since data updates via WebSocket, prevent unnecessary refetches
const { data } = useQuery({
  queryKey: ['sensor-readings'],
  queryFn: fetchSensorReadings,
  staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh via socket
});
```

**3. Handle Reconnection Events**

```typescript
// Listen to Manager events for reconnection handling
socket.io.on('reconnect_attempt', () => {
  console.log('Attempting to reconnect...');
});

socket.io.on('reconnect', () => {
  console.log('Reconnected successfully');
  // Re-subscribe to rooms
  socket.emit('subscribe:organization', organizationId);
});
```

**Sources:**

- [Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query) (TkDodo's blog)
- [TanStack Query and WebSockets](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/)
- [Socket.io + React Query Discussion](https://github.com/socketio/socket.io/discussions/4952)
- [Socket.io Client API](https://socket.io/docs/v4/client-api) (Context7)

---

## 5. Connection Lifecycle & Reconnection Handling

### Disconnect Reasons

**Confidence:** HIGH (verified from Context7)

Socket.io provides detailed disconnect reasons in the `disconnect` event:

```typescript
socket.on('disconnect', (reason, details) => {
  console.log('Disconnect reason:', reason);
  console.log('Disconnect details:', details);

  if (reason === 'io server disconnect') {
    // Server forcefully disconnected (e.g., authentication failed)
    // MUST manually reconnect
    socket.connect();
  }

  if (reason === 'io client disconnect') {
    // Client called socket.disconnect()
    // Will NOT auto-reconnect
  }

  if (reason === 'ping timeout') {
    // Server didn't respond to ping in time
    // Auto-reconnects
  }

  if (reason === 'transport close') {
    // Underlying connection closed
    // Auto-reconnects
  }

  if (reason === 'transport error') {
    // Transport error
    // Auto-reconnects
  }
});
```

### Automatic Reconnection Behavior

**Default Behavior:**

- Socket.io client automatically attempts reconnection for most disconnect reasons
- Uses exponential backoff: 1s, 2s, 5s, 10s, 20s, 40s, 60s (max)
- Reconnects infinitely by default

**Exception:** Server-initiated disconnects (`io server disconnect`) require manual reconnection.

### Reconnection Configuration

```typescript
const socket = io({
  reconnection: true, // Enable auto-reconnection (default: true)
  reconnectionAttempts: Infinity, // Max attempts (default: Infinity)
  reconnectionDelay: 1000, // Initial delay (default: 1000ms)
  reconnectionDelayMax: 5000, // Max delay (default: 5000ms)
  randomizationFactor: 0.5, // Randomization (default: 0.5)
  timeout: 20000, // Connection timeout (default: 20000ms)
});
```

### Connection Error Handling

```typescript
socket.on('connect_error', (error) => {
  console.log('Error message:', error.message);
  console.log('Error description:', error.description);
  console.log('Error context:', error.context);

  if (socket.active) {
    // Temporary failure - socket will auto-retry
    console.log('Temporary connection failure, retrying...');
  } else {
    // Connection denied by server
    // Handle authentication failure
    console.error('Connection rejected:', error.message);
    handleAuthenticationFailure();
  }
});
```

### Connection State Recovery (Socket.io 4.6.0+)

**Feature:** Automatically restore client state after temporary disconnection, including missed packets.

**Server Configuration:**

```typescript
const io = new Server({
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true, // Skip middlewares on recovery (faster)
  },
});
```

**Client Usage:**

```typescript
socket.on('connect', () => {
  if (socket.recovered) {
    // Connection was recovered, any missed events were replayed
    console.log('Connection recovered, no data loss');
  } else {
    // New or non-recoverable connection
    console.log('New connection established');
  }
});
```

**When to Use:**

- Temporary network interruptions
- Mobile device switching between WiFi/cellular
- Short server restarts

**Limitations:**

- Only works for temporary disconnections (< maxDisconnectionDuration)
- Client must reconnect to the same server instance (requires sticky sessions)
- Not suitable for long-term offline scenarios

### Graceful Shutdown Best Practices

**Server-Side:**

```typescript
// Handle SIGTERM for graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing gracefully...');

  // Disconnect all clients
  io.local.disconnectSockets(true);

  // Close server
  await new Promise((resolve) => {
    io.close(() => {
      console.log('Socket.io server closed');
      resolve(null);
    });
  });

  process.exit(0);
});
```

**Client-Side:**

```typescript
// Clean disconnect on app unmount
useEffect(() => {
  return () => {
    socket.disconnect();
  };
}, []);
```

### Proxy Configuration (nginx/HAProxy)

**Critical:** Proxy timeout must be longer than Socket.io ping cycle.

```nginx
# Socket.io default: pingInterval (25s) + pingTimeout (20s) = 45s
# Nginx default: proxy_read_timeout = 60s (OK)
# If changing Socket.io ping settings, adjust accordingly:

location / {
  proxy_read_timeout 90s; # Must be > pingInterval + pingTimeout
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

**Sources:**

- [Handling Disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections) (Context7)
- [Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery) (Context7)
- [Graceful Shutdown Discussion](https://github.com/socketio/socket.io/discussions/5030)
- [Troubleshooting Connection Issues](https://socket.io/docs/v4/troubleshooting-connection-issues) (Context7)

---

## 6. Production Scaling Considerations

### Performance Optimization

**Confidence:** HIGH (verified from official Socket.io docs)

#### Binary Add-ons (Recommended)

```bash
npm install --save-optional bufferutil utf-8-validate
```

**Benefits:**

- `bufferutil`: Faster masking/unmasking of WebSocket payload data
- `utf-8-validate`: Faster UTF-8 validation
- Significant performance improvement for high-throughput scenarios

#### Memory Optimization

**1. Discard HTTP Request Reference:**

```typescript
io.engine.on('connection', (rawSocket) => {
  rawSocket.request = null; // Free memory if not using express-session
});
```

**When NOT to use:** If integrating with `express-session` or need session middleware.

**2. Memory Scaling:**

- Memory usage scales linearly with connected clients (not exponential)
- Focus on per-client efficiency for best ROI

**3. Alternative WebSocket Engines:**

```typescript
// Using eiows (C++ implementation, better performance)
import { Server } from 'socket.io';

const io = new Server({
  wsEngine: require('eiows').Server,
});
```

**Options:**

- `eiows` - Fork of uws, better memory/CPU than default
- `µWebSockets.js` - Alternative HTTP server with WebSocket support

#### OS-Level Tuning (Linux Production Servers)

**Increase File Descriptor Limit:**

```bash
# /etc/security/limits.d/custom.conf
* soft nofile 1048576
* hard nofile 1048576
```

**Expand Local Port Range:**

```bash
# /etc/sysctl.d/net.ipv4.ip_local_port_range.conf
net.ipv4.ip_local_port_range = 1024 60999
```

Allows ~55,000 concurrent connections per incoming IP address.

### Memory Leak Prevention

**Confidence:** MEDIUM (based on GitHub issues and community reports)

**Known Issues:**

- Socket.io has experienced memory leaks in certain scenarios (v4.5.1 reports)
- Emitting with acknowledgment callbacks can leak memory
- ArrayBuffer transmission has caused issues in past versions

**Prevention Strategies:**

**1. Proper Event Listener Cleanup:**

```typescript
// Always remove listeners on disconnect
socket.on('disconnect', () => {
  socket.removeAllListeners();
});
```

**2. Avoid Storing Large Objects in Socket Data:**

```typescript
// ❌ BAD - Stores reference to large object
socket.data.fullSensorHistory = largeSensorArray;

// ✅ GOOD - Store only IDs, fetch data when needed
socket.data.unitId = unitId;
```

**3. Monitor Memory in Production:**

```typescript
// Log memory usage periodically
setInterval(() => {
  const used = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
  });
}, 60000); // Every minute
```

**4. Use Socket.io Admin UI for Monitoring (Production):**

```typescript
import { instrument } from '@socket.io/admin-ui';

instrument(io, {
  auth: {
    type: 'basic',
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  },
  mode: 'production', // Important!
});
```

Access admin UI at `http://your-server:3000/admin`

### IoT-Specific Architecture Patterns

**Confidence:** MEDIUM-HIGH (based on community patterns and case studies)

**Challenge:** IoT sensors emit data at high frequencies (1-10Hz), causing excessive React re-renders.

**Solution: Data Buffering Strategy**

```typescript
// backend/src/services/sensor-stream.service.ts
class SensorStreamBuffer {
  private buffer: Map<string, SensorReading[]> = new Map();
  private flushInterval = 1000; // Flush every 1 second

  constructor(private io: Server) {
    // Flush buffer to clients every second
    setInterval(() => this.flush(), this.flushInterval);
  }

  addReading(organizationId: string, unitId: string, reading: SensorReading) {
    const key = `${organizationId}:${unitId}`;

    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }

    this.buffer.get(key)!.push(reading);
  }

  private flush() {
    for (const [key, readings] of this.buffer.entries()) {
      if (readings.length === 0) continue;

      const [organizationId, unitId] = key.split(':');

      // Send batched readings
      this.io.to(`org:${organizationId}`).emit('sensor:readings:batch', {
        unitId,
        readings,
        count: readings.length,
      });

      // Clear buffer
      this.buffer.set(key, []);
    }
  }
}
```

**Frontend Handling:**

```typescript
// Throttle UI updates to prevent render thrashing
socket.on('sensor:readings:batch', (data) => {
  // Update only latest reading in UI
  queryClient.setQueryData(['sensor-latest', data.unitId], data.readings[data.readings.length - 1]);

  // Store full batch for chart (if needed)
  queryClient.setQueryData(['sensor-history', data.unitId], (old: Reading[] = []) => {
    return [...old, ...data.readings].slice(-1000); // Keep last 1000 points
  });
});
```

### Load Balancing Requirements

**Sticky Sessions Required:** Always use sticky sessions with multiple instances.

**Recommended Configuration:**

- IP hash for simplicity
- Cookie-based for accuracy
- Session affinity duration: At least 1 hour

**Health Check Endpoints:**

```typescript
// backend/src/routes/health.ts
app.get('/health', async (request, reply) => {
  const socketCount = await io.fetchSockets();

  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    socketConnections: socketCount.length,
    memory: process.memoryUsage(),
  };
});
```

**Sources:**

- [Socket.io Performance Tuning](https://socket.io/docs/v4/performance-tuning) (Context7)
- [Socket.io Memory Usage](https://socket.io/docs/v4/memory-usage) (Context7)
- [Scaling Socket.io - Ably Guide](https://ably.com/topic/scaling-socketio)
- [IoT Sensor Dashboard GitHub](https://github.com/ChristySchott/iot-sensor-dashboard)
- [Real-Time Data Processing with IoT](https://medium.com/@harshyelpcamp/real-time-data-processing-using-sockets-and-iot-devices-201227b77591)

---

## 7. Authentication & Security

### JWT Middleware Pattern

**Confidence:** HIGH (verified from official docs and community patterns)

```typescript
// backend/src/middleware/socket-auth.ts
import { Server, Socket } from 'socket.io';
import { verifyJWT } from '../utils/jwt';

export function setupSocketAuth(io: Server) {
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = await verifyJWT(token);

      // Attach user data to socket
      socket.data.userId = decoded.userId;
      socket.data.organizationId = decoded.organizationId;
      socket.data.role = decoded.role;
      socket.data.email = decoded.email;

      next();
    } catch (error) {
      console.error('Socket.io auth error:', error);
      next(new Error('Invalid or expired token'));
    }
  });
}
```

### Client-Side Auth

```typescript
// Frontend: Send token on connection
const token = localStorage.getItem('access_token');

const socket = io('http://localhost:3000', {
  auth: { token },
});

// Handle auth errors
socket.on('connect_error', (error) => {
  if (error.message.includes('token')) {
    // Redirect to login or refresh token
    window.location.href = '/login';
  }
});
```

### Security Best Practices

**1. Don't Send Token in Query String:**

```typescript
// ❌ BAD - Token visible in logs
const socket = io(`http://localhost:3000?token=${token}`);

// ✅ GOOD - Token in auth object
const socket = io('http://localhost:3000', {
  auth: { token },
});
```

**2. CORS Configuration:**

```typescript
const io = new Server({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST'],
  },
});
```

**3. Rate Limiting (Per Socket):**

```typescript
import rateLimit from 'socket.io-rate-limit';

io.use(
  rateLimit({
    tokensPerInterval: 100,
    interval: 1000, // 100 requests per second per socket
    fireImmediately: true,
  }),
);
```

**4. Validate All Client Events:**

```typescript
socket.on('device:command', async (data) => {
  // Validate input
  const schema = z.object({
    deviceId: z.string(),
    command: z.enum(['START', 'STOP', 'RESET']),
  });

  const result = schema.safeParse(data);
  if (!result.success) {
    socket.emit('error', { message: 'Invalid command format' });
    return;
  }

  // Check authorization
  if (!canUserControlDevice(socket.data.userId, result.data.deviceId)) {
    socket.emit('error', { message: 'Unauthorized' });
    return;
  }

  // Process command
  await executeDeviceCommand(result.data);
});
```

**Sources:**

- [Socket.io JWT Authentication](https://socket.io/how-to/use-with-jwt) (Context7)
- [Socket.io Middlewares](https://socket.io/docs/v4/middlewares) (Context7)
- [Securing Socket.io with Authentication](https://medium.com/@mcmohangowda/securing-socket-io-with-authentication-in-node-js-33a6ae8bb534)

---

## 8. Implementation Roadmap for FreshTrack Pro v2.0

### Phase 1: Basic Real-Time Infrastructure

**Goal:** Get Socket.io working with Fastify and basic room-based multi-tenancy.

**Tasks:**

1. Install dependencies: `fastify-socket.io`, `socket.io`
2. Create Socket.io plugin in `backend/src/plugins/socket.plugin.ts`
3. Implement JWT authentication middleware
4. Setup organization-based rooms
5. Create health check endpoint that reports socket connections

**Deliverable:** Server can accept authenticated WebSocket connections and assign clients to organization rooms.

### Phase 2: Redis Adapter for Horizontal Scaling

**Goal:** Enable multi-instance deployments with Redis pub/sub.

**Tasks:**

1. Install Redis adapter: `@socket.io/redis-adapter`, `redis`
2. Configure Redis clients (pub/sub)
3. Setup sticky sessions in load balancer (nginx/HAProxy)
4. Test broadcasting across multiple server instances
5. Implement connection state recovery

**Deliverable:** Multiple backend instances can broadcast messages to all clients.

### Phase 3: Real-Time Sensor Data Streaming

**Goal:** Push live sensor readings to connected clients.

**Tasks:**

1. Create `SensorStreamBuffer` service for data throttling
2. Modify TTN webhook handler to emit to Socket.io rooms
3. Implement room subscription system (`subscribe:site`, `subscribe:unit`)
4. Add batch emission logic (throttle to 1 update/second)
5. Test with simulated high-frequency sensor data

**Deliverable:** Sensor readings broadcast to subscribed clients in real-time with proper throttling.

### Phase 4: React Client Integration

**Goal:** Integrate Socket.io with React and TanStack Query.

**Tasks:**

1. Create `lib/socket.ts` with connection management
2. Build `useRealtimeSensorData` hook
3. Implement `useRealtimeAlerts` hook
4. Add connection status indicator in UI
5. Handle reconnection and error states
6. Test cache updates via `queryClient.setQueryData`

**Deliverable:** React app receives real-time updates and updates TanStack Query cache automatically.

### Phase 5: Alert Notifications

**Goal:** Real-time alert delivery with acknowledgment.

**Tasks:**

1. Emit alerts via Socket.io from `alert-evaluator.service.ts`
2. Implement client-side alert toast notifications
3. Add alert acknowledgment flow (client → server)
4. Store unread alerts in client cache
5. Test alert delivery across organization members

**Deliverable:** Users receive instant alert notifications with toast UI.

### Phase 6: Production Hardening

**Goal:** Optimize for production performance and reliability.

**Tasks:**

1. Install binary add-ons (`bufferutil`, `utf-8-validate`)
2. Configure memory optimization (discard HTTP request)
3. Setup Socket.io Admin UI for monitoring
4. Implement graceful shutdown handling
5. Configure OS-level tuning (file descriptors, port range)
6. Load test with K6/Artillery
7. Setup monitoring (Prometheus metrics for socket count)

**Deliverable:** Production-ready real-time system with monitoring and performance optimization.

---

## 9. Testing Strategy

### Unit Tests

```typescript
// __tests__/socket.service.test.ts
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';

describe('Socket.io Service', () => {
  let io: Server;
  let serverSocket: any;
  let clientSocket: any;

  beforeAll((done) => {
    const httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: 'valid-jwt-token' },
      });

      io.on('connection', (socket) => {
        serverSocket = socket;
      });

      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
  });

  test('should authenticate with valid JWT', (done) => {
    clientSocket.on('connect', () => {
      expect(serverSocket.data.userId).toBeDefined();
      done();
    });
  });

  test('should join organization room', (done) => {
    const orgId = '123';
    clientSocket.emit('subscribe:organization', orgId);

    setTimeout(() => {
      expect(serverSocket.rooms.has(`org:${orgId}`)).toBe(true);
      done();
    }, 100);
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/realtime-sensor.test.ts
test('sensor reading should broadcast to organization members', async () => {
  // Connect two clients from same org
  const client1 = connectClient(org1Token);
  const client2 = connectClient(org1Token);

  // Subscribe to unit
  client1.emit('subscribe:unit', unitId);
  client2.emit('subscribe:unit', unitId);

  // Simulate sensor reading from server
  const reading = { unitId, temperature: 25.5, timestamp: Date.now() };
  io.to(`org:${orgId}:unit:${unitId}`).emit('sensor:reading', reading);

  // Both clients should receive
  await Promise.all([
    waitForEvent(client1, 'sensor:reading'),
    waitForEvent(client2, 'sensor:reading'),
  ]);
});
```

### Load Testing (K6)

```javascript
// k6/socket-load-test.js
import { check } from 'k6';
import ws from 'k6/ws';

export const options = {
  stages: [
    { duration: '1m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '1m', target: 1000 }, // Ramp to 1000
    { duration: '5m', target: 1000 }, // Stay at 1000
    { duration: '1m', target: 0 }, // Ramp down
  ],
};

export default function () {
  const url = 'ws://localhost:3000/socket.io/?EIO=4&transport=websocket';

  const response = ws.connect(url, (socket) => {
    socket.on('open', () => {
      // Send auth
      socket.send('40{"token":"test-jwt"}');
    });

    socket.on('message', (data) => {
      console.log('Received:', data);
    });

    socket.on('close', () => {
      console.log('Disconnected');
    });

    socket.setTimeout(() => {
      socket.close();
    }, 30000); // 30s connection
  });

  check(response, { 'status is 101': (r) => r && r.status === 101 });
}
```

---

## 10. Monitoring & Observability

### Metrics to Track

```typescript
// Prometheus-style metrics
const metrics = {
  // Connection metrics
  totalConnections: () => io.sockets.sockets.size,
  connectionsPerOrg: (orgId: string) => io.in(`org:${orgId}`).allSockets().size,

  // Event metrics
  eventsEmitted: 0,
  eventsReceived: 0,

  // Performance metrics
  averageLatency: 0,
  messageQueueSize: 0,
};

// Export metrics endpoint
app.get('/metrics', async (request, reply) => {
  return {
    socketio_connections_total: await io.fetchSockets().then((s) => s.length),
    socketio_rooms_total: io.sockets.adapter.rooms.size,
    socketio_events_emitted_total: metrics.eventsEmitted,
    socketio_events_received_total: metrics.eventsReceived,
  };
});
```

### Logging Strategy

```typescript
// Structured logging
io.on('connection', (socket) => {
  logger.info({
    event: 'socket_connected',
    socketId: socket.id,
    userId: socket.data.userId,
    organizationId: socket.data.organizationId,
    transport: socket.conn.transport.name,
  });

  socket.on('disconnect', (reason) => {
    logger.info({
      event: 'socket_disconnected',
      socketId: socket.id,
      reason,
      duration: Date.now() - socket.handshake.time,
    });
  });
});
```

---

## 11. Potential Pitfalls & Mitigations

### Pitfall 1: Missing Sticky Sessions in Production

**Problem:** Without sticky sessions, HTTP long-polling clients disconnect immediately.

**Symptoms:**

- Clients connect then immediately disconnect
- `transport error` or `transport close` in rapid succession
- Works with WebSocket-only clients but fails with fallback

**Mitigation:**

- Always configure sticky sessions in load balancer
- Test with HTTP long-polling transport explicitly
- Monitor disconnect reasons in production

### Pitfall 2: Duplicate Event Listeners on Reconnection

**Problem:** Registering event listeners inside `connect` event creates duplicates on each reconnect.

**Symptoms:**

- Event handlers fire multiple times
- Memory increases on each reconnection
- Users see duplicate notifications

**Mitigation:**

```typescript
// ✅ Register once, outside connect event
socket.on('data', handleData);
socket.on('connect', () => console.log('Connected'));
```

### Pitfall 3: Broadcasting to Wrong Rooms (Data Leakage)

**Problem:** Typo in room name or missing organization check allows cross-tenant data access.

**Symptoms:**

- Users seeing other organization's data
- Security vulnerability

**Mitigation:**

- Always use consistent room naming: `org:${organizationId}:resource:${resourceId}`
- Validate organizationId from socket.data in all event handlers
- Add integration tests for multi-tenant isolation

### Pitfall 4: Memory Leaks from Event Listeners

**Problem:** Not cleaning up event listeners on disconnect.

**Symptoms:**

- Memory grows over time
- Server becomes unresponsive
- Node.js heap out of memory errors

**Mitigation:**

```typescript
socket.on('disconnect', () => {
  socket.removeAllListeners(); // Clean up all custom listeners
});
```

### Pitfall 5: Overwhelming React with High-Frequency Updates

**Problem:** IoT sensors emit data every 100ms, causing 10 renders/second.

**Symptoms:**

- UI lag/freezing
- Browser performance degradation
- High CPU usage in dev tools

**Mitigation:**

- Implement server-side buffering (batch updates to 1/second)
- Use `useDeferredValue` or `useTransition` in React
- Throttle cache updates in React Query

### Pitfall 6: Redis Connection Failures Not Handled

**Problem:** Redis goes down, Socket.io stops broadcasting across instances.

**Symptoms:**

- Messages only reach clients on same server instance
- No error messages visible
- Silent degradation

**Mitigation:**

```typescript
pubClient.on('error', (err) => {
  logger.error('Redis pub client error:', err);
  // Trigger alert to ops team
});

subClient.on('error', (err) => {
  logger.error('Redis sub client error:', err);
});
```

### Pitfall 7: Token Expiration During Active Connection

**Problem:** JWT expires while user is connected, causing authorization issues.

**Symptoms:**

- User connected but can't perform authenticated actions
- Confusing UX (appears connected but actions fail)

**Mitigation:**

- Implement token refresh flow on client
- Disconnect client when token expires (server-side check)
- Show "Session expired, reconnecting..." UI

```typescript
// Server-side middleware
io.use(async (socket, next) => {
  const tokenAge = Date.now() - socket.handshake.time;
  if (tokenAge > TOKEN_MAX_AGE) {
    return next(new Error('Token expired, please reconnect'));
  }
  next();
});
```

---

## 12. Decision Matrix: When to Use Socket.io

### Use Socket.io When:

| Scenario                        | Reason                                   |
| ------------------------------- | ---------------------------------------- |
| Live sensor data updates        | Push data without polling overhead       |
| Real-time alert notifications   | Instant delivery to affected users       |
| Collaborative features (future) | Multi-user editing, presence indicators  |
| Dashboard auto-refresh          | Keep data fresh without user action      |
| Live status indicators          | Connection status, device online/offline |

### Don't Use Socket.io When:

| Scenario                | Better Alternative                  |
| ----------------------- | ----------------------------------- |
| One-time data fetches   | HTTP REST API with TanStack Query   |
| Bulk data export        | HTTP streaming or download endpoint |
| File uploads            | HTTP multipart/form-data            |
| Historical data queries | REST API with pagination            |
| Configuration updates   | REST API with optimistic updates    |

### Hybrid Approach (Recommended for FreshTrack Pro):

- **REST API:** CRUD operations, queries, bulk operations
- **Socket.io:** Live sensor readings, alerts, presence
- **TanStack Query:** Client-side caching for both sources

---

## 13. Total Cost of Ownership (TCO) Analysis

### Development Effort

| Task                             | Estimated Effort          |
| -------------------------------- | ------------------------- |
| Socket.io + Fastify integration  | 4 hours                   |
| JWT authentication middleware    | 2 hours                   |
| Room-based multi-tenancy         | 4 hours                   |
| Redis adapter configuration      | 3 hours                   |
| React client integration         | 6 hours                   |
| TanStack Query cache integration | 4 hours                   |
| Real-time sensor streaming       | 8 hours                   |
| Alert notifications              | 4 hours                   |
| Testing (unit + integration)     | 8 hours                   |
| Production hardening             | 6 hours                   |
| **Total**                        | **49 hours (~1.5 weeks)** |

### Infrastructure Costs (Monthly, AWS estimates)

| Resource                                  | Cost           |
| ----------------------------------------- | -------------- |
| Redis (ElastiCache, cache.t3.micro)       | $15            |
| Load Balancer (ALB)                       | $20            |
| Additional bandwidth (WebSocket overhead) | $5             |
| Monitoring/logging overhead               | $5             |
| **Total Additional Cost**                 | **~$45/month** |

**Note:** Assumes existing EC2/ECS infrastructure. Socket.io runs in same instances as Fastify, no additional compute needed.

### Maintenance Burden

| Area                                  | Ongoing Effort       |
| ------------------------------------- | -------------------- |
| Monitoring socket connection health   | 2 hours/month        |
| Redis adapter maintenance             | 1 hour/month         |
| Memory leak investigation (if occurs) | 4-8 hours (rare)     |
| Version upgrades (Socket.io, Redis)   | 2 hours/quarter      |
| **Total**                             | **~3-5 hours/month** |

---

## 14. Alternative Approaches Considered

### Alternative 1: Server-Sent Events (SSE)

**Pros:**

- Simpler than WebSocket
- Works over HTTP/1.1
- Auto-reconnection built-in
- No special proxy configuration

**Cons:**

- One-way (server → client only)
- No binary data support
- Connection limits per browser (6 concurrent per domain)
- Not suitable for bidirectional needs (alerts acknowledgment, commands)

**Verdict:** ❌ Not suitable for FreshTrack Pro (need bidirectional)

### Alternative 2: Native WebSocket API

**Pros:**

- No library dependency
- Full control over protocol
- Lower memory footprint

**Cons:**

- Must implement own reconnection logic
- No room/namespace abstraction
- No fallback to HTTP long-polling
- More development effort for multi-tenancy
- No Redis adapter equivalent (must build custom)

**Verdict:** ❌ Too much reinventing the wheel

### Alternative 3: GraphQL Subscriptions (Apollo)

**Pros:**

- Type-safe with GraphQL schema
- Integrates well with existing GraphQL API (if you had one)
- Built-in subscription management

**Cons:**

- FreshTrack Pro uses REST, not GraphQL
- Higher complexity for this use case
- Larger bundle size
- Overkill for simple pub/sub needs

**Verdict:** ❌ Unnecessary complexity

### Alternative 4: Polling with TanStack Query

**Pros:**

- No WebSocket infrastructure needed
- Simple implementation
- Works everywhere (no proxy issues)

**Cons:**

- Higher latency (polling interval)
- Unnecessary server load (wasted requests)
- Doesn't scale well with many clients
- Poor UX for real-time needs

**Verdict:** ❌ Doesn't meet "real-time" requirement

### Recommendation: Socket.io

**Why Socket.io is the best fit:**

1. **Proven at scale** - Used by production IoT systems
2. **Great DX** - Simple API, good TypeScript support
3. **Production-ready** - Redis adapter, connection recovery, monitoring tools
4. **Multi-tenant friendly** - Rooms/namespaces solve isolation
5. **React integration** - Well-documented TanStack Query patterns
6. **Fallback support** - Works even when WebSocket is blocked

---

## 15. Sources & References

### High Confidence (Context7 + Official Docs)

- [Socket.io v4 Documentation](https://socket.io/docs/v4/) - Official docs
- [Socket.io Server Initialization](https://socket.io/docs/v4/server-initialization) - Context7
- [Socket.io Redis Adapter](https://socket.io/docs/v4/redis-adapter) - Context7
- [Socket.io Namespaces](https://socket.io/docs/v4/namespaces) - Context7
- [Socket.io Client API](https://socket.io/docs/v4/client-api) - Context7
- [Socket.io Performance Tuning](https://socket.io/docs/v4/performance-tuning) - Context7
- [Socket.io Memory Usage](https://socket.io/docs/v4/memory-usage) - Context7
- [Socket.io Connection State Recovery](https://socket.io/docs/v4/connection-state-recovery) - Context7
- [Socket.io JWT Authentication](https://socket.io/how-to/use-with-jwt) - Context7
- [Socket.io Middlewares](https://socket.io/docs/v4/middlewares) - Context7
- [fastify-socket.io GitHub](https://github.com/ducktors/fastify-socket.io) - Official plugin repo

### Medium Confidence (Community + Multiple Sources)

- [Using WebSockets with React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query) - TkDodo's authoritative blog
- [TanStack Query and WebSockets](https://blog.logrocket.com/tanstack-query-websockets-real-time-react-data-fetching/) - LogRocket
- [Socket.io + React Query Discussion](https://github.com/socketio/socket.io/discussions/4952) - Official discussion
- [Scaling Socket.io - Ably Guide](https://ably.com/topic/scaling-socketio) - Industry expert
- [Horizontal Scaling with Socket.io](https://dev.to/kawanedres/horizontal-scaling-with-socketio-1lca) - DEV Community
- [Scaling Socket.io for 100K+ Connections](https://medium.com/@connect.hashblock/scaling-socket-io-redis-adapters-and-namespace-partitioning-for-100k-connections-afd01c6938e7) - Medium
- [Securing Socket.io with Authentication](https://medium.com/@mcmohangowda/securing-socket-io-with-authentication-in-node-js-33a6ae8bb534) - Medium
- [Multi-tenant Fastify Auth](https://peerlist.io/shrey_/articles/building-better-auth-in-fastify-multitenant-saas-and-secure-api-authentication) - Peerlist

### Supporting Resources (IoT Use Cases)

- [IoT Sensor Dashboard GitHub](https://github.com/ChristySchott/iot-sensor-dashboard) - Real-world example
- [Real-Time Data Processing with IoT](https://medium.com/@harshyelpcamp/real-time-data-processing-using-sockets-and-iot-devices-201227b77591) - Medium
- [When to Use Socket.io Guide](https://www.videosdk.live/developer-hub/socketio/when-to-use-socket-io) - VideoSDK

### Production & Monitoring

- [Socket.io Memory Leak Issues](https://github.com/socketio/socket.io/issues/4451) - GitHub issues
- [Graceful Shutdown Discussion](https://github.com/socketio/socket.io/discussions/5030) - GitHub discussion
- [Handling Disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections) - Context7
- [Troubleshooting Connection Issues](https://socket.io/docs/v4/troubleshooting-connection-issues) - Context7

---

## 16. Next Steps

**Recommended Actions:**

1. **Review Research with Team** - Ensure alignment on approach
2. **Spike: Fastify + Socket.io Integration** - 4 hours to validate basic setup
3. **POC: Single-Instance Real-Time Updates** - 1 day to prove concept
4. **Plan Redis Infrastructure** - Provision ElastiCache, configure sticky sessions
5. **Design Event Schema** - Define all Socket.io events and payloads
6. **Create Implementation Epic** - Break down 6-phase roadmap into tickets

**Open Questions for Team Discussion:**

1. Should we implement Connection State Recovery (Socket.io 4.6.0+)?
2. What's our target max concurrent connections per server instance?
3. Do we want Socket.io Admin UI in production or custom monitoring?
4. Should we buffer sensor data server-side or client-side (or both)?
5. What's our acceptable latency for alert delivery (SLA)?

**Risks to Monitor:**

- Memory leaks in production (requires monitoring)
- Redis single point of failure (needs HA setup)
- WebSocket proxy issues in customer environments
- Token expiration during active connections

**Success Metrics:**

- Alert delivery latency < 1 second
- Sensor reading freshness < 2 seconds
- Connection success rate > 99.5%
- Memory growth < 100MB per 1000 connections
- Support 1000+ concurrent connections per instance

---

## Confidence Assessment

| Area                               | Confidence      | Reasoning                                                     |
| ---------------------------------- | --------------- | ------------------------------------------------------------- |
| Socket.io + Fastify Integration    | **HIGH**        | Verified from Context7, official GitHub, working examples     |
| Redis Adapter Configuration        | **HIGH**        | Official Socket.io docs, multiple production case studies     |
| Multi-Tenant Architecture          | **HIGH**        | Clear patterns from official docs + community implementations |
| React + TanStack Query Integration | **HIGH**        | TkDodo's authoritative blog + official discussions            |
| Production Scaling                 | **MEDIUM-HIGH** | Official performance docs + community scaling articles        |
| Memory Management                  | **MEDIUM**      | Some historical issues, but mitigation strategies documented  |
| IoT-Specific Patterns              | **MEDIUM**      | Community examples + architectural patterns                   |

**Overall Research Confidence:** HIGH

All core recommendations are backed by Context7-verified Socket.io v4 documentation and official sources. Community patterns for React integration and scaling are well-established with multiple confirming sources. Some minor uncertainty around memory optimization is based on historical GitHub issues, but official mitigation strategies exist.

---

**Research Complete**
Ready for implementation planning and technical spike.
