import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNavTree } from '../useNavTree';

// Mock dependencies
vi.mock('@/integrations/supabase/client', () => ({
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
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            not: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/api', () => ({
  sitesApi: {
    listSites: vi.fn(),
  },
  areasApi: {
    listAreas: vi.fn(),
  },
  unitsApi: {
    listUnits: vi.fn(),
  },
}));

import { sitesApi, areasApi, unitsApi } from '@/lib/api';

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
    it('fetches sites using sitesApi', async () => {
      const mockSites = [
        { id: 'site-1', name: 'Site 1', organizationId: 'org-1', isActive: true },
        { id: 'site-2', name: 'Site 2', organizationId: 'org-1', isActive: true },
      ];

      vi.mocked(sitesApi.listSites).mockResolvedValueOnce(mockSites as any);
      vi.mocked(areasApi.listAreas).mockResolvedValue([] as any);
      vi.mocked(unitsApi.listUnits).mockResolvedValue([] as any);

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(sitesApi.listSites).toHaveBeenCalledWith('org-1', 'test-token');
      expect(result.current.sites).toHaveLength(2);
    });

    it('fetches areas and units for each site', async () => {
      const mockSites = [{ id: 'site-1', name: 'Site 1', organizationId: 'org-1', isActive: true }];
      const mockAreas = [{ id: 'area-1', name: 'Area 1', siteId: 'site-1', isActive: true }];
      const mockUnits = [
        {
          id: 'unit-1',
          name: 'Unit 1',
          areaId: 'area-1',
          unitType: 'freezer',
          status: 'ok',
        },
      ];

      vi.mocked(sitesApi.listSites).mockResolvedValueOnce(mockSites as any);
      vi.mocked(areasApi.listAreas).mockResolvedValueOnce(mockAreas as any);
      vi.mocked(unitsApi.listUnits).mockResolvedValueOnce(mockUnits as any);

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(areasApi.listAreas).toHaveBeenCalledWith('org-1', 'site-1', 'test-token');
      expect(unitsApi.listUnits).toHaveBeenCalledWith('org-1', 'site-1', 'area-1', 'test-token');
    });

    it('builds navigation tree structure', async () => {
      const mockSites = [{ id: 'site-1', name: 'Site 1', organizationId: 'org-1', isActive: true }];
      const mockAreas = [{ id: 'area-1', name: 'Area 1', siteId: 'site-1', isActive: true }];
      const mockUnits = [
        {
          id: 'unit-1',
          name: 'Unit 1',
          areaId: 'area-1',
          unitType: 'freezer',
          status: 'ok',
        },
      ];

      vi.mocked(sitesApi.listSites).mockResolvedValueOnce(mockSites as any);
      vi.mocked(areasApi.listAreas).mockResolvedValueOnce(mockAreas as any);
      vi.mocked(unitsApi.listUnits).mockResolvedValueOnce(mockUnits as any);

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
      const mockSites = [{ id: 'site-1', name: 'Single Site', organizationId: 'org-1', isActive: true }];

      vi.mocked(sitesApi.listSites).mockResolvedValueOnce(mockSites as any);
      vi.mocked(areasApi.listAreas).mockResolvedValue([] as any);
      vi.mocked(unitsApi.listUnits).mockResolvedValue([] as any);

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasSingleSite).toBe(true);
    });

    it('handles multiple sites', async () => {
      const mockSites = [
        { id: 'site-1', name: 'Site 1', organizationId: 'org-1', isActive: true },
        { id: 'site-2', name: 'Site 2', organizationId: 'org-1', isActive: true },
      ];

      vi.mocked(sitesApi.listSites).mockResolvedValueOnce(mockSites as any);
      vi.mocked(areasApi.listAreas).mockResolvedValue([] as any);
      vi.mocked(unitsApi.listUnits).mockResolvedValue([] as any);

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.hasSingleSite).toBe(false);
      expect(result.current.sites).toHaveLength(2);
    });

    it('returns empty when organizationId is null', () => {
      const { result } = renderHook(() => useNavTree(null), { wrapper });

      expect(result.current.sites).toEqual([]);
      expect(result.current.hasSingleSite).toBe(false);
    });

    it('preserves query key structure for cache', async () => {
      const mockSites = [{ id: 'site-1', name: 'Site 1', organizationId: 'org-1', isActive: true }];

      vi.mocked(sitesApi.listSites).mockResolvedValueOnce(mockSites as any);
      vi.mocked(areasApi.listAreas).mockResolvedValue([] as any);
      vi.mocked(unitsApi.listUnits).mockResolvedValue([] as any);

      renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => {
        // Query key should be org-scoped for cache invalidation on impersonation
        const cachedData = queryClient.getQueryData(['org', 'org-1', 'sites']);
        return expect(cachedData).toBeDefined();
      });
    });

    it('handles errors gracefully', async () => {
      vi.mocked(sitesApi.listSites).mockRejectedValueOnce(new Error('API Error'));

      const { result } = renderHook(() => useNavTree('org-1'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeDefined();
      expect(result.current.sites).toEqual([]);
    });
  });
});
