/**
 * Widget Health Metrics
 *
 * Observability counters and event tracking for widget health states.
 * Tracks failures per org for diagnostics and alerting.
 *
 * This file is deprecated - use useWidgetHealthMetrics hook instead.
 */

import type {
	FailingLayer,
	WidgetHealthStatus,
} from '@/features/dashboard-layout/types/widgetState'

/**
 * Widget health change event
 */
export interface WidgetHealthEvent {
	eventType: 'widget_health_change'
	widgetId: string
	entityId: string
	entityType: 'unit' | 'site'
	orgId: string
	previousStatus: WidgetHealthStatus | null
	currentStatus: WidgetHealthStatus
	failingLayer: FailingLayer | null
	payloadType: string | null
	timestamp: string
	metadata?: Record<string, unknown>
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function trackHealthChange(
	event: Omit<WidgetHealthEvent, 'eventType' | 'timestamp'>,
): void {
	console.warn(
		'trackHealthChange is deprecated - use useWidgetHealthMetrics hook instead',
	)
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function getHealthDistribution(
	orgId: string,
): Record<WidgetHealthStatus, number> {
	console.warn(
		'getHealthDistribution is deprecated - use useWidgetHealthMetrics hook instead',
	)
	return {
		healthy: 0,
		degraded: 0,
		stale: 0,
		error: 0,
		no_data: 0,
		misconfigured: 0,
		permission_denied: 0,
		not_configured: 0,
		loading: 0,
		empty: 0,
		offline: 0,
		mismatch: 0,
		decoder_error: 0,
		schema_failed: 0,
		partial_payload: 0,
		out_of_order: 0,
	}
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function getBufferedEvents(orgId: string): WidgetHealthEvent[] {
	console.warn(
		'getBufferedEvents is deprecated - use useWidgetHealthMetrics hook instead',
	)
	return []
}

// Deprecated - use useWidgetHealthMetrics hook instead
export async function flushHealthMetrics(orgId: string): Promise<void> {
	console.warn(
		'flushHealthMetrics is deprecated - use useWidgetHealthMetrics hook instead',
	)
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function getFailuresByLayer(
	orgId: string,
): Record<FailingLayer, number> {
	console.warn(
		'getFailuresByLayer is deprecated - use useWidgetHealthMetrics hook instead',
	)
	return {
		sensor: 0,
		gateway: 0,
		ttn: 0,
		decoder: 0,
		webhook: 0,
		database: 0,
		external_api: 0,
	}
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function hasCriticalIssues(orgId: string): boolean {
	console.warn(
		'hasCriticalIssues is deprecated - use useWidgetHealthMetrics hook instead',
	)
	return false
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function resetOrgCounters(orgId: string): void {
	console.warn(
		'resetOrgCounters is deprecated - use useWidgetHealthMetrics hook instead',
	)
}

// Deprecated - use useWidgetHealthMetrics hook instead
export function clearAllCounters(): void {
	console.warn(
		'clearAllCounters is deprecated - use useWidgetHealthMetrics hook instead',
	)
}
