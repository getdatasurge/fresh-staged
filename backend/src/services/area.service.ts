import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { areas, sites, units, type Area, type InsertArea } from '../db/schema/hierarchy.js';

/**
 * Verify that a site belongs to an organization
 * This prevents BOLA attacks by ensuring hierarchy integrity
 */
async function verifySiteAccess(siteId: string, organizationId: string): Promise<boolean> {
  const [site] = await db
    .select()
    .from(sites)
    .where(
      and(eq(sites.id, siteId), eq(sites.organizationId, organizationId), eq(sites.isActive, true)),
    )
    .limit(1);

  return !!site;
}

/**
 * List all active areas in a site
 * Silent filtering - only returns areas user has access to
 */
export async function listAreas(siteId: string, organizationId: string): Promise<Area[]> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return [];
  }

  return db
    .select()
    .from(areas)
    .where(and(eq(areas.siteId, siteId), eq(areas.isActive, true)))
    .orderBy(areas.sortOrder, areas.name);
}

/**
 * List all active areas in a site with unit counts
 */
export async function listAreasWithUnitCount(
  siteId: string,
  organizationId: string,
): Promise<(Area & { unitsCount: number })[]> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return [];
  }

  const results = await db
    .select({
      id: areas.id,
      siteId: areas.siteId,
      name: areas.name,
      description: areas.description,
      sortOrder: areas.sortOrder,
      isActive: areas.isActive,
      createdAt: areas.createdAt,
      updatedAt: areas.updatedAt,
      deletedAt: areas.deletedAt,
      unitsCount: sql<number>`count(${units.id})::int`,
    })
    .from(areas)
    .leftJoin(units, and(eq(units.areaId, areas.id), eq(units.isActive, true)))
    .where(and(eq(areas.siteId, siteId), eq(areas.isActive, true)))
    .groupBy(areas.id)
    .orderBy(areas.sortOrder, areas.name);

  return results;
}

/**
 * Get a specific area by ID within a site
 */
export async function getArea(
  areaId: string,
  siteId: string,
  organizationId: string,
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .select()
    .from(areas)
    .where(and(eq(areas.id, areaId), eq(areas.siteId, siteId), eq(areas.isActive, true)))
    .limit(1);

  return area ?? null;
}

/**
 * Create a new area in a site
 */
export async function createArea(
  siteId: string,
  organizationId: string,
  data: Omit<InsertArea, 'id' | 'siteId' | 'createdAt' | 'updatedAt' | 'isActive'>,
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
  data: Partial<Omit<InsertArea, 'id' | 'siteId' | 'createdAt' | 'updatedAt'>>,
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
    } as any)
    .where(and(eq(areas.id, areaId), eq(areas.siteId, siteId), eq(areas.isActive, true)))
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
  organizationId: string,
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
    } as any)
    .where(and(eq(areas.id, areaId), eq(areas.siteId, siteId), eq(areas.isActive, true)))
    .returning();

  return area ?? null;
}

/**
 * Restore a soft-deleted area (sets isActive = true)
 */
export async function restoreArea(
  areaId: string,
  siteId: string,
  organizationId: string,
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .update(areas)
    .set({
      isActive: true,
      updatedAt: new Date(),
    } as any)
    .where(and(eq(areas.id, areaId), eq(areas.siteId, siteId), eq(areas.isActive, false)))
    .returning();

  return area ?? null;
}

/**
 * Permanently delete an area
 */
export async function permanentlyDeleteArea(
  areaId: string,
  siteId: string,
  organizationId: string,
): Promise<Area | null> {
  // Verify site belongs to org
  const hasAccess = await verifySiteAccess(siteId, organizationId);
  if (!hasAccess) {
    return null;
  }

  const [area] = await db
    .delete(areas)
    .where(and(eq(areas.id, areaId), eq(areas.siteId, siteId)))
    .returning();

  return area ?? null;
}
