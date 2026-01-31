import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { areas, sites, units, type InsertSite, type Site } from '../db/schema/hierarchy.js';

/**
 * List all active sites in an organization with counts
 */
export async function listSitesWithStats(organizationId: string): Promise<any[]> {
  return db
    .select({
      id: sites.id,
      organizationId: sites.organizationId,
      name: sites.name,
      address: sites.address,
      city: sites.city,
      state: sites.state,
      postalCode: sites.postalCode,
      country: sites.country,
      timezone: sites.timezone,
      complianceMode: sites.complianceMode,
      manualLogCadenceSeconds: sites.manualLogCadenceSeconds,
      correctiveActionRequired: sites.correctiveActionRequired,
      latitude: sites.latitude,
      longitude: sites.longitude,
      isActive: sites.isActive,
      createdAt: sites.createdAt,
      updatedAt: sites.updatedAt,
      areasCount:
        sql<number>`COUNT(DISTINCT ${areas.id}) FILTER (WHERE ${areas.isActive} = true)`.mapWith(
          Number,
        ),
      unitsCount:
        sql<number>`COUNT(DISTINCT ${units.id}) FILTER (WHERE ${units.isActive} = true)`.mapWith(
          Number,
        ),
    })
    .from(sites)
    .leftJoin(areas, eq(areas.siteId, sites.id))
    .leftJoin(units, eq(units.areaId, areas.id))
    .where(and(eq(sites.organizationId, organizationId), eq(sites.isActive, true)))
    .groupBy(sites.id)
    .orderBy(sites.name);
}

/**
 * List all active sites in an organization
 * Silent filtering - only returns sites user has access to
 */
export async function listSites(organizationId: string): Promise<Site[]> {
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.organizationId, organizationId), eq(sites.isActive, true)))
    .orderBy(sites.name);
}

/**
 * Get a specific site by ID within an organization
 */
export async function getSite(siteId: string, organizationId: string): Promise<Site | null> {
  const [site] = await db
    .select()
    .from(sites)
    .where(
      and(eq(sites.id, siteId), eq(sites.organizationId, organizationId), eq(sites.isActive, true)),
    )
    .limit(1);

  return site ?? null;
}

/**
 * Create a new site in an organization
 */
export async function createSite(
  organizationId: string,
  data: Omit<InsertSite, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'isActive'>,
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
  data: Partial<Omit<InsertSite, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>,
): Promise<Site | null> {
  const [site] = await db
    .update(sites)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sites.id, siteId), eq(sites.organizationId, organizationId), eq(sites.isActive, true)),
    )
    .returning();

  return site ?? null;
}

/**
 * Soft delete a site (sets isActive = false)
 * Note: This cascades to areas, units via database constraints
 */
export async function deleteSite(siteId: string, organizationId: string): Promise<Site | null> {
  const [site] = await db
    .update(sites)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sites.id, siteId), eq(sites.organizationId, organizationId), eq(sites.isActive, true)),
    )
    .returning();

  return site ?? null;
}

/**
 * Restore a soft-deleted site (sets isActive = true)
 */
export async function restoreSite(siteId: string, organizationId: string): Promise<Site | null> {
  const [site] = await db
    .update(sites)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sites.id, siteId),
        eq(sites.organizationId, organizationId),
        eq(sites.isActive, false),
      ),
    )
    .returning();

  return site ?? null;
}

/**
 * Permanently delete a site
 */
export async function permanentlyDeleteSite(
  siteId: string,
  organizationId: string,
): Promise<Site | null> {
  const [site] = await db
    .delete(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, organizationId)))
    .returning();

  return site ?? null;
}
