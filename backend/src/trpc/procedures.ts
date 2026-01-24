/**
 * Protected tRPC procedures with authentication middleware
 *
 * These procedures enforce authentication and authorization:
 * - protectedProcedure: Requires valid JWT token
 * - orgProcedure: Requires JWT + organization membership
 */

import { TRPCError } from '@trpc/server';
import { middleware, publicProcedure } from './index.js';
import { userService } from '../services/index.js';
import type { AuthUser } from '../types/auth.js';

/**
 * Authentication middleware
 * Checks that user exists in context (JWT was valid)
 */
const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  // Narrow user type to non-null
  return next({
    ctx: {
      ...ctx,
      user: ctx.user as AuthUser,
    },
  });
});

/**
 * Protected procedure - requires authentication
 *
 * Use for endpoints that need a logged-in user but don't need
 * organization context (e.g., user preferences, profile)
 */
export const protectedProcedure = publicProcedure.use(isAuthed);

/**
 * Organization membership middleware
 * Checks that user has access to the organization in input.organizationId
 *
 * IMPORTANT: Procedures using this MUST include organizationId in their input schema
 * This middleware assumes user is authenticated (used after protectedProcedure)
 */
const hasOrgAccess = middleware(async ({ ctx, input, next }) => {
  // User is guaranteed to be non-null when used with protectedProcedure
  const user = ctx.user as AuthUser;

  // Input should have organizationId (enforced by procedure schema)
  const { organizationId } = input as { organizationId: string };

  if (!organizationId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'organizationId is required',
    });
  }

  // Check user has role in this organization
  const role = await userService.getUserRoleInOrg(user.id, organizationId);

  if (!role) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Not a member of this organization',
    });
  }

  // Get or create profile
  const { id: profileId } = await userService.getOrCreateProfile(
    user.id,
    organizationId,
    user.email,
    user.name
  );

  // Attach organization context to ctx.user
  return next({
    ctx: {
      ...ctx,
      user: {
        ...user,
        organizationId,
        role,
        profileId,
      },
    },
  });
});

/**
 * Organization-scoped procedure - requires authentication + org membership
 *
 * Use for all organization-scoped endpoints. Automatically verifies membership
 * and attaches organizationId, role, and profileId to context.
 *
 * Your input schema MUST include organizationId field.
 */
export const orgProcedure = protectedProcedure.use(hasOrgAccess);
