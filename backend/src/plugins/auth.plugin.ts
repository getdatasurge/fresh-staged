/**
 * Authentication plugin for Fastify
 *
 * This plugin decorates Fastify requests with a user property that will be
 * populated by the requireAuth middleware when a valid JWT token is verified.
 *
 * The null decoration preserves V8 object shape optimization by ensuring all
 * request objects have the same property structure from startup.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/**
 * Auth plugin that decorates request with user property
 *
 * @param fastify - Fastify instance
 */
async function authPlugin(fastify: FastifyInstance): Promise<void> {
  // Decorate request with user property (undefined until JWT verification)
  // This preserves V8 object shape optimization
  fastify.decorateRequest('user', undefined);
}

/**
 * Export as fastify-plugin wrapped function
 *
 * The fp wrapper ensures this plugin is registered at the root level
 * and runs once at startup, not on every request.
 */
export default fp(authPlugin, {
  name: 'auth-plugin',
  dependencies: [],
});
