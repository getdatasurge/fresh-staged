import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheck;
    redis?: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'fail';
  latency_ms?: number;
  message?: string;
}

const checkDatabase = async (): Promise<HealthCheck> => {
  const start = Date.now();
  try {
    // Simple query to verify database connectivity
    await db.execute(sql`SELECT 1`);
    return {
      status: 'pass',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Database unreachable',
    };
  }
};

// Redis check placeholder - uncomment when Redis client is added
// const checkRedis = async (): Promise<HealthCheck> => {
//   const start = Date.now();
//   try {
//     await redis.ping();
//     return {
//       status: 'pass',
//       latency_ms: Date.now() - start,
//     };
//   } catch (error) {
//     return {
//       status: 'fail',
//       message: error instanceof Error ? error.message : 'Redis unreachable',
//     };
//   }
// };

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic liveness probe (for Docker/k8s)
  fastify.get('/health', async (request, reply) => {
    const dbCheck = await checkDatabase();
    // const redisCheck = await checkRedis();

    const checks = {
      database: dbCheck,
      // redis: redisCheck,
    };

    // Determine overall status
    const allPassing = Object.values(checks).every(c => c.status === 'pass');
    const status: HealthStatus['status'] = allPassing ? 'healthy' : 'unhealthy';

    const response: HealthStatus = {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      checks,
    };

    // Return 503 if unhealthy (for load balancer/Docker health checks)
    if (status === 'unhealthy') {
      return reply.code(503).send(response);
    }

    return response;
  });

  // Kubernetes-style readiness probe (can serve traffic?)
  fastify.get('/health/ready', async (request, reply) => {
    const dbCheck = await checkDatabase();

    if (dbCheck.status === 'fail') {
      return reply.code(503).send({
        ready: false,
        reason: 'Database not available',
      });
    }

    return { ready: true };
  });

  // Kubernetes-style liveness probe (is process alive?)
  fastify.get('/health/live', async () => {
    return { alive: true };
  });

  // Real-time WebSocket connection status
  fastify.get('/health/realtime', async () => {
    // Count active WebSocket connections
    const connectionCount = fastify.io?.engine?.clientsCount ?? 0;

    return {
      websocket: {
        enabled: true,
        connections: connectionCount,
      },
    };
  });
};
