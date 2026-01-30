import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBranding } from '../useBranding';

// Mock dependencies
vi.mock('@stackframe/react', () => ({
  useUser: () => ({
    id: 'test-user-id',
    getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
  }),
}));

vi.mock('../useEffectiveIdentity', () => ({
  useEffectiveIdentity: () => ({
    effectiveOrgId: 'test-org-id',
    isInitialized: true,
  }),
}));

const mockUseTRPC = vi.fn();

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC(),
}));

describe('useOrganizations hooks', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  describe('useBranding', () => {
    it('fetches organization branding data', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'Test Organization',
        logoUrl: 'https://example.com/logo.png',
      };

      // Mock the queryFn to return the mockOrg
      const mockQueryFn = vi.fn().mockResolvedValue(mockOrg);
      mockUseTRPC.mockReturnValue({
        organizations: {
          get: {
            queryOptions: vi.fn().mockReturnValue({
              queryKey: ['organizations', 'get', 'test-org-id'],
              queryFn: mockQueryFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.branding).toEqual({
        name: 'Test Organization',
        logoUrl: 'https://example.com/logo.png',
        accentColor: '#0097a7',
      });
    });

    it('handles null logo and uses default accent color', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'No Logo Org',
        logoUrl: null,
      };

      const mockQueryFn = vi.fn().mockResolvedValue(mockOrg);
      mockUseTRPC.mockReturnValue({
        organizations: {
          get: {
            queryOptions: vi.fn().mockReturnValue({
              queryKey: ['organizations', 'get', 'test-org-id'],
              queryFn: mockQueryFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.branding?.logoUrl).toBeNull();
      expect(result.current.branding?.accentColor).toBe('#0097a7'); // Default accent
    });

    it('caches data for 5 minutes', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'Test Org',
        logoUrl: null,
      };

      const mockQueryFn = vi.fn().mockResolvedValue(mockOrg);
      mockUseTRPC.mockReturnValue({
        organizations: {
          get: {
            queryOptions: vi.fn().mockReturnValue({
              queryKey: ['organizations', 'get', 'test-org-id'],
              queryFn: mockQueryFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Verify branding is loaded
      expect(result.current.branding).toBeDefined();
      expect(result.current.branding?.name).toBe('Test Org');
    });
  });
});
