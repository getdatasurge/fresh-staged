/**
 * Auth routes for user identity and profile management
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getUserRoleInOrg } from '../services/user.service.js';
import { db } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { userRoles } from '../db/schema/users.js';

interface AuthMeResponse {
  userId: string;
  email: string | null;
  displayName: string | null;
  primaryOrganizationId: string | null;
  organizations: Array<{
    organizationId: string;
    role: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
  }>;
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/auth/me - Get current user's profile and org context
   *
   * Returns the authenticated user's profile along with their organization
   * memberships and roles. This is the primary endpoint for identity resolution
   * on the frontend.
   */
  fastify.get(
    '/me',
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Query user's organization memberships from userRoles table
      const memberships = await db
        .select({
          organizationId: userRoles.organizationId,
          role: userRoles.role,
        })
        .from(userRoles)
        .where(eq(userRoles.userId, user.id));

      const organizations = memberships.map((m) => ({
        organizationId: m.organizationId,
        role: m.role as 'owner' | 'admin' | 'manager' | 'staff' | 'viewer',
      }));

      // Primary org is the first organization (could be made configurable later)
      const primaryOrganizationId = organizations[0]?.organizationId ?? null;

      return {
        userId: user.id,
        email: user.email ?? null,
        displayName: user.name ?? null,
        primaryOrganizationId,
        organizations,
      };
    },
  );
};

export default authRoutes;
