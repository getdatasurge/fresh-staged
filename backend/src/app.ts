import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { getFastifyLoggerConfig } from './utils/logger.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';
import authPlugin from './plugins/auth.plugin.js';
import socketPlugin from './plugins/socket.plugin.js';
import queuePlugin from './plugins/queue.plugin.js';
import { emailPlugin } from './plugins/email.plugin.js';
import { requireAuth, requireOrgContext, requireRole } from './middleware/index.js';
import { healthRoutes } from './routes/health.js';
import authRoutes from './routes/auth.js';
import organizationRoutes from './routes/organizations.js';
import siteRoutes from './routes/sites.js';
import areaRoutes from './routes/areas.js';
import unitRoutes from './routes/units.js';
import readingsRoutes from './routes/readings.js';
import alertRoutes from './routes/alerts.js';
import ttnDeviceRoutes from './routes/ttn-devices.js';
import ttnGatewayRoutes from './routes/ttn-gateways.js';
import ttnWebhookRoutes from './routes/ttn-webhooks.js';
import stripeWebhookRoutes from './routes/stripe-webhooks.js';
import telnyxWebhookRoutes from './routes/telnyx-webhooks.js';
import paymentRoutes from './routes/payments.js';
import smsConfigRoutes from './routes/sms-config.js';
import preferencesRoutes from './routes/preferences.js';
import assetRoutes from './routes/assets.js';
import availabilityRoutes from './routes/availability.js';
import devRoutes from './routes/dev.js';
import { adminRoutes } from './routes/admin.js';

export interface AppOptions {
  logger?: boolean;
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  // Use structured JSON logging configuration
  const loggerConfig = opts.logger ? getFastifyLoggerConfig() : false;

  const app = Fastify({
    logger: loggerConfig,
    // Add request ID header to responses for correlation
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Enable CORS for frontend
  // In production, use CORS_ORIGINS env var (comma-separated list)
  // In development, allow localhost origins
  const corsOrigins: (string | RegExp)[] = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:8080',
        'http://localhost:5173',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:5173',
        /^http:\/\/172\.\d+\.\d+\.\d+:\d+$/, // WSL IP addresses
      ];

  app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-stack-access-token', 'x-stack-refresh-token'],
  });

  // Register rate limiting for auth endpoints protection
  // Uses RATE_LIMIT_WINDOW (ms) and RATE_LIMIT_MAX from env, with sensible defaults
  const rateLimitWindow = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10);
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
  app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: rateLimitWindow,
    // More restrictive limits for auth endpoints to prevent brute force
    keyGenerator: (request) => {
      // Use IP + user agent for rate limit key
      return `${request.ip}-${request.headers['user-agent'] || 'unknown'}`;
    },
    // Skip rate limiting for health checks
    allowList: (request) => {
      return request.url.startsWith('/health');
    },
  });

  // Register multipart plugin for file uploads (5MB limit)
  app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });

  // Configure Zod validation and serialization
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register global error handler (includes Sentry integration if configured)
  app.register(errorHandlerPlugin);

  // Register Socket.io plugin (must be registered before routes)
  app.register(socketPlugin, {
    cors: {
      origin: corsOrigins as (string | RegExp)[],
      credentials: true,
    },
  });

  // Register Queue plugin for background job processing
  app.register(queuePlugin);

  // Register Email plugin for email delivery
  app.register(emailPlugin);

  // Register auth plugin (decorates request.user)
  app.register(authPlugin);

  // Health check routes (no auth required - before auth middleware)
  app.register(healthRoutes);

  // Register API routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(organizationRoutes, { prefix: '/api/orgs' });
  app.register(siteRoutes, { prefix: '/api/orgs/:organizationId/sites' });
  app.register(areaRoutes, { prefix: '/api/orgs/:organizationId/sites/:siteId/areas' });
  app.register(unitRoutes, { prefix: '/api/orgs/:organizationId/sites/:siteId/areas/:areaId/units' });

  // Register readings routes (ingest and query endpoints)
  app.register(readingsRoutes, { prefix: '/api' });

  // Register alert routes
  app.register(alertRoutes, { prefix: '/api/orgs/:organizationId/alerts' });

  // Register TTN device routes
  app.register(ttnDeviceRoutes, { prefix: '/api/orgs/:organizationId/ttn/devices' });

  // Register TTN gateway routes
  app.register(ttnGatewayRoutes, { prefix: '/api/orgs/:organizationId/ttn/gateways' });

  // Register TTN webhook routes (receives uplink messages from TTN)
  app.register(ttnWebhookRoutes, { prefix: '/api/webhooks/ttn' });

  // Register Stripe webhook routes (receives events from Stripe)
  app.register(stripeWebhookRoutes, { prefix: '/api/webhooks/stripe' });

  // Register Telnyx webhook routes (receives SMS delivery status from Telnyx)
  app.register(telnyxWebhookRoutes, { prefix: '/api/webhooks/telnyx' });

  // Register payment routes
  app.register(paymentRoutes, { prefix: '/api/orgs/:organizationId/payments' });

  // Register SMS config routes (Telnyx SMS alerting configuration)
  app.register(smsConfigRoutes, { prefix: '/api/orgs/:organizationId/alerts/sms/config' });

  // Register user preferences routes (digest settings, notification preferences)
  app.register(preferencesRoutes, { prefix: '/api/preferences' });

  // Register asset upload routes (images for sites, units, etc.)
  app.register(assetRoutes, { prefix: '/api/orgs/:organizationId/assets' });

  // Register availability check routes (public, no auth required)
  app.register(availabilityRoutes, { prefix: '/api/availability' });

  // Register development routes (simulation, testing utilities - dev mode only)
  app.register(devRoutes, { prefix: '/api/dev' });

  // Register admin routes (includes Bull Board dashboard and health checks)
  app.register(adminRoutes, { prefix: '/api/admin' });

  // Example protected route for testing
  app.get('/api/protected', {
    preHandler: [requireAuth],
  }, async (request) => {
    return { userId: request.user!.id, email: request.user!.email };
  });

  // Example org-scoped route for testing
  app.get<{ Params: { organizationId: string } }>(
    '/api/orgs/:organizationId/test',
    {
      preHandler: [requireAuth, requireOrgContext],
    },
    async (request) => {
      return {
        userId: request.user!.id,
        organizationId: request.user!.organizationId,
        role: request.user!.role,
      };
    }
  );

  // Example admin-only route for testing
  app.delete<{ Params: { organizationId: string; userId: string } }>(
    '/api/orgs/:organizationId/users/:userId',
    {
      preHandler: [requireAuth, requireOrgContext, requireRole('admin')],
    },
    async (request) => {
      return { deleted: true };
    }
  );

  return app;
}

export default buildApp;
