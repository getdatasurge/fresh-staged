/**
 * tRPC Client Setup
 *
 * Provides TRPCProvider, useTRPC hook, and tRPC client factory.
 * Uses TanStack React Query for caching and request deduplication.
 *
 * Type safety flows from backend AppRouter via monorepo import.
 */

import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { createTRPCContext } from '@trpc/tanstack-react-query'
import type { AppRouter } from '../../backend/src/trpc/router'

// Base API URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')

/**
 * tRPC React context with queryOptions/mutationOptions pattern
 *
 * Uses createTRPCContext which provides .queryOptions() and .mutationOptions()
 * for use with @tanstack/react-query's useQuery and useMutation.
 */
const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()

export { TRPCProvider, useTRPC, useTRPCClient }

/**
 * Create tRPC client instance with authentication
 *
 * @param getAccessToken - Async function to get current access token
 * @returns Configured tRPC client for use with TRPCProvider
 *
 * @example
 * ```tsx
 * const user = useUser();
 * const client = useMemo(
 *   () => createTRPCClientInstance(async () => {
 *     const { accessToken } = await user.getAuthJson();
 *     return accessToken;
 *   }),
 *   [user]
 * );
 * ```
 */
export function createTRPCClientInstance(
	getAccessToken: () => Promise<string>,
) {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${API_BASE_URL}/trpc`,
				async headers() {
					const token = await getAccessToken()
					return {
						'x-stack-access-token': token,
					}
				},
			}),
		],
	})
}

/**
 * Type helpers for input/output inference
 *
 * @example
 * ```tsx
 * type OrganizationInput = RouterInput['organizations']['create'];
 * type OrganizationOutput = RouterOutput['organizations']['get'];
 * ```
 */
export type { AppRouter }
