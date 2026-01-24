/**
 * tRPC Client Setup
 *
 * Provides TRPCProvider, useTRPC hook, and tRPC client factory.
 * Uses TanStack React Query for caching and request deduplication.
 *
 * Type safety flows from backend AppRouter via monorepo import.
 */

import { createTRPCContext } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../backend/src/trpc/router';

// Base API URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * tRPC React context and hooks
 */
const { TRPCProvider, useTRPCClient, useTRPC } = createTRPCContext<AppRouter>();

export { TRPCProvider, useTRPCClient, useTRPC };

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
export function createTRPCClientInstance(getAccessToken: () => Promise<string>) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/trpc`,
        async headers() {
          const token = await getAccessToken();
          return {
            'x-stack-access-token': token,
          };
        },
      }),
    ],
  });
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
export type { AppRouter };
