/**
 * useEffectiveIdentity Hook
 *
 * Single source of truth for "who is the current effective user/org" for data fetching.
 * When a Super Admin is impersonating a user, this returns the impersonated user's
 * identity. Otherwise, returns the real authenticated user's identity.
 *
 * MIGRATED: Now uses Stack Auth + tRPC users.me instead of Supabase
 *
 * This hook should be used by all data-fetching components to ensure proper scoping.
 */

import { useSuperAdmin } from '@/contexts/SuperAdminContext'
import { qk } from '@/lib/queryKeys'
import { createTRPCClientInstance } from '@/lib/trpc'
import { useUser } from '@stackframe/react'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

export interface EffectiveIdentity {
	effectiveUserId: string | null
	effectiveOrgId: string | null
	effectiveOrgName: string | null
	effectiveUserEmail: string | null
	effectiveUserName: string | null
	realUserId: string | null
	realOrgId: string | null
	isImpersonating: boolean
	impersonationExpiresAt: Date | null
	impersonationSessionId: string | null
	isLoading: boolean
	isInitialized: boolean
	impersonationChecked: boolean
	refresh: () => Promise<void>
}

export function useEffectiveIdentity(): EffectiveIdentity {
	const stackUser = useUser()
	const { isSuperAdmin, rolesLoaded, impersonation, isSupportModeActive } =
		useSuperAdmin()

	const {
		data: profile,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: qk.user(stackUser?.id ?? null).profile(),
		queryFn: async () => {
			if (!stackUser) return null
			const authJson = await stackUser.getAuthJson()
			const trpcClient = createTRPCClientInstance(
				async () => authJson.accessToken,
			)
			return trpcClient.users.me.query()
		},
		enabled: !!stackUser,
		staleTime: 1000 * 60 * 5,
	})

	const realUserId = stackUser?.id ?? null
	const realOrgId = null

	const hasContextImpersonation =
		impersonation?.isImpersonating && impersonation?.impersonatedOrgId

	const isImpersonating = Boolean(
		isSuperAdmin && isSupportModeActive && hasContextImpersonation,
	)

	const effectiveUserId = isImpersonating
		? (impersonation.impersonatedUserId ?? realUserId)
		: realUserId

	const effectiveOrgId = isImpersonating
		? (impersonation.impersonatedOrgId ?? realOrgId)
		: realOrgId

	const effectiveOrgName = isImpersonating
		? (impersonation.impersonatedOrgName ?? null)
		: null

	const effectiveUserEmail = isImpersonating
		? (impersonation.impersonatedUserEmail ?? null)
		: (stackUser?.primaryEmail ?? null)

	const effectiveUserName = isImpersonating
		? (impersonation.impersonatedUserName ?? null)
		: (stackUser?.displayName ?? null)

	const isInitialized = useMemo(() => {
		if (!rolesLoaded) return false
		if (stackUser && isLoading) return false

		if (isSupportModeActive) {
			return true
		}

		return true
	}, [rolesLoaded, stackUser, isLoading, isSupportModeActive])

	const refresh = useCallback(async () => {
		await refetch()
	}, [refetch])

	return {
		effectiveUserId,
		effectiveOrgId,
		effectiveOrgName,
		effectiveUserEmail,
		effectiveUserName,
		realUserId,
		realOrgId,
		isImpersonating,
		impersonationExpiresAt: null,
		impersonationSessionId: null,
		isLoading,
		isInitialized,
		impersonationChecked: true,
		refresh,
	}
}
