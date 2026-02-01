import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, type Organization, type InsertOrganization } from '../db/schema/tenancy.js';
import { userRoles, profiles } from '../db/schema/users.js';
import type { AppRole } from '../types/auth.js';

/**
 * Get organization by ID
 */
export async function getOrganization(
  organizationId: string
): Promise<Organization | null> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return org ?? null;
}

/**
 * Update organization settings
 * Only updatable fields are included
 */
export async function updateOrganization(
  organizationId: string,
  data: Partial<{
    name: string;
    timezone: string;
    complianceMode: 'standard' | 'haccp';
    logoUrl: string | null;
  }>
): Promise<Organization | null> {
  const [org] = await db
    .update(organizations)
    .set(data)
    .where(eq(organizations.id, organizationId))
    .returning();

  return org ?? null;
}

/**
 * List organization members with their roles
 */
export async function listMembers(
  organizationId: string
): Promise<Array<{
  userId: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  joinedAt: Date;
}>> {
  // Join userRoles with profiles to get member info
  const members = await db
    .select({
      userId: userRoles.userId,
      email: profiles.email,
      fullName: profiles.fullName,
      role: userRoles.role,
      joinedAt: userRoles.createdAt,
    })
    .from(userRoles)
    .leftJoin(profiles, and(
      eq(profiles.userId, userRoles.userId),
      eq(profiles.organizationId, userRoles.organizationId)
    ))
    .where(eq(userRoles.organizationId, organizationId))
    .orderBy(userRoles.createdAt);

  return members.map(m => ({
    userId: m.userId,
    email: m.email ?? '',
    fullName: m.fullName,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}
