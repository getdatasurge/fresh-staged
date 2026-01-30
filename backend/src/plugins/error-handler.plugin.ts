import type { FastifyPluginAsync, FastifyError, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { ErrorCodes } from '../utils/errors.js';

/**
 * Global error handler plugin for production monitoring
 *
 * Features:
 * - Consistent error response format
 * - Structured error logging
 * - Zod validation error transformation
 * - Request context in error logs
 * - Sentry integration (when configured)
 */

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

// Sentry interface for optional integration
interface SentryLike {
  init(options: Record<string, unknown>): void;
  withScope(callback: (scope: SentryScope) => void): void;
  captureException(error: Error): void;
  close(timeout: number): Promise<boolean>;
}

interface SentryScope {
  setTag(key: string, value: string): void;
  setContext(name: string, context: Record<string, unknown> | null): void;
  setUser(user: { id: string; email?: string } | null): void;
}

// Check if Sentry is configured
const SENTRY_DSN = process.env.SENTRY_DSN;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Lazy load Sentry only if configured
let Sentry: SentryLike | null = null;
async function initSentry() {
  if (SENTRY_DSN && !Sentry) {
    try {
      // Dynamic import with explicit ignore for type checking
      // @ts-expect-error - @sentry/node is an optional dependency
      const sentryModule = await import('@sentry/node');
      Sentry = sentryModule as unknown as SentryLike;
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.npm_package_version || '1.0.0',
        // Sample rate for performance monitoring (optional)
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
        // Don't send PII by default
        sendDefaultPii: false,
      });
    } catch {
      // Sentry is optional - if import fails, continue without it
      console.warn('Sentry not available - error tracking disabled');
    }
  }
}

/**
 * Determine if error should be reported to error tracking
 */
function shouldReportError(error: Error | FastifyError): boolean {
  // Don't report 4xx client errors
  if ('statusCode' in error) {
    const statusCode = (error as FastifyError).statusCode || 500;
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  // Don't report validation errors
  if (error instanceof ZodError) {
    return false;
  }

  return true;
}

/**
 * Report error to Sentry (if configured)
 */
function reportToSentry(error: Error, request: FastifyRequest, context: Record<string, unknown>) {
  if (!Sentry || !shouldReportError(error)) {
    return;
  }

  const sentry = Sentry;
  sentry.withScope((scope: SentryScope) => {
    scope.setTag('request_id', request.id);
    scope.setTag('method', request.method);
    scope.setTag('url', request.url);
    scope.setContext('request', {
      method: request.method,
      url: request.url,
      headers: request.headers as Record<string, unknown>,
      params: request.params as Record<string, unknown>,
      query: request.query as Record<string, unknown>,
    });
    scope.setContext('extra', context);

    if (request.user) {
      scope.setUser({
        id: request.user.id,
        email: request.user.email,
      });
    }

    sentry.captureException(error);
  });
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  // Initialize Sentry if configured
  await initSentry();

  // Global error handler
  fastify.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const requestId = request.id;

    // Build error context for logging
    const errorContext = {
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      userId: request.user?.id,
      organizationId: request.user?.organizationId,
    };

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const zodErrors = error.issues;
      const response: ErrorResponse = {
        error: {
          code: ErrorCodes.INVALID_INPUT,
          message: 'Validation failed',
          requestId,
          details: zodErrors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      };

      request.log.warn({ ...errorContext, validation: zodErrors }, 'Validation error');
      return reply.code(400).send(response);
    }

    // Handle Fastify errors (with statusCode)
    if ('statusCode' in error) {
      const statusCode = error.statusCode || 500;
      const isServerError = statusCode >= 500;

      // Log server errors as error, client errors as warn
      if (isServerError) {
        request.log.error({ err: error, ...errorContext }, 'Server error');
        reportToSentry(error, request, errorContext);
      } else {
        request.log.warn({ err: error, ...errorContext }, 'Client error');
      }

      const response: ErrorResponse = {
        error: {
          code: error.code || (isServerError ? ErrorCodes.INTERNAL_ERROR : 'REQUEST_ERROR'),
          message: isServerError && IS_PRODUCTION ? 'An internal error occurred' : error.message,
          requestId,
        },
      };

      return reply.code(statusCode).send(response);
    }

    // Handle unexpected errors
    request.log.error({ err: error, ...errorContext }, 'Unexpected error');
    reportToSentry(error, request, errorContext);

    const response: ErrorResponse = {
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: IS_PRODUCTION ? 'An internal error occurred' : error.message,
        requestId,
      },
    };

    return reply.code(500).send(response);
  });

  // Log when request/response cycle completes
  fastify.addHook('onResponse', (request, reply, done) => {
    const responseTime = reply.elapsedTime;
    const statusCode = reply.statusCode;

    // Log slow requests as warnings
    if (responseTime > 3000) {
      request.log.warn(
        {
          responseTime,
          statusCode,
          method: request.method,
          url: request.url,
        },
        'Slow request',
      );
    }

    // Log 5xx errors
    if (statusCode >= 500) {
      request.log.error(
        {
          responseTime,
          statusCode,
          method: request.method,
          url: request.url,
        },
        'Request completed with server error',
      );
    }

    done();
  });

  // Handle uncaught exceptions (log and exit gracefully)
  if (IS_PRODUCTION) {
    process.on('uncaughtException', (error) => {
      fastify.log.fatal({ err: error }, 'Uncaught exception - shutting down');
      if (Sentry) {
        Sentry.captureException(error);
        // Flush Sentry events before exit
        Sentry.close(2000).then(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });

    process.on('unhandledRejection', (reason, promise) => {
      fastify.log.error({ reason, promise: promise.toString() }, 'Unhandled promise rejection');
      if (Sentry && reason instanceof Error) {
        Sentry.captureException(reason);
      }
    });
  }
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
