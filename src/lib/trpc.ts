/**
 * tRPC Client Setup
 *
 * Provides TRPCProvider, useTRPC hook, and tRPC client factory.
 * Uses TanStack React Query for caching and request deduplication.
 *
 * Type safety flows from backend AppRouter via monorepo import.
 */

import { createTRPCClient, httpBatchLink, TRPCLink } from '@trpc/client'
import { createTRPCContext } from '@trpc/tanstack-react-query'
import type { AppRouter } from '../../backend/src/trpc/router'

// Base API URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Performance monitoring link for tRPC
 * Measures the time taken for each request to complete
 */
const performanceLink: TRPCLink<AppRouter> = () => {
	return ({ next, op }) => {
		return next(op).then(async result => {
			const { path, type } = op
			const duration = result.headers?.['x-response-time']
				? Number(result.headers['x-response-time'])
				: null

			if (duration !== null) {
				const name = `tRPC: ${path} (${type})`
				const color =
					duration > 500
						? 'color: red'
						: duration > 200
							? 'color: orange'
							: duration > 100
								? 'color: yellow'
								: 'color: green'

				console.log(`%c[PERF] ${name}: ${duration}ms`, color)
			}

			return result
		})
	}
}

/**
 * tRPC React context and hooks
 */
const { TRPCProvider, useTRPCClient, useTRPC } = createTRPCContext<AppRouter>()

export { TRPCProvider, useTRPC, useTRPCClient }

/**
 * Create tRPC client instance with authentication
 *
 * @param getAccessToken - Async function to get current access token
 * @returns Configured tRPC client
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
			performanceLink,
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
