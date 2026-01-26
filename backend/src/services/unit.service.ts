import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
	areas,
	sites,
	units,
	type InsertUnit,
	type Unit,
} from '../db/schema/hierarchy.js'

/**
 * Verify area belongs to site and site belongs to organization
 * CRITICAL: Prevents BOLA by ensuring full hierarchy integrity
 */
async function verifyAreaAccess(
	areaId: string,
	siteId: string,
	organizationId: string,
): Promise<boolean> {
	const [result] = await db
		.select({ id: areas.id })
		.from(areas)
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(
			and(
				eq(areas.id, areaId),
				eq(areas.siteId, siteId),
				eq(sites.organizationId, organizationId),
				eq(areas.isActive, true),
				eq(sites.isActive, true),
			),
		)
		.limit(1)

	return !!result
}

/**
 * List all active units in an area
 */
export async function listUnits(
	areaId: string,
	siteId: string,
	organizationId: string,
): Promise<Unit[] | null> {
	// Verify full hierarchy first
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null // Area not found or not in org
	}

	return db
		.select()
		.from(units)
		.where(and(eq(units.areaId, areaId), eq(units.isActive, true)))
		.orderBy(units.sortOrder, units.name)
}

/**
 * Get a specific unit by ID
 */
export async function getUnit(
	unitId: string,
	areaId: string,
	siteId: string,
	organizationId: string,
): Promise<Unit | null> {
	// Verify full hierarchy: org -> site -> area -> unit
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null
	}

	const [unit] = await db
		.select()
		.from(units)
		.where(
			and(
				eq(units.id, unitId),
				eq(units.areaId, areaId),
				eq(units.isActive, true),
			),
		)
		.limit(1)

	return unit ?? null
}

/**
 * Create a new unit in an area
 */
export async function createUnit(
	areaId: string,
	siteId: string,
	organizationId: string,
	data: Omit<
		InsertUnit,
		'id' | 'areaId' | 'createdAt' | 'updatedAt' | 'isActive'
	>,
): Promise<Unit | null> {
	// Verify full hierarchy first
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null // Area not found or not in org
	}

	const [unit] = await db
		.insert(units)
		.values({
			...data,
			areaId,
		})
		.returning()

	return unit
}

/**
 * Update an existing unit
 */
export async function updateUnit(
	unitId: string,
	areaId: string,
	siteId: string,
	organizationId: string,
	data: Partial<Omit<InsertUnit, 'id' | 'areaId' | 'createdAt' | 'updatedAt'>>,
): Promise<Unit | null> {
	// Verify hierarchy first
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null
	}

	const [unit] = await db
		.update(units)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(units.id, unitId),
				eq(units.areaId, areaId),
				eq(units.isActive, true),
			),
		)
		.returning()

	return unit ?? null
}

/**
 * Soft delete a unit
 */
export async function deleteUnit(
	unitId: string,
	areaId: string,
	siteId: string,
	organizationId: string,
): Promise<Unit | null> {
	// Verify hierarchy first
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null
	}

	const [unit] = await db
		.update(units)
		.set({
			isActive: false,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(units.id, unitId),
				eq(units.areaId, areaId),
				eq(units.isActive, true),
			),
		)
		.returning()

	return unit ?? null
}

/**
 * Restore a soft-deleted unit (sets isActive = true)
 */
export async function restoreUnit(
	unitId: string,
	areaId: string,
	siteId: string,
	organizationId: string,
): Promise<Unit | null> {
	// Verify hierarchy first
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null
	}

	const [unit] = await db
		.update(units)
		.set({
			isActive: true,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(units.id, unitId),
				eq(units.areaId, areaId),
				eq(units.isActive, false),
			),
		)
		.returning()

	return unit ?? null
}

/**
 * Permanently delete a unit
 */
export async function permanentlyDeleteUnit(
	unitId: string,
	areaId: string,
	siteId: string,
	organizationId: string,
): Promise<Unit | null> {
	// Verify hierarchy first
	if (!(await verifyAreaAccess(areaId, siteId, organizationId))) {
		return null
	}

	const [unit] = await db
		.delete(units)
		.where(and(eq(units.id, unitId), eq(units.areaId, areaId)))
		.returning()

	return unit ?? null
}

/**
 * List all active units for an organization with hierarchy info
 */
export async function listUnitsByOrg(organizationId: string): Promise<any[]> {
	return db
		.select({
			id: units.id,
			areaId: units.areaId,
			name: units.name,
			unitType: units.unitType,
			status: units.status,
			tempMin: units.tempMin,
			tempMax: units.tempMax,
			tempUnit: units.tempUnit,
			manualMonitoringRequired: units.manualMonitoringRequired,
			manualMonitoringInterval: units.manualMonitoringInterval,
			lastReadingAt: units.lastReadingAt,
			lastTemperature: units.lastTemperature,
			isActive: units.isActive,
			sortOrder: units.sortOrder,
			createdAt: units.createdAt,
			updatedAt: units.updatedAt,
			areaName: areas.name,
			siteName: sites.name,
			siteId: sites.id,
			// lastManualLogAt would require another join or subquery,
			// but the units table has lastManualLogAt column (added in migration)
			lastManualLogAt: units.lastManualLogAt,
		})
		.from(units)
		.innerJoin(areas, eq(units.areaId, areas.id))
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(
			and(
				eq(sites.organizationId, organizationId),
				eq(units.isActive, true),
				eq(areas.isActive, true),
				eq(sites.isActive, true),
			),
		)
		.orderBy(sites.name, areas.name, units.sortOrder, units.name)
}

/**
 * Get a specific unit by ID with hierarchy info
 */
export async function getUnitWithHierarchy(
	unitId: string,
	organizationId: string,
): Promise<any | null> {
	const [result] = await db
		.select({
			id: units.id,
			areaId: units.areaId,
			name: units.name,
			unitType: units.unitType,
			status: units.status,
			tempMin: units.tempMin,
			tempMax: units.tempMax,
			tempUnit: units.tempUnit,
			manualMonitoringRequired: units.manualMonitoringRequired,
			manualMonitoringInterval: units.manualMonitoringInterval,
			lastReadingAt: units.lastReadingAt,
			lastTemperature: units.lastTemperature,
			isActive: units.isActive,
			sortOrder: units.sortOrder,
			createdAt: units.createdAt,
			updatedAt: units.updatedAt,
			areaName: areas.name,
			siteName: sites.name,
			siteId: sites.id,
			lastManualLogAt: units.lastManualLogAt,
		})
		.from(units)
		.innerJoin(areas, eq(units.areaId, areas.id))
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(
			and(
				eq(units.id, unitId),
				eq(sites.organizationId, organizationId),
				eq(units.isActive, true),
			),
		)
		.limit(1)

	return result ?? null
}
