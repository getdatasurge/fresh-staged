/**
 * Authentication middleware for JWT validation
 *
 * This middleware implements the requireAuth preHandler hook that:
 * - Validates JWT tokens from Authorization header
 * - Populates request.user with authenticated user info
 * - Returns 401 for missing/invalid/expired tokens
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import type { AuthUser } from '../types/auth.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Require authentication middleware
 *
 * Validates JWT access token from Authorization header and populates
 * request.user with basic user information (id, email, name).
 *
 * Profile lookup and organization context are handled by separate middleware.
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws Returns 401 if token is missing, invalid, or expired
 *
 * @example
 * ```typescript
 * // Protect a route with authentication
 * fastify.get('/protected', {
 *   preHandler: [requireAuth]
 * }, async (request, reply) => {
 *   const userId = request.user.id;
 *   return { message: 'Authenticated' };
 * });
 * ```
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Extract token from Authorization header OR x-stack-access-token header
  // Stack Auth React SDK sends tokens via x-stack-access-token
  const authHeader = request.headers.authorization;
  const stackAccessToken = request.headers['x-stack-access-token'];

  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Standard Authorization: Bearer <token>
    token = authHeader.slice(7);
  } else if (typeof stackAccessToken === 'string') {
    // Stack Auth header: x-stack-access-token: <token>
    token = stackAccessToken;
  }

  if (!token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  try {
    // Verify token with Stack Auth JWKS
    const { payload, userId } = await verifyAccessToken(token);

    // Populate request.user with basic user info
    const user: AuthUser = {
      id: userId,
      email: payload.email,
      name: payload.name,
    };

    request.user = user;
  } catch (error) {
    // Handle specific JWT errors
    let message = 'Invalid token';

    if (error instanceof jose.errors.JWTExpired) {
      message = 'Token expired';
    } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
      message = 'Invalid token claims';
    } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      message = 'Invalid token signature';
    }

    return reply.status(401).send({
      error: 'Unauthorized',
      message,
    });
  }
}
