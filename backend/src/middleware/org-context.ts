import type { FastifyRequest, FastifyReply } from 'fastify';
import { userService } from '../services/index.js';

/**
 * UUID validation regex (RFC 4122 compliant)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Organization context middleware
 *
 * Validates that the authenticated user has access to the requested organization
 * by checking their role membership in the organization.
 *
 * Flow:
 * 1. Extract organizationId from route params (/api/orgs/:organizationId/...)
 * 2. Query userRoles table to verify user is a member of this organization
 * 3. If member: attach organizationId and role to request.user
 * 4. If not member: return 403 Forbidden
 *
 * This middleware MUST be used after requireAuth middleware.
 *
 * Usage:
 * ```typescript
 * fastify.get('/orgs/:organizationId/units', {
 *   preHandler: [requireAuth, requireOrgContext],
 * }, handler);
 * ```
 *
 * After this middleware runs:
 * - request.user.organizationId is set to the validated organization ID
 * - request.user.role is set to the user's role in that organization
 *
 * @param request - Fastify request with organizationId in params
 * @param reply - Fastify reply
 */
export async function requireOrgContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Check authentication
  if (!request.user) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Extract organizationId from route params
  const { organizationId } = request.params as { organizationId?: string };

  // Validate organizationId exists
  if (!organizationId) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Organization ID required in path',
    });
    return;
  }

  // Validate UUID format
  if (!UUID_REGEX.test(organizationId)) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid organization ID format',
    });
    return;
  }

  // Look up user's role in this organization
  const role = await userService.getUserRoleInOrg(request.user.id, organizationId);

  // If user is not a member of this organization, deny access
  if (role === null) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'No access to this organization',
    });
    return;
  }

  // Get or create user profile (ensures profileId is available)
  const profile = await userService.getOrCreateProfile(
    request.user.id,
    organizationId,
    request.user.email,
    request.user.name,
  );

  // Attach organization context to request.user
  request.user.organizationId = organizationId;
  request.user.role = role;
  request.user.profileId = profile.id;
}
