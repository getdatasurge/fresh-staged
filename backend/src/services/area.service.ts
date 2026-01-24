import { eq, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { areas, sites, type Area, type InsertArea } from '../db/schema/hierarchy.js';

/**
 * Verify that a site belongs to an organization
 * This prevents BOLA attacks by ensuring hierarchy integrity
 */
async function verifySiteAccess(
  siteId: string,
  organizationId: string
): Promise<boolean> {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(
      eq(sites.id, siteId),
      eq(sites.organizationId, organizationId),
      eq(sites.isActive, true)
    ))
    .limit(1);

  return !!site;
}

/**
 * List all active areas in a site
 * Silent filtering - only returns areas user has access to
 */
export async function listAreas(
  siteId: string,
  organizationId: string
): Promise<Area[]> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return [];
  }

  return db
    .select()
    .from(areas)
    .where(and(
      eq(areas.siteId, siteId),
      eq(areas.isActive, true)
    ))
    .orderBy(areas.sortOrder, areas.name);
}

/**
 * Get a specific area by ID within a site
 */
export async function getArea(
  areaId: string,
  siteId: string,
  organizationId: string
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .select()
    .from(areas)
    .where(and(
      eq(areas.id, areaId),
      eq(areas.siteId, siteId),
      eq(areas.isActive, true)
    ))
    .limit(1);

  return area ?? null;
}

/**
 * Create a new area in a site
 */
export async function createArea(
  siteId: string,
  organizationId: string,
  data: Omit<InsertArea, 'id' | 'siteId' | 'createdAt' | 'updatedAt' | 'isActive'>
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .insert(areas)
    .values({
      ...data,
      siteId,
    })
    .returning();

  return area;
}

/**
 * Update an existing area
 */
export async function updateArea(
  areaId: string,
  siteId: string,
  organizationId: string,
  data: Partial<Omit<InsertArea, 'id' | 'siteId' | 'createdAt' | 'updatedAt'>>
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .update(areas)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(
      eq(areas.id, areaId),
      eq(areas.siteId, siteId),
      eq(areas.isActive, true)
    ))
    .returning();

  return area ?? null;
}

/**
 * Soft delete an area (sets isActive = false)
 * Note: This cascades to units via database constraints
 */
export async function deleteArea(
  areaId: string,
  siteId: string,
  organizationId: string
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .update(areas)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(
      eq(areas.id, areaId),
      eq(areas.siteId, siteId),
      eq(areas.isActive, true)
    ))
    .returning();

  return area ?? null;
}
