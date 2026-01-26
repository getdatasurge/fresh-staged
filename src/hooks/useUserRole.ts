/**
 * useUserRole Hook
 *
 * MIGRATED: Now uses Stack Auth + tRPC users.me instead of Supabase
 *
 * Returns the user's role in the current organization.
 * The role is fetched from the users.me tRPC procedure.
 */

import { qk } from '@/lib/queryKeys'
import { createTRPCClientInstance } from '@/lib/trpc'
import { useUser } from '@stackframe/react'
import { useQuery } from '@tanstack/react-query'

export interface UserRoleInfo {
	role: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer' | 'inspector' | null
	isLoading: boolean
	/**
	 * @deprecated Use useOrgScope().orgId for data queries instead.
	 * This returns the REAL user's organization, which is incorrect during impersonation.
	 * For data-fetching components, always use:
	 *   const { orgId } = useOrgScope();
	 */
	organizationId: string | null
}

export interface RolePermissions {
	canLogTemps: boolean
	canViewAlerts: boolean
	canAcknowledgeAlerts: boolean
	canEditTempLimits: boolean
	canManageSites: boolean
	canManageSensors: boolean
	canManageUsers: boolean
	canEditComplianceSettings: boolean
	canExportReports: boolean
	canViewAuditLogs: boolean
	canDeleteEntities: boolean
	canRestoreEntities: boolean
	canPermanentlyDelete: boolean
	canCustomizeDashboard: boolean
	canManageAnnotations: boolean
}

type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer' | 'inspector'

// Define permissions for each role
const rolePermissions: Record<AppRole, RolePermissions> = {
	owner: {
		canLogTemps: true,
		canViewAlerts: true,
		canAcknowledgeAlerts: true,
		canEditTempLimits: true,
		canManageSites: true,
		canManageSensors: true,
		canManageUsers: true,
		canEditComplianceSettings: true,
		canExportReports: true,
		canViewAuditLogs: true,
		canDeleteEntities: true,
		canRestoreEntities: true,
		canPermanentlyDelete: true,
		canCustomizeDashboard: true,
		canManageAnnotations: true,
	},
	admin: {
		canLogTemps: true,
		canViewAlerts: true,
		canAcknowledgeAlerts: true,
		canEditTempLimits: true,
		canManageSites: true,
		canManageSensors: true,
		canManageUsers: true,
		canEditComplianceSettings: true,
		canExportReports: true,
		canViewAuditLogs: true,
		canDeleteEntities: true,
		canRestoreEntities: true,
		canPermanentlyDelete: true,
		canCustomizeDashboard: true,
		canManageAnnotations: true,
	},
	manager: {
		canLogTemps: true,
		canViewAlerts: true,
		canAcknowledgeAlerts: true,
		canEditTempLimits: true,
		canManageSites: false,
		canManageSensors: false,
		canManageUsers: false,
		canEditComplianceSettings: false,
		canExportReports: true,
		canViewAuditLogs: false,
		canDeleteEntities: false,
		canRestoreEntities: false,
		canPermanentlyDelete: false,
		canCustomizeDashboard: true,
		canManageAnnotations: true,
	},
	staff: {
		canLogTemps: true,
		canViewAlerts: true,
		canAcknowledgeAlerts: true, // Fixed: Staff CAN acknowledge alerts per PERMISSION_MATRIX
		canEditTempLimits: false,
		canManageSites: false,
		canManageSensors: false,
		canManageUsers: false,
		canEditComplianceSettings: false,
		canExportReports: false,
		canViewAuditLogs: false,
		canDeleteEntities: false,
		canRestoreEntities: false,
		canPermanentlyDelete: false,
		canCustomizeDashboard: false,
		canManageAnnotations: false,
	},
	viewer: {
		canLogTemps: false,
		canViewAlerts: true,
		canAcknowledgeAlerts: false,
		canEditTempLimits: false,
		canManageSites: false,
		canManageSensors: false,
		canManageUsers: false,
		canEditComplianceSettings: false,
		canExportReports: false,
		canViewAuditLogs: false,
		canDeleteEntities: false,
		canRestoreEntities: false,
		canPermanentlyDelete: false,
		canCustomizeDashboard: false,
		canManageAnnotations: false,
	},
	inspector: {
		canLogTemps: false,
		canViewAlerts: true,
		canAcknowledgeAlerts: false,
		canEditTempLimits: false,
		canManageSites: false,
		canManageSensors: false,
		canManageUsers: false,
		canEditComplianceSettings: false,
		canExportReports: true,
		canViewAuditLogs: false,
		canDeleteEntities: false,
		canRestoreEntities: false,
		canPermanentlyDelete: false,
		canCustomizeDashboard: false,
		canManageAnnotations: false,
	},
}

/**
 * Get user's role in the specified organization.
 * Uses users.me tRPC procedure.
 *
 * @param orgId - Organization ID to check role for (optional)
 */
export function useUserRole(orgId?: string | null): UserRoleInfo {
	const user = useUser()

	const { data: profile, isLoading } = useQuery({
		queryKey: qk.user(user?.id ?? null).role(),
		queryFn: async () => {
			if (!user) return null
			const authJson = await user.getAuthJson()
			const trpcClient = createTRPCClientInstance(
				async () => authJson.accessToken,
			)
			return trpcClient.users.me.query()
		},
		enabled: !!user,
		staleTime: 1000 * 60 * 5, // 5 min cache (same as useEffectiveIdentity)
	})

	return {
		role: profile?.role ?? null,
		isLoading,
		organizationId: null, // TODO: Get from tRPC if available
	}
}

export function getPermissions(role: AppRole | null): RolePermissions {
	if (!role) {
		return {
			canLogTemps: false,
			canViewAlerts: false,
			canAcknowledgeAlerts: false,
			canEditTempLimits: false,
			canManageSites: false,
			canManageSensors: false,
			canManageUsers: false,
			canEditComplianceSettings: false,
			canExportReports: false,
			canViewAuditLogs: false,
			canDeleteEntities: false,
			canRestoreEntities: false,
			canPermanentlyDelete: false,
			canCustomizeDashboard: false,
			canManageAnnotations: false,
		}
	}
	return rolePermissions[role]
}

export function usePermissions(): RolePermissions & {
	isLoading: boolean
	role: AppRole | null
} {
	const { role, isLoading } = useUserRole()
	const permissions = getPermissions(role)
	return { ...permissions, isLoading, role }
}
