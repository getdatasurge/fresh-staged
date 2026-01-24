import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import authPlugin from './plugins/auth.plugin.js';
import { requireAuth, requireOrgContext, requireRole } from './middleware/index.js';
import { healthRoutes } from './routes/health.js';
import authRoutes from './routes/auth.js';
import organizationRoutes from './routes/organizations.js';
import siteRoutes from './routes/sites.js';
import areaRoutes from './routes/areas.js';
import unitRoutes from './routes/units.js';
import readingsRoutes from './routes/readings.js';
import alertRoutes from './routes/alerts.js';

export interface AppOptions {
  logger?: boolean;
}

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? false,
  });

  // Enable CORS for frontend
  app.register(cors, {
    origin: [
      'http://localhost:8080',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
      /^http:\/\/172\.\d+\.\d+\.\d+:\d+$/, // WSL IP addresses
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-stack-access-token', 'x-stack-refresh-token'],
  });

  // Configure Zod validation and serialization
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
