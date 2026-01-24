/**
 * Role-Based Access Control (RBAC) middleware
 * Enforces role hierarchy and permission checking
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { AppRole } from '../types/auth.js';

/**
 * Role hierarchy mapping (higher number = more permissions)
 * This enforces the role hierarchy: owner > admin > manager > staff > viewer
 */
export const ROLE_HIERARCHY = {
  viewer: 1,
  staff: 2,
  manager: 3,
  admin: 4,
  owner: 5,
} as const;

/**
 * Re-export AppRole type for convenience
 * Allows single import location for RBAC functionality
 */
export type { AppRole } from '../types/auth.js';

/**
 * Creates a preHandler hook that enforces minimum role requirement
 * Higher roles automatically satisfy lower role requirements (e.g., owner can access admin-only routes)
 *
 * @param minimumRole - The minimum role required to access the route
 * @returns Fastify preHandler hook that validates user role
 *
 * @example
 * fastify.get('/admin/users',
 *   { preHandler: requireRole('admin') },
 *   async (request, reply) => { ... }
 * )
 */
export function requireRole(minimumRole: AppRole): preHandlerHookHandler {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Check authentication
    if (!request.user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Check organization context (requires org-context middleware to run first)
    if (!request.user.organizationId || !request.user.role) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Organization context required',
      });
    }

    // Get role hierarchy levels
    const userLevel = ROLE_HIERARCHY[request.user.role as AppRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole];

    // Enforce hierarchy (higher role level satisfies lower requirements)
    if (userLevel < requiredLevel) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `This action requires ${minimumRole} role or higher`,
      });
    }

    // Role check passed - continue to route handler
  };
}

/**
 * Convenience exports for common role requirements
 * These are preconfigured requireRole() calls for each role level
 */

/** Requires viewer role or higher (all authenticated org users) */
export const requireViewer = requireRole('viewer');

/** Requires staff role or higher (staff, manager, admin, owner) */
export const requireStaff = requireRole('staff');

/** Requires manager role or higher (manager, admin, owner) */
export const requireManager = requireRole('manager');

/** Requires admin role or higher (admin, owner) */
export const requireAdmin = requireRole('admin');

/** Requires owner role (highest privilege level) */
export const requireOwner = requireRole('owner');
