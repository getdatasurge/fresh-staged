import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryOptionsMock } from '@/test/trpc-test-utils';

// Mock Stack Auth before importing hook
vi.mock('@stackframe/react', () => ({
  useUser: vi.fn(() => ({
    getAuthJson: vi.fn().mockResolvedValue({ accessToken: 'test-token' }),
  })),
  useStackApp: vi.fn(() => ({})),
}));

import { useNavTree } from '../useNavTree';

const mockUseTRPC = vi.fn();

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC(),
}));

describe('useSites hooks', () => {
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

  describe('useNavTree', () => {
    it('fetches sites and units using tRPC', async () => {
      const mockSites = [
        {
          id: 'site-1',
          name: 'Site 1',
          organizationId: 'org-1',
          isActive: true,
        },
        {
          id: 'site-2',
          name: 'Site 2',
          organizationId: 'org-1',
          isActive: true,
        },
      ];

      const mockUnits = [
        {
          id: 'unit-1',
          name: 'Unit 1',
          unitType: 'freezer',
          status: 'ok',
          areaId: 'area-1',
          areaName: 'Area 1',
          siteId: 'site-1',
        },
      ];

      // Mock queryOptions pattern: trpc.router.procedure.queryOptions() returns { queryKey, queryFn }
      mockUseTRPC.mockReturnValue({
        sites: {
          list: {
            queryOptions: createQueryOptionsMock(mockSites, {
              queryKey: ['sites', 'list', { organizationId: 'org-1' }],
            }),
          },
        },
        units: {
          listByOrg: {
            queryOptions: createQueryOptionsMock(mockUnits, {
              queryKey: ['units', 'listByOrg', { organizationId: 'org-1' }],
            }),
          },
        },
      });

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.sites).toHaveLength(2);
    });

    it('builds navigation tree structure', async () => {
      const mockSites = [
        {
          id: 'site-1',
          name: 'Site 1',
          organizationId: 'org-1',
          isActive: true,
        },
      ];

      const mockUnits = [
        {
          id: 'unit-1',
          name: 'Unit 1',
          unitType: 'freezer',
          status: 'ok',
          areaId: 'area-1',
          areaName: 'Area 1',
          siteId: 'site-1',
        },
      ];

      mockUseTRPC.mockReturnValue({
        sites: {
          list: {
            queryOptions: createQueryOptionsMock(mockSites, {
              queryKey: ['sites', 'list', { organizationId: 'org-1' }],
            }),
          },
        },
        units: {
          listByOrg: {
            queryOptions: createQueryOptionsMock(mockUnits, {
              queryKey: ['units', 'listByOrg', { organizationId: 'org-1' }],
            }),
          },
        },
      });

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const site = result.current.sites[0];
      expect(site.siteId).toBe('site-1');
      expect(site.siteName).toBe('Site 1');
      expect(site.units).toHaveLength(1);
      expect(site.units[0].unitId).toBe('unit-1');
      expect(site.units[0].areaName).toBe('Area 1');
    });

    it('detects single site correctly', async () => {
      const mockSites = [
        {
          id: 'site-1',
          name: 'Single Site',
          organizationId: 'org-1',
          isActive: true,
        },
      ];

      mockUseTRPC.mockReturnValue({
        sites: {
          list: {
            queryOptions: createQueryOptionsMock(mockSites, {
              queryKey: ['sites', 'list', { organizationId: 'org-1' }],
            }),
          },
        },
        units: {
          listByOrg: {
            queryOptions: createQueryOptionsMock([], {
              queryKey: ['units', 'listByOrg', { organizationId: 'org-1' }],
            }),
          },
        },
      });

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasSingleSite).toBe(true);
    });

    it('handles multiple sites', async () => {
      const mockSites = [
        {
          id: 'site-1',
          name: 'Site 1',
          organizationId: 'org-1',
          isActive: true,
        },
        {
          id: 'site-2',
          name: 'Site 2',
          organizationId: 'org-1',
          isActive: true,
        },
      ];

      mockUseTRPC.mockReturnValue({
        sites: {
          list: {
            queryOptions: createQueryOptionsMock(mockSites, {
              queryKey: ['sites', 'list', { organizationId: 'org-1' }],
            }),
          },
        },
        units: {
          listByOrg: {
            queryOptions: createQueryOptionsMock([], {
              queryKey: ['units', 'listByOrg', { organizationId: 'org-1' }],
            }),
          },
        },
      });

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasSingleSite).toBe(false);
      expect(result.current.sites).toHaveLength(2);
    });

    it('returns empty when organizationId is null', () => {
      // When organizationId is null, queries are disabled but still need queryOptions
      mockUseTRPC.mockReturnValue({
        sites: {
          list: {
            queryOptions: createQueryOptionsMock([], {
              enabled: false,
            }),
          },
        },
        units: {
          listByOrg: {
            queryOptions: createQueryOptionsMock([], {
              enabled: false,
            }),
          },
        },
      });

      const { result } = renderHook(() => useNavTree(null), { wrapper });

      expect(result.current.sites).toEqual([]);
      expect(result.current.hasSingleSite).toBe(false);
    });

    it('handles errors gracefully', async () => {
      // Mock queryOptions that will cause an error when queryFn is called
      const apiError = new Error('API Error');

      mockUseTRPC.mockReturnValue({
        sites: {
          list: {
            queryOptions: vi.fn().mockReturnValue({
              queryKey: ['sites', 'list', { organizationId: 'org-1' }],
              queryFn: () => Promise.reject(apiError),
              enabled: true,
              staleTime: 30000,
            }),
          },
        },
        units: {
          listByOrg: {
            queryOptions: createQueryOptionsMock([], {
              queryKey: ['units', 'listByOrg', { organizationId: 'org-1' }],
            }),
          },
        },
      });

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeDefined();
      expect(result.current.sites).toEqual([]);
    });
  });
});
