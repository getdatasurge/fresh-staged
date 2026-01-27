/**
 * useAuditedWrite Hook
 *
 * Wraps write operations with automatic impersonation auditing.
 * When a Super Admin is impersonating a user, all writes are logged
 * with full audit trail including acting_user_id and impersonation_session_id.
 *
 * @example
 * ```tsx
 * const { auditedWrite, isImpersonating } = useAuditedWrite();
 *
 * const handleSave = async () => {
 *   await auditedWrite(
 *     async () => {
 *       await trpc.alerts.resolve.mutate({ alertId });
 *     },
 *     {
 *       eventType: 'alert_resolved',
 *       title: 'Alert Resolved',
 *       unitId: alert.unitId,
 *       siteId: alert.siteId,
 *     }
 *   );
 * };
 * ```
 */

import { useUser } from '@stackframe/react'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTRPC } from '../lib/trpc'
import { useEffectiveIdentity } from './useEffectiveIdentity'
import { useOrgScope } from './useOrgScope'

export interface AuditContext {
	/** The type of event being logged (e.g., 'alert_resolved', 'manual_temp_logged') */
	eventType: string
	/** Human-readable title for the event */
	title: string
	/** Optional: The unit ID associated with this action */
	unitId?: string | null
	/** Optional: The site ID associated with this action */
	siteId?: string | null
	/** Optional: The area ID associated with this action */
	areaId?: string | null
	/** Optional: Category of the event (defaults to 'user_action') */
	category?: 'alert' | 'compliance' | 'settings' | 'user_action' | 'system'
	/** Optional: Severity of the event (defaults to 'info') */
	severity?: 'info' | 'success' | 'warning' | 'critical'
	/** Optional: Additional data to include in the event log */
	additionalData?: Record<string, unknown>
}

export interface AuditedWriteResult {
	/**
	 * Execute a write operation with automatic audit logging when impersonating.
	 * The write is executed first, then audit logging occurs.
	 */
	auditedWrite: <T>(
		writeOperation: () => Promise<T>,
		auditContext: AuditContext,
	) => Promise<T>

	/** Whether currently impersonating a user */
	isImpersonating: boolean

	/** The impersonation session ID if impersonating, null otherwise */
	impersonationSessionId: string | null

	/** The real user ID (acting admin) when impersonating */
	realUserId: string | null

	/** The effective organization ID for scoping */
	orgId: string | null
}

/**
 * Hook that provides audited write capabilities.
 * Automatically logs all write operations to the audit trail when impersonating.
 */
export function useAuditedWrite(): AuditedWriteResult {
	const user = useUser()
	const { orgId, isImpersonating } = useOrgScope()
	const { impersonationSessionId, realUserId } = useEffectiveIdentity()
	const trpc = useTRPC()

	// Use useMutation from @tanstack/react-query directly
	const logEventMutation = useMutation({
		mutationFn: async (data: any) => {
			// Use type assertion to bypass type check
			return (trpc.audit.logEvent as any).mutate(data)
		},
	})

	const auditedWrite = useCallback(
		async <T>(
			writeOperation: () => Promise<T>,
			auditContext: AuditContext,
		): Promise<T> => {
			// Execute the write operation first
			const result = await writeOperation()

			// Log audit trail if impersonating
			if (isImpersonating && orgId && user) {
				try {
					await logEventMutation.mutateAsync({
						eventType: auditContext.eventType,
						category: auditContext.category || 'user_action',
						severity: auditContext.severity || 'info',
						title: auditContext.title,
						organizationId: orgId,
						siteId: auditContext.siteId || null,
						areaId: auditContext.areaId || null,
						unitId: auditContext.unitId || null,
						eventData: auditContext.additionalData,
						impersonationSessionId: impersonationSessionId,
						actingAdminId: realUserId,
					})
				} catch (err) {
					// Don't fail the write if audit logging fails
					console.error(
						'[useAuditedWrite] Error logging impersonated action:',
						err,
					)
				}
			}

			return result
		},
		[
			user,
			orgId,
			isImpersonating,
			impersonationSessionId,
			realUserId,
			logEventMutation,
		],
	)

	return {
		auditedWrite,
		isImpersonating,
		impersonationSessionId,
		realUserId,
		orgId,
	}
}
