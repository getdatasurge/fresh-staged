import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sites, type Site, type InsertSite } from '../db/schema/hierarchy.js';

/**
 * List all active sites in an organization
 * Silent filtering - only returns sites user has access to
 */
export async function listSites(organizationId: string): Promise<Site[]> {
  return db
    .select()
    .from(sites)
    .where(and(
      eq(sites.organizationId, organizationId),
      eq(sites.isActive, true)
    ))
    .orderBy(sites.name);
}

/**
 * Get a specific site by ID within an organization
 */
export async function getSite(
  siteId: string,
  organizationId: string
): Promise<Site | null> {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(
      eq(sites.id, siteId),
      eq(sites.organizationId, organizationId),
      eq(sites.isActive, true)
    ))
    .limit(1);

  return site ?? null;
}

/**
 * Create a new site in an organization
 */
export async function createSite(
  organizationId: string,
  data: Omit<InsertSite, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'isActive'>
): Promise<Site> {
  const [site] = await db
    .insert(sites)
    .values({
      ...data,
      organizationId,
    })
    .returning();

  return site;
}

/**
 * Update an existing site
 */
export async function updateSite(
  siteId: string,
  organizationId: string,
  data: Partial<Omit<InsertSite, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>
): Promise<Site | null> {
  const [site] = await db
    .update(sites)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(
      eq(sites.id, siteId),
      eq(sites.organizationId, organizationId),
      eq(sites.isActive, true)
    ))
    .returning();

  return site ?? null;
}

/**
 * Soft delete a site (sets isActive = false)
 * Note: This cascades to areas, units via database constraints
 */
export async function deleteSite(
  siteId: string,
  organizationId: string
): Promise<Site | null> {
  const [site] = await db
    .update(sites)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(
      eq(sites.id, siteId),
      eq(sites.organizationId, organizationId),
      eq(sites.isActive, true)
    ))
    .returning();

  return site ?? null;
}
