/**
 * Fastify type augmentations for authentication
 *
 * This module extends Fastify's FastifyRequest interface to include
 * the authenticated user context populated by auth middleware.
 */

import type { AuthUser } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Authenticated user context
     * Populated by requireAuth middleware after JWT verification
     * and profile lookup
     */
    user?: AuthUser;
  }
}
