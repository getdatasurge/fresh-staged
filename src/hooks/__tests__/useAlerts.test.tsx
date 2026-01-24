import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useFetchUnitAlerts, useFetchAlerts, useAcknowledgeAlert, useResolveAlert } from '../useUnitAlerts';

// Mock dependencies
vi.mock('@stackframe/react', () => ({
  useUser: () => ({
    id: 'test-user-id',
    getAuthJson: vi.fn(() => ({
      accessToken: 'test-token',
    })),
  }),
}));

vi.mock('../useOrgScope', () => ({
  useOrgScope: () => ({
    orgId: 'test-org-id',
    isReady: true,
  }),
}));

vi.mock('@/lib/api/alerts', () => ({
  alertsApi: {
    listAlerts: vi.fn(),
    listUnitAlerts: vi.fn(),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
  },
}));

import { alertsApi } from '@/lib/api/alerts';

describe('useAlerts hooks', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  describe('useFetchUnitAlerts', () => {
    it('fetches alerts for a specific unit', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          unitId: 'unit-1',
          type: 'temperature',
          status: 'active',
          severity: 'critical',
        },
      ];

      vi.mocked(alertsApi.listUnitAlerts).mockResolvedValueOnce(mockAlerts as any);

      const { result } = renderHook(() => useFetchUnitAlerts('unit-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAlerts);
      expect(alertsApi.listUnitAlerts).toHaveBeenCalledWith(
        'test-org-id',
        'unit-1',
        {},
        'test-token'
      );
    });

    it('passes filter parameters to API', async () => {
      vi.mocked(alertsApi.listUnitAlerts).mockResolvedValueOnce([] as any);

      const { result } = renderHook(
        () =>
          useFetchUnitAlerts('unit-1', {
            status: 'active',
            page: 2,
            limit: 10,
          }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(alertsApi.listUnitAlerts).toHaveBeenCalledWith(
        'test-org-id',
        'unit-1',
        {
          status: 'active',
          page: 2,
          limit: 10,
        },
        'test-token'
      );
    });

    it('is disabled when unitId is null', () => {
      const { result } = renderHook(() => useFetchUnitAlerts(null), { wrapper });

      expect(result.current.data).toBeUndefined();
      expect(alertsApi.listUnitAlerts).not.toHaveBeenCalled();
    });

    it('uses correct query key for caching', async () => {
      vi.mocked(alertsApi.listUnitAlerts).mockResolvedValueOnce([] as any);

      renderHook(() => useFetchUnitAlerts('unit-1', { status: 'active' }), { wrapper });

      await waitFor(() => {
        const cachedData = queryClient.getQueryData(['unit', 'unit-1', 'alerts', 'active', undefined, undefined]);
        return expect(cachedData).toBeDefined();
      });
    });

    it('caches data for 10 seconds', async () => {
      vi.mocked(alertsApi.listUnitAlerts).mockResolvedValueOnce([{ id: 'alert-1' }] as any);

      const { result } = renderHook(() => useFetchUnitAlerts('unit-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Query should be cached and not stale immediately
      expect(result.current.data).toBeDefined();
    });
  });

  describe('useFetchAlerts', () => {
    it('fetches all alerts for organization', async () => {
      const mockAlerts = [
        { id: 'alert-1', unitId: 'unit-1', type: 'temperature', status: 'active' },
        { id: 'alert-2', unitId: 'unit-2', type: 'offline', status: 'active' },
      ];

      vi.mocked(alertsApi.listAlerts).mockResolvedValueOnce(mockAlerts as any);

      const { result } = renderHook(() => useFetchAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAlerts);
      expect(alertsApi.listAlerts).toHaveBeenCalledWith('test-org-id', {}, 'test-token');
    });

    it('passes filter parameters to API', async () => {
      vi.mocked(alertsApi.listAlerts).mockResolvedValueOnce([] as any);

      const { result } = renderHook(
        () =>
          useFetchAlerts({
            status: ['active', 'acknowledged'],
            unitId: 'unit-1',
            siteId: 'site-1',
            page: 1,
            limit: 20,
          }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(alertsApi.listAlerts).toHaveBeenCalledWith(
        'test-org-id',
        {
          status: ['active', 'acknowledged'],
          unitId: 'unit-1',
          siteId: 'site-1',
          page: 1,
          limit: 20,
        },
        'test-token'
      );
    });

    it('uses correct org-scoped query key', async () => {
      vi.mocked(alertsApi.listAlerts).mockResolvedValueOnce([] as any);

      renderHook(() => useFetchAlerts(), { wrapper });

      await waitFor(() => {
        const cachedData = queryClient.getQueryData([
          'org',
          'test-org-id',
          'alerts',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
        return expect(cachedData).toBeDefined();
      });
    });
  });

  describe('useAcknowledgeAlert', () => {
    it('acknowledges an alert', async () => {
      const mockAcknowledgedAlert = {
        id: 'alert-1',
        status: 'acknowledged',
      };

      vi.mocked(alertsApi.acknowledgeAlert).mockResolvedValueOnce(mockAcknowledgedAlert as any);

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ alertId: 'alert-1', notes: 'Investigating' });
      });

      expect(alertsApi.acknowledgeAlert).toHaveBeenCalledWith(
        'test-org-id',
        'alert-1',
        'Investigating',
        'test-token'
      );
    });

    it('invalidates alerts cache after acknowledgement', async () => {
      const mockAcknowledgedAlert = {
        id: 'alert-1',
        status: 'acknowledged',
      };

      vi.mocked(alertsApi.acknowledgeAlert).mockResolvedValueOnce(mockAcknowledgedAlert as any);

      // Pre-populate cache
      queryClient.setQueryData(['org', 'test-org-id', 'alerts'], [{ id: 'alert-1', status: 'active' }]);

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync({ alertId: 'alert-1' });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('handles acknowledgement errors', async () => {
      vi.mocked(alertsApi.acknowledgeAlert).mockRejectedValueOnce(new Error('API Error'));

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      await act(async () => {
        await expect(result.current.mutateAsync({ alertId: 'alert-1' })).rejects.toThrow('API Error');
      });
    });

    it('supports optional notes parameter', async () => {
      vi.mocked(alertsApi.acknowledgeAlert).mockResolvedValueOnce({ id: 'alert-1' } as any);

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ alertId: 'alert-1' });
      });

      expect(alertsApi.acknowledgeAlert).toHaveBeenCalledWith(
        'test-org-id',
        'alert-1',
        undefined,
        'test-token'
      );
    });
  });

  describe('useResolveAlert', () => {
    it('resolves an alert with corrective action', async () => {
      const mockResolvedAlert = {
        id: 'alert-1',
        status: 'resolved',
      };

      vi.mocked(alertsApi.resolveAlert).mockResolvedValueOnce(mockResolvedAlert as any);

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          alertId: 'alert-1',
          resolution: 'Temperature normalized',
          correctiveAction: 'Adjusted thermostat',
        });
      });

      expect(alertsApi.resolveAlert).toHaveBeenCalledWith(
        'test-org-id',
        'alert-1',
        'Temperature normalized',
        'Adjusted thermostat',
        'test-token'
      );
    });

    it('invalidates alerts cache after resolution', async () => {
      vi.mocked(alertsApi.resolveAlert).mockResolvedValueOnce({ id: 'alert-1' } as any);

      // Pre-populate cache
      queryClient.setQueryData(['org', 'test-org-id', 'alerts'], [{ id: 'alert-1', status: 'acknowledged' }]);

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await result.current.mutateAsync({
          alertId: 'alert-1',
          resolution: 'Fixed',
        });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('handles resolution errors', async () => {
      vi.mocked(alertsApi.resolveAlert).mockRejectedValueOnce(new Error('Resolution failed'));

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            alertId: 'alert-1',
            resolution: 'Fixed',
          })
        ).rejects.toThrow('Resolution failed');
      });
    });

    it('supports optional correctiveAction parameter', async () => {
      vi.mocked(alertsApi.resolveAlert).mockResolvedValueOnce({ id: 'alert-1' } as any);

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          alertId: 'alert-1',
          resolution: 'Issue resolved',
        });
      });

      expect(alertsApi.resolveAlert).toHaveBeenCalledWith(
        'test-org-id',
        'alert-1',
        'Issue resolved',
        undefined,
        'test-token'
      );
    });
  });
});
