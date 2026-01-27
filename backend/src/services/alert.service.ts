import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
	alerts,
	areas,
	correctiveActions,
	sites,
	units,
	type Alert,
	type InsertCorrectiveAction,
} from '../db/schema/index.js'
import type { AlertQuery } from '../schemas/alerts.js'

/**
 * List all alerts for an organization with hierarchy info
 */
export async function listAlertsWithHierarchy(
	organizationId: string,
	filters: {
		unitId?: string
		siteId?: string
		status?: string | string[]
		severity?: string | string[]
		start?: string
		end?: string
		limit?: number
		offset?: number
	} = {},
): Promise<any[]> {
	const query = db
		.select({
			id: alerts.id,
			unitId: alerts.unitId,
			alertRuleId: alerts.alertRuleId,
			alertType: alerts.alertType,
			severity: alerts.severity,
			status: alerts.status,
			message: alerts.message,
			triggerTemperature: alerts.triggerTemperature,
			thresholdViolated: alerts.thresholdViolated,
			triggeredAt: alerts.triggeredAt,
			acknowledgedAt: alerts.acknowledgedAt,
			acknowledgedBy: alerts.acknowledgedBy,
			resolvedAt: alerts.resolvedAt,
			resolvedBy: alerts.resolvedBy,
			escalatedAt: alerts.escalatedAt,
			escalationLevel: alerts.escalationLevel,
			metadata: alerts.metadata,
			createdAt: alerts.createdAt,
			updatedAt: alerts.updatedAt,
			unitName: units.name,
			areaName: areas.name,
			siteName: sites.name,
			siteId: sites.id,
		})
		.from(alerts)
		.innerJoin(units, eq(alerts.unitId, units.id))
		.innerJoin(areas, eq(units.areaId, areas.id))
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(
			and(
				eq(sites.organizationId, organizationId),
				filters.unitId ? eq(alerts.unitId, filters.unitId) : undefined,
				filters.siteId ? eq(areas.siteId, filters.siteId) : undefined,
				filters.status
					? Array.isArray(filters.status)
						? inArray(alerts.status, filters.status as any)
						: eq(alerts.status, filters.status as any)
					: undefined,
				filters.severity
					? Array.isArray(filters.severity)
						? inArray(alerts.severity, filters.severity as any)
						: eq(alerts.severity, filters.severity as any)
					: undefined,
				filters.start
					? gte(alerts.triggeredAt, new Date(filters.start))
					: undefined,
				filters.end
					? lte(alerts.triggeredAt, new Date(filters.end))
					: undefined,
			),
		)
		.orderBy(desc(alerts.triggeredAt))
		.limit(filters.limit ?? 100)
		.offset(filters.offset ?? 0)

	return query
}

/**
 * Verify alert belongs to organization via unit -> area -> site -> org hierarchy
 * @returns Alert if accessible, null otherwise
 */
export async function verifyAlertAccess(
	alertId: string,
	organizationId: string,
): Promise<Alert | null> {
	const [result] = await db
		.select({ alert: alerts })
		.from(alerts)
		.innerJoin(units, eq(alerts.unitId, units.id))
		.innerJoin(areas, eq(units.areaId, areas.id))
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(
			and(
				eq(alerts.id, alertId),
				eq(sites.organizationId, organizationId),
				eq(units.isActive, true),
				eq(areas.isActive, true),
				eq(sites.isActive, true),
			),
		)
		.limit(1)

	return result?.alert || null
}

/**
 * List alerts for organization with filtering and pagination
 * Enforces org isolation via hierarchy joins
 */
export async function listAlerts(
	organizationId: string,
	params: AlertQuery,
): Promise<Alert[]> {
	const {
		unitId,
		status,
		severity,
		start,
		end,
		limit = 100,
		offset = 0,
	} = params

	// Build where conditions
	const conditions = [
		eq(sites.organizationId, organizationId),
		eq(units.isActive, true),
		eq(areas.isActive, true),
		eq(sites.isActive, true),
	]

	if (unitId) {
		conditions.push(eq(alerts.unitId, unitId))
	}

	if (status) {
		conditions.push(eq(alerts.status, status))
	}

	if (severity) {
		conditions.push(eq(alerts.severity, severity))
	}

	if (start) {
		conditions.push(gte(alerts.triggeredAt, new Date(start)))
	}

	if (end) {
		conditions.push(lte(alerts.triggeredAt, new Date(end)))
	}

	// Query alerts with hierarchy validation
	const results = await db
		.select({ alert: alerts })
		.from(alerts)
		.innerJoin(units, eq(alerts.unitId, units.id))
		.innerJoin(areas, eq(units.areaId, areas.id))
		.innerJoin(sites, eq(areas.siteId, sites.id))
		.where(and(...conditions))
		.orderBy(desc(alerts.triggeredAt))
		.limit(limit)
		.offset(offset)

	return results.map(r => r.alert)
}

/**
 * Get single alert with hierarchy validation
 */
export async function getAlert(
	alertId: string,
	organizationId: string,
): Promise<Alert | null> {
	return verifyAlertAccess(alertId, organizationId)
}

/**
 * Acknowledge an alert
 * @returns Alert if acknowledged, 'already_acknowledged' if already in that state, null if not found
 */
export async function acknowledgeAlert(
	alertId: string,
	organizationId: string,
	profileId: string,
	notes?: string,
): Promise<Alert | 'already_acknowledged' | null> {
	// Verify access first
	const alert = await verifyAlertAccess(alertId, organizationId)
	if (!alert) {
		return null
	}

	// Check if already acknowledged
	if (alert.status === 'acknowledged') {
		return 'already_acknowledged'
	}

	// Update alert to acknowledged
	const [updated] = await db
		.update(alerts)
		.set({
			status: 'acknowledged',
			acknowledgedAt: new Date(),
			acknowledgedBy: profileId,
			metadata: notes
				? JSON.stringify({ acknowledgementNotes: notes })
				: alert.metadata,
			updatedAt: new Date(),
		})
		.where(eq(alerts.id, alertId))
		.returning()

	return updated || null
}

/**
 * Resolve an alert with optional corrective action
 * @returns Resolved alert or null if not found
 */
export async function resolveAlert(
	alertId: string,
	organizationId: string,
	profileId: string,
	resolution: string,
	correctiveAction?: string,
): Promise<Alert | null> {
	// Verify access first
	const alert = await verifyAlertAccess(alertId, organizationId)
	if (!alert) {
		return null
	}

	return db.transaction(async tx => {
		// Update alert to resolved
		const [updated] = await tx
			.update(alerts)
			.set({
				status: 'resolved',
				resolvedAt: new Date(),
				resolvedBy: profileId,
				metadata: JSON.stringify({ resolution }),
				updatedAt: new Date(),
			})
			.where(eq(alerts.id, alertId))
			.returning()

		if (!updated) {
			return null
		}

		// Create corrective action if provided
		if (correctiveAction) {
			const actionData: InsertCorrectiveAction = {
				alertId,
				unitId: alert.unitId,
				profileId,
				description: resolution,
				actionTaken: correctiveAction,
				resolvedAlert: true,
				actionAt: new Date(),
			}

			await tx.insert(correctiveActions).values(actionData)
		}

		// Update unit status to 'ok' if currently in alarm state
		await tx
			.update(units)
			.set({
				status: 'ok',
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(units.id, alert.unitId),
					inArray(units.status, ['excursion', 'alarm_active', 'restoring']),
				),
			)

		return updated
	})
}
