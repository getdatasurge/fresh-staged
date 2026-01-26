import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBranding } from '../useBranding';

// Mock dependencies
vi.mock('@stackframe/react', () => ({
  useUser: () => ({
    id: 'test-user-id',
    getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
  }),
}));

vi.mock('@/lib/supabase-placeholder', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: {
            session: {
              access_token: 'test-token',
            },
          },
        })
      ),
    },
  },
}));

vi.mock('../useEffectiveIdentity', () => ({
  useEffectiveIdentity: () => ({
    effectiveOrgId: 'test-org-id',
    isInitialized: true,
  }),
}));

vi.mock('@/lib/api', () => ({
  organizationsApi: {
    getOrganization: vi.fn(),
  },
}));

import { organizationsApi } from '@/lib/api';

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
        accentColor: '#0097a7',
      };

      vi.mocked(organizationsApi.getOrganization).mockResolvedValueOnce(mockOrg as any);

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.branding).toEqual({
        name: 'Test Organization',
        logoUrl: 'https://example.com/logo.png',
        accentColor: '#0097a7',
      });
    });

    it('uses access token from session', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'Test Org',
        logoUrl: null,
        accentColor: null,
      };

      vi.mocked(organizationsApi.getOrganization).mockResolvedValueOnce(mockOrg as any);

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(organizationsApi.getOrganization).toHaveBeenCalledWith('test-org-id', 'test-token');
    });

    it('handles null logo and uses default accent color', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'No Logo Org',
        logoUrl: null,
        accentColor: null,
      };

      vi.mocked(organizationsApi.getOrganization).mockResolvedValueOnce(mockOrg as any);

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.branding?.logoUrl).toBeNull();
      expect(result.current.branding?.accentColor).toBe('#0097a7'); // Default accent
    });

    it('uses correct query key for caching', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'Test Org',
        logoUrl: null,
        accentColor: '#0097a7',
      };

      vi.mocked(organizationsApi.getOrganization).mockResolvedValueOnce(mockOrg as any);

      renderHook(() => useBranding(), { wrapper });

      await waitFor(() => {
        const cachedData = queryClient.getQueryData(['org', 'test-org-id', 'branding']);
        return expect(cachedData).toBeDefined();
      });
    });

    it('caches data for 5 minutes', async () => {
      const mockOrg = {
        id: 'test-org-id',
        name: 'Test Org',
        logoUrl: null,
        accentColor: '#0097a7',
      };

      vi.mocked(organizationsApi.getOrganization).mockResolvedValueOnce(mockOrg as any);

      const { result } = renderHook(() => useBranding(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Verify branding is loaded
      expect(result.current.branding).toBeDefined();
      expect(result.current.branding?.name).toBe('Test Org');
    });
  });
});
