/**
 * Widget Health Metrics Hook
 *
 * Uses tRPC to interact with widget health metrics procedures.
 */

import { useTRPCClient } from '@/lib/trpc'

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

export function useWidgetHealthMetrics() {
	const trpcClient = useTRPCClient()

	/**
	 * Track a widget health status change
	 */
	const trackHealthChange = async (
		event: Omit<WidgetHealthEvent, 'eventType' | 'timestamp'>,
	) => {
		try {
			await trpcClient.widgetHealth.trackHealthChange.mutate(event)
		} catch (error) {
			console.error('Failed to track widget health change:', error)
		}
	}

	/**
	 * Get current health status distribution for an org
	 */
	const getHealthDistribution = async (
		orgId: string,
	): Promise<Record<WidgetHealthStatus, number>> => {
		try {
			return await trpcClient.widgetHealth.getHealthDistribution.query({ orgId })
		} catch (error) {
			console.error('Failed to get health distribution:', error)
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
	}

	/**
	 * Get failure counts by layer for an org
	 */
	const getFailuresByLayer = async (
		orgId: string,
	): Promise<Record<FailingLayer, number>> => {
		try {
			return await trpcClient.widgetHealth.getFailuresByLayer.query({ orgId })
		} catch (error) {
			console.error('Failed to get failures by layer:', error)
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
	}

	/**
	 * Check if an org has critical issues
	 */
	const hasCriticalIssues = async (orgId: string): Promise<boolean> => {
		try {
			return await trpcClient.widgetHealth.hasCriticalIssues.query({ orgId })
		} catch (error) {
			console.error('Failed to check critical issues:', error)
			return false
		}
	}

	/**
	 * Get buffered events for an org (for debugging)
	 */
	const getBufferedEvents = async (
		orgId: string,
	): Promise<WidgetHealthEvent[]> => {
		try {
			return await trpcClient.widgetHealth.getBufferedEvents.query({ orgId })
		} catch (error) {
			console.error('Failed to get buffered events:', error)
			return []
		}
	}

	/**
	 * Flush buffered events to database
	 */
	const flushHealthMetrics = async (orgId: string): Promise<void> => {
		try {
			await trpcClient.widgetHealth.flushHealthMetrics.mutate({ orgId })
		} catch (error) {
			console.error('Failed to flush health metrics:', error)
		}
	}

	/**
	 * Reset counters for an org (for testing)
	 */
	const resetOrgCounters = async (orgId: string): Promise<void> => {
		try {
			await trpcClient.widgetHealth.resetOrgCounters.mutate({ orgId })
		} catch (error) {
			console.error('Failed to reset org counters:', error)
		}
	}

	return {
		trackHealthChange,
		getHealthDistribution,
		getFailuresByLayer,
		hasCriticalIssues,
		getBufferedEvents,
		flushHealthMetrics,
		resetOrgCounters,
	}
}
