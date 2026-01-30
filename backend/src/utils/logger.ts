import type { FastifyServerOptions, FastifyRequest } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

/**
 * Production-ready structured logging configuration for Fastify/Pino
 *
 * Features:
 * - JSON format in production for log aggregation
 * - Pretty printing in development
 * - Request ID correlation
 * - Sensitive data redaction
 * - Log level configuration via environment
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Fields to redact from logs (prevents sensitive data exposure)
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-stack-access-token"]',
  'req.headers["x-stack-refresh-token"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'apiKey',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
];

/**
 * Get Pino logger configuration based on environment
 */
export function getLoggerConfig(): PinoLoggerOptions {
  const baseConfig: PinoLoggerOptions = {
    level: LOG_LEVEL,
    // Add service name for log aggregation filtering
    name: 'freshtrack-api',
    // Redact sensitive fields
    redact: REDACT_PATHS,
    // Custom serializers for consistent log format
    serializers: {
      req(request: unknown) {
        const req = request as {
          method?: string;
          url?: string;
          routerPath?: string;
          params?: unknown;
          headers?: unknown;
        };
        return {
          method: req.method,
          url: req.url,
          path: req.routerPath || req.url,
          parameters: req.params,
          headers: req.headers,
        };
      },
      res(reply: unknown) {
        const res = reply as { statusCode?: number };
        return {
          statusCode: res.statusCode,
        };
      },
      err(error: unknown) {
        const err = error as {
          constructor?: { name?: string };
          message?: string;
          stack?: string;
          code?: string;
        };
        return {
          type: err.constructor?.name || 'Error',
          message: err.message,
          stack: err.stack,
          code: err.code,
        };
      },
    },
  };

  if (IS_PRODUCTION) {
    // Production: JSON format for log aggregation (ELK, Datadog, CloudWatch, etc.)
    return {
      ...baseConfig,
      // ISO timestamp format for consistent parsing
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
    };
  }

  // Development: Pretty printing for human readability
  return {
    ...baseConfig,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  };
}

/**
 * Fastify logger configuration (includes request logging and ID generation)
 */
export function getFastifyLoggerConfig(): NonNullable<FastifyServerOptions['logger']> {
  const config = getLoggerConfig();

  return {
    ...config,
    // Generate unique request ID for correlation
    genReqId: (request: FastifyRequest) => {
      // Use existing request ID from load balancer/proxy if present
      const existingId = request.headers['x-request-id'] || request.headers['x-correlation-id'];
      if (existingId && typeof existingId === 'string') {
        return existingId;
      }
      // Generate new UUID-like ID
      return `req-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    },
  };
}

/**
 * Log levels and their usage:
 * - fatal: System is unusable (immediate action required)
 * - error: Error events (something failed, investigate)
 * - warn: Warning conditions (unusual but not error)
 * - info: Normal operations (start, stop, config changes)
 * - debug: Detailed debugging info (not for production)
 * - trace: Very detailed tracing (performance impact)
 */
export const LogLevels = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
} as const;

/**
 * Helper to create structured log context
 */
export function createLogContext(context: Record<string, unknown>) {
  return {
    ...context,
    timestamp: new Date().toISOString(),
  };
}
