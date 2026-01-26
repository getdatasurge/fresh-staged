/**
 * Site Location Mutation Hook
 *
 * React Query mutation for updating site latitude, longitude, and timezone.
 */

import { qk } from '@/lib/queryKeys'
import { useTRPC } from '@/lib/trpc'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrgScope } from './useOrgScope'

interface SiteLocationData {
	latitude: number
	longitude: number
	timezone: string
}

export function useSiteLocationMutation(siteId: string) {
	const { orgId } = useOrgScope()
	const trpc = useTRPC()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (data: SiteLocationData) => {
			if (!orgId) throw new Error('Not authenticated')

			return trpc.sites.update.mutate({
				siteId,
				data: {
					latitude: data.latitude,
					longitude: data.longitude,
					timezone: data.timezone,
				},
			})
		},
		onSuccess: () => {
			// Invalidate site queries to refresh site data (so components receive new lat/lon)
			queryClient.invalidateQueries({ queryKey: qk.site(siteId).details() })
			queryClient.invalidateQueries({ queryKey: qk.org(orgId).sites() })
			// Invalidate ALL weather queries - the hook uses ["weather", "current", lat, lon, tz]
			// By invalidating the prefix, we catch all weather queries regardless of coordinates
			queryClient.invalidateQueries({ queryKey: ['weather'] })
			toast.success('Site location updated successfully')
		},
		onError: error => {
			console.error('Failed to update site location:', error)
			toast.error('Failed to update site location')
		},
	})
}
