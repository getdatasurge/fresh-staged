/**
 * Vitest Test Setup
 *
 * This file runs before each test suite to configure the test environment.
 *
 * ============================================================================
 * tRPC Test Mocking Pattern
 * ============================================================================
 *
 * Production code uses @trpc/tanstack-react-query with the queryOptions pattern:
 *
 *   useQuery(trpc.router.procedure.queryOptions(input, opts))
 *   useMutation(trpc.router.procedure.mutationOptions())
 *
 * Test mocks must provide these methods. DO NOT mock `.useQuery` or `.useMutation`
 * directly - those don't exist in the @trpc/tanstack-react-query API.
 *
 * queryOptions() mock must return:
 * {
 *   queryKey: [routerName, procedureName, input],
 *   queryFn: () => Promise.resolve(data),
 *   enabled: boolean,
 *   staleTime: number
 * }
 *
 * mutationOptions() mock must return:
 * {
 *   mutationKey: [routerName, procedureName],
 *   mutationFn: (input) => Promise.resolve(result)
 * }
 *
 * See: src/test/trpc-test-utils.ts for reusable mock factory
 * Example: src/hooks/__tests__/useSites.test.tsx (queryOptions pattern)
 * Example: src/hooks/__tests__/useOrganizations.test.tsx (queryOptions pattern)
 *
 * ============================================================================
 * Common Mock Setup
 * ============================================================================
 *
 * Example tRPC mock setup:
 *
 * ```typescript
 * import { createQueryOptionsMock } from '@/test/trpc-test-utils'
 *
 * const mockUseTRPC = vi.fn()
 *
 * vi.mock('@/lib/trpc', () => ({
 *   useTRPC: () => mockUseTRPC(),
 * }))
 *
 * beforeEach(() => {
 *   mockUseTRPC.mockReturnValue({
 *     sites: {
 *       list: {
 *         queryOptions: createQueryOptionsMock(mockSites, {
 *           queryKey: ['sites', 'list', { organizationId: 'org-1' }],
 *         }),
 *       },
 *     },
 *   })
 * })
 * ```
 *
 * ============================================================================
 */

import '@testing-library/jest-dom';
