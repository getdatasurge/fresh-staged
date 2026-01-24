/**
 * tRPC context creation
 *
 * Context is created for each request and contains:
 * - req/res: Fastify request/response objects
 * - user: Authenticated user (if JWT token provided)
 */

import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import type { AuthUser } from '../types/auth.js';

/**
 * Create tRPC context from Fastify request
 *
 * Extracts JWT token from headers and verifies it to populate user context.
 * Supports two auth header formats:
 * 1. x-stack-access-token: <token>
 * 2. Authorization: Bearer <token>
 *
 * @param req - Fastify request object
 * @param res - Fastify response object
 * @returns Context with user (if authenticated) and request/response objects
 */
export async function createContext({ req, res }: CreateFastifyContextOptions) {
  // Extract token from headers (same logic as requireAuth middleware)
  const customToken = req.headers['x-stack-access-token'];
  const authHeader = req.headers.authorization;

  let token: string | undefined;

  if (customToken && typeof customToken === 'string') {
    token = customToken;
  } else if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  // Verify token and build user object if present
  let user: AuthUser | null = null;

  if (token) {
    try {
      const { payload, userId } = await verifyAccessToken(token);
      user = {
        id: userId,
        email: payload.email,
        name: payload.name,
      };
    } catch (error) {
      // Invalid token - user remains null
      // Client will get UNAUTHORIZED error if they hit protected procedure
    }
  }

  return {
    req,
    res,
    user,
  };
}

/**
 * Context type derived from createContext return value
 * This is used throughout tRPC for type safety
 */
export type Context = Awaited<ReturnType<typeof createContext>>;
