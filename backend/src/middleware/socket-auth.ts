/**
 * Socket.io authentication middleware
 *
 * Validates JWT tokens for WebSocket connections and populates socket.data
 * with authenticated user context.
 *
 * This middleware intercepts all connection attempts and:
 * 1. Extracts JWT token from socket.handshake.auth.token
 * 2. Verifies token using existing Stack Auth JWT verification
 * 3. Populates socket.data with user context (userId, organizationId, role, email)
 * 4. Rejects connections with invalid/missing tokens
 *
 * Usage:
 * ```typescript
 * import { setupSocketAuth } from './middleware/socket-auth.js';
 * setupSocketAuth(io);
 * ```
 */

import type { Server as SocketIOServer } from 'socket.io';
import * as jose from 'jose';
import { verifyAccessToken } from '../utils/jwt.js';
import { userService } from '../services/index.js';

/**
 * Setup Socket.io authentication middleware
 *
 * Registers an io.use() middleware that validates JWT tokens for all
 * incoming WebSocket connections. Connections without valid tokens are
 * rejected with clear error messages.
 *
 * The middleware populates socket.data with:
 * - userId: Stack Auth user ID (from JWT sub claim)
 * - organizationId: User's current organization context
 * - role: User's role in the organization
 * - email: User email address
 *
 * @param io - Socket.io server instance
 *
 * @example
 * ```typescript
 * const io = new Server(fastify.server);
 * setupSocketAuth(io);
 *
 * io.on('connection', (socket) => {
 *   console.log('User connected:', socket.data.userId);
 *   console.log('Organization:', socket.data.organizationId);
 *   console.log('Role:', socket.data.role);
 * });
 * ```
 */
export function setupSocketAuth(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    try {
      // Extract token from handshake auth object
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT using existing Stack Auth verification
      const { payload, userId } = await verifyAccessToken(token);

      // Get user's primary organization (first role record)
      // In future, client can send organizationId in auth object
      // For now, use the first organization the user belongs to
      const userOrganization = await userService.getUserPrimaryOrganization(userId);

      if (!userOrganization) {
        return next(new Error('User has no organization access'));
      }

      // Get or create user profile for this organization
      const profile = await userService.getOrCreateProfile(
        userId,
        userOrganization.organizationId,
        payload.email,
        payload.name,
      );

      // Populate socket.data with authenticated user context
      socket.data.userId = userId;
      socket.data.organizationId = userOrganization.organizationId;
      socket.data.role = userOrganization.role;
      socket.data.email = payload.email || '';
      socket.data.profileId = profile.id;

      // Authentication successful, allow connection
      next();
    } catch (error) {
      // Handle JWT verification errors
      if (error instanceof jose.errors.JWTExpired) {
        return next(new Error('Token expired'));
      } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
        return next(new Error('Invalid token claims'));
      } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        return next(new Error('Invalid token signature'));
      } else if (error instanceof jose.errors.JWTInvalid) {
        return next(new Error('Invalid or malformed token'));
      }

      // Generic error for unexpected issues
      return next(new Error('Invalid or expired token'));
    }
  });
}
