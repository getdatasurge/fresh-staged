import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles, userRoles } from '../db/schema/users.js';
import type { AppRole } from '../types/auth.js';

/**
 * Get or create a user profile
 *
 * PRECONDITION: This function is ONLY called after requireOrgContext has verified
 * that the user has a userRoles record for this organization (i.e., they were invited
 * and accepted). It is NOT called for users who have no org membership.
 *
 * @param stackAuthUserId - Stack Auth user ID (from JWT sub claim)
 * @param organizationId - Organization the user is accessing (they must already be a member)
 * @param email - User email address (optional)
 * @param name - User display name (optional)
 * @returns Profile ID and whether it was newly created
 */
export async function getOrCreateProfile(
  stackAuthUserId: string,
  organizationId: string,
  email?: string,
  name?: string
): Promise<{ id: string; isNew: boolean }> {
  // Check for existing profile by Stack Auth user ID
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, stackAuthUserId))
    .limit(1);

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Create new profile
  // Note: The user must already have a userRoles record for this org
  // (checked by requireOrgContext before this function is called)
  const [created] = await db
    .insert(profiles)
    .values({
      userId: stackAuthUserId,
      organizationId,
      email: email || '',
      fullName: name,
    })
    .returning({ id: profiles.id });

  return { id: created.id, isNew: true };
}

/**
 * Get user's role in a specific organization
 *
 * @param stackAuthUserId - Stack Auth user ID (from JWT sub claim)
 * @param organizationId - Organization ID to check membership
 * @returns User's role in the organization, or null if not a member
 */
export async function getUserRoleInOrg(
  stackAuthUserId: string,
  organizationId: string
): Promise<AppRole | null> {
  const [role] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, stackAuthUserId),
        eq(userRoles.organizationId, organizationId)
      )
    )
    .limit(1);

  return role?.role || null;
}

/**
 * Get profile by Stack Auth user ID
 * Helper function for auth middleware
 *
 * @param stackAuthUserId - Stack Auth user ID (from JWT sub claim)
 * @returns Profile ID and organization ID, or null if not found
 */
export async function getProfileByUserId(
  stackAuthUserId: string
): Promise<{ id: string; organizationId: string } | null> {
  const [profile] = await db
    .select({
      id: profiles.id,
      organizationId: profiles.organizationId,
    })
    .from(profiles)
    .where(eq(profiles.userId, stackAuthUserId))
    .limit(1);

  return profile || null;
}
