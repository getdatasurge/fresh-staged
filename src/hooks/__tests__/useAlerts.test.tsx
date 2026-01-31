import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryOptionsMock } from '@/test/trpc-test-utils';
import {
  useAcknowledgeAlert,
  useFetchAlerts,
  useFetchUnitAlerts,
  useResolveAlert,
} from '../useUnitAlerts';

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

const mockUseTRPC = vi.fn();

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => mockUseTRPC(),
}));

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

      // Mock queryOptions pattern: trpc.alerts.listByOrg.queryOptions() returns { queryKey, queryFn }
      mockUseTRPC.mockReturnValue({
        alerts: {
          listByOrg: {
            queryOptions: createQueryOptionsMock(mockAlerts, {
              queryKey: [
                'alerts',
                'listByOrg',
                { organizationId: 'test-org-id', unitId: 'unit-1' },
              ],
            }),
          },
        },
      });

      const { result } = renderHook(() => useFetchUnitAlerts('unit-1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAlerts);
    });

    it('passes filter parameters to API', async () => {
      const mockAlerts: unknown[] = [];

      mockUseTRPC.mockReturnValue({
        alerts: {
          listByOrg: {
            queryOptions: createQueryOptionsMock(mockAlerts, {
              queryKey: [
                'alerts',
                'listByOrg',
                { organizationId: 'test-org-id', unitId: 'unit-1' },
              ],
            }),
          },
        },
      });

      const { result } = renderHook(
        () =>
          useFetchUnitAlerts('unit-1', {
            status: 'active',
            page: 2,
            limit: 10,
          }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify the data is returned correctly
      expect(result.current.data).toEqual(mockAlerts);
    });

    it('is disabled when unitId is null', () => {
      mockUseTRPC.mockReturnValue({
        alerts: {
          listByOrg: {
            queryOptions: createQueryOptionsMock([], {
              enabled: false,
            }),
          },
        },
      });

      const { result } = renderHook(() => useFetchUnitAlerts(null), { wrapper });

      // Query should be disabled, so data is undefined
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('useFetchAlerts', () => {
    it('fetches all alerts for organization', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          unitId: 'unit-1',
          type: 'temperature',
          status: 'active',
        },
        { id: 'alert-2', unitId: 'unit-2', type: 'offline', status: 'active' },
      ];

      mockUseTRPC.mockReturnValue({
        alerts: {
          listByOrg: {
            queryOptions: createQueryOptionsMock(mockAlerts, {
              queryKey: ['alerts', 'listByOrg', { organizationId: 'test-org-id' }],
            }),
          },
        },
      });

      const { result } = renderHook(() => useFetchAlerts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAlerts);
    });

    it('passes filter parameters to API', async () => {
      const mockAlerts: unknown[] = [];

      mockUseTRPC.mockReturnValue({
        alerts: {
          listByOrg: {
            queryOptions: createQueryOptionsMock(mockAlerts, {
              queryKey: ['alerts', 'listByOrg', { organizationId: 'test-org-id' }],
            }),
          },
        },
      });

      const { result } = renderHook(
        () =>
          useFetchAlerts({
            status: ['active', 'acknowledged'],
            unitId: 'unit-1',
            siteId: 'site-1',
            page: 1,
            limit: 20,
          }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAlerts);
    });
  });

  describe('useAcknowledgeAlert', () => {
    it('acknowledges an alert', async () => {
      const mockAcknowledgedAlert = {
        id: 'alert-1',
        status: 'acknowledged',
      };

      const mockMutationFn = vi.fn().mockResolvedValue(mockAcknowledgedAlert);

      mockUseTRPC.mockReturnValue({
        alerts: {
          acknowledge: {
            mutationOptions: vi.fn().mockReturnValue({
              mutationKey: ['alerts', 'acknowledge'],
              mutationFn: mockMutationFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          alertId: 'alert-1',
          notes: 'Investigating',
        });
      });

      expect(mockMutationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          alertId: 'alert-1',
          notes: 'Investigating',
        }),
        expect.anything(),
      );
    });

    it('invalidates alerts cache after acknowledgement', async () => {
      const mockAcknowledgedAlert = {
        id: 'alert-1',
        status: 'acknowledged',
      };

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const mockMutationFn = vi.fn().mockResolvedValue(mockAcknowledgedAlert);

      mockUseTRPC.mockReturnValue({
        alerts: {
          acknowledge: {
            mutationOptions: vi.fn().mockReturnValue({
              mutationKey: ['alerts', 'acknowledge'],
              mutationFn: mockMutationFn,
            }),
          },
        },
      });

      // Pre-populate cache
      queryClient.setQueryData(
        ['org', 'test-org-id', 'alerts'],
        [{ id: 'alert-1', status: 'active' }],
      );

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ alertId: 'alert-1' });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('handles acknowledgement errors', async () => {
      const mockMutationFn = vi.fn().mockRejectedValue(new Error('API Error'));

      mockUseTRPC.mockReturnValue({
        alerts: {
          acknowledge: {
            mutationOptions: vi.fn().mockReturnValue({
              mutationKey: ['alerts', 'acknowledge'],
              mutationFn: mockMutationFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });

      await act(async () => {
        await expect(result.current.mutateAsync({ alertId: 'alert-1' })).rejects.toThrow(
          'API Error',
        );
      });
    });
  });

  describe('useResolveAlert', () => {
    it('resolves an alert with corrective action', async () => {
      const mockResolvedAlert = {
        id: 'alert-1',
        status: 'resolved',
      };

      const mockMutationFn = vi.fn().mockResolvedValue(mockResolvedAlert);

      mockUseTRPC.mockReturnValue({
        alerts: {
          resolve: {
            mutationOptions: vi.fn().mockReturnValue({
              mutationKey: ['alerts', 'resolve'],
              mutationFn: mockMutationFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          alertId: 'alert-1',
          resolution: 'Temperature normalized',
          correctiveAction: 'Adjusted thermostat',
        });
      });

      expect(mockMutationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          alertId: 'alert-1',
          resolution: 'Temperature normalized',
          correctiveAction: 'Adjusted thermostat',
        }),
        expect.anything(),
      );
    });

    it('invalidates alerts cache after resolution', async () => {
      const mockResolvedAlert = {
        id: 'alert-1',
        status: 'resolved',
      };

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const mockMutationFn = vi.fn().mockResolvedValue(mockResolvedAlert);

      mockUseTRPC.mockReturnValue({
        alerts: {
          resolve: {
            mutationOptions: vi.fn().mockReturnValue({
              mutationKey: ['alerts', 'resolve'],
              mutationFn: mockMutationFn,
            }),
          },
        },
      });

      // Pre-populate cache
      queryClient.setQueryData(
        ['org', 'test-org-id', 'alerts'],
        [{ id: 'alert-1', status: 'acknowledged' }],
      );

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          alertId: 'alert-1',
          resolution: 'Fixed',
        });
      });

      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('handles resolution errors', async () => {
      const mockMutationFn = vi.fn().mockRejectedValue(new Error('Resolution failed'));

      mockUseTRPC.mockReturnValue({
        alerts: {
          resolve: {
            mutationOptions: vi.fn().mockReturnValue({
              mutationKey: ['alerts', 'resolve'],
              mutationFn: mockMutationFn,
            }),
          },
        },
      });

      const { result } = renderHook(() => useResolveAlert(), { wrapper });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            alertId: 'alert-1',
            resolution: 'Fixed',
          }),
        ).rejects.toThrow('Resolution failed');
      });
    });
  });
});
