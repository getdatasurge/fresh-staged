/**
 * tRPC Test Mock Utilities
 *
 * Provides type-safe mocking utilities for tRPC with TanStack Query's queryOptions pattern.
 *
 * Production code uses: useQuery(trpc.router.procedure.queryOptions(input, opts))
 * These utilities create properly structured mocks that return { queryKey, queryFn, enabled?, staleTime? }
 *
 * @example
 * ```typescript
 * // Create mock for a single procedure
 * const mockTRPC = createMockTRPC({
 *   sites: {
 *     list: createQueryOptionsMock(mockSites),
 *   },
 *   units: {
 *     listByOrg: createQueryOptionsMock(mockUnits),
 *   },
 * });
 *
 * vi.mock('@/lib/trpc', () => ({
 *   useTRPC: () => mockTRPC,
 * }));
 * ```
 */

import { vi } from 'vitest';

/**
 * Return type for queryOptions() - matches TanStack Query's queryOptions return
 */
export interface QueryOptionsReturn<TData> {
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
}

/**
 * A procedure mock with queryOptions method
 */
export interface ProcedureMock<TData> {
  queryOptions: ReturnType<typeof vi.fn>;
}

/**
 * Creates a queryOptions mock function that returns the expected structure.
 *
 * @param data - The data to return when queryFn is called
 * @param options - Optional overrides for enabled, staleTime, or custom queryKey
 * @returns A vi.fn() that when called returns { queryKey, queryFn, enabled, staleTime }
 *
 * @example
 * ```typescript
 * const mockSites = [{ id: 'site-1', name: 'Site 1' }];
 * const sitesListMock = createQueryOptionsMock(mockSites);
 *
 * // Use in mock structure
 * mockUseTRPC.mockReturnValue({
 *   sites: {
 *     list: { queryOptions: sitesListMock },
 *   },
 * });
 * ```
 */
export function createQueryOptionsMock<TData>(
  data: TData,
  options: {
    enabled?: boolean;
    staleTime?: number;
    queryKey?: unknown[];
    error?: Error;
  } = {},
): ReturnType<typeof vi.fn> {
  const { enabled = true, staleTime = 30000, queryKey, error } = options;

  return vi.fn().mockImplementation((input?: unknown) => {
    const resolvedQueryKey = queryKey ?? ['mock', 'procedure', input];
    return {
      queryKey: resolvedQueryKey,
      queryFn: error ? () => Promise.reject(error) : () => Promise.resolve(data),
      enabled,
      staleTime,
    };
  });
}

/**
 * Router structure type for mock tRPC
 */
export type MockRouterStructure = Record<
  string,
  Record<string, { queryOptions: ReturnType<typeof vi.fn> }>
>;

/**
 * Creates a mock tRPC object with the expected queryOptions structure.
 *
 * This is a convenience wrapper that ensures proper typing for the mock structure.
 * Use this when you need to mock multiple routers/procedures at once.
 *
 * @param routers - Object mapping router names to procedure mocks
 * @returns A mock object suitable for use with vi.mock('@/lib/trpc')
 *
 * @example
 * ```typescript
 * const mockSites = [{ id: 'site-1', name: 'Site 1' }];
 * const mockUnits = [{ id: 'unit-1', name: 'Unit 1' }];
 *
 * const mockTRPC = createMockTRPC({
 *   sites: {
 *     list: { queryOptions: createQueryOptionsMock(mockSites) },
 *   },
 *   units: {
 *     listByOrg: { queryOptions: createQueryOptionsMock(mockUnits) },
 *   },
 * });
 *
 * // Use with vi.mock
 * vi.mock('@/lib/trpc', () => ({
 *   useTRPC: () => mockTRPC,
 * }));
 * ```
 */
export function createMockTRPC<T extends MockRouterStructure>(routers: T): T {
  return routers;
}

/**
 * Helper to create a procedure mock with a single queryOptions function.
 *
 * This is a shorthand for creating procedure mocks with data.
 *
 * @param data - The data to return from queryFn
 * @param options - Optional overrides
 * @returns Object with queryOptions mock function
 *
 * @example
 * ```typescript
 * const mockTRPC = {
 *   sites: {
 *     list: createProcedureMock([{ id: 'site-1' }]),
 *   },
 * };
 * ```
 */
export function createProcedureMock<TData>(
  data: TData,
  options: {
    enabled?: boolean;
    staleTime?: number;
    queryKey?: unknown[];
    error?: Error;
  } = {},
): { queryOptions: ReturnType<typeof vi.fn> } {
  return {
    queryOptions: createQueryOptionsMock(data, options),
  };
}

/**
 * Creates a mock for error scenarios.
 *
 * @param error - The error to throw when queryFn is called
 * @param options - Optional overrides
 * @returns Object with queryOptions mock function that rejects with the error
 *
 * @example
 * ```typescript
 * const mockTRPC = {
 *   sites: {
 *     list: createErrorMock(new Error('API Error')),
 *   },
 * };
 * ```
 */
export function createErrorMock(
  error: Error,
  options: {
    enabled?: boolean;
    staleTime?: number;
    queryKey?: unknown[];
  } = {},
): { queryOptions: ReturnType<typeof vi.fn> } {
  return createProcedureMock(null, { ...options, error });
}
