import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  environment: string;
  checks: {
    database: HealthCheck;
    redis?: HealthCheck;
    queue?: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'skip';
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

/**
 * Check Redis connectivity via QueueService
 * Returns 'skip' if Redis is not configured (development mode)
 */
const checkRedis = async (fastify: { queueService?: { isEnabled(): boolean; healthCheck(): Promise<{ ok: boolean; latencyMs: number }> } }): Promise<HealthCheck> => {
  // QueueService may not be registered yet during startup
  if (!fastify.queueService) {
    return { status: 'skip', message: 'Queue service not initialized' };
  }

  // Check if Redis is enabled (may be disabled in development)
  if (!fastify.queueService.isEnabled()) {
    return { status: 'skip', message: 'Redis not configured' };
  }

  const start = Date.now();
  try {
    const result = await fastify.queueService.healthCheck();
    return {
      status: result.ok ? 'pass' : 'fail',
      latency_ms: result.latencyMs,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Redis unreachable',
      latency_ms: Date.now() - start,
    };
  }
};

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Comprehensive health check (for monitoring dashboards)
  fastify.get('/health', async (request, reply) => {
    const [dbCheck, redisCheck] = await Promise.all([
      checkDatabase(),
      checkRedis(fastify),
    ]);

    const checks: HealthStatus['checks'] = {
      database: dbCheck,
    };

    // Only include Redis if it's configured
    if (redisCheck.status !== 'skip') {
      checks.redis = redisCheck;
    }

    // Determine overall status
    // Skip checks don't affect overall health (optional dependencies)
    const requiredChecks = [dbCheck];
    const optionalChecks = [redisCheck].filter(c => c.status !== 'skip');
    const allChecks = [...requiredChecks, ...optionalChecks];

    const allPassing = requiredChecks.every(c => c.status === 'pass');
    const anyFailing = allChecks.some(c => c.status === 'fail');
    const optionalFailing = optionalChecks.some(c => c.status === 'fail');

    let status: HealthStatus['status'];
    if (!allPassing) {
      status = 'unhealthy';
    } else if (optionalFailing) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const response: HealthStatus = {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
    };

    // Return 503 if unhealthy (for load balancer/Docker health checks)
    if (status === 'unhealthy') {
      return reply.code(503).send(response);
    }

    // Return 200 for healthy/degraded (service can still accept traffic)
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
